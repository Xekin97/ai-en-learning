//go:build integration

package generation

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/ai"
)

type usageFactFixture struct {
	stage, prompt, review string
	reasons               []string
	repair                bool
}

func recordUsageFacts(t *testing.T, ctx context.Context, pool *pgxpool.Pool, run uuid.UUID, preview bool, model string, facts ...usageFactFixture) {
	t.Helper()
	owner := "user_run_id"
	if preview {
		owner = "preview_run_id"
	}
	for index, fact := range facts {
		if fact.review == "" {
			fact.review = "not_applicable"
		}
		if fact.reasons == nil {
			fact.reasons = []string{}
		}
		_, err := pool.Exec(ctx, `INSERT INTO wordweave.ai_call_usage(`+owner+`,call_no,model_snapshot,usage_status,completed_at,call_stage,prompt_version,provider_invoked,review_result,reason_codes,repair_requested)
			VALUES($1,$2,$3,'unknown',clock_timestamp(),$4,$5,true,$6,$7,$8)`, run, index+1, model, fact.stage, fact.prompt, fact.review, fact.reasons, fact.repair)
		if err != nil {
			t.Fatal(err)
		}
	}
}

func recordSuccessfulPipelineFacts(t *testing.T, ctx context.Context, pool *pgxpool.Pool, run Run, preview bool) {
	t.Helper()
	facts := []usageFactFixture{{"planning", ai.PlanPromptVersion, "", nil, false}, {"generation", ai.PromptVersion, "", nil, false}}
	if run.Snapshot.ContentService.ContentReviewEnabled {
		facts = append(facts,
			usageFactFixture{"fixed_edit", ai.FixedEditPromptVersion, "", nil, false},
			usageFactFixture{"content_review", ai.ReviewPromptVersion, "pass", nil, false},
		)
	}
	recordUsageFacts(t, ctx, pool, run.ID, preview, run.Spec.ProviderModelID, facts...)
}
