package generation

import (
	"testing"

	"wordweave/internal/entitlement"
)

func TestValidPipelineForAcceptedContentServiceSnapshot(t *testing.T) {
	stop := "content_review_invalid"
	basic := entitlement.ContentService{NativeValidation: true}
	enhanced := entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 2}
	for _, test := range []struct {
		name    string
		service entitlement.ContentService
		result  PipelineResult
		want    bool
	}{
		{"basic", basic, PipelineResult{Version: 1, Outcome: OutcomeBasic}, true},
		{"basic cannot claim review", basic, PipelineResult{Version: 1, Outcome: OutcomeReviewPassed}, false},
		{"enhanced fixed edit review pass", enhanced, PipelineResult{Version: 2, Outcome: OutcomeReviewPassed}, true},
		{"enhanced review cannot skip fixed version", enhanced, PipelineResult{Version: 1, Outcome: OutcomeReviewPassed}, false},
		{"enhanced repaired", enhanced, PipelineResult{Version: 3, Outcome: OutcomeRepairedPassed}, true},
		{"enhanced limit", enhanced, PipelineResult{Version: 4, Outcome: OutcomeLimitFinalized}, true},
		{"enhanced limit wrong version", enhanced, PipelineResult{Version: 3, Outcome: OutcomeLimitFinalized}, false},
		{"enhanced retained incomplete", enhanced, PipelineResult{Version: 1, Outcome: OutcomeServiceIncomplete, StopReason: &stop}, true},
		{"enhanced cannot claim basic", enhanced, PipelineResult{Version: 1, Outcome: OutcomeBasic}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := validPipelineForService(test.service, test.result); got != test.want {
				t.Fatalf("got %v want %v", got, test.want)
			}
		})
	}
}
