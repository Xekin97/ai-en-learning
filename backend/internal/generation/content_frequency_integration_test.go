//go:build integration

package generation

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestContentFrequencySeparatesRunCallIntersectionAndUnknownBounds(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.accounts SET group_code='pro' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	var model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Frequency model','test/frequency',true) RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('pro',$1)`, model); err != nil {
		t.Fatal(err)
	}
	envelope, err := security.NewEnvelope(map[int][]byte{1: make([]byte, 32)}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(pool, envelope)
	if err = credentials.Put(ctx, owner, "synthetic-not-a-real-key"); err != nil {
		t.Fatal(err)
	}
	service := NewService(pool, credentials, nil, []byte(strings.Repeat("f", 32)), 30*time.Minute, ai.Validator{})
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "pro"}
	run, err := service.Start(ctx, actor, Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn", "weave"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.ai_call_usage(user_run_id,call_no,model_snapshot,usage_status,completed_at,call_stage,prompt_version,provider_invoked,review_result,reason_codes,repair_requested) VALUES
		($1,1,'test/frequency','unknown',clock_timestamp(),'content_review','m003-review-v2',true,'issues',ARRAY['forced_wording','contradiction'],true),
		($1,2,'test/frequency','unknown',clock_timestamp(),'content_repair','m003-rewrite-v3',true,'not_applicable',ARRAY['forced_wording'],false),
		($1,3,'test/frequency','unknown',clock_timestamp(),'content_repair','m003-rewrite-v3',NULL,'not_applicable',ARRAY['contradiction'],false),
		($1,4,'test/frequency','unknown',clock_timestamp(),'content_repair','m003-rewrite-v3',false,'not_applicable',ARRAY['forced_wording','contradiction'],false)`, run.ID); err != nil {
		t.Fatal(err)
	}
	stats, err := service.DiagnoseContentFrequency(ctx, time.Now().Add(-time.Hour), time.Now().Add(time.Hour), "normal", false)
	if err != nil {
		t.Fatal(err)
	}
	if stats.AcceptedRuns != 1 || stats.EnhancedRuns != 1 || stats.ReviewRuns.Lower != 1 || stats.ReviewIssueRuns != 1 || stats.RepairRequestedRuns != 1 {
		t.Fatalf("unexpected denominators/review: %+v", stats)
	}
	if stats.RepairRuns != (InvocationBounds{Lower: 1, Upper: 1, Unknown: 1, NotInvoked: 1}) {
		t.Fatalf("repair run bounds: %+v", stats.RepairRuns)
	}
	if stats.ForcedRuns.Lower != 1 || stats.ContradictionRuns.Lower != 0 || stats.ContradictionRuns.Upper != 1 || stats.ForcedAndContradictionRuns.Lower != 0 || stats.ForcedAndContradictionRuns.Upper != 1 || stats.ForcedOrContradictionRuns.Lower != 1 {
		t.Fatalf("F/C run facts: forced=%+v contradiction=%+v intersection=%+v union=%+v", stats.ForcedRuns, stats.ContradictionRuns, stats.ForcedAndContradictionRuns, stats.ForcedOrContradictionRuns)
	}
	if stats.RepairCalls != (InvocationBounds{Lower: 1, Upper: 2, Unknown: 1, NotInvoked: 1}) || stats.ForcedAndContradictionCalls.Upper != 0 {
		t.Fatalf("repair call facts: repair=%+v intersection=%+v", stats.RepairCalls, stats.ForcedAndContradictionCalls)
	}
	if stats.Stages["content_review"].Lower != 1 || stats.Stages["content_repair"].Lower != 1 || stats.Stages["content_repair"].Upper != 2 {
		t.Fatalf("stage facts: %+v", stats.Stages)
	}
}
