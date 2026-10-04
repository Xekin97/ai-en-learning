//go:build integration

package entitlement_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/entitlement"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func model(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Quota model','test/quota',true) RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
func reserve(t *testing.T, ctx context.Context, pool *pgxpool.Pool, actor identity.Actor, model uuid.UUID) (uuid.UUID, error) {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		t.Fatal(err)
	}
	if err = business.LockLearner(ctx, tx, actor.ID); err != nil {
		t.Fatal(err)
	}
	p, err := entitlement.Resolve(ctx, tx, actor, c.Now)
	if err != nil {
		t.Fatal(err)
	}
	var run uuid.UUID
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot) VALUES($1,$1,$2,$3,'Quota model','test/quota','en','story','short',50,5) RETURNING id`, actor.ID, p.Code, model).Scan(&run); err != nil {
		return uuid.Nil, err
	}
	if err = entitlement.Reserve(ctx, tx, actor, p, run, c.Now); err != nil {
		return uuid.Nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return run, nil
}

func TestBaseAndTrialSamePlanRetainIndependentQuota(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	m := model(t, ctx, pool)
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "registered"}
	if _, err := pool.Exec(ctx, `WITH configured AS(UPDATE wordweave.entitlement_groups SET rolling_quota_limit=10 WHERE code='pro') INSERT INTO wordweave.plan_trials(owner_id,target_plan_code,started_at,ends_at) VALUES($1,'pro',now(),now()+interval '6 days')`, owner); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 8; i++ {
		run, err := reserve(t, ctx, pool, actor, m)
		if err != nil {
			t.Fatal(err)
		}
		if err = generation.SettleTerminal(ctx, pool, run, "user_cancelled", ""); err != nil {
			t.Fatal(err)
		}
	}
	check := func(origin string, want int) {
		t.Helper()
		p, err := entitlement.Resolve(ctx, pool, actor, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		q, err := entitlement.Usage(ctx, pool, actor, p, time.Now())
		if err != nil || p.Origin != origin || q.Remaining == nil || *q.Remaining != want {
			t.Fatalf("origin=%s quota=%+v err=%v", p.Origin, q, err)
		}
	}
	check("trial", 2)
	if _, err := pool.Exec(ctx, `WITH adjusted AS(UPDATE wordweave.accounts SET group_code='pro',quota_reset_at=now() WHERE id=$1) INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_epoch,reset_at) VALUES($1,'pro','base',1,now())`, owner); err != nil {
		t.Fatal(err)
	}
	check("base", 10)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.accounts SET group_code='registered' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	check("trial", 2)
	var trialEpoch int
	if err := pool.QueryRow(ctx, `SELECT reset_epoch FROM wordweave.plan_quota_states WHERE owner_id=$1 AND plan_code='pro' AND origin='trial'`, owner).Scan(&trialEpoch); err != nil || trialEpoch != 0 {
		t.Fatal("base adjustment reset trial usage")
	}
}

func TestExtraRefundRestoresExpiredOriginalSourceOnce(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	m := model(t, ctx, pool)
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner"}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var definition, settlement, item uuid.UUID
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.item_definitions(kind,name_en,description_en,exchange_price,activation_ttl_seconds,extra_count,ever_issued) VALUES('extra_credit','Extra','One generation',0,3600,1,true) RETURNING id`).Scan(&definition); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.growth_settlements(owner_id,kind,source_key,config_snapshot) VALUES($1,'admin_grant','fixture','{}') RETURNING id`, owner).Scan(&settlement); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.user_items(owner_id,definition_id,issuance_settlement_id,issuance_component,issued_at,activation_deadline,kind_snapshot,parameters_snapshot,activated_at) VALUES($1,$2,$3,'card',now()-interval '1 minute',now()+interval '1 hour','extra_credit','{"extra_count":1}',now()) RETURNING id`, owner, definition, settlement).Scan(&item); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `WITH configured AS(UPDATE wordweave.entitlement_groups SET rolling_quota_limit=0 WHERE code='registered') INSERT INTO wordweave.extra_credit_balances(item_id,owner_id,initial_count,remaining_count,expires_at) VALUES($1,$2,1,1,now()+interval '1 hour')`, item, owner); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	run, err := reserve(t, ctx, pool, actor, m)
	if err != nil {
		t.Fatal(err)
	}
	var expiry time.Time
	if err = pool.QueryRow(ctx, `UPDATE wordweave.extra_credit_balances SET expires_at=now()-interval '1 second' WHERE item_id=$1 RETURNING expires_at`, item).Scan(&expiry); err != nil {
		t.Fatal(err)
	}
	if err = generation.SettleTerminal(ctx, pool, run, "provider_failed", "test_failure"); err != nil {
		t.Fatal(err)
	}
	if err = generation.SettleTerminal(ctx, pool, run, "provider_failed", "test_failure"); err != generation.ErrTerminalRace {
		t.Fatalf("second refund: %v", err)
	}
	var remaining int
	var after time.Time
	if err = pool.QueryRow(ctx, `SELECT remaining_count,expires_at FROM wordweave.extra_credit_balances WHERE item_id=$1`, item).Scan(&remaining, &after); err != nil {
		t.Fatal(err)
	}
	if remaining != 1 || !expiry.Equal(after) {
		t.Fatal("refund changed expiry or credited twice")
	}
	if _, err = reserve(t, ctx, pool, actor, m); err != entitlement.ErrQuotaExhausted {
		t.Fatalf("expired refund became usable: %v", err)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_runs WHERE account_id=$1`, owner).Scan(&count); err != nil || count != 1 {
		t.Fatal("rejected generation left a run")
	}
}
