package admin

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"time"
	"wordweave/internal/entitlement"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

type BaseBenefit struct {
	Code  string            `json:"code"`
	Quota entitlement.Quota `json:"quota"`
}
type TrialBenefit struct {
	Code  string            `json:"code"`
	Ends  time.Time         `json:"ends_at"`
	Quota entitlement.Quota `json:"quota"`
}
type Benefits struct {
	Base   BaseBenefit            `json:"base_plan"`
	Trial  *TrialBenefit          `json:"trial"`
	Origin string                 `json:"effective_origin"`
	Extra  entitlement.ExtraQuota `json:"extra_quota"`
}

func (s *Service) Benefits(ctx context.Context, owner uuid.UUID) (Benefits, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Benefits{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Benefits{}, err
	}
	if err = business.LockLearner(ctx, tx, owner); err != nil {
		if errors.Is(err, business.ErrNotFound) {
			err = ErrNotFound
		}
		return Benefits{}, err
	}
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner"}
	base := entitlement.Plan{Origin: "base"}
	if err = tx.QueryRow(ctx, `SELECT a.group_code,g.rolling_quota_limit,g.max_entries_per_run FROM wordweave.accounts a JOIN wordweave.entitlement_groups g ON g.code=a.group_code WHERE a.id=$1`, owner).Scan(&base.Code, &base.Limit, &base.MaxEntries); err != nil {
		return Benefits{}, err
	}
	out := Benefits{Base: BaseBenefit{Code: publicGroupCode(base.Code)}}
	out.Base.Quota, err = entitlement.Usage(ctx, tx, actor, base, c.Now)
	if err != nil {
		return out, err
	}
	trial := entitlement.Plan{Origin: "trial"}
	var ends time.Time
	err = tx.QueryRow(ctx, `SELECT t.target_plan_code,t.ends_at,g.rolling_quota_limit,g.max_entries_per_run FROM wordweave.plan_trials t JOIN wordweave.entitlement_groups g ON g.code=t.target_plan_code WHERE t.owner_id=$1 AND t.closed_at IS NULL AND t.ends_at>$2`, owner, c.Now).Scan(&trial.Code, &ends, &trial.Limit, &trial.MaxEntries)
	if err == nil {
		quota, err := entitlement.Usage(ctx, tx, actor, trial, c.Now)
		if err != nil {
			return out, err
		}
		out.Trial = &TrialBenefit{publicGroupCode(trial.Code), ends, quota}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}
	selected, err := entitlement.Resolve(ctx, tx, actor, c.Now)
	if err != nil {
		return out, err
	}
	out.Origin = selected.Origin
	out.Extra, err = entitlement.Extra(ctx, tx, actor, c.Now)
	return out, err
}
