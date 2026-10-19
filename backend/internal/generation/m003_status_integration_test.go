//go:build integration

package generation

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestM003GenerationStatusUsesPersistedOutcomeOwnerAndTTL(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.accounts SET group_code='pro' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	var model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('M003 status model','test/m003-status',true) RETURNING id`).Scan(&model); err != nil {
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
	service := NewService(pool, credentials, nil, []byte(strings.Repeat("s", 32)), 30*time.Minute, ai.Validator{})
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "pro"}
	run, err := service.Start(ctx, actor, Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn", "weave"}})
	if err != nil {
		t.Fatal(err)
	}
	stop := "content_review_invalid"
	recordUsageFacts(t, ctx, pool, run.ID, false, run.Spec.ProviderModelID,
		usageFactFixture{"planning", ai.PlanPromptVersion, "", nil, false},
		usageFactFixture{"generation", ai.PromptVersion, "", nil, false},
		usageFactFixture{"fixed_edit", ai.FixedEditPromptVersion, "", nil, false})
	if err = service.CompletePipeline(ctx, run, PipelineResult{Version: 1, Batch: samplePreset(), Outcome: OutcomeServiceIncomplete, StopReason: &stop}); err != nil {
		t.Fatal(err)
	}
	view, err := service.ReadStatus(ctx, actor, run.ID, run.Token)
	if err != nil || view.Status != "valid" || view.ContentOutcome == nil || *view.ContentOutcome != OutcomeServiceIncomplete || view.FinalContentVersion == nil || *view.FinalContentVersion != 1 || view.CompletionNotice == nil || *view.CompletionNotice != "content_review_incomplete" || view.Result == nil || !view.CanSave || view.QuotaRefunded {
		t.Fatalf("view=%+v err=%v", view, err)
	}
	other := identity.Actor{ID: testdb.Learner(t, ctx, pool), Kind: "account", Role: "learner", GroupCode: "registered"}
	if _, err = service.ReadStatus(ctx, other, run.ID, run.Token); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("cross-account status error=%v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.generation_runs SET completed_at=clock_timestamp()-$2::interval WHERE id=$1`, run.ID, intervalLiteral(TerminalTokenRetention+time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err = service.ReadStatus(ctx, actor, run.ID, run.Token); !errors.Is(err, ErrRunExpired) {
		t.Fatalf("expired status error=%v", err)
	}
}

func TestM003TrialPaidPlanCanSnapshotN0AndReachBasicTerminal(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.entitlement_groups
		SET content_review_enabled=false,content_repair_limit=0 WHERE code='pro'`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.plan_trials(owner_id,target_plan_code,started_at,ends_at)
		VALUES($1,'pro',clock_timestamp(),clock_timestamp()+interval '1 day')`, owner); err != nil {
		t.Fatal(err)
	}
	var model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('M003 N0 trial model','test/m003-n0-trial',true) RETURNING id`).Scan(&model); err != nil {
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
	service := NewService(pool, credentials, nil, []byte(strings.Repeat("n", 32)), 30*time.Minute, ai.Validator{})
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "registered"}
	run, err := service.Start(ctx, actor, Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn", "weave"}})
	if err != nil {
		t.Fatal(err)
	}
	if run.Snapshot.EffectivePlan.Code != "pro" || run.Snapshot.EffectivePlan.Origin != "trial" || run.Snapshot.ContentService.ContentReviewEnabled || run.Snapshot.ContentService.ContentRepairLimit != 0 {
		t.Fatalf("unexpected trial N0 snapshot: %+v", run.Snapshot)
	}
	recordSuccessfulPipelineFacts(t, ctx, pool, run, false)
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_call_usage SET model_snapshot='wrong/model' WHERE user_run_id=$1 AND call_stage='generation'`, run.ID); err != nil {
		t.Fatal(err)
	}
	if err = service.CompletePipeline(ctx, run, PipelineResult{Version: 1, Batch: samplePreset(), Outcome: OutcomeBasic}); !errors.Is(err, errContentUsageFacts) {
		t.Fatalf("mismatched provider facts accepted: %v", err)
	}
	var activeStatus string
	if err = pool.QueryRow(ctx, `SELECT call_status FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&activeStatus); err != nil || activeStatus != "active" {
		t.Fatalf("usage rejection changed terminal state: %q %v", activeStatus, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_call_usage SET model_snapshot=$2 WHERE user_run_id=$1 AND call_stage='generation'`, run.ID, run.Spec.ProviderModelID); err != nil {
		t.Fatal(err)
	}
	if err = service.CompletePipeline(ctx, run, PipelineResult{Version: 1, Batch: samplePreset(), Outcome: OutcomeBasic}); err != nil {
		t.Fatal(err)
	}
	var status, outcome, pipeline, origin string
	var enabled bool
	var limit, version int
	if err = pool.QueryRow(ctx, `SELECT call_status,content_outcome,pipeline_version_snapshot,plan_origin_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,final_content_version FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&status, &outcome, &pipeline, &origin, &enabled, &limit, &version); err != nil {
		t.Fatal(err)
	}
	if status != "valid" || outcome != OutcomeBasic || pipeline != "m003-content-v5" || origin != "trial" || enabled || limit != 0 || version != 1 {
		t.Fatalf("unexpected persisted N0 terminal: %q %q %q %q %v %d %d", status, outcome, pipeline, origin, enabled, limit, version)
	}
}

func TestM003PreviewStatusKeepsAcceptedModeAfterDraftModeChanges(t *testing.T) {
	service, pool, ctx, admin, input := presetFixture(t)
	input.PreviewContentMode = "enhanced"
	preset, revision, err := service.SavePreset(ctx, admin, uuid.Nil, input, "")
	if err != nil {
		t.Fatal(err)
	}
	run, err := service.StartPreviewMode(ctx, admin, preset.ID, preset.DraftVersion, "enhanced")
	if err != nil {
		t.Fatal(err)
	}
	stop := "content_rate_limited"
	recordUsageFacts(t, ctx, pool, run.ID, true, run.Spec.ProviderModelID,
		usageFactFixture{"planning", ai.PlanPromptVersion, "", nil, false},
		usageFactFixture{"generation", ai.PromptVersion, "", nil, false},
		usageFactFixture{"fixed_edit", ai.FixedEditPromptVersion, "", nil, false})
	if _, err = service.CompletePreviewPipeline(ctx, run, PipelineResult{Version: 1, Batch: samplePreset(), Outcome: OutcomeServiceIncomplete, StopReason: &stop}); err != nil {
		t.Fatal(err)
	}
	input.PreviewContentMode = "basic"
	if _, _, err = service.SavePreset(ctx, admin, preset.ID, input, revision); err != nil {
		t.Fatal(err)
	}
	view, err := service.ReadPreviewStatus(ctx, admin, run.ID, run.Token)
	if err != nil || view.Status != "valid" || view.PreviewContentMode != "enhanced" || view.ContentOutcome == nil || *view.ContentOutcome != OutcomeServiceIncomplete || view.CompletionNotice == nil || view.Result == nil || view.FinalContentVersion == nil || *view.FinalContentVersion != 1 {
		t.Fatalf("view=%+v err=%v", view, err)
	}
	otherAdmin := identity.Actor{ID: uuid.New(), Kind: "account", Role: "admin"}
	if _, err = service.ReadPreviewStatus(ctx, otherAdmin, run.ID, run.Token); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("cross-admin status error=%v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET completed_at=clock_timestamp()-$2::interval WHERE id=$1`, run.ID, intervalLiteral(TerminalTokenRetention+time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err = service.ReadPreviewStatus(ctx, admin, run.ID, run.Token); !errors.Is(err, ErrRunExpired) {
		t.Fatalf("expired preview status error=%v", err)
	}
}
