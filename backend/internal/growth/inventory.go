package growth

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/entitlement"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

type EffectModel struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	Status  string    `json:"status"`
	retired *time.Time
}
type Effect struct {
	Kind       string
	Count      int64
	Models     []EffectModel
	Seconds    int64
	Plan       string
	Retirement business.Amount
}

func (e Effect) MarshalJSON() ([]byte, error) {
	if e.Kind == "model_trial" {
		return json.Marshal(struct {
			Kind       string          `json:"kind"`
			Models     []EffectModel   `json:"models"`
			Seconds    int64           `json:"trial_seconds"`
			Retirement business.Amount `json:"retirement_points"`
		}{e.Kind, e.Models, e.Seconds, e.Retirement})
	}
	return json.Marshal(EffectInput{Kind: e.Kind, ExtraCount: e.Count, Seconds: e.Seconds, Plan: e.Plan})
}

type OwnedModelTime struct {
	ID        uuid.UUID  `json:"model_id"`
	Name      string     `json:"name"`
	Starts    time.Time  `json:"contribution_starts_at"`
	Ends      time.Time  `json:"contribution_ends_at"`
	Aggregate *time.Time `json:"aggregate_ends_at"`
	revoked   *time.Time
}
type OwnedPlanTrial struct {
	Code   string    `json:"plan_code"`
	Ends   time.Time `json:"ends_at"`
	closed *time.Time
}
type OwnedExtra struct {
	Remaining int64     `json:"remaining"`
	Expires   time.Time `json:"expires_at"`
}
type OwnedRefund struct {
	EligibleAt time.Time       `json:"eligible_at"`
	Points     business.Amount `json:"points"`
}
type OwnedItem struct {
	ID            uuid.UUID        `json:"id"`
	DefinitionID  uuid.UUID        `json:"definition_id"`
	Name          string           `json:"name"`
	Description   string           `json:"description"`
	Kind          string           `json:"kind"`
	Effect        Effect           `json:"effect"`
	IssuedAt      time.Time        `json:"issued_at"`
	Deadline      time.Time        `json:"activation_deadline"`
	ActivatedAt   *time.Time       `json:"activated_at"`
	State         string           `json:"state"`
	UseBlock      *string          `json:"use_block"`
	ModelTimes    []OwnedModelTime `json:"model_times"`
	Plan          *OwnedPlanTrial  `json:"plan_trial"`
	Extra         *OwnedExtra      `json:"extra_credit"`
	Refund        *OwnedRefund     `json:"refund"`
	RefundedAt    *time.Time       `json:"refunded_at"`
	RefundReceipt *uuid.UUID       `json:"refund_receipt_id"`
}
type ownedRecord struct {
	OwnedItem
	eligible *time.Time
	params   issuedParameters
}

func modelEffects(ctx context.Context, tx pgx.Tx, id uuid.UUID, owned bool) ([]EffectModel, error) {
	source := `wordweave.item_definition_models dm`
	idColumn := "dm.definition_id"
	if owned {
		source = `wordweave.user_item_models dm`
		idColumn = "dm.item_id"
	}
	rows, err := tx.Query(ctx, `SELECT m.id,m.display_name,CASE WHEN m.retired_at IS NOT NULL THEN 'retired' WHEN m.enabled THEN 'enabled' ELSE 'disabled' END,m.retired_at FROM `+source+` JOIN wordweave.ai_models m ON m.id=dm.model_id WHERE `+idColumn+`=$1 ORDER BY m.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	models := make([]EffectModel, 0)
	for rows.Next() {
		var m EffectModel
		if err = rows.Scan(&m.ID, &m.Name, &m.Status, &m.retired); err != nil {
			return nil, err
		}
		models = append(models, m)
	}
	return models, rows.Err()
}
func loadOwned(ctx context.Context, tx pgx.Tx, owner, id uuid.UUID, locale string, c business.Configuration) (ownedRecord, error) {
	var r ownedRecord
	var raw []byte
	r.ModelTimes = make([]OwnedModelTime, 0)
	err := tx.QueryRow(ctx, `SELECT id,definition_id,issued_at,activation_deadline,kind_snapshot,parameters_snapshot,activated_at,refunded_at,refund_eligible_at FROM wordweave.user_items WHERE owner_id=$1 AND id=$2 FOR UPDATE`, owner, id).Scan(&r.ID, &r.DefinitionID, &r.IssuedAt, &r.Deadline, &r.Kind, &raw, &r.ActivatedAt, &r.RefundedAt, &r.eligible)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, ErrNotFound
	}
	if err != nil {
		return r, err
	}
	if err = json.Unmarshal(raw, &r.params); err != nil {
		return r, err
	}
	d, err := readDefinition(ctx, tx, r.DefinitionID)
	if err != nil {
		return r, err
	}
	r.Name = local(d.Name, locale)
	r.Description = local(d.Description, locale)
	r.Effect = Effect{Kind: r.Kind, Count: r.params.ExtraCount, Seconds: r.params.Seconds, Plan: r.params.Plan, Retirement: d.Effect.Retirement}
	if r.Kind == "model_trial" {
		r.Effect.Models, err = modelEffects(ctx, tx, id, true)
		if err != nil {
			return r, err
		}
		rows, err := tx.Query(ctx, `SELECT t.model_id,m.display_name,t.starts_at,t.ends_at,t.revoked_at,(SELECT max(ends_at) FROM wordweave.model_time_contributions WHERE owner_id=$1 AND model_id=t.model_id AND revoked_at IS NULL AND ends_at>$3) FROM wordweave.model_time_contributions t JOIN wordweave.ai_models m ON m.id=t.model_id WHERE t.owner_id=$1 AND t.item_id=$2 ORDER BY t.model_id`, owner, id, c.Now)
		if err != nil {
			return r, err
		}
		for rows.Next() {
			var m OwnedModelTime
			if err = rows.Scan(&m.ID, &m.Name, &m.Starts, &m.Ends, &m.revoked, &m.Aggregate); err != nil {
				rows.Close()
				return r, err
			}
			r.ModelTimes = append(r.ModelTimes, m)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return r, err
		}
		if r.eligible == nil && len(r.Effect.Models) > 0 {
			allRetired := true
			var last time.Time
			for _, m := range r.Effect.Models {
				if m.retired == nil {
					allRetired = false
					break
				}
				if m.retired.After(last) {
					last = *m.retired
				}
			}
			valid := r.ActivatedAt == nil && last.Before(r.Deadline) && !last.Before(r.IssuedAt)
			if r.ActivatedAt != nil {
				for _, m := range r.ModelTimes {
					if m.Ends.After(last) && m.revoked == nil {
						valid = true
						break
					}
				}
			}
			if allRetired && valid {
				if _, err = tx.Exec(ctx, `UPDATE wordweave.user_items SET refund_eligible_at=$3 WHERE owner_id=$1 AND id=$2 AND refund_eligible_at IS NULL`, owner, id, last); err != nil {
					return r, err
				}
				r.eligible = &last
			}
		}
	}
	if r.ActivatedAt != nil {
		if r.Kind == "extra_credit" {
			var extra OwnedExtra
			if err = tx.QueryRow(ctx, `SELECT remaining_count,expires_at FROM wordweave.extra_credit_balances WHERE owner_id=$1 AND item_id=$2`, owner, id).Scan(&extra.Remaining, &extra.Expires); err != nil {
				return r, err
			}
			r.Extra = &extra
		}
		if r.Kind == "plan_trial" {
			var trial OwnedPlanTrial
			if err = tx.QueryRow(ctx, `SELECT t.target_plan_code,t.ends_at,t.closed_at FROM wordweave.plan_trial_uses u JOIN wordweave.plan_trials t ON t.id=u.trial_id AND t.owner_id=u.owner_id WHERE u.owner_id=$1 AND u.item_id=$2`, owner, id).Scan(&trial.Code, &trial.Ends, &trial.closed); err != nil {
				return r, err
			}
			trial.Code = apiPlan(trial.Code)
			r.Plan = &trial
		}
	}
	switch {
	case r.RefundedAt != nil:
		r.State = "refunded"
		reason := "already_refunded"
		r.UseBlock = &reason
		var receipt uuid.UUID
		if err = tx.QueryRow(ctx, `SELECT id FROM wordweave.growth_settlements WHERE owner_id=$1 AND kind='model_refund' AND source_key=$2`, owner, id.String()).Scan(&receipt); err != nil {
			return r, err
		}
		r.RefundReceipt = &receipt
	case r.eligible != nil:
		r.State = "refundable"
		r.Refund = &OwnedRefund{*r.eligible, d.Effect.Retirement}
		reason := "model_unavailable"
		if r.ActivatedAt != nil {
			reason = "already_used"
		}
		r.UseBlock = &reason
	case r.ActivatedAt == nil:
		r.State = "unused"
		if !r.Deadline.After(c.Now) {
			r.State = "ended"
		}
		r.UseBlock, err = itemUseBlock(ctx, tx, owner, r, c)
		if err != nil {
			return r, err
		}
	default:
		r.State = "ended"
		reason := "already_used"
		r.UseBlock = &reason
		if r.Extra != nil && r.Extra.Remaining > 0 && r.Extra.Expires.After(c.Now) {
			r.State = "active"
		}
		if r.Plan != nil && r.Plan.closed == nil && r.Plan.Ends.After(c.Now) {
			r.State = "active"
		}
		for _, m := range r.ModelTimes {
			if m.revoked == nil && m.Ends.After(c.Now) {
				r.State = "active"
				break
			}
		}
	}
	return r, nil
}
func itemUseBlock(ctx context.Context, tx pgx.Tx, owner uuid.UUID, r ownedRecord, c business.Configuration) (*string, error) {
	block := func(reason string) (*string, error) { return &reason, nil }
	if r.RefundedAt != nil {
		return block("already_refunded")
	}
	if r.ActivatedAt != nil {
		return block("already_used")
	}
	if !r.Deadline.After(c.Now) {
		return block("expired")
	}
	if r.Kind == "model_trial" {
		available := false
		for _, m := range r.Effect.Models {
			if m.Status == "enabled" {
				available = true
				break
			}
		}
		if !available {
			return block("model_unavailable")
		}
		actor := identity.Actor{ID: owner, Kind: "account", Role: "learner"}
		plan, err := entitlement.Resolve(ctx, tx, actor, c.Now)
		if err != nil {
			return nil, err
		}
		var covered bool
		err = tx.QueryRow(ctx, `SELECT NOT EXISTS(SELECT 1 FROM wordweave.user_item_models im JOIN wordweave.ai_models m ON m.id=im.model_id WHERE im.item_id=$1 AND m.retired_at IS NULL AND NOT EXISTS(SELECT 1 FROM wordweave.group_models gm WHERE gm.group_code=$2 AND gm.model_id=im.model_id))`, r.ID, plan.Code).Scan(&covered)
		if err != nil {
			return nil, err
		}
		if covered {
			return block("plan_already_covers_models")
		}
	}
	if r.Kind == "plan_trial" {
		var aboveBase, belowTrial bool
		err := tx.QueryRow(ctx, `SELECT target.priority>base.priority,coalesce(target.priority<trial.priority,false) FROM wordweave.accounts a JOIN wordweave.entitlement_groups base ON base.code=a.group_code JOIN wordweave.entitlement_groups target ON target.code=$2 LEFT JOIN wordweave.plan_trials t ON t.owner_id=a.id AND t.closed_at IS NULL AND t.ends_at>$3 LEFT JOIN wordweave.entitlement_groups trial ON trial.code=t.target_plan_code WHERE a.id=$1`, owner, dbPlan(r.params.Plan), c.Now).Scan(&aboveBase, &belowTrial)
		if err != nil {
			return nil, err
		}
		if !aboveBase {
			return block("plan_not_above_base")
		}
		if belowTrial {
			return block("lower_than_current_trial")
		}
	}
	return nil, nil
}

type OwnedCursor struct {
	At time.Time `json:"at"`
	ID uuid.UUID `json:"id"`
}

func (s *Service) OwnedItems(ctx context.Context, owner uuid.UUID, locale, kind, state string, cursor *OwnedCursor, limit int) ([]OwnedItem, bool, error) {
	validState := state == "" || state == "unused" || state == "active" || state == "ended" || state == "refundable" || state == "refunded"
	if limit < 1 || limit > 100 || kind != "" && !validItemKind(kind) || !validState {
		return nil, false, &ValidationError{[]FieldError{{"/filter", "out_of_range"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return nil, false, err
	}
	if err = business.LockLearner(ctx, tx, owner); err != nil {
		return nil, false, err
	}
	var at, id any
	if cursor != nil {
		at = cursor.At
		id = cursor.ID
	}
	// Scan keyset chunks when filtering derived state. Expiry/refund eligibility
	// use transaction time and retirement facts, never a delayed status job.
	out := make([]OwnedItem, 0, limit+1)
	for len(out) <= limit {
		rows, err := tx.Query(ctx, `SELECT id,issued_at FROM wordweave.user_items WHERE owner_id=$1 AND ($2='' OR kind_snapshot=$2) AND ($3::timestamptz IS NULL OR (issued_at,id)<($3,$4)) ORDER BY issued_at DESC,id DESC LIMIT 100`, owner, kind, at, id)
		if err != nil {
			return nil, false, err
		}
		batch := make([]OwnedCursor, 0, 100)
		for rows.Next() {
			var row OwnedCursor
			if err = rows.Scan(&row.ID, &row.At); err != nil {
				rows.Close()
				return nil, false, err
			}
			batch = append(batch, row)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return nil, false, err
		}
		if len(batch) == 0 {
			break
		}
		for _, key := range batch {
			row, err := loadOwned(ctx, tx, owner, key.ID, locale, c)
			if err != nil {
				return nil, false, err
			}
			if state == "" || row.State == state {
				out = append(out, row.OwnedItem)
				if len(out) > limit {
					break
				}
			}
		}
		last := batch[len(batch)-1]
		at = last.At
		id = last.ID
		if len(batch) < 100 {
			break
		}
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return out, more, nil
}
