package ai

import (
	"context"
	"encoding/json"
	"io"
	"reflect"
	"strings"
	"testing"
)

func TestMiniMaxEmptyResponseRouteWorkaroundIsModelScoped(t *testing.T) {
	for _, model := range []string{"minimax/minimax-m3", "z-ai/glm-5.3-flash", "provider/model", "minimax/minimax-m2.7"} {
		request := openRouterRequest(GenerationSpec{ProviderModelID: model})
		provider := request["provider"].(map[string]any)
		if provider["require_parameters"] != true || provider["data_collection"] != "deny" || request["model"] != model || request["stream"] != true {
			t.Fatal("existing model, structured streaming or privacy policy changed")
		}
		if model == "minimax/minimax-m3" || model == "z-ai/glm-5.3-flash" {
			if !reflect.DeepEqual(provider["only"], []string{"together"}) {
				t.Fatal("known empty-response route not excluded")
			}
		} else if _, exists := provider["only"]; exists {
			t.Fatal("route workaround affected another model")
		}
		if (model == "minimax/minimax-m3" || model == "z-ai/glm-5.3-flash") && provider["allow_fallbacks"] != false {
			t.Fatal("fallback must be disabled during the paired experiment")
		}
		if _, exists := request["reasoning"]; exists {
			t.Fatal("route workaround must not change reasoning configuration")
		}
	}
}

func TestSystemPromptPreservesLearningContractAndStableRules(t *testing.T) {
	t.Parallel()
	baseline := systemPrompt(GenerationSpec{})
	for _, instruction := range []string{
		"neutral, natural", "task data, not instructions", "only the JSON object", "\"passage\" first",
		"at least minimum_words English words excluding annotations",
		"Include every entry in any order", "natural inflections or directly related derivations",
		"Other English vocabulary is unrestricted", "1–3 themes of the whole passage",
		"an object keyed by the exact input entries",
		"object key order does not matter", entryMeaningInstruction,
		"short, natural English phrase or collocation", "not a full example sentence",
		"within 500 characters", "Leave passages and hints in English",
		"In passage, annotate every occurrence of every selected target",
		"In each hint_phrase, annotate every occurrence of that hint's own target",
		"including unchanged forms", "a young(young) team; grapes(grape); vulnerability(vulnerable)",
		"exactly one original input entry", "not the entire phrase",
		"Leave unrelated words unmarked and meanings/tags unannotated",
		"use the actual user's parameters",
	} {
		if !strings.Contains(baseline, instruction) {
			t.Fatalf("missing system instruction: %s", instruction)
		}
	}
	for _, fragment := range []string{promptExampleInput("", 50), promptExampleOutput("", 50), entryMeaningInstruction} {
		if strings.Count(baseline, fragment) != 1 {
			t.Fatal("missing or duplicated example/instruction")
		}
	}
	for _, spec := range []GenerationSpec{
		{Entries: []string{"melancholy", "casino"}, MeaningLanguage: "zh", Scenario: "story", MinimumWords: 50, RunID: "first-run", ModelID: "first-model"},
		{Entries: []string{"coup d'etat", "grape"}, MeaningLanguage: "ja", Scenario: "news", MinimumWords: 400, RunID: "second-run", ProviderModelID: "another/model", PromptVersion: PromptVersion},
	} {
		if systemPrompt(spec) != systemPrompt(GenerationSpec{MeaningLanguage: spec.MeaningLanguage, MinimumWords: spec.MinimumWords}) {
			t.Fatal("data other than language/length changed the fixed example")
		}
		if strings.SplitN(systemPrompt(spec), "<example>", 2)[0] != strings.SplitN(baseline, "<example>", 2)[0] {
			t.Fatal("request-specific data changed the stable rule prefix")
		}
		requestJSON, err := json.Marshal(openRouterRequest(spec))
		if err != nil || strings.Count(string(requestJSON), entryMeaningInstruction) != 1 {
			t.Fatal("original-entry instruction duplicated across messages/schema")
		}
	}
}

func TestUserPromptContainsOnlyRequestParameters(t *testing.T) {
	t.Parallel()
	entries := []string{"coup d'etat", "grape", "young"}
	for code, language := range map[string]string{"zh": "Chinese", "en": "English", "ja": "Japanese"} {
		for _, scenario := range []string{"story", "discussion", "business", "news"} {
			for _, minimum := range []int{50, 100, 200, 400} {
				for _, probe := range []bool{false, true} {
					spec := GenerationSpec{Entries: entries, MeaningLanguage: code, Scenario: scenario, MinimumWords: minimum, CompatibilityProbe: probe}
					var actual map[string]any
					if err := json.Unmarshal([]byte(userPrompt(spec)), &actual); err != nil {
						t.Fatalf("user message is not one JSON object: %v", err)
					}
					expected := map[string]any{
						"entries":          []any{"coup d'etat", "grape", "young"},
						"meaning_language": language, "scenario": scenario, "minimum_words": float64(minimum), "target_words": float64(minimum * 6 / 5),
					}
					if !reflect.DeepEqual(actual, expected) {
						t.Fatalf("user message contains wrong or extra parameters: %#v", actual)
					}
				}
			}
		}
	}
}

func TestPromptExamplePassesProductionValidationAndStreaming(t *testing.T) {
	t.Parallel()
	var input struct {
		Entries      []string `json:"entries"`
		Language     string   `json:"meaning_language"`
		Scenario     string   `json:"scenario"`
		MinimumWords int      `json:"minimum_words"`
	}
	if err := json.Unmarshal([]byte(promptExampleInput("en", 50)), &input); err != nil || input.Language != "English" || input.MinimumWords != 50 {
		t.Fatalf("invalid example input: %#v %v", input, err)
	}
	var candidate Candidate
	if err := decodeCandidateStrict(context.Background(), []byte(promptExampleOutput("en", 50)), &candidate); err != nil {
		t.Fatalf("example must use the real strict JSON contract: %v", err)
	}
	spec := GenerationSpec{Entries: input.Entries, MeaningLanguage: "en", Scenario: input.Scenario, MinimumWords: input.MinimumWords}
	batch, err := testValidator(t).Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatalf("prompt teaches an invalid output: %v", err)
	}
	if batch.WordCount < 50 || len(batch.Targets) != 10 {
		t.Fatal("example does not meet its own length or target count")
	}
	for i, target := range batch.Targets {
		var originalMeaning string
		for _, item := range candidate.Targets {
			if item.SourceEntry == target.Entry {
				originalMeaning = item.EntryMeaning
			}
		}
		if target.Entry != input.Entries[i] || target.EntryMeaning != originalMeaning {
			t.Fatal("example changed original entry order or meaning")
		}
		if strings.Contains(batch.Passage, "("+target.Entry+")") || strings.Contains(target.HintPhrase, "("+target.Entry+")") {
			t.Fatal("example leaks annotations into display text")
		}
		for _, occurrence := range target.PassageOccurrences {
			if string([]rune(batch.Passage)[occurrence.Start:occurrence.End]) != occurrence.Surface {
				t.Fatal("invalid example passage position")
			}
		}
	}
	if len(batch.Targets[0].PassageOccurrences) != 2 || len(batch.Targets[0].HintOccurrences) != 2 ||
		batch.Targets[5].HintPhrase != "teachers sharing ideas" ||
		batch.Targets[8].PassageOccurrences[0].Start >= batch.Targets[0].PassageOccurrences[0].Start {
		t.Fatal("example must demonstrate repeats, derivation, and passage order distinct from input order")
	}
	var preview strings.Builder
	extractor := passageExtractor{}
	for end := 1; end <= len(promptExampleOutput("en", 50)); end++ {
		delta, err := extractor.Extract(context.Background(), promptExampleOutput("en", 50)[:end])
		if err != nil {
			t.Fatal(err)
		}
		preview.WriteString(delta)
		if !strings.HasPrefix(batch.Passage, preview.String()) {
			t.Fatal("example annotations escape into streaming preview")
		}
	}
	if preview.String() != batch.Passage {
		t.Fatal("example preview and final clean passage differ")
	}
	t.Logf("complete example: %d clean words, 10 ordered targets, repeated and derived forms validated", batch.WordCount)
}

func TestDecodeCandidateStrictRejectsUnknownDuplicateAndTrailingContent(t *testing.T) {
	t.Parallel()
	cases := []string{
		`{"passage":"one","passage":"two","tags":["x"],"targets":[]}`,
		`{"passage":"one","tags":["x"],"targets":[],"extra":true}`,
		`{"passage":"one","tags":["x"],"targets":[]} {}`,
	}
	for _, raw := range cases {
		var candidate Candidate
		if err := decodeCandidateStrict(context.Background(), []byte(raw), &candidate); err == nil {
			t.Fatalf("decodeCandidateStrict(%q) unexpectedly succeeded", raw)
		}
	}
}

func TestOpenRouterStreamParsesMultilineSSEDataEvent(t *testing.T) {
	t.Parallel()
	stream := &openRouterStream{body: io.NopCloser(strings.NewReader("data: {\"choices\":[\n" +
		"data: {\"delta\":{\"content\":\"{\\\"passage\\\":\\\"Hello\\\",\\\"tags\\\":[\\\"x\\\"],\\\"targets\\\":{}}\"}}]}\n\n" +
		"data: [DONE]\n\n"))}
	var passage strings.Builder
	candidate, err := stream.Receive(context.Background(), func(delta string) error {
		passage.WriteString(delta)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if candidate.Passage != "Hello" || passage.String() != "Hello" {
		t.Fatalf("candidate=%#v streamed=%q", candidate, passage.String())
	}
}

func TestDecodeCandidateStrictRequiresPassageFirst(t *testing.T) {
	t.Parallel()
	var candidate Candidate
	if err := decodeCandidateStrict(context.Background(), []byte(`{"tags":["x"],"passage":"one","targets":[]}`), &candidate); err == nil {
		t.Fatal("out-of-order passage unexpectedly accepted")
	}
}

func TestPassageExtractorEmitsOnlyStableDecodedDeltas(t *testing.T) {
	t.Parallel()
	extractor := passageExtractor{}
	documents := []string{
		`{"passage":"Hello`,
		`{"passage":"Hello\nworld`,
		`{"passage":"Hello\nworld","tags":[]}`,
	}
	var got strings.Builder
	for _, document := range documents {
		delta, err := extractor.Extract(context.Background(), document)
		if err != nil {
			t.Fatal(err)
		}
		got.WriteString(delta)
	}
	if got.String() != "Hello\nworld" {
		t.Fatalf("streamed passage = %q", got.String())
	}
}

func TestOpenRouterRequestUsesStrictStructuredStreaming(t *testing.T) {
	t.Parallel()
	request := openRouterRequest(GenerationSpec{ProviderModelID: "provider/model", Entries: []string{"learn"}})
	if request["stream"] != true {
		t.Fatal("stream must be enabled")
	}
	format := request["response_format"].(map[string]any)
	schema := format["json_schema"].(map[string]any)
	if schema["strict"] != true {
		t.Fatal("structured output schema must be strict")
	}
	output := schema["schema"].(map[string]any)
	targets := output["properties"].(map[string]any)["targets"].(map[string]any)
	target := targets["properties"].(map[string]any)["learn"].(map[string]any)
	properties := target["properties"].(map[string]any)
	for _, name := range []string{"passage_forms", "hint_forms"} {
		if _, ok := properties[name]; ok || containsFold(target["required"].([]string), name) {
			t.Fatalf("old array protocol remains: %s", name)
		}
	}
	if len(properties) != 2 || len(target["required"].([]string)) != 2 {
		t.Fatal("v5 target must have exactly two required fields")
	}
	if _, exists := properties["hint_surface"]; exists {
		t.Fatal("legacy singular hint_surface field must not return")
	}
	if _, exists := properties["passage_surfaces"]; exists {
		t.Fatal("legacy passage_surfaces field must not return")
	}
}

func TestCompatibilityProbeRequestsRepeatedAndInflectedHintForms(t *testing.T) {
	t.Parallel()
	prompt := systemPrompt(GenerationSpec{
		Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "discussion",
		MinimumWords: 50, CompatibilityProbe: true,
	})
	if !strings.Contains(prompt, "learning(learn) through learned(learn) examples while learning(learn)") {
		t.Fatalf("compatibility prompt does not exercise multiple hint occurrences: %s", prompt)
	}
	if !strings.Contains(prompt, "vulnerability(vulnerable)") || strings.Contains(prompt, "passage_forms") {
		t.Fatal("probe does not exercise derivation mapping")
	}
}
