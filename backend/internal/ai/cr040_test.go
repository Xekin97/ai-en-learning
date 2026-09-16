package ai

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestCR040EntryMeaningPromptAcrossConfigurations(t *testing.T) {
	for language, name := range map[string]string{"zh": "Chinese", "en": "English", "ja": "Japanese"} {
		for _, scenario := range []string{"discussion", "story", "business", "news"} {
			for _, probe := range []bool{false, true} {
				spec := GenerationSpec{Entries: []string{"vulnerable"}, MeaningLanguage: language, Scenario: scenario, PromptVersion: PromptVersion, CompatibilityProbe: probe}
				prompt := systemPrompt(spec)
				var parameters map[string]any
				if err := json.Unmarshal([]byte(userPrompt(spec)), &parameters); err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(prompt, entryMeaningInstruction) || parameters["meaning_language"] != name {
					t.Fatal("dedicated original-entry instruction or language missing")
				}
				for _, forbidden := range []string{"one contextual meaning", "part of speech in context"} {
					if strings.Contains(prompt, forbidden) {
						t.Fatal("conflicting old instruction remains")
					}
				}
				if PromptVersion != "m001-v5-r10" {
					t.Fatal("prompt version not bumped")
				}
			}
		}
	}
	target := outputSchema(GenerationSpec{Entries: []string{"vulnerable"}, MeaningLanguage: "en"})["properties"].(map[string]any)["targets"].(map[string]any)["properties"].(map[string]any)["vulnerable"].(map[string]any)
	properties := target["properties"].(map[string]any)
	if _, old := properties["contextual_meaning"]; old {
		t.Fatal("old schema property")
	}
	if properties["entry_meaning"].(map[string]any)["description"] != `General dictionary meanings of "vulnerable" in English, independent of the passage.` {
		t.Fatal("schema must describe the original entry without repeating the instruction")
	}
}

func TestCR040CandidateKeysAndValueBoundaries(t *testing.T) {
	spec, candidate := mappingCandidate("vulnerable", "Vulnerability matters.", "vulnerable people", []string{"vulnerability"}, []string{"vulnerable"})
	raw, _ := []byte(p0JSON(candidate)), error(nil)
	for name, replacement := range map[string]string{
		"old":        `"contextual_meaning":"open to harm"`,
		"dual":       `"entry_meaning":"open to harm","contextual_meaning":"open to harm"`,
		"missing":    `"unexpected":"open to harm"`,
		"null":       `"entry_meaning":null`,
		"number":     `"entry_meaning":12`,
		"case_alias": `"Entry_Meaning":"open to harm"`,
	} {
		t.Run(name, func(t *testing.T) {
			body := strings.Replace(string(raw), `"entry_meaning":"open to harm; easily injured"`, replacement, 1)
			var decoded Candidate
			if decodeCandidateStrict(context.Background(), []byte(body), &decoded) == nil {
				t.Fatal("invalid current candidate accepted")
			}
		})
	}
	validator := testValidator(t)
	for _, value := range []string{"", " open to harm", "open to harm ", strings.Repeat("a", 501)} {
		candidate.Targets[0].EntryMeaning = value
		if _, err := validator.Validate(context.Background(), spec, candidate); err == nil {
			t.Fatal("invalid meaning accepted")
		}
	}
	candidate.Targets[0].EntryMeaning = "open to harm; easily injured"
	for _, passage := range []string{"Vulnerability matters.", "Vulnerable people face vulnerability."} {
		candidate.Passage = annotateFixture(passage, "vulnerable", []string{"vulnerable", "vulnerability"})
		batch, err := validator.Validate(context.Background(), spec, candidate)
		if err != nil || batch.Targets[0].EntryMeaning != candidate.Targets[0].EntryMeaning {
			t.Fatal("meaning changed with passage or was truncated")
		}
	}
}

func TestCR040CurrentSnapshotStrictAndUnmodified(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/cr040/v4-validated.json")
	if err != nil {
		t.Fatal(err)
	}
	batch, err := DecodeSnapshot(raw)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(batch)
	if err != nil {
		t.Fatal(err)
	}
	roundTrip, err := DecodeSnapshot(encoded)
	if err != nil || !reflect.DeepEqual(batch, roundTrip) {
		t.Fatal("current snapshot changed")
	}
	for name, body := range map[string]string{
		"old":            strings.ReplaceAll(string(raw), "entry_meaning", "contextual_meaning"),
		"dual":           strings.Replace(string(raw), `"entry_meaning":`, `"contextual_meaning":"unused","entry_meaning":`, 1),
		"missing":        strings.Replace(string(raw), `"entry_meaning": "open to harm; easily injured",`, "", 1),
		"null":           strings.Replace(string(raw), `"open to harm; easily injured"`, "null", 1),
		"number":         strings.Replace(string(raw), `"open to harm; easily injured"`, "3", 1),
		"alias":          strings.ReplaceAll(string(raw), "entry_meaning", "ENTRY_MEANING"),
		"duplicate":      strings.Replace(string(raw), `"entry_meaning":`, `"entry_meaning":"first","entry_meaning":`, 1),
		"null_offset":    strings.Replace(string(raw), `"start": 0`, `"start": null`, 1),
		"missing_offset": strings.Replace(string(raw), `"start": 0,`, "", 1),
		"trailing":       string(raw) + "{}",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := DecodeSnapshot([]byte(body)); err == nil {
				t.Fatal("invalid snapshot accepted")
			}
		})
	}
	for _, value := range []string{"", " x", "x ", strings.Repeat("𠮷", 501)} {
		batch.Targets[0].EntryMeaning = value
		if ValidateSnapshot(batch) == nil {
			t.Fatal("invalid persisted meaning accepted")
		}
	}
	batch.Targets[0].EntryMeaning = strings.Repeat("𠮷", 500)
	if ValidateSnapshot(batch) != nil {
		t.Fatal("500 Unicode code points rejected")
	}
	batch.Targets[0].PassageOccurrences[0].End++
	if ValidateSnapshot(batch) == nil {
		t.Fatal("invalid immutable span accepted")
	}
}
