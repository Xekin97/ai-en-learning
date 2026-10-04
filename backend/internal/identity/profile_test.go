package identity

import (
	"testing"
	"time"
)

func TestWelcomeUsesLearningDayAndUnknownRemainsUnknown(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-09-20T04:00:00+08:00")
	if got := welcome("reader", nil, now); got.Kind != "no_learning" || got.DaysSinceLearning != nil || got.PreviousLearningAt != nil {
		t.Fatalf("unknown history: %+v", got)
	}
	for _, tt := range []struct {
		at, kind string
		days     int
	}{
		{"2026-09-20T03:59:59+08:00", "returning", 1},
		{"2026-09-20T04:00:00+08:00", "same_day", 0},
		{"2026-09-15T04:00:00+08:00", "returning", 5},
	} {
		at, _ := time.Parse(time.RFC3339, tt.at)
		got := welcome("reader", &at, now)
		if got.Kind != tt.kind || *got.DaysSinceLearning != tt.days {
			t.Fatalf("%s: %+v", tt.at, got)
		}
	}
}
