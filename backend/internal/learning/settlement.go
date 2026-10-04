package learning

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/growth"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

func lockLearningSubject(ctx context.Context, tx pgx.Tx, actor identity.Actor) (business.Configuration, error) {
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return c, err
	}
	if actor.IsLearner() {
		err = business.LockLearner(ctx, tx, actor.ID)
	} else if actor.IsVisitor() {
		var id uuid.UUID
		err = tx.QueryRow(ctx, `SELECT id FROM wordweave.visitor_identities WHERE id=$1 FOR UPDATE`, actor.ID).Scan(&id)
	} else {
		return c, ErrForbidden
	}
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, business.ErrNotFound) {
		err = ErrNotFound
	}
	return c, err
}

func recordSaved(ctx context.Context, tx pgx.Tx, owner, run uuid.UUID, c business.Configuration, claimAt *time.Time) error {
	if err := growth.RecordSaved(ctx, tx, owner, c, claimAt); err != nil {
		return err
	}
	if !growth.Enabled(c) {
		return nil
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.analytics_accounts SET first_saved_at=coalesce(first_saved_at,$2) WHERE owner_id=$1`, owner, c.Now); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,owner_id,source_kind,reference_key) VALUES($1,'passage_saved',$2,$3,$4,'account',$5)`, "saved:"+run.String(), c.Now, business.LearningDay(c.Now), owner, run)
	return err
}
