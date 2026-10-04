package generation

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/growth"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

func lockRunSubject(ctx context.Context, tx pgx.Tx, run uuid.UUID) (business.Configuration, identity.Actor, error) {
	c, err := business.LockConfiguration(ctx, tx, false)
	var actor identity.Actor
	if err != nil {
		return c, actor, err
	}
	var account, visitor *uuid.UUID
	err = tx.QueryRow(ctx, `SELECT account_id,visitor_id FROM wordweave.generation_runs WHERE id=$1`, run).Scan(&account, &visitor)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, actor, ErrRunNotFound
	}
	if err != nil {
		return c, actor, err
	}
	if account != nil {
		actor = identity.Actor{ID: *account, Kind: "account", Role: "learner"}
	} else {
		actor = identity.Actor{ID: *visitor, Kind: "visitor"}
	}
	_, _, err = lockActor(ctx, tx, actor)
	return c, actor, err
}

func settleCharge(ctx context.Context, tx pgx.Tx, run uuid.UUID, refund bool, now time.Time) error {
	state := "consumed"
	if refund {
		state = "refunded"
	}
	var item *uuid.UUID
	err := tx.QueryRow(ctx, `UPDATE wordweave.generation_charges SET state=$2,settled_at=$3 WHERE run_id=$1 AND state='reserved' RETURNING item_id`, run, state, now).Scan(&item)
	if err != nil {
		return err
	}
	if refund && item != nil {
		result, err := tx.Exec(ctx, `UPDATE wordweave.extra_credit_balances SET remaining_count=remaining_count+1 WHERE item_id=$1 AND remaining_count<initial_count`, item)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return errors.New("original extra-credit source cannot be refunded")
		}
	}
	return nil
}

func recordGenerationTerminal(ctx context.Context, tx pgx.Tx, run uuid.UUID, actor identity.Actor, status string, c business.Configuration) error {
	if !growth.Enabled(c) {
		return nil
	}
	event := "generation_failed"
	if status == "valid" {
		event = "generation_valid"
	} else if status == "user_cancelled" {
		event = "generation_cancelled"
	}
	var owner any
	source := "visitor"
	if actor.IsLearner() {
		owner = actor.ID
		source = "account"
	}
	_, err := tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,started_at,learning_day,owner_id,source_kind,reference_key)
  SELECT $1,$2,$3,started_at,$4,$5,$6,id FROM wordweave.generation_runs WHERE id=$7`, "generation-terminal:"+run.String(), event, c.Now, business.LearningDay(c.Now), owner, source, run)
	return err
}

// SettleTerminal is shared by request handling and restart/shutdown recovery.
// The run, original charge, and extra-credit refund commit together.
func SettleTerminal(ctx context.Context, pool *pgxpool.Pool, run uuid.UUID, status, failureCode string) error {
	if status != "user_cancelled" && status != "provider_failed" && status != "server_failed" && status != "stream_failed" && status != "validation_failed" {
		return errors.New("invalid terminal status")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	c, actor, err := lockRunSubject(ctx, tx, run)
	if err != nil {
		return err
	}
	cancelled := status == "user_cancelled"
	var failure any
	if !cancelled {
		failure = failureCode
	}
	result, err := tx.Exec(ctx, `UPDATE wordweave.generation_runs SET call_status=$2,quota_charged=$3,counts_toward_cumulative=$3,completed_at=$4,failure_code=$5 WHERE id=$1 AND call_status='active'`, run, status, cancelled, c.Now, failure)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrTerminalRace
	}
	if err = settleCharge(ctx, tx, run, !cancelled, c.Now); err != nil {
		return err
	}
	if err = recordGenerationTerminal(ctx, tx, run, actor, status, c); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
