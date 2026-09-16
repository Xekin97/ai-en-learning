package ai

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestKeyedTargetsIdentityAndPublicOrder(t *testing.T) {
	spec, candidate := p0Candidate()
	// Wire order must never determine identity or frontend order.
	candidate.Targets[0], candidate.Targets[1] = candidate.Targets[1], candidate.Targets[0]
	var decoded Candidate
	if err := decodeCandidateStrict(context.Background(), []byte(p0JSON(candidate)), &decoded); err != nil {
		t.Fatal(err)
	}
	batch, err := testValidator(t).Validate(context.Background(), spec, decoded)
	if err != nil {
		t.Fatal(err)
	}
	for i, entry := range spec.Entries {
		if batch.Targets[i].Entry != entry {
			t.Fatal("public input order changed")
		}
	}
	if batch.Targets[0].EntryMeaning != "a small fruit" {
		t.Fatal("key identity shifted")
	}
	wire, _ := json.Marshal(batch)
	var public struct {
		Targets []json.RawMessage `json:"targets"`
	}
	if json.Unmarshal(wire, &public) != nil || len(public.Targets) != 2 {
		t.Fatal("public DTO no longer an array")
	}

	for _, mutation := range []string{"missing", "extra", "alias", "duplicate"} {
		t.Run(mutation, func(t *testing.T) {
			s, c := p0Candidate()
			switch mutation {
			case "missing":
				c.Targets = c.Targets[:1]
			case "extra":
				c.Targets = append(c.Targets, CandidateTarget{"apple", "a fruit", "an apple(apple)"})
			case "alias":
				c.Targets[1].SourceEntry = "Young"
			case "duplicate":
				c.Targets[1].SourceEntry = c.Targets[0].SourceEntry
			}
			var got Candidate
			err := decodeCandidateStrict(context.Background(), []byte(p0JSON(c)), &got)
			if err == nil {
				_, err = testValidator(t).Validate(context.Background(), s, got)
			}
			if err == nil {
				t.Fatal("incorrect identity set accepted")
			}
		})
	}
}

func TestKeyedTargetsNoLegacyWireFallback(t *testing.T) {
	_, candidate := p0Candidate()
	legacy, _ := json.Marshal(candidate)
	var decoded Candidate
	err := decodeCandidateStrict(context.Background(), legacy, &decoded)
	if DescribeFailure(err).Reason != "targets_type_invalid" {
		t.Fatal("old array protocol accepted", err)
	}
	for _, raw := range []string{
		strings.Replace(p0JSON(candidate), `"entry_meaning":`, `"source_entry":"grape","entry_meaning":`, 1),
		strings.Replace(p0JSON(candidate), `"grape":{`, `"grape":null,"grape":{`, 1),
	} {
		if decodeCandidateStrict(context.Background(), []byte(raw), &decoded) == nil {
			t.Fatal("legacy or duplicate keys accepted")
		}
	}
}

func TestKeyedSchemaAndExamplesMatchEveryLanguage(t *testing.T) {
	for language, name := range map[string]string{"zh": "Chinese", "en": "English", "ja": "Japanese"} {
		t.Run(language, func(t *testing.T) {
			spec := GenerationSpec{Entries: promptExampleEntries(), MeaningLanguage: language, Scenario: "story", MinimumWords: 50}
			schema := outputSchema(spec)
			properties := schema["properties"].(map[string]any)
			targets := properties["targets"].(map[string]any)
			if targets["type"] != "object" || targets["additionalProperties"] != false || !reflect.DeepEqual(targets["required"], spec.Entries) {
				t.Fatal("target key set not constrained")
			}
			keyed := targets["properties"].(map[string]any)
			if len(keyed) != len(spec.Entries) {
				t.Fatal("wrong key count")
			}
			for _, entry := range spec.Entries {
				value := keyed[entry].(map[string]any)
				fields := value["properties"].(map[string]any)
				description := fields["entry_meaning"].(map[string]any)["description"].(string)
				if value["additionalProperties"] != false || len(fields) != 2 || !strings.Contains(description, name) || !strings.Contains(description, entry) {
					t.Fatal("missing keyed language guidance")
				}
			}
			if !strings.Contains(properties["tags"].(map[string]any)["description"].(string), name) {
				t.Fatal("tag language missing")
			}
			raw := promptExampleOutput(language, 50)
			var candidate Candidate
			if err := decodeCandidateStrict(context.Background(), []byte(raw), &candidate); err != nil {
				t.Fatal(err)
			}
			batch, err := testValidator(t).Validate(context.Background(), spec, candidate)
			if err != nil || batch.WordCount < 60 {
				t.Fatal("example fails language, identity, annotations or word margin", err)
			}
			var preview strings.Builder
			extractor := passageExtractor{}
			for end := 1; end <= len(raw); end++ {
				delta, err := extractor.Extract(context.Background(), raw[:end])
				if err != nil {
					t.Fatal(err)
				}
				preview.WriteString(delta)
				if !strings.HasPrefix(batch.Passage, preview.String()) {
					t.Fatal("annotation leaked")
				}
			}
			if preview.String() != batch.Passage {
				t.Fatal("preview/final mismatch")
			}
			prompt := systemPrompt(spec)
			if !strings.Contains(prompt, raw) || !strings.Contains(prompt, promptExampleInput(language, 50)) {
				t.Fatal("wrong language example in system")
			}
		})
	}
}
