package growth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
)

// Activate is an explicit operator action after configuration is prepared. It
// never installs sample rewards, rewinds history, or re-enables past events.
func Activate(ctx context.Context, pool *pgxpool.Pool) (time.Time, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return time.Time{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return time.Time{}, err
	}
	if c.ActivatedAt != nil {
		return *c.ActivatedAt, nil
	}
	var ready bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.growth_levels WHERE level_no=1 AND min_experience=0) AND EXISTS(SELECT 1 FROM wordweave.checkin_rules WHERE effective_day<=$1)`, business.LearningDay(c.Now)).Scan(&ready)
	if err != nil {
		return time.Time{}, err
	}
	if !ready {
		return time.Time{}, errors.New("growth activation requires configured level one and an effective check-in rule")
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=$1 WHERE singleton AND activated_at IS NULL`, c.Now); err != nil {
		return time.Time{}, err
	}
	if _, err = business.AdvanceConfiguration(ctx, tx); err != nil {
		return time.Time{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return time.Time{}, err
	}
	return c.Now, nil
}

// RecomputeBatch never holds an exclusive configuration lock while visiting
// learners. Conditional checkpointing cannot overwrite a newer admin revision.
func RecomputeBatch(ctx context.Context, pool *pgxpool.Pool, limit int) (int, error) {
	if limit < 1 || limit > 200 {
		return 0, errors.New("invalid maintenance batch size")
	}
	var target int64
	var after *uuid.UUID
	var active *time.Time
	if err := pool.QueryRow(ctx, `SELECT recompute_target_revision,recompute_after_owner,activated_at FROM wordweave.growth_settings WHERE singleton`).Scan(&target, &after, &active); err != nil {
		return 0, err
	}
	if active == nil {
		return 0, nil
	}
	rows, err := pool.Query(ctx, `SELECT id FROM wordweave.accounts WHERE role='learner' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`, after, limit)
	if err != nil {
		return 0, err
	}
	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return 0, err
	}
	for i, id := range ids {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return i, err
		}
		c, err := business.LockConfiguration(ctx, tx, false)
		if err == nil {
			err = business.LockLearner(ctx, tx, id)
		}
		if errors.Is(err, business.ErrNotFound) {
			tx.Rollback(ctx)
			continue
		}
		if err == nil {
			err = Recompute(ctx, tx, id, c)
			if err == nil {
				err = qualifyRetiredCards(ctx, tx, id)
			}
		}
		if err != nil {
			tx.Rollback(ctx)
			return i, err
		}
		if err = tx.Commit(ctx); err != nil {
			return i, err
		}
	}
	if len(ids) > 0 {
		if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_settings SET recompute_after_owner=$2 WHERE singleton AND recompute_target_revision=$1 AND (recompute_after_owner IS NULL OR recompute_after_owner<$2)`, target, ids[len(ids)-1]); err != nil {
			return len(ids), err
		}
	}
	return len(ids), nil
}
