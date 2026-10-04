package maintenance

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type cleanupCandidate struct {
	id             uuid.UUID
	owner, visitor *uuid.UUID
}
type cleanupJob struct{ candidates, lock, remove string }

// Enumerate without locks, then recheck one object at a time under the business
// lock order. A locked account/object is left for the next sweep.
func (r *Runner) cleanupExpired(ctx context.Context) error {
	jobs := []cleanupJob{
		{`SELECT s.id,s.account_id,NULL::uuid FROM wordweave.account_sessions s JOIN wordweave.accounts a ON a.id=s.account_id WHERE s.expires_at<=clock_timestamp() OR s.last_seen_at<=clock_timestamp()-CASE WHEN a.role='admin' THEN interval '30 minutes' ELSE interval '7 days' END ORDER BY s.expires_at,s.id LIMIT $1`,
			`SELECT id FROM wordweave.account_sessions WHERE id=$1 FOR UPDATE SKIP LOCKED`,
			`DELETE FROM wordweave.account_sessions s USING wordweave.accounts a WHERE s.id=$1 AND a.id=s.account_id AND (s.expires_at<=$2 OR s.last_seen_at<=$2::timestamptz-CASE WHEN a.role='admin' THEN interval '30 minutes' ELSE interval '7 days' END)`},
		{`SELECT r.id,r.account_id,r.visitor_id FROM wordweave.generation_runs r JOIN wordweave.generation_drafts d ON d.run_id=r.id WHERE d.expires_at<=clock_timestamp() ORDER BY d.expires_at,r.id LIMIT $1`,
			`SELECT id FROM wordweave.generation_runs WHERE id=$1 FOR UPDATE SKIP LOCKED`,
			`WITH expired AS(DELETE FROM wordweave.generation_drafts WHERE run_id=$1 AND expires_at<=$2 RETURNING run_id) UPDATE wordweave.generation_runs r SET disposition='abandoned' FROM expired d WHERE r.id=d.run_id AND r.call_status='valid' AND r.disposition='pending'`},
		{`SELECT id,consumed_account_id,visitor_id FROM wordweave.visitor_claims WHERE (status='active' AND expires_at<=clock_timestamp()) OR (status='consumed' AND consumed_at<=clock_timestamp()-interval '24 hours') ORDER BY expires_at,id LIMIT $1`,
			`SELECT id FROM wordweave.visitor_claims WHERE id=$1 FOR UPDATE SKIP LOCKED`,
			`DELETE FROM wordweave.visitor_claims WHERE id=$1 AND ((status='active' AND expires_at<=$2) OR (status='consumed' AND consumed_at<=$2::timestamptz-interval '24 hours'))`},
		{`SELECT v.id,NULL::uuid,v.id FROM wordweave.visitor_identities v WHERE v.last_seen_at<=clock_timestamp()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM wordweave.visitor_claims c WHERE c.visitor_id=v.id) AND NOT EXISTS(SELECT 1 FROM wordweave.generation_runs r LEFT JOIN wordweave.generation_drafts d ON d.run_id=r.id WHERE r.visitor_id=v.id AND(r.call_status='active' OR d.run_id IS NOT NULL)) ORDER BY v.last_seen_at,v.id LIMIT $1`,
			`SELECT id FROM wordweave.visitor_identities WHERE id=$1 FOR UPDATE SKIP LOCKED`,
			`DELETE FROM wordweave.visitor_identities v WHERE id=$1 AND last_seen_at<=$2::timestamptz-interval '30 days' AND NOT EXISTS(SELECT 1 FROM wordweave.visitor_claims c WHERE c.visitor_id=v.id) AND NOT EXISTS(SELECT 1 FROM wordweave.generation_runs r LEFT JOIN wordweave.generation_drafts d ON d.run_id=r.id WHERE r.visitor_id=v.id AND(r.call_status='active' OR d.run_id IS NOT NULL))`},
	}
	for index, job := range jobs {
		rows, err := r.pool.Query(ctx, job.candidates, cleanupBatchSize)
		if err != nil {
			return err
		}
		items := []cleanupCandidate{}
		for rows.Next() {
			var c cleanupCandidate
			if err = rows.Scan(&c.id, &c.owner, &c.visitor); err != nil {
				rows.Close()
				return err
			}
			items = append(items, c)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return err
		}
		for _, c := range items {
			if err = r.cleanupObject(ctx, c, job, index == 3); err != nil {
				return err
			}
		}
	}
	return nil
}
func (r *Runner) cleanupObject(ctx context.Context, c cleanupCandidate, job cleanupJob, visitorRemoval bool) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	cfg, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return err
	}
	owners := []uuid.UUID{}
	if c.owner != nil {
		owners = append(owners, *c.owner)
	}
	if visitorRemoval {
		rows, e := tx.Query(ctx, `SELECT DISTINCT credited_account_id FROM wordweave.generation_runs WHERE visitor_id=$1 AND credited_account_id IS NOT NULL ORDER BY credited_account_id`, c.id)
		if e != nil {
			return e
		}
		for rows.Next() {
			var id uuid.UUID
			if e = rows.Scan(&id); e != nil {
				rows.Close()
				return e
			}
			owners = append(owners, id)
		}
		rows.Close()
		if e = rows.Err(); e != nil {
			return e
		}
	}
	lock := func(query string, id uuid.UUID) error {
		var found uuid.UUID
		return tx.QueryRow(ctx, query, id).Scan(&found)
	}
	for _, id := range owners {
		if err = lock(`SELECT id FROM wordweave.accounts WHERE id=$1 FOR UPDATE SKIP LOCKED`, id); errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
	}
	if c.visitor != nil {
		if err = lock(`SELECT id FROM wordweave.visitor_identities WHERE id=$1 FOR UPDATE SKIP LOCKED`, *c.visitor); errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
	}
	if visitorRemoval {
		var changed bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.generation_runs WHERE visitor_id=$1 AND credited_account_id IS NOT NULL AND NOT(credited_account_id=ANY($2::uuid[])))`, c.id, owners).Scan(&changed); err != nil {
			return err
		}
		if changed {
			return nil
		}
	}
	if err = lock(job.lock, c.id); errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, job.remove, c.id, cfg.Now); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
