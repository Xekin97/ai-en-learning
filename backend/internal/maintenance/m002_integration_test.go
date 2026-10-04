//go:build integration

package maintenance

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
	"time"
	"wordweave/internal/testdb"
)

func operationalPool(t *testing.T, ctx context.Context, pool *pgxpool.Pool) *pgxpool.Pool {
	t.Helper()
	cfg := pool.Config()
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE wordweave_maintenance`)
		return err
	}
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Close)
	return p
}
func TestM002MaintenanceSkipsBusyOwnerAndRecoversCharges(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.account_sessions(account_id,token_hash,created_at,last_seen_at,expires_at) VALUES($1,'expired'::bytea,clock_timestamp()-interval '2 days',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'),($1,'current'::bytea,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 day')`, owner); err != nil {
		t.Fatal(err)
	}
	maintenance := operationalPool(t, ctx, pool)
	runner := &Runner{pool: maintenance}
	barrier, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer barrier.Rollback(ctx)
	if _, err = barrier.Exec(ctx, `SELECT id FROM wordweave.accounts WHERE id=$1 FOR UPDATE`, owner); err != nil {
		t.Fatal(err)
	}
	fast, cancel := context.WithTimeout(ctx, time.Second)
	err = runner.cleanupExpired(fast)
	cancel()
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.account_sessions`).Scan(&count); err != nil || count != 2 {
		t.Fatal("cleanup bypassed busy owner")
	}
	if err = barrier.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err = runner.cleanupExpired(ctx); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.account_sessions`).Scan(&count); err != nil || count != 1 {
		t.Fatal("cleanup removed live session or retained expired session")
	}
	var model, run uuid.UUID
	if err = pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id) VALUES('Test recovery','test/recovery') RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot) VALUES($1,$1,'registered',$2,'Test recovery','test/recovery','en','story','short',50,5) RETURNING id`, owner, model).Scan(&run); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_at) VALUES($1,'registered','base',clock_timestamp())`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.generation_charges(run_id,account_id,source_kind,plan_code,origin,quota_epoch,state,charged_at) VALUES($1,$2,'plan','registered','base',0,'reserved',clock_timestamp())`, run, owner); err != nil {
		t.Fatal(err)
	}
	if n, err := SettleActiveGenerations(ctx, maintenance, "startup_recovery"); err != nil || n != 1 {
		t.Fatalf("maintenance recovery privilege/settlement: %d %v", n, err)
	}
	var consistent bool
	if err = pool.QueryRow(ctx, `SELECT r.call_status='server_failed' AND NOT r.quota_charged AND c.state='refunded' FROM wordweave.generation_runs r JOIN wordweave.generation_charges c ON c.run_id=r.id WHERE r.id=$1`, run).Scan(&consistent); err != nil || !consistent {
		t.Fatal("recovery stranded original charge")
	}
	if n, err := SettleActiveGenerations(ctx, maintenance, "startup_recovery"); err != nil || n != 0 {
		t.Fatal("recovery repeated settlement")
	}
}
