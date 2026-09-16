//go:build uatdiagnostics

package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"wordweave/internal/ai"
)

// The passage is user-supplied evidence. All metadata below is synthetic, not
// recovered provider output. This checks the ability to diagnose either section.
func TestQACaptureUserPassagePreservesDiagnosticDistinction(t *testing.T) {
	const passage = "Last weekend, Maya visited her grandfather's vineyard, where rows of young grape vines stretched toward the sun. He warned her about the danger of slippery paths after rain and always enforced the rule that everyone wear sturdy boots. As they walked together, he explained how each young plant needed care before it could produce sweet fruit."
	entries := []string{"young", "grape", "weekend", "danger", "enforce"}
	spec := ai.GenerationSpec{RunID: "qa-synthetic-only", ModelID: "qa-local-model", MeaningLanguage: "zh", Scenario: "story", LengthCode: "short", MinimumWords: 50, Entries: entries, PromptVersion: ai.PromptVersion}
	lexicon, err := ai.LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	validator := ai.NewValidator(lexicon)
	makeCandidate := func() ai.Candidate {
		return ai.Candidate{Passage: passage, Tags: []string{"故事"}, Targets: []ai.CandidateTarget{
			{SourceEntry: "young", EntryMeaning: "年轻的", HintPhrase: "young people", PassageForms: []string{"young"}, HintForms: []string{"young"}},
			{SourceEntry: "grape", EntryMeaning: "葡萄", HintPhrase: "fresh grapes", PassageForms: []string{"grape"}, HintForms: []string{"grapes"}},
			{SourceEntry: "weekend", EntryMeaning: "周末", HintPhrase: "last weekend", PassageForms: []string{"weekend"}, HintForms: []string{"weekend"}},
			{SourceEntry: "danger", EntryMeaning: "危险", HintPhrase: "great danger", PassageForms: []string{"danger"}, HintForms: []string{"danger"}},
			{SourceEntry: "enforce", EntryMeaning: "执行；强制实行", HintPhrase: "enforce the rules", PassageForms: []string{"enforced"}, HintForms: []string{"enforce"}},
		}}
	}
	valid, err := validator.Validate(context.Background(), spec, makeCandidate())
	if err != nil || len(valid.Targets[0].PassageOccurrences) != 2 || valid.Targets[4].PassageOccurrences[0].Surface != "enforced" {
		t.Fatalf("passage fixture itself is not valid: %v", err)
	}
	for _, section := range []string{"passage", "hint"} {
		t.Run(section, func(t *testing.T) {
			candidate := makeCandidate()
			if section == "passage" {
				candidate.Targets[1].PassageForms = []string{"grapes"}
			} else {
				candidate.Targets[1].HintForms = []string{"grape"}
			}
			_, err := validator.Validate(context.Background(), spec, candidate)
			var failure *ai.MappingValidationError
			if !errors.As(err, &failure) || failure.Reason != "mapping_surface_absent" || failure.Target != 1 {
				t.Fatalf("unexpected diagnostic: %v", err)
			}
			dir := t.TempDir()
			if err := os.Chmod(dir, 0o700); err != nil {
				t.Fatal(err)
			}
			ticket := captureTicket{ExpiresAt: time.Now().Add(time.Minute), ModelID: spec.ModelID, MeaningLanguage: "zh", Scenario: "story", Length: "short", Entries: entries}
			raw, _ := json.Marshal(ticket)
			if err := os.WriteFile(filepath.Join(dir, "ticket.json"), raw, 0o600); err != nil {
				t.Fatal(err)
			}
			t.Setenv("UAT_FAILURE_CAPTURE_DIR", dir)
			capture, err := newFailureCapture("http://localhost:6001")
			if err != nil || capture == nil {
				t.Fatalf("capture not available: %v", err)
			}
			defer capture.Close()
			capture.Record(spec, candidate, failure.Reason, failure.Target)
			raw, err = os.ReadFile(filepath.Join(dir, "failure.json"))
			if err != nil {
				t.Fatal(err)
			}
			var got struct {
				Candidate ai.Candidate `json:"candidate"`
			}
			if json.Unmarshal(raw, &got) != nil || !reflect.DeepEqual(got.Candidate, candidate) {
				t.Fatal("capture lost the evidence needed to distinguish hint from passage")
			}
			_, replayErr := validator.Validate(context.Background(), spec, got.Candidate)
			if !errors.As(replayErr, &failure) || failure.Reason != "mapping_surface_absent" || failure.Target != 1 {
				t.Fatal("offline replay changed outcome")
			}
			t.Log("synthetic metadata: original candidate retained; section mismatch can be distinguished offline; no model call")
		})
	}
}
