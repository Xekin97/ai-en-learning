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

func TestReviewPassageProjectionUsesAnonymousV13Groups(t *testing.T) {
	t.Parallel()
	keyA := "grp_" + strings.Repeat("A", 22)
	keyB := "grp_" + strings.Repeat("B", 22)
	projection := mapReviewItem(review.Item{
		Stage: "passage_cloze",
		ID:    "itm_contract",
		PassageSegments: []review.Segment{
			{Kind: "blank", BlankID: "blank_1", GroupKey: keyA},
			{Kind: "text", Text: " teams "},
			{Kind: "blank", BlankID: "blank_2", GroupKey: keyB},
			{Kind: "text", Text: " and "},
			{Kind: "blank", BlankID: "blank_3", GroupKey: keyA},
		},
	})
	segments, ok := projection["passage_segments"].([]any)
	if !ok || len(segments) != 5 {
		t.Fatalf("unexpected passage projection: %#v", projection)
	}
	wantKeys := []string{keyA, keyB, keyA}
	blankIndex := 0
	for _, rawSegment := range segments {
		segment, ok := rawSegment.(map[string]any)
		if !ok {
			t.Fatalf("segment is %T, want object", rawSegment)
		}
		if segment["kind"] == "text" {
			if len(segment) != 2 {
				t.Fatalf("text segment contains fields outside the v1.3 contract: %#v", segment)
			}
			continue
		}
		if len(segment) != 3 || segment["blank_id"] == "" || segment["group_key"] != wantKeys[blankIndex] {
			t.Fatalf("blank segment does not match v1.3: %#v", segment)
		}
		blankIndex++
	}
	if blankIndex != len(wantKeys) {
		t.Fatalf("blank count = %d, want %d", blankIndex, len(wantKeys))
	}
	raw, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"target_id", "source_entry", "surface", "length_hint", "Learning", "learned"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("passage projection exposed %q: %s", forbidden, raw)
		}
	}
}

func TestReviewSpellingProjectionDoesNotExposeGroupKey(t *testing.T) {
	t.Parallel()
	projection := mapReviewItem(review.Item{
		Stage: "spelling",
		ID:    "itm_spelling",
		HintSegments: []review.Segment{
			{Kind: "text", Text: "Keep "},
			{Kind: "blank", LengthHint: 8, GroupKey: "grp_" + strings.Repeat("A", 22)},
		},
	})
	raw, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "group_key") {
		t.Fatalf("spelling projection exposed a passage-only group key: %s", raw)
	}
}

func TestReviewActionRejectsV13GroupKeyAtEveryRequestLevel(t *testing.T) {
	t.Parallel()
	for name, raw := range map[string]string{
		"top level":      `{"action_id":"act_1","item_id":"itm_1","action":"skip","group_key":"grp_forbidden"}`,
		"answer element": `{"action_id":"act_1","item_id":"itm_1","action":"answer","answers":[{"blank_id":"blank_1","answer":"learn","group_key":"grp_forbidden"}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest("POST", "/api/v1/me/review-attempts/att_1/actions", strings.NewReader(raw))
			writer := httptest.NewRecorder()
			var body reviewActionRequest
			if err := decodeStrict(writer, request, &body, 2048); err == nil {
				t.Fatalf("review action accepted group_key: %s", raw)
			}
		})
	}
}
