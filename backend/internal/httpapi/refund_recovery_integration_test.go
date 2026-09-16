//go:build integration

package httpapi

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/maintenance"
)

func refundFault(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(ctx, `CREATE FUNCTION wordweave.refund_fault() RETURNS trigger LANGUAGE plpgsql AS $$
	BEGIN RAISE EXCEPTION 'private synthetic refund failure'; END $$;
	CREATE TRIGGER refund_fault BEFORE UPDATE ON wordweave.generation_runs FOR EACH ROW
	WHEN (NEW.call_status IN ('provider_failed','server_failed','stream_failed','validation_failed'))
	EXECUTE FUNCTION wordweave.refund_fault()`)
	if err != nil {
		t.Fatal(err)
	}
}

func assertRefundRow(t *testing.T, ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, status string, charged, cumulative bool) {
	t.Helper()
	var got string
	var charge, count bool
	var drafts int
	if err := pool.QueryRow(ctx, `SELECT call_status,quota_charged,counts_toward_cumulative,
		(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id)
		FROM wordweave.generation_runs r WHERE id=$1`, id).Scan(&got, &charge, &count, &drafts); err != nil {
		t.Fatal(err)
	}
	if got != status || charge != charged || count != cumulative || (status != "valid" && drafts != 0) {
		t.Fatalf("unexpected settlement %s/%v/%v/drafts=%d", got, charge, count, drafts)
	}
}

func TestRefundRecoveryFailureMatrix(t *testing.T) {
	for _, status := range []string{"provider_failed", "server_failed", "stream_failed", "validation_failed"} {
		t.Run(status, func(t *testing.T) {
			ctx, api, pool, actor, model, _ := cr039Harness(t)
			run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
			refundFault(t, ctx, pool)
			for i := 0; i < 2; i++ {
				out, err := api.generation.ReconcileFailure(ctx, run.ID, status, "original_failure")
				if err == nil || out.Status != "pending" || out.QuotaRefunded {
					t.Fatalf("unconfirmed refund: %+v/%v", out, err)
				}
			}
			api.generation.Registry().PurgeOlderThan(time.Now().Add(2 * time.Hour))
			if len(api.generation.Registry().PendingFailures(10)) != 1 {
				t.Fatal("pending work lost to terminal cleanup")
			}
			assertRefundRow(t, ctx, pool, run.ID, "active", true, false)
			if _, err := pool.Exec(ctx, `DROP TRIGGER refund_fault ON wordweave.generation_runs`); err != nil {
				t.Fatal(err)
			}
			var wg sync.WaitGroup
			for i := 0; i < 8; i++ {
				wg.Add(1)
				go func() { defer wg.Done(); api.generation.RetryPendingFailures(ctx, 200) }()
			}
			wg.Wait()
			assertRefundRow(t, ctx, pool, run.ID, status, false, false)
			out, err := api.generation.ReconcileFailure(ctx, run.ID, "server_failed", "late_failure")
			if err != nil || !out.QuotaRefunded || out.Transitioned || len(api.generation.Registry().PendingFailures(10)) != 0 {
				t.Fatalf("idempotence: %+v/%v", out, err)
			}
			var code string
			if err := pool.QueryRow(ctx, `SELECT failure_code FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&code); err != nil || code != "original_failure" {
				t.Fatal("original failure overwritten")
			}
		})
	}
}

func TestRefundRecoveryRespectsWinningTerminal(t *testing.T) {
	for _, terminal := range []string{"cancelled", "valid", "gone"} {
		t.Run(terminal, func(t *testing.T) {
			ctx, api, pool, actor, model, _ := cr039Harness(t)
			run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
			refundFault(t, ctx, pool)
			if out, err := api.generation.ReconcileFailure(ctx, run.ID, "validation_failed", "invalid"); err == nil || out.QuotaRefunded {
				t.Fatal("fault did not apply")
			}
			switch terminal {
			case "cancelled":
				if _, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token); err != nil {
					t.Fatal(err)
				}
			case "valid":
				if err := api.generation.CompleteValid(ctx, run, cr039Snapshot(t)); err != nil {
					t.Fatal(err)
				}
			case "gone":
				if _, err := pool.Exec(ctx, `DELETE FROM wordweave.generation_runs WHERE id=$1`, run.ID); err != nil {
					t.Fatal(err)
				}
			}
			// Represents a stale retry or lost terminal acknowledgement. DB wins.
			out, err := api.generation.ReconcileFailure(ctx, run.ID, "validation_failed", "late_failure")
			if err != nil || out.Status != terminal || out.QuotaRefunded || len(api.generation.Registry().PendingFailures(10)) != 0 {
				t.Fatalf("terminal overwritten: %+v/%v", out, err)
			}
			if terminal == "cancelled" {
				assertRefundRow(t, ctx, pool, run.ID, "user_cancelled", true, true)
			}
			if terminal == "valid" {
				assertRefundRow(t, ctx, pool, run.ID, "valid", true, true)
			}
		})
	}
}

func TestRefundRecoveryTimeoutAndRestart(t *testing.T) {
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT id FROM wordweave.generation_runs WHERE id=$1 FOR UPDATE`, run.ID); err != nil {
		t.Fatal(err)
	}
	bounded, cancel := context.WithTimeout(ctx, 30*time.Millisecond)
	out, err := api.generation.ReconcileFailure(bounded, run.ID, "stream_failed", "disconnected")
	cancel()
	if err == nil || out.QuotaRefunded || out.Status != "pending" {
		t.Fatal("timeout treated as success")
	}
	assertRefundRow(t, ctx, pool, run.ID, "active", true, false)
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	// Client timeout does not prove rollback: releasing the lock may race the
	// server's cancellation packet. Reconciliation must handle either outcome.
	out, err = api.generation.ReconcileFailure(ctx, run.ID, "stream_failed", "disconnected")
	if err != nil || !out.QuotaRefunded {
		t.Fatal("ambiguous write did not reconcile")
	}
	assertRefundRow(t, ctx, pool, run.ID, "stream_failed", false, false)
	orphan := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	// A new process has no registry; the already-persisted active row survives.
	count, err := maintenance.SettleActiveGenerations(ctx, pool, "startup_recovery")
	if err != nil || count != 1 {
		t.Fatalf("restart recovery %d/%v", count, err)
	}
	assertRefundRow(t, ctx, pool, orphan.ID, "server_failed", false, false)
	out, err = api.generation.ReconcileFailure(ctx, orphan.ID, "stream_failed", "stale")
	if err != nil || !out.QuotaRefunded || out.Transitioned {
		t.Fatal("restart acknowledgement inconsistent")
	}
}

func TestRefundMaintenanceAutomaticallyRecovers(t *testing.T) {
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	refundFault(t, ctx, pool)
	if _, err := api.generation.ReconcileFailure(ctx, run.ID, "validation_failed", "invalid"); err == nil {
		t.Fatal("expected injected failure")
	}
	if _, err := pool.Exec(ctx, `DROP TRIGGER refund_fault ON wordweave.generation_runs`); err != nil {
		t.Fatal(err)
	}
	workerCtx, stop := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { defer close(done); api.RunMaintenance(workerCtx) }()
	defer func() { stop(); <-done }()
	deadline := time.NewTimer(8 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	for len(api.generation.Registry().PendingFailures(10)) > 0 {
		select {
		case <-deadline.C:
			t.Fatal("maintenance did not retry refund")
		case <-tick.C:
		}
	}
	assertRefundRow(t, ctx, pool, run.ID, "validation_failed", false, false)
	// A genuine active stream is not pending and must never be swept by age.
	active := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	if _, err := pool.Exec(ctx, `UPDATE wordweave.generation_runs SET started_at=clock_timestamp()-interval '2 days' WHERE id=$1`, active.ID); err != nil {
		t.Fatal(err)
	}
	api.generation.RetryPendingFailures(ctx, 200)
	assertRefundRow(t, ctx, pool, active.ID, "active", true, false)
}
