//go:build integration

package admin

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestM002ModelsRetireAndReuseProviderAsNewIdentity(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, nil, nil, nil, []byte("admin-models"))
	model, err := s.CreateModel(ctx, "Reusable model", nil, "test/model")
	if err != nil {
		t.Fatal(err)
	}
	if model.Enabled || model.RetiredAt != nil {
		t.Fatal("model was automatically enabled")
	}
	if _, err = pool.Exec(ctx, `WITH activated AS(UPDATE wordweave.ai_models SET enabled=true WHERE id=$1) INSERT INTO wordweave.group_models(group_code,model_id) VALUES('registered',$1)`, model.ID); err != nil {
		t.Fatal(err)
	}
	impact, err := s.RemovalImpact(ctx, "admin:session", model.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(impact.Groups) != 1 || impact.Groups[0].Code != "basic" || impact.Groups[0].Remaining != 0 {
		t.Fatalf("lost-model impact missing: %+v", impact)
	}
	if _, _, err = s.RemoveModel(ctx, "admin:another-session", model.ID, impact.Revision, impact.Token, true); !errors.Is(err, ErrImpactChanged) {
		t.Fatalf("confirmation not bound to session: %v", err)
	}
	removed, groups, err := s.RemoveModel(ctx, "admin:session", model.ID, impact.Revision, impact.Token, true)
	if err != nil || removed.RetiredAt == nil || removed.Enabled || len(removed.AssignedGroupCodes) != 0 || len(groups) != 1 {
		t.Fatalf("retirement not atomic: %+v %v", removed, err)
	}
	if _, err = s.SetModelEnabled(ctx, model.ID, removed.Revision, true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("retired model enabled: %v", err)
	}
	if _, err = s.PatchModel(ctx, model.ID, removed.Revision, ModelPatch{ProviderModelIDSet: true, ProviderModelID: "test/new"}); !errors.Is(err, ErrNotFound) {
		t.Fatal("retired identity edited")
	}
	replacement, err := s.CreateModel(ctx, "Reusable model", nil, "test/model")
	if err != nil || replacement.ID == removed.ID {
		t.Fatalf("reused retired identity: %v", err)
	}
	rows, _, _, err := s.ListModels(ctx, "retired", nil, 20)
	if err != nil || len(rows) != 1 || rows[0].ID != removed.ID {
		t.Fatal("retired models disappeared from administration")
	}
}

func TestM002PlanPrioritySwapIsAtomicAndRevisionProtected(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, nil, nil, nil, []byte("admin-plans"))
	before, rev, err := s.ListGroups(ctx)
	if err != nil {
		t.Fatal(err)
	}
	change := PrioritiesInput{Expected: rev, Priorities: []Priority{{"visitor", 0}, {"basic", 1}, {"pro", 3}, {"plus", 2}}}
	after, newRev, err := s.SavePriorities(ctx, change)
	if err != nil {
		t.Fatal(err)
	}
	if after[2].Priority != 3 || after[3].Priority != 2 || newRev == rev {
		t.Fatal("priority swap failed")
	}
	for i, g := range after {
		if g.Code != before[i].Code || g.MaxEntries != before[i].MaxEntries {
			t.Fatal("priority swap changed other plan rights")
		}
	}
	_, _, err = s.SavePriorities(ctx, change)
	var conflict *business.RevisionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("stale swap accepted: %v", err)
	}
	input := GroupInput{Expected: newRev, Priority: 4, Limit: nil, Maximum: 3000, Lengths: []string{"long", "short", "long"}, Models: []uuid.UUID{}}
	impact, err := s.GroupImpact(ctx, "basic", input)
	if err != nil || !impact.LosesModels {
		t.Fatalf("empty model warning missing: %+v %v", impact, err)
	}
	saved, err := s.PutGroup(ctx, "basic", input)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Priority != 4 || saved.Rolling24hLimit != nil || saved.MaxEntries != 3000 || len(saved.AllowedLengths) != 2 || saved.AllowedLengths[0] != "short" {
		t.Fatalf("full rights update lost fields: %+v", saved)
	}
}

func TestM002CredentialCASAndRoleBoundary(t *testing.T) {
	pool, ctx := testdb.Open(t)
	learner := testdb.Learner(t, ctx, pool)
	actor := cr313AdminActor(t, ctx, pool)
	envelope, err := security.NewEnvelope(map[int][]byte{1: make([]byte, 32)}, 1)
	if err != nil {
		t.Fatal(err)
	}
	store := ai.NewCredentialStore(pool, envelope)
	var initial int64
	if err = pool.QueryRow(ctx, `SELECT revision FROM wordweave.growth_settings WHERE singleton`).Scan(&initial); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err = store.Replace(ctx, learner, "fixture-forbidden-key", &initial); err == nil {
		t.Fatal("learner replaced the provider credential")
	}
	status, revision, applied, err := store.Replace(ctx, actor, "fixture-first-key", &initial)
	if err != nil || !applied || revision != initial+1 || !status.Configured {
		t.Fatalf("credential change failed: %+v %d %v %v", status, revision, applied, err)
	}
	_, same, applied, err := store.Replace(ctx, actor, "fixture-stale-key", &initial)
	if err != nil || applied || same != revision {
		t.Fatal("stale credential write advanced configuration")
	}
	key, err := store.Get(ctx)
	if err != nil || key != "fixture-first-key" {
		t.Fatal("stale credential write replaced ciphertext")
	}
	var aiPersonal, aiConfig, aiFunction, appCipher, appFunction, appLedgerDelete bool
	if err = pool.QueryRow(ctx, `SELECT has_table_privilege('wordweave_ai','wordweave.user_items','SELECT'),has_table_privilege('wordweave_ai','wordweave.growth_settings','SELECT'),has_function_privilege('wordweave_ai','wordweave.replace_openrouter_credential(bigint,bytea,bytea,integer,text,uuid)','EXECUTE'),has_table_privilege('wordweave_app','wordweave.openrouter_credentials','SELECT'),has_function_privilege('wordweave_app','wordweave.replace_openrouter_credential(bigint,bytea,bytea,integer,text,uuid)','EXECUTE'),has_table_privilege('wordweave_app','wordweave.growth_ledger','DELETE')`).Scan(&aiPersonal, &aiConfig, &aiFunction, &appCipher, &appFunction, &appLedgerDelete); err != nil {
		t.Fatal(err)
	}
	if aiPersonal || aiConfig || !aiFunction || appCipher || appFunction || appLedgerDelete {
		t.Fatal("credential CAS broadened data permissions")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SET LOCAL ROLE wordweave_ai`); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `SELECT applied,configuration_revision FROM wordweave.replace_openrouter_credential($1,$2,$3,1,'fixture',$4)`, revision, []byte{1}, []byte{1}, actor).Scan(&applied, &same); err != nil || !applied || same != revision+1 {
		t.Fatalf("restricted AI role cannot perform atomic write: %v", err)
	}
	if err = tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	key, err = store.Get(ctx)
	if err != nil || key != "fixture-first-key" {
		t.Fatal("rolled back credential function committed independently")
	}
}

func cr313AdminActor(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var actor uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,status) VALUES($1,'synthetic-admin-hash','admin','active') RETURNING id`, "credential_admin_"+uuid.NewString()[:8]).Scan(&actor); err != nil {
		t.Fatal(err)
	}
	return actor
}

func TestM002BaseResetKeepsTrialUsageAndExpiry(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, nil, nil, nil, []byte("admin-plans"))
	owner := testdb.Learner(t, ctx, pool)
	model := quotaModel(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.entitlement_groups SET rolling_quota_limit=10 WHERE code='pro';`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `WITH trial AS(INSERT INTO wordweave.plan_trials(owner_id,target_plan_code,started_at,ends_at) VALUES($1,'pro',clock_timestamp(),clock_timestamp()+interval '6 days')) INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_at) VALUES($1,'pro','trial','-infinity')`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `WITH runs AS(INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,quota_charged,counts_toward_cumulative,completed_at,content_policy_version,model_request_parameters_snapshot) SELECT $1,$1,'pro',$2,'Fixture','test/quota','en','story','short',30,5,'valid',true,true,clock_timestamp(),NULL,'{"version":"custom-parameters-v1","custom_parameters":{},"output_mode":"prompt","max_output_tokens":null,"structured_route":"unchanged"}'::jsonb FROM generate_series(1,8) RETURNING id,started_at,completed_at) INSERT INTO wordweave.generation_charges(run_id,account_id,source_kind,plan_code,origin,quota_epoch,state,charged_at,settled_at) SELECT id,$1,'plan','pro','trial',0,'consumed',started_at,completed_at FROM runs`, owner, model); err != nil {
		t.Fatal(err)
	}
	before, err := s.GetUser(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	assertQuota(t, before, "limited", 2)
	prior, err := s.Benefits(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := s.ChangeUserGroup(ctx, owner, "pro", true, *before.BaseRevision)
	if err != nil {
		t.Fatal(err)
	}
	assertQuota(t, changed, "limited", 10)
	benefits, err := s.Benefits(ctx, owner)
	if err != nil || benefits.Origin != "base" || *benefits.Trial.Quota.Remaining != 2 || !benefits.Trial.Ends.Equal(prior.Trial.Ends) {
		t.Fatalf("trial affected by base reset: %+v %v", benefits, err)
	}
	if _, err = s.ChangeUserGroup(ctx, owner, "pro", true, *before.BaseRevision); !errors.Is(err, ErrBasePlanChanged) {
		t.Fatalf("lost response reset twice: %v", err)
	}
	restored, err := s.ChangeUserGroup(ctx, owner, "basic", true, *changed.BaseRevision)
	if err != nil {
		t.Fatal(err)
	}
	assertQuota(t, restored, "limited", 2)
	benefits, err = s.Benefits(ctx, owner)
	if err != nil || benefits.Origin != "trial" || !benefits.Trial.Ends.Equal(prior.Trial.Ends) {
		t.Fatal("switch back reset or extended trial")
	}
}
