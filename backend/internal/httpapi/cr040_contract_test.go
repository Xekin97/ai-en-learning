package httpapi

import (
	"encoding/json"
	"strings"
	"testing"

	"wordweave/internal/ai"
	"wordweave/internal/learning"
	"wordweave/internal/review"
)

func TestCR040AllMeaningProjectionsUseOnlyCurrentKey(t *testing.T) {
	const meaning = "易受伤害的；脆弱的"
	item := review.DraftWord{QuestionID: "spelling-current", EntryMeaning: meaning}
	cases := map[string]any{
		"validated":                mapGenerationResult(ai.ValidatedBatch{Targets: []ai.ValidatedTarget{{Entry: "vulnerable", EntryMeaning: meaning}}}),
		"learner_and_admin_detail": mapBatchDetail(learning.BatchDetail{Targets: []learning.TargetDetail{{Entry: "vulnerable", EntryMeaning: meaning}}}),
		"review_word":              item,
	}
	for name, value := range cases {
		t.Run(name, func(t *testing.T) {
			raw, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(raw), `"entry_meaning":"`+meaning+`"`) ||
				strings.Contains(string(raw), "contextual_meaning") {
				t.Fatal("projection differs from current contract")
			}
		})
	}
	raw, _ := json.Marshal(review.DraftSegment{Kind: "blank", BlankID: "passage-current", GroupKey: "opaque"})
	if strings.Contains(string(raw), "entry_meaning") || strings.Contains(string(raw), meaning) {
		t.Fatal("stage two leaked meaning")
	}
}
