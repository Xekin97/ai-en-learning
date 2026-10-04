package growth

import (
	"math"
	"testing"
)

func TestCheckinCapPreventsIntermediateOverflow(t *testing.T) {
	got, err := CheckinPoints(1, math.MaxInt64, 100, 30)
	if err != nil || got != 100 {
		t.Fatalf("capped reward: %d %v", got, err)
	}
	got, err = CheckinPoints(5, 2, 20, 4)
	if err != nil || got != 11 {
		t.Fatalf("streak reward: %d %v", got, err)
	}
	if _, err = CheckinPoints(5, 2, 4, 1); err == nil {
		t.Fatal("invalid cap accepted")
	}
}
