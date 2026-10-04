package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"wordweave/internal/ai"
	"wordweave/internal/review"
)

func TestGenerationResultUsesPluralSafeHintBlanks(t *testing.T) {
	t.Parallel()
	result := mapGenerationResult(ai.ValidatedBatch{
		Passage: "Learning works.",
		Tags:    []string{"study"},
		Targets: []ai.ValidatedTarget{{
			Entry:        "learn",
			EntryMeaning: "gain knowledge",
			HintPhrase:   "learning while learning",
			HintOccurrences: []ai.Occurrence{
				{Surface: "learning", Start: 0, End: 8},
				{Surface: "learning", Start: 15, End: 23},
			},
			PassageOccurrences: []ai.Occurrence{{Surface: "Learning", Start: 0, End: 8}},
		}},
	})
	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	encoded := string(raw)
	if !strings.Contains(encoded, `"hint_blanks":[{"start":0,"end":8},{"start":15,"end":23}]`) {
		t.Fatalf("plural hint blanks missing: %s", encoded)
	}
	for _, forbidden := range []string{`"hint_blank":`, `"hint_surface":`, `"hint_occurrences":`, `"passage_occurrences":`} {
		if strings.Contains(encoded, forbidden) {
			t.Fatalf("public result exposed internal field %s: %s", forbidden, encoded)
		}
	}
}

func TestReviewDraftProjectionKeepsPassageBlanksAnonymous(t *testing.T) {
	draft := review.DraftAttempt{Words: []review.DraftWord{{QuestionID: "question", EntryMeaning: "gain knowledge", Slots: []review.Slot{{Kind: "letters", Count: 5}}}}}
	draft.Words[0].Hint.Segments = []review.HintSegment{{Kind: "text", Text: "Keep "}, {Kind: "blank"}}
	draft.Passage.Segments = []review.DraftSegment{{Kind: "blank", BlankID: "blank_1", GroupKey: "opaque_group"}, {Kind: "text", Text: " and "}, {Kind: "blank", BlankID: "blank_2", GroupKey: "opaque_group"}}
	raw, err := json.Marshal(draft)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"target_id", "source_entry", "surface", "length_hint", "Learning", "learned", "passage_preview", "title"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("draft exposed %q", forbidden)
		}
	}
	var object map[string]any
	if err = json.Unmarshal(raw, &object); err != nil {
		t.Fatal(err)
	}
	segments := object["passage"].(map[string]any)["segments"].([]any)
	first, last := segments[0].(map[string]any), segments[2].(map[string]any)
	if len(first) != 3 || first["blank_id"] == last["blank_id"] || first["group_key"] != last["group_key"] {
		t.Fatal("per-occurrence identity or same-target grouping lost")
	}
	hints := object["words"].([]any)[0].(map[string]any)["hint"].(map[string]any)["segments"].([]any)
	if len(hints[1].(map[string]any)) != 1 {
		t.Fatal("hint blank leaked identity or length")
	}
}
func TestReviewSubmissionRejectsGroupKeyAtEveryRequestLevel(t *testing.T) {
	for _, raw := range []string{
		`{"expected_revision":"revision","words":[],"passage":[],"group_key":"forbidden"}`,
		`{"expected_revision":"revision","words":[],"passage":[{"blank_id":"blank","answer":"learn","group_key":"forbidden"}]}`,
	} {
		request := httptest.NewRequest("POST", "/api/v1/me/review-attempts/test/submit", strings.NewReader(raw))
		writer := httptest.NewRecorder()
		var body reviewSubmitRequest
		if err := decodeStrict(writer, request, &body, 2048); err == nil {
			t.Fatal("accepted passage-only grouping in submitted answer")
		}
	}
}
