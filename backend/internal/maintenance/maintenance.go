package maintenance

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/generation"
	"wordweave/internal/review"
)

const cleanupBatchSize = 200

type Runner struct {
	pool       *pgxpool.Pool
	generation *generation.Service
	review     *review.Service
}

func New(pool *pgxpool.Pool, generationService *generation.Service, reviewService *review.Service) *Runner {
	return &Runner{pool: pool, generation: generationService, review: reviewService}
}

func SettleActiveGenerations(ctx context.Context, pool *pgxpool.Pool, failureCode string) (int64, error) {
	result, err := pool.Exec(ctx, `
		UPDATE wordweave.generation_runs
		SET call_status='server_failed', quota_charged=false, counts_toward_cumulative=false,
			completed_at=clock_timestamp(), failure_code=$1
		WHERE call_status='active'`, failureCode)
	if err != nil {
		return 0, fmt.Errorf("settle active generations: %w", err)
	}
	return result.RowsAffected(), nil
}

func (runner *Runner) Run(ctx context.Context) {
	// Separate from cleanup: a failed/slow cleanup must not strand refunds.
	refundDone := make(chan struct{})
	defer func() { <-refundDone }()
	go func() {
		defer close(refundDone)
		runner.runRefunds(ctx)
	}()
	if err := runner.cleanupOnce(ctx); err != nil {
		slog.Error("maintenance cleanup failed", "error", err)
	}
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := runner.cleanupOnce(ctx); err != nil {
				slog.Error("maintenance cleanup failed", "error", err)
			}
		}
	}
}

func (runner *Runner) runRefunds(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			attempt, cancel := context.WithTimeout(ctx, 5*time.Second)
			runner.generation.RetryPendingFailures(attempt, cleanupBatchSize)
			cancel()
		}
	}
}

func (runner *Runner) cleanupOnce(ctx context.Context) error {
	statements := []string{
		`WITH locked AS (
			SELECT session.id FROM wordweave.account_sessions session
			JOIN wordweave.accounts account ON account.id=session.account_id
			WHERE session.expires_at <= clock_timestamp()
			   OR session.last_seen_at <= clock_timestamp() - CASE WHEN account.role='admin' THEN interval '30 minutes' ELSE interval '7 days' END
			ORDER BY session.expires_at LIMIT $1 FOR UPDATE OF session SKIP LOCKED
		) DELETE FROM wordweave.account_sessions session USING locked WHERE session.id=locked.id`,
		`WITH locked AS (
			SELECT run.id AS run_id FROM wordweave.generation_runs run
			JOIN wordweave.generation_drafts draft ON draft.run_id=run.id
			WHERE draft.expires_at <= clock_timestamp() ORDER BY draft.expires_at LIMIT $1 FOR UPDATE OF run SKIP LOCKED
		), updated AS (
			UPDATE wordweave.generation_runs run SET disposition='abandoned'
			FROM locked WHERE run.id=locked.run_id AND run.call_status='valid' AND run.disposition='pending'
		) DELETE FROM wordweave.generation_drafts draft USING locked WHERE draft.run_id=locked.run_id`,
		`WITH locked AS (
			SELECT id FROM wordweave.visitor_claims WHERE status='active' AND expires_at <= clock_timestamp()
			ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
		) DELETE FROM wordweave.visitor_claims claim USING locked WHERE claim.id=locked.id`,
		`WITH locked AS (
			SELECT id FROM wordweave.visitor_claims WHERE status='consumed' AND consumed_at <= clock_timestamp()-interval '24 hours'
			ORDER BY consumed_at LIMIT $1 FOR UPDATE SKIP LOCKED
		) DELETE FROM wordweave.visitor_claims claim USING locked WHERE claim.id=locked.id`,
		`WITH locked AS (
			SELECT visitor.id FROM wordweave.visitor_identities visitor
			WHERE visitor.last_seen_at <= clock_timestamp()-interval '30 days'
			  AND NOT EXISTS (SELECT 1 FROM wordweave.visitor_claims claim WHERE claim.visitor_id=visitor.id)
			  AND NOT EXISTS (
				SELECT 1 FROM wordweave.generation_runs run
				LEFT JOIN wordweave.generation_drafts draft ON draft.run_id=run.id
				WHERE run.visitor_id=visitor.id AND (run.call_status='active' OR draft.run_id IS NOT NULL)
			  )
			ORDER BY visitor.last_seen_at LIMIT $1 FOR UPDATE SKIP LOCKED
		) DELETE FROM wordweave.visitor_identities visitor USING locked WHERE visitor.id=locked.id`,
	}
	for _, statement := range statements {
		if _, err := runner.pool.Exec(ctx, statement, cleanupBatchSize); err != nil {
			return err
		}
	}
	now := time.Now()
	runner.generation.Registry().PurgeOlderThan(now.Add(-generation.TerminalTokenRetention))
	runner.review.PurgeAttempts(now)
	return nil
}

func (runner *Runner) Stop(ctx context.Context) error {
	runner.generation.Registry().CancelAll()
	_, err := SettleActiveGenerations(ctx, runner.pool, "shutdown")
	return err
}
