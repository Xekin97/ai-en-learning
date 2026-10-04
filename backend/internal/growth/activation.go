package growth

import (
	"context"
	"encoding/hex"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type AddedModelTime struct {
	ID      uuid.UUID `json:"model_id"`
	Seconds int64     `json:"added_seconds"`
	Ends    time.Time `json:"result_ends_at"`
	start   time.Time
}
type PlanResult struct {
	Code string    `json:"plan_code"`
	Ends time.Time `json:"result_ends_at"`
}
type DiscardedTrial struct {
	Code      string    `json:"plan_code"`
	Ends      time.Time `json:"ends_at"`
	Remaining int64     `json:"remaining_seconds"`
}
type ExtraResult struct {
	Added   int64     `json:"added_count"`
	Expires time.Time `json:"expires_at"`
}
type ActivationPreview struct {
	Can     bool             `json:"can_activate"`
	Reason  *string          `json:"reason"`
	Effect  Effect           `json:"effect"`
	Models  []AddedModelTime `json:"model_times"`
	Plan    *PlanResult      `json:"plan_result"`
	Discard *DiscardedTrial  `json:"discarded_trial"`
	Extra   *ExtraResult     `json:"extra_result"`
	Token   *string          `json:"confirmation_token"`
	Expires *time.Time       `json:"token_expires_at"`
}
type ItemResult struct {
	Receipt Receipt   `json:"receipt"`
	Item    OwnedItem `json:"item"`
}
type benefitToken struct {
	Owner   uuid.UUID `json:"owner"`
	Item    uuid.UUID `json:"item"`
	Binding string    `json:"binding"`
	Expires time.Time `json:"expires"`
}
type trialFact struct {
	ID   uuid.UUID
	Code string
	Ends time.Time
}
type activationState struct {
	Preview ActivationPreview
	binding string
	trial   *trialFact
	record  ownedRecord
}

func addSeconds(at time.Time, seconds int64) (time.Time, error) {
	if seconds <= 0 || at.Unix() > math.MaxInt64-seconds {
		return time.Time{}, reject("configuration_invalid", 422)
	}
	result := time.Unix(at.Unix()+seconds, int64(at.Nanosecond())).UTC()
	if result.Year() > 9999 {
		return time.Time{}, reject("configuration_invalid", 422)
	}
	return result, nil
}
func activeTrial(ctx context.Context, tx pgx.Tx, owner uuid.UUID, now time.Time) (*trialFact, error) {
	var t trialFact
	err := tx.QueryRow(ctx, `SELECT id,target_plan_code,ends_at FROM wordweave.plan_trials WHERE owner_id=$1 AND closed_at IS NULL AND ends_at>$2`, owner, now).Scan(&t.ID, &t.Code, &t.Ends)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &t, err
}
func (s *Service) activation(ctx context.Context, tx pgx.Tx, owner, id uuid.UUID, locale string, c business.Configuration) (activationState, error) {
	r, err := loadOwned(ctx, tx, owner, id, locale, c)
	if err != nil {
		return activationState{}, err
	}
	result := activationState{record: r, Preview: ActivationPreview{Reason: r.UseBlock, Effect: r.Effect, Models: make([]AddedModelTime, 0)}}
	if r.UseBlock != nil {
		return result, nil
	}
	if r.Kind == "makeup" {
		reason := "invalid_target_day"
		result.Preview.Reason = &reason
		return result, nil
	}
	binding := struct {
		Item     uuid.UUID
		Revision string
		Deadline time.Time
		Params   issuedParameters
		Tails    map[uuid.UUID]*time.Time
		Trial    *trialFact
	}{Item: id, Revision: s.revision(c), Deadline: r.Deadline, Params: r.params, Tails: map[uuid.UUID]*time.Time{}}
	switch r.Kind {
	case "extra_credit":
		result.Preview.Extra = &ExtraResult{r.params.ExtraCount, r.Deadline}
	case "model_trial":
		for _, m := range r.Effect.Models {
			var tail *time.Time
			if err = tx.QueryRow(ctx, `SELECT max(ends_at) FROM wordweave.model_time_contributions WHERE owner_id=$1 AND model_id=$2 AND revoked_at IS NULL`, owner, m.ID).Scan(&tail); err != nil {
				return result, err
			}
			binding.Tails[m.ID] = tail
			start := c.Now
			if tail != nil && tail.After(start) {
				start = *tail
			}
			end, err := addSeconds(start, r.params.Seconds)
			if err != nil {
				return result, err
			}
			result.Preview.Models = append(result.Preview.Models, AddedModelTime{m.ID, r.params.Seconds, end, start})
		}
	case "plan_trial":
		result.trial, err = activeTrial(ctx, tx, owner, c.Now)
		if err != nil {
			return result, err
		}
		binding.Trial = result.trial
		start := c.Now
		if result.trial != nil {
			if result.trial.Code == dbPlan(r.params.Plan) {
				start = result.trial.Ends
			} else {
				result.Preview.Discard = &DiscardedTrial{apiPlan(result.trial.Code), result.trial.Ends, max(int64(0), result.trial.Ends.Unix()-c.Now.Unix())}
			}
		}
		end, err := addSeconds(start, r.params.Seconds)
		if err != nil {
			return result, err
		}
		result.Preview.Plan = &PlanResult{r.params.Plan, end}
	default:
		return result, reject("configuration_invalid", 422)
	}
	digest, err := fingerprint(binding)
	if err != nil {
		return result, err
	}
	result.binding = hex.EncodeToString(digest)
	result.Preview.Can = true
	return result, nil
}
func (s *Service) previewTransaction(ctx context.Context, owner uuid.UUID) (pgx.Tx, business.Configuration, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, business.Configuration{}, err
	}
	c, err := business.LockConfiguration(ctx, tx, false)
	if err == nil {
		err = business.LockLearner(ctx, tx, owner)
	}
	if err != nil {
		tx.Rollback(ctx)
		return nil, c, err
	}
	return tx, c, nil
}
func (s *Service) ActivationPreview(ctx context.Context, owner, id uuid.UUID, locale string) (ActivationPreview, error) {
	tx, c, err := s.previewTransaction(ctx, owner)
	if err != nil {
		return ActivationPreview{}, err
	}
	defer tx.Rollback(ctx)
	state, err := s.activation(ctx, tx, owner, id, locale, c)
	if err != nil {
		return ActivationPreview{}, err
	}
	if state.Preview.Can {
		expires := c.Now.Add(5 * time.Minute)
		token, err := s.signer.Encode("item-activation", benefitToken{owner, id, state.binding, expires})
		if err != nil {
			return ActivationPreview{}, err
		}
		state.Preview.Token = &token
		state.Preview.Expires = &expires
	}
	if err = tx.Commit(ctx); err != nil {
		return ActivationPreview{}, err
	}
	return state.Preview, nil
}
func existingItemReceipt(ctx context.Context, tx pgx.Tx, owner, item uuid.UUID, kind string) (*Receipt, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM wordweave.growth_settlements WHERE owner_id=$1 AND kind=$2 AND source_key=$3`, owner, kind, item.String()).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r, err := readReceipt(ctx, tx, owner, id)
	return &r, err
}
func (s *Service) Activate(ctx context.Context, owner, key, id uuid.UUID, locale, tokenString string, confirmDiscard bool) (ItemResult, error) {
	if key == uuid.Nil {
		return ItemResult{}, &ValidationError{[]FieldError{{"/idempotency_key", "required"}}}
	}
	tx, c, err := s.previewTransaction(ctx, owner)
	if err != nil {
		return ItemResult{}, err
	}
	defer tx.Rollback(ctx)
	if old, err := existingItemReceipt(ctx, tx, owner, id, "item_activation"); err != nil {
		return ItemResult{}, err
	} else if old != nil {
		item, err := loadOwned(ctx, tx, owner, id, locale, c)
		if err != nil {
			return ItemResult{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return ItemResult{}, err
		}
		return ItemResult{*old, item.OwnedItem}, nil
	}
	var token benefitToken
	if err = s.signer.Decode("item-activation", tokenString, &token); err != nil || token.Owner != owner || token.Item != id || !token.Expires.After(c.Now) {
		return ItemResult{}, ErrPreviewStale
	}
	state, err := s.activation(ctx, tx, owner, id, locale, c)
	if err != nil {
		return ItemResult{}, err
	}
	if !state.Preview.Can {
		if state.Preview.Reason != nil {
			return ItemResult{}, reject(*state.Preview.Reason, 422)
		}
		return ItemResult{}, ErrPreviewStale
	}
	if token.Binding != state.binding {
		return ItemResult{}, ErrPreviewStale
	}
	if state.Preview.Discard != nil && !confirmDiscard {
		return ItemResult{}, reject("replacement_confirmation_required", 422)
	}
	if err = Ensure(ctx, tx, owner); err != nil {
		return ItemResult{}, err
	}
	settlement, _, err := intent(ctx, tx, owner, "item_activation", id.String(), struct{ Item uuid.UUID }{id}, c.Now)
	if err != nil {
		return ItemResult{}, err
	}
	switch state.record.Kind {
	case "extra_credit":
		_, err = tx.Exec(ctx, `INSERT INTO wordweave.extra_credit_balances(item_id,owner_id,initial_count,remaining_count,expires_at) VALUES($1,$2,$3,$3,$4)`, id, owner, state.record.params.ExtraCount, state.record.Deadline)
	case "model_trial":
		for _, m := range state.Preview.Models {
			if _, err = tx.Exec(ctx, `INSERT INTO wordweave.model_time_contributions(owner_id,item_id,model_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5)`, owner, id, m.ID, m.start, m.Ends); err != nil {
				return ItemResult{}, err
			}
		}
	case "plan_trial":
		if _, err = tx.Exec(ctx, `UPDATE wordweave.plan_trials SET closed_at=$2,close_reason='expired' WHERE owner_id=$1 AND closed_at IS NULL AND ends_at<=$2`, owner, c.Now); err != nil {
			return ItemResult{}, err
		}
		var trialID uuid.UUID
		var previous *time.Time
		if state.trial != nil && state.Preview.Discard == nil {
			trialID = state.trial.ID
			previous = &state.trial.Ends
			_, err = tx.Exec(ctx, `UPDATE wordweave.plan_trials SET ends_at=$3 WHERE owner_id=$1 AND id=$2`, owner, trialID, state.Preview.Plan.Ends)
		} else {
			if state.trial != nil {
				if _, err = tx.Exec(ctx, `UPDATE wordweave.plan_trials SET closed_at=$3,close_reason='replaced' WHERE owner_id=$1 AND id=$2`, owner, state.trial.ID, c.Now); err != nil {
					return ItemResult{}, err
				}
			}
			err = tx.QueryRow(ctx, `INSERT INTO wordweave.plan_trials(owner_id,target_plan_code,started_at,ends_at) VALUES($1,$2,$3,$4) RETURNING id`, owner, dbPlan(state.record.params.Plan), c.Now, state.Preview.Plan.Ends).Scan(&trialID)
		}
		if err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.plan_trial_uses(item_id,owner_id,trial_id,added_seconds,previous_ends_at,result_ends_at,activated_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, owner, trialID, state.record.params.Seconds, previous, state.Preview.Plan.Ends, c.Now)
		}
	}
	if err != nil {
		return ItemResult{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.user_items SET activated_at=$3 WHERE owner_id=$1 AND id=$2`, owner, id, c.Now); err != nil {
		return ItemResult{}, err
	}
	receipt, err := finishReceipt(ctx, tx, owner, settlement, nil)
	if err != nil {
		return ItemResult{}, err
	}
	item, err := loadOwned(ctx, tx, owner, id, locale, c)
	if err != nil {
		return ItemResult{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ItemResult{}, err
	}
	return ItemResult{receipt, item.OwnedItem}, nil
}

type RefundPreview struct {
	Eligible bool             `json:"eligible"`
	Reason   *string          `json:"reason"`
	Points   *business.Amount `json:"points"`
	Token    *string          `json:"confirmation_token"`
}

func refundBlock(r ownedRecord) *string {
	reason := ""
	switch {
	case r.Kind != "model_trial":
		reason = "wrong_item_kind"
	case r.RefundedAt != nil:
		reason = "already_refunded"
	case r.eligible == nil:
		reason = "expired_before_retirement"
		for _, m := range r.Effect.Models {
			if m.Status != "retired" {
				reason = "models_not_all_retired"
				break
			}
		}
	}
	if reason == "" {
		return nil
	}
	return &reason
}
func (s *Service) RefundPreview(ctx context.Context, owner, id uuid.UUID, locale string) (RefundPreview, error) {
	tx, c, err := s.previewTransaction(ctx, owner)
	if err != nil {
		return RefundPreview{}, err
	}
	defer tx.Rollback(ctx)
	r, err := loadOwned(ctx, tx, owner, id, locale, c)
	if err != nil {
		return RefundPreview{}, err
	}
	out := RefundPreview{Reason: refundBlock(r)}
	if out.Reason == nil {
		out.Eligible = true
		points := r.Effect.Retirement
		out.Points = &points
		token, err := s.signer.Encode("item-refund", benefitToken{owner, id, s.revision(c), c.Now.Add(5 * time.Minute)})
		if err != nil {
			return out, err
		}
		out.Token = &token
	}
	if err = tx.Commit(ctx); err != nil {
		return RefundPreview{}, err
	}
	return out, nil
}
func (s *Service) Refund(ctx context.Context, owner, key, id uuid.UUID, locale, tokenString string) (ItemResult, error) {
	if key == uuid.Nil {
		return ItemResult{}, &ValidationError{[]FieldError{{"/idempotency_key", "required"}}}
	}
	tx, c, err := s.previewTransaction(ctx, owner)
	if err != nil {
		return ItemResult{}, err
	}
	defer tx.Rollback(ctx)
	if old, err := existingItemReceipt(ctx, tx, owner, id, "model_refund"); err != nil {
		return ItemResult{}, err
	} else if old != nil {
		item, err := loadOwned(ctx, tx, owner, id, locale, c)
		if err != nil {
			return ItemResult{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return ItemResult{}, err
		}
		return ItemResult{*old, item.OwnedItem}, nil
	}
	var token benefitToken
	if err = s.signer.Decode("item-refund", tokenString, &token); err != nil || token.Owner != owner || token.Item != id || token.Binding != s.revision(c) || !token.Expires.After(c.Now) {
		return ItemResult{}, ErrPreviewStale
	}
	item, err := loadOwned(ctx, tx, owner, id, locale, c)
	if err != nil {
		return ItemResult{}, err
	}
	if reason := refundBlock(item); reason != nil {
		return ItemResult{}, reject(*reason, 422)
	}
	if err = Ensure(ctx, tx, owner); err != nil {
		return ItemResult{}, err
	}
	settlement, _, err := intent(ctx, tx, owner, "model_refund", id.String(), struct{ Item uuid.UUID }{id}, c.Now)
	if err != nil {
		return ItemResult{}, err
	}
	if err = credit(ctx, tx, owner, settlement, "retirement", int64(item.Effect.Retirement), 0); err != nil {
		return ItemResult{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.user_items SET refunded_at=$3 WHERE owner_id=$1 AND id=$2`, owner, id, c.Now); err != nil {
		return ItemResult{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.model_time_contributions SET revoked_at=$3 WHERE owner_id=$1 AND item_id=$2 AND revoked_at IS NULL`, owner, id, c.Now); err != nil {
		return ItemResult{}, err
	}
	receipt, err := finishReceipt(ctx, tx, owner, settlement, nil)
	if err != nil {
		return ItemResult{}, err
	}
	item, err = loadOwned(ctx, tx, owner, id, locale, c)
	if err != nil {
		return ItemResult{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ItemResult{}, err
	}
	return ItemResult{receipt, item.OwnedItem}, nil
}
