package ai

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"
)

func TestProsePromptGuidanceAcrossConfigurations(t *testing.T) {
	for _, language := range []string{"zh", "en", "ja"} {
		for _, minimum := range []int{50, 100, 200, 400} {
			for _, scenario := range []string{"story", "discussion", "business", "news"} {
				spec := GenerationSpec{Entries: []string{"deteriorate", "undermine"}, MeaningLanguage: language, Scenario: scenario, MinimumWords: minimum}
				prompt := systemPrompt(spec)
				for _, rule := range []string{
					"without a title or heading", "Aim near target_words", "not an upper limit",
					"Before closing the passage string, cover every entry",
					"at least minimum_words English words excluding annotations",
					"give the passage a natural ending", `paragraphs with \n\n inside the JSON string`,
					"Start and end the passage without whitespace",
					"deteriorate(deteriorate) over time; undermine(undermine) confidence",
					entryMeaningInstruction,
				} {
					if !strings.Contains(prompt, rule) {
						t.Fatalf("missing prompt guidance: %s", rule)
					}
				}
				schema := outputSchema(spec)
				properties := schema["properties"].(map[string]any)
				passage := properties["passage"].(map[string]any)
				description := passage["description"].(string)
				if !strings.Contains(description, fmt.Sprintf("Aim near %d words; minimum %d words", minimum*6/5, minimum)) ||
					strings.Contains(description, "or more") || passage["maxLength"] != maxCandidateBytes {
					t.Fatal("length guidance or existing safety ceiling changed", description)
				}
				targets := properties["targets"].(map[string]any)["properties"].(map[string]any)
				for _, entry := range spec.Entries {
					hint := targets[entry].(map[string]any)["properties"].(map[string]any)["hint_phrase"].(map[string]any)
					if !strings.Contains(hint["description"].(string), "not a subject-verb sentence") || hint["maxLength"] != maxAnnotatedHintRunes {
						t.Fatal("hint guidance/ceiling mismatch")
					}
				}
				for _, model := range []string{"minimax/minimax-m3", "z-ai/glm-5.3-flash", "other/model"} {
					spec.ProviderModelID = model
					request := openRouterRequest(spec)
					for _, key := range []string{"reasoning", "reasoning_effort", "max_tokens", "stop"} {
						if _, exists := request[key]; exists {
							t.Fatal("prompt revision changed inference controls", key)
						}
					}
				}
			}
		}
	}
}

func TestProseExampleShowsParagraphsAndVerbCollocation(t *testing.T) {
	for _, language := range []string{"zh", "en", "ja"} {
		var candidate Candidate
		raw := promptExampleOutput(language, 50)
		if err := decodeCandidateStrict(context.Background(), []byte(raw), &candidate); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(raw, `\n\n`) || strings.Count(candidate.Passage, "\n\n") != 1 || strings.TrimSpace(candidate.Passage) != candidate.Passage {
			t.Fatal("example does not teach valid paragraph spacing")
		}
		spec := GenerationSpec{Entries: promptExampleEntries(), MeaningLanguage: language, Scenario: "story", MinimumWords: 50}
		batch, err := testValidator(t).Validate(context.Background(), spec, candidate)
		if err != nil || batch.WordCount < 60 || batch.WordCount > 72 {
			t.Fatal("example is not close to its own soft 60-word target", batch.WordCount, err)
		}
		if batch.Targets[3].HintPhrase != "planning a school event" {
			t.Fatal("verb hint is not the compact demonstrated collocation")
		}
		t.Logf("%s: %d clean words, 2 paragraphs, verb collocation and ordered public targets", language, batch.WordCount)
	}
}

// Synthetic reductions of r5 cases 8/10. These remain invalid: prompt changes
// must not rewrite the returned prose or lower deterministic acceptance.
func TestProsePromptKnownFailuresRemainRejected(t *testing.T) {
	t.Run("joined_title_and_body", func(t *testing.T) {
		spec, candidate := mappingCandidate("prevalent", "Prevalent local conditions are common.", "prevalent conditions", []string{"prevalent"}, []string{"prevalent"})
		validator := testValidator(t)
		if _, err := validator.Validate(context.Background(), spec, candidate); err != nil {
			t.Fatal("positive boundary control", err)
		}
		candidate.Passage = "Prevalent(prevalent)Local conditions are common."
		stream := openRouterStream{io.NopCloser(strings.NewReader(p0SSE(p0JSON(candidate))))}
		defer stream.Close()
		var preview strings.Builder
		decoded, err := stream.Receive(context.Background(), func(delta string) error { preview.WriteString(delta); return nil })
		if err != nil {
			t.Fatal(err)
		}
		if preview.String() != "PrevalentLocal conditions are common." {
			t.Fatal("stream silently repaired upstream text")
		}
		_, err = validator.Validate(context.Background(), spec, decoded)
		if DescribeFailure(err).Reason != "mapping_surface_absent" {
			t.Fatal("joined target accepted", err)
		}
	})
	t.Run("unfinished_long_passage_has_multiple_failures", func(t *testing.T) {
		spec, candidate := p0Candidate()
		spec.MinimumWords = 400
		candidate.Passage = strings.Repeat("Residents shared their plans. ", 39) + "Young(young). "
		validator := testValidator(t)
		_, err := validator.Validate(context.Background(), spec, candidate)
		if DescribeFailure(err).Reason != "passage_content_invalid" {
			t.Fatal("outer whitespace unexpectedly accepted", err)
		}
		candidate.Passage = strings.TrimSpace(candidate.Passage)
		_, err = validator.Validate(context.Background(), spec, candidate)
		failure := DescribeFailure(err)
		if failure.Reason != "passage_too_short" || failure.Actual != 157 || failure.Limit != 400 {
			t.Fatal("trim alone incorrectly resolved incomplete passage", failure)
		}
		candidate.Passage = strings.Repeat("Neighbors shared their plans. ", 61) + candidate.Passage
		_, err = validator.Validate(context.Background(), spec, candidate)
		if DescribeFailure(err).Reason != "passage_annotation_missing" {
			t.Fatal("minimum alone incorrectly resolved omitted entry", err)
		}
		_, intact := p0Candidate()
		candidate.Passage += " " + intact.Passage
		if _, err := validator.Validate(context.Background(), spec, candidate); err != nil {
			t.Fatal("completed long passage should pass", err)
		}
	})
}
