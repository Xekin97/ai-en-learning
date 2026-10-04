package generation

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
)

// A version is needed by a draft, publication, active call, or the successful
// preview reused by one of those versions. Usage facts outlive obsolete content.
func CleanupPresets(ctx context.Context, pool *pgxpool.Pool, limit int) (int64, error) {
	if limit < 1 || limit > 1000 {
		return 0, ErrInvalidInput
	}
	rows, err := pool.Query(ctx, `SELECT p.id FROM wordweave.presets p WHERE EXISTS(SELECT 1 FROM wordweave.preset_versions v WHERE v.preset_id=p.id AND v.id<>p.draft_version_id AND v.id IS DISTINCT FROM p.published_version_id) OR EXISTS(SELECT 1 FROM wordweave.preset_previews v WHERE v.preset_id=p.id AND NOT EXISTS(SELECT 1 FROM wordweave.preset_versions r WHERE r.preview_id=v.id)) ORDER BY p.id LIMIT $1`, limit)
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
	var total int64
	for _, id := range ids {
		n, err := cleanupPreset(ctx, pool, id, limit-int(total))
		if err != nil {
			return total, err
		}
		total += n
		if total >= int64(limit) {
			break
		}
	}
	return total, nil
}
func cleanupPreset(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, limit int) (int64, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return 0, err
	}
	var locked uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM wordweave.presets WHERE id=$1 FOR UPDATE SKIP LOCKED`, id).Scan(&locked); errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	tag, err := tx.Exec(ctx, `WITH RECURSIVE roots(id) AS (
 SELECT draft_version_id FROM wordweave.presets WHERE id=$1 UNION SELECT published_version_id FROM wordweave.presets WHERE id=$1
 UNION SELECT preset_version_id FROM wordweave.generation_runs WHERE call_status='active'
 UNION SELECT version_id FROM wordweave.preset_preview_runs WHERE preset_id=$1 AND (status='active' OR completed_at>$2::timestamptz-interval '1 hour')
 ),live(id) AS (SELECT id FROM roots UNION SELECT r.version_id FROM live l JOIN wordweave.preset_versions v ON v.id=l.id JOIN wordweave.preset_previews p ON p.id=v.preview_id JOIN wordweave.preset_preview_runs r ON r.id=p.run_id),
 obsolete AS (SELECT id FROM wordweave.preset_versions WHERE preset_id=$1 AND NOT EXISTS(SELECT 1 FROM live WHERE live.id=preset_versions.id) ORDER BY version_no LIMIT $3)
 DELETE FROM wordweave.preset_versions v USING obsolete o WHERE v.id=o.id`, id, c.Now, limit)
	if err != nil {
		return 0, err
	}
	n := tag.RowsAffected()
	// A completed extra preview may have never been attached. Keep the retry
	// window, then discard only its unreferenced public content, not usage/run facts.
	_, err = tx.Exec(ctx, `WITH obsolete AS(SELECT p.id FROM wordweave.preset_previews p JOIN wordweave.preset_preview_runs r ON r.id=p.run_id WHERE p.preset_id=$1 AND r.status<>'active' AND r.completed_at<=$2::timestamptz-interval '1 hour' AND NOT EXISTS(SELECT 1 FROM wordweave.preset_versions v WHERE v.preview_id=p.id) ORDER BY p.id LIMIT $3) DELETE FROM wordweave.preset_previews p USING obsolete o WHERE p.id=o.id`, id, c.Now, limit)
	if err != nil {
		return 0, err
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return n, nil
}
