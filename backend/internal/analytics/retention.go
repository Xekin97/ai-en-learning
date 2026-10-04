package analytics

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"time"
	"wordweave/internal/platform/business"
)

var ErrAggregationBehind = errors.New("analytics detail cleanup awaits aggregation checkpoint")

func Purge(ctx context.Context, pool *pgxpool.Pool, limit int) (int64, error) {
	if limit < 1 || limit > 1000 {
		return 0, ErrValidation
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return 0, err
	}
	var through *time.Time
	if err = tx.QueryRow(ctx, `SELECT analytics_aggregated_through FROM wordweave.growth_settings WHERE singleton`).Scan(&through); err != nil {
		return 0, err
	}
	if through == nil {
		return 0, nil
	}
	if c.Now.Sub(*through) > 2*time.Minute {
		return 0, ErrAggregationBehind
	}
	cutoff := c.Now.Add(-90 * 24 * time.Hour)
	var count int64
	for _, query := range []string{
		`WITH expired AS(SELECT id FROM wordweave.analytics_events WHERE occurred_at<=$1 AND occurred_at<=$2 ORDER BY occurred_at,id LIMIT $3 FOR UPDATE SKIP LOCKED) DELETE FROM wordweave.analytics_events e USING expired x WHERE e.id=x.id`,
		`WITH expired AS(SELECT id FROM wordweave.traffic_sessions WHERE started_at<=$1 AND started_at<=$2 ORDER BY started_at,id LIMIT $3 FOR UPDATE SKIP LOCKED) DELETE FROM wordweave.traffic_sessions s USING expired x WHERE s.id=x.id`,
		`WITH expired AS(SELECT owner_id FROM wordweave.analytics_accounts WHERE retention_due_at<=$1::timestamptz+interval '90 days' AND registered_learning_day<=($2::timestamptz AT TIME ZONE 'UTC'+interval '4 hours')::date ORDER BY retention_due_at,owner_id LIMIT $3 FOR UPDATE SKIP LOCKED) DELETE FROM wordweave.analytics_accounts a USING expired x WHERE a.owner_id=x.owner_id`,
	} {
		var tag interface{ RowsAffected() int64 }
		// Keep each statement's bind arity explicit rather than inventing unused inputs.
		tag, err = tx.Exec(ctx, query, cutoff, through, limit)
		if err != nil {
			return count, err
		}
		count += tag.RowsAffected()
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return count, nil
}
