//go:build integration

package httpapi

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"testing"
	"wordweave/internal/platform/config"
)

// Production uses independent application and credential pools. Tests must do
// the same: preflight can hold an application transaction while reading a
// credential status, and saturated app reservations must not occupy AI slots.
func integrationServer(t *testing.T, cfg config.Config, pool *pgxpool.Pool) (*Server, error) {
	t.Helper()
	// Test setup now writes its mock URL to the unified connection; production
	// never overwrites an administrator's persisted connection on restart.
	if _, err := pool.Exec(context.Background(), `UPDATE wordweave.ai_providers SET base_url=$1,legacy_url_pending=false WHERE id='00000000-0000-4000-8000-000000000001'`, cfg.OpenRouterBaseURL); err != nil {
		return nil, err
	}
	options := pool.Config()
	previous := options.AfterConnect
	options.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		if previous != nil {
			if err := previous(ctx, c); err != nil {
				return err
			}
		}
		_, err := c.Exec(ctx, `SET ROLE wordweave_ai`)
		return err
	}
	aiPool, err := pgxpool.NewWithConfig(context.Background(), options)
	if err != nil {
		return nil, err
	}
	t.Cleanup(aiPool.Close)
	return New(cfg, pool, aiPool)
}
func configurationRevisionHTTP(t *testing.T, client *http.Client, base string) string {
	t.Helper()
	response := getJSON(t, client, base+"/api/v1/admin/groups")
	requireStatus(t, response, 200)
	return dataString(t, response.body, "revision")
}
func baseRevisionHTTP(t *testing.T, client *http.Client, endpoint string) string {
	t.Helper()
	response := getJSON(t, client, endpoint)
	requireStatus(t, response, 200)
	return nestedString(t, response.body, "data", "user", "base_revision")
}

// Direct run fixtures must include the same charge facts that live preflight
// creates. Never run this helper in the application or infer charges at read time.
func fixtureRunCharges(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	for _, q := range []string{
		`INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_epoch,reset_at)
   SELECT id,group_code,'base',1,quota_reset_at FROM wordweave.accounts WHERE role='learner'
   ON CONFLICT DO NOTHING`,
		`INSERT INTO wordweave.generation_charges(run_id,account_id,visitor_id,source_kind,plan_code,origin,quota_epoch,state,charged_at,settled_at)
   SELECT r.id,r.account_id,r.visitor_id,CASE WHEN r.account_id IS NULL THEN 'visitor' ELSE 'plan' END,
   CASE WHEN r.account_id IS NOT NULL THEN r.group_code_snapshot END,
   CASE WHEN r.account_id IS NOT NULL THEN 'base' END,
   CASE WHEN r.account_id IS NOT NULL THEN q.reset_epoch END,
   CASE WHEN r.call_status='active' THEN 'reserved' WHEN r.quota_charged THEN 'consumed' ELSE 'refunded' END,
   r.started_at,r.completed_at FROM wordweave.generation_runs r
   LEFT JOIN wordweave.plan_quota_states q ON q.owner_id=r.account_id AND q.plan_code=r.group_code_snapshot AND q.origin='base'
   ON CONFLICT(run_id) DO NOTHING`,
	} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
}
