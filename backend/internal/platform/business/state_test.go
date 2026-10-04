package business

import (
	"encoding/json"
	"testing"
	"time"
)

func TestLearningDayBoundary(t *testing.T) {
	for _, tt := range []struct{ at, day string }{
		{"2026-09-20T03:59:59+08:00", "2026-09-19"},
		{"2026-09-20T04:00:00+08:00", "2026-09-20"},
		{"2026-09-19T20:00:00Z", "2026-09-20"},
		{"2026-01-01T00:00:00+08:00", "2025-12-31"},
	} {
		at, _ := time.Parse(time.RFC3339, tt.at)
		if got := LearningDay(at).Format(time.DateOnly); got != tt.day {
			t.Fatalf("%s: %s", tt.at, got)
		}
	}
}
func TestAmountRejectsLossyAndAmbiguousInputs(t *testing.T) {
	for _, raw := range []string{`null`, `0`, `1.5`, `""`, `"-1"`, `"+1"`, `"01"`, `"1e3"`, `"9223372036854775808"`, `" 1"`} {
		var a Amount
		if json.Unmarshal([]byte(raw), &a) == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	for _, raw := range []string{`"0"`, `"9007199254740993"`, `"9223372036854775807"`} {
		var a Amount
		if err := json.Unmarshal([]byte(raw), &a); err != nil {
			t.Fatal(err)
		}
		got, _ := json.Marshal(a)
		if string(got) != raw {
			t.Fatalf("amount changed: %s", got)
		}
	}
}
func TestRevisionBindsResourceAndVersion(t *testing.T) {
	key := []byte("test-key")
	token := Revision(key, "batch:a", 1)
	if !MatchRevision(key, "batch:a", 1, token) || MatchRevision(key, "batch:b", 1, token) || MatchRevision(key, "batch:a", 2, token) {
		t.Fatal("revision scope mismatch")
	}
}
