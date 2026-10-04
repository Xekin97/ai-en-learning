//go:build integration

package growth

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/testdb"
)

func TestM002ActivationAndMaintenanceOnlyQualifyRewards(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	if _, err := Activate(ctx, pool); err == nil {
		t.Fatal("activated with missing operational configuration")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0),(2,10,true,9); INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES('2020-01-01',1,1,5,1)`); err != nil {
		t.Fatal(err)
	}
	at, err := Activate(ctx, pool)
	if err != nil {
		t.Fatal(err)
	}
	again, err := Activate(ctx, pool)
	if err != nil || !again.Equal(at) {
		t.Fatal("activation was reset")
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,experience) VALUES($1,10)`, owner); err != nil {
		t.Fatal(err)
	}
	cfg := pool.Config()
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE wordweave_maintenance`)
		return err
	}
	maintenance, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer maintenance.Close()
	if err := postgres.VerifyMaintenance(ctx, maintenance); err != nil {
		t.Fatal(err)
	}
	if again, err := Activate(ctx, maintenance); err != nil || !again.Equal(at) {
		t.Fatalf("operator activation: %v", err)
	}
	if n, err := RecomputeBatch(ctx, maintenance, 100); err != nil || n != 1 {
		t.Fatalf("maintenance role: n=%d %v", n, err)
	}
	var awarded, claimed, ledger, points int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.level_awards),(SELECT count(*) FROM wordweave.level_awards WHERE claimed_at IS NOT NULL),(SELECT count(*) FROM wordweave.growth_ledger),(SELECT points FROM wordweave.growth_balances WHERE owner_id=$1)`, owner).Scan(&awarded, &claimed, &ledger, &points); err != nil || awarded != 1 || claimed != 0 || ledger != 0 || points != 0 {
		t.Fatalf("background auto-paid manual reward: %d %d %d %d %v", awarded, claimed, ledger, points, err)
	}
	if n, err := RecomputeBatch(ctx, maintenance, 100); err != nil || n != 0 {
		t.Fatalf("cursor restarted completed sweep: %d %v", n, err)
	}
}
