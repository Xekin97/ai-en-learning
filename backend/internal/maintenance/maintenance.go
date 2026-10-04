package maintenance

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/analytics"
	"wordweave/internal/generation"
	"wordweave/internal/growth"
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
	if _, err := generation.SettleActivePreviews(ctx, pool, failureCode); err != nil {
		return 0, err
	}
	rows, err := pool.Query(ctx, `SELECT id FROM wordweave.generation_runs WHERE call_status='active' ORDER BY id`)
	if err != nil {
		return 0, fmt.Errorf("find active generations: %w", err)
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	var settled int64
	for _, id := range ids {
		if err = generation.SettleTerminal(ctx, pool, id, "server_failed", failureCode); err != nil {
			if errors.Is(err, generation.ErrTerminalRace) || errors.Is(err, generation.ErrRunNotFound) {
				continue
			}
			return settled, err
		}
		settled++
	}
	return settled, nil
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
	ticker := time.NewTicker(time.Minute)
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
	// Independent jobs do not let a failed analytics query strand ordinary TTL
	// cleanup, generation refunds, or pending qualifications.
	attempt, cancel := context.WithTimeout(ctx, 30*time.Second)
	aggregateErr := analytics.Aggregate(attempt, runner.pool)
	if aggregateErr != nil {
		slog.ErrorContext(ctx, "analytics_aggregation_failed", "reason", "database_operation_failed")
	}
	cancel()
	attempt, cancel = context.WithTimeout(ctx, 15*time.Second)
	if _, err := analytics.Purge(attempt, runner.pool, cleanupBatchSize); err != nil {
		slog.ErrorContext(ctx, "analytics_cleanup_failed", "reason", "checkpoint_or_database_unavailable")
	}
	cancel()
	attempt, cancel = context.WithTimeout(ctx, 15*time.Second)
	if _, err := growth.RecomputeBatch(attempt, runner.pool, cleanupBatchSize); err != nil {
		slog.ErrorContext(ctx, "growth_recompute_failed", "reason", "database_operation_failed")
	}
	cancel()

	attempt, cancel = context.WithTimeout(ctx, 15*time.Second)
	if _, err := generation.CleanupPresets(attempt, runner.pool, cleanupBatchSize); err != nil {
		slog.ErrorContext(ctx, "preset_cleanup_failed", "reason", "database_operation_failed")
	}
	cancel()
	if err := runner.cleanupExpired(ctx); err != nil {
		return err
	}
	now := time.Now()
	runner.generation.Registry().PurgeOlderThan(now.Add(-generation.TerminalTokenRetention))
	runner.generation.PreviewRegistry().PurgeOlderThan(now.Add(-generation.TerminalTokenRetention))
	runner.review.PurgeAttempts(now)
	return nil
}

func (runner *Runner) Stop(ctx context.Context) error {
	runner.generation.Registry().CancelAll()
	runner.generation.PreviewRegistry().CancelAll()
	_, err := SettleActiveGenerations(ctx, runner.pool, "shutdown")
	return err
}
