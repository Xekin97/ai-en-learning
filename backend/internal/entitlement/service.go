package entitlement

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/dbgen"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

var ErrForbidden = errors.New("generation is not available for this actor")
var ErrQuotaExhausted = errors.New("generation quota exhausted")

type Model struct {
	ID, Name    string
	Description *string
	FromPlan    bool
	CardEndsAt  *time.Time
}
type Quota struct {
	Kind        string     `json:"kind"`
	Limit       *int       `json:"limit"`
	Remaining   *int       `json:"remaining"`
	WindowHours int        `json:"window_hours"`
	RefreshesAt *time.Time `json:"refreshes_at"`
}
type EffectivePlan struct {
	Code        string     `json:"code"`
	Origin      string     `json:"origin"`
	TrialEndsAt *time.Time `json:"trial_ends_at"`
}
type ExtraQuota struct {
	Remaining         int        `json:"remaining"`
	EarliestExpiresAt *time.Time `json:"earliest_expires_at"`
}
type Options struct {
	Models                               []Model
	MeaningLanguages, Scenarios, Lengths []string
	MaxEntries                           int
	CanGenerate                          bool
	Reason                               *string
	Quota                                Quota
	EffectivePlan                        EffectivePlan
	ExtraQuota                           ExtraQuota
}
type Service struct {
	pool *pgxpool.Pool
	ai   *dbgen.Queries
}

func NewService(appPool, aiPool *pgxpool.Pool) *Service {
	return &Service{pool: appPool, ai: dbgen.New(aiPool)}
}

type Reader interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}
type Plan struct {
	Code, Origin string
	TrialEndsAt  *time.Time
	Limit        *int
	MaxEntries   int
}

func Resolve(ctx context.Context, q Reader, actor identity.Actor, now time.Time) (Plan, error) {
	var p Plan
	if actor.IsAdmin() || (!actor.IsVisitor() && !actor.IsLearner()) {
		return p, ErrForbidden
	}
	if actor.IsVisitor() {
		p.Code = "visitor"
		p.Origin = "visitor"
	} else {
		err := q.QueryRow(ctx, `SELECT CASE WHEN trial.priority>base.priority THEN trial.code ELSE base.code END,
   CASE WHEN trial.priority>base.priority THEN 'trial' ELSE 'base' END,
   CASE WHEN trial.priority>base.priority THEN t.ends_at END
   FROM wordweave.accounts a JOIN wordweave.entitlement_groups base ON base.code=a.group_code
   LEFT JOIN wordweave.plan_trials t ON t.owner_id=a.id AND t.closed_at IS NULL AND t.ends_at>$2
   LEFT JOIN wordweave.entitlement_groups trial ON trial.code=t.target_plan_code
   WHERE a.id=$1 AND a.role='learner'`, actor.ID, now).Scan(&p.Code, &p.Origin, &p.TrialEndsAt)
		if err != nil {
			return p, err
		}
	}
	err := q.QueryRow(ctx, `SELECT rolling_quota_limit,max_entries_per_run FROM wordweave.entitlement_groups WHERE code=$1`, p.Code).Scan(&p.Limit, &p.MaxEntries)
	return p, err
}

func Usage(ctx context.Context, q Reader, actor identity.Actor, p Plan, now time.Time) (Quota, error) {
	quota := Quota{Kind: "unlimited", WindowHours: 24}
	if p.Limit == nil {
		return quota, nil
	}
	var used int
	var oldest *time.Time
	var err error
	if actor.IsVisitor() {
		err = q.QueryRow(ctx, `SELECT count(*),(array_agg(charged_at ORDER BY charged_at))[greatest(1,count(*)-$3::bigint+1)] FROM wordweave.generation_charges WHERE visitor_id=$1 AND source_kind='visitor' AND state<>'refunded' AND charged_at>=$2::timestamptz-interval '24 hours'`, actor.ID, now, *p.Limit).Scan(&used, &oldest)
	} else {
		err = q.QueryRow(ctx, `SELECT count(*),(array_agg(c.charged_at ORDER BY c.charged_at))[greatest(1,count(*)-$5::bigint+1)] FROM wordweave.generation_charges c JOIN wordweave.plan_quota_states q ON q.owner_id=c.account_id AND q.plan_code=c.plan_code AND q.origin=c.origin AND q.reset_epoch=c.quota_epoch
   WHERE c.account_id=$1 AND c.plan_code=$2 AND c.origin=$3 AND c.source_kind='plan' AND c.state<>'refunded' AND c.charged_at>=greatest($4::timestamptz-interval '24 hours',q.reset_at)`, actor.ID, p.Code, p.Origin, now, *p.Limit).Scan(&used, &oldest)
	}
	if err != nil {
		return quota, err
	}
	remaining := max(0, *p.Limit-used)
	quota.Kind = "limited"
	quota.Limit = p.Limit
	quota.Remaining = &remaining
	if *p.Limit > 0 && oldest != nil {
		at := oldest.Add(24 * time.Hour)
		quota.RefreshesAt = &at
	}
	return quota, nil
}
func Extra(ctx context.Context, q Reader, actor identity.Actor, now time.Time) (ExtraQuota, error) {
	var result ExtraQuota
	if actor.IsVisitor() {
		return result, nil
	}
	err := q.QueryRow(ctx, `SELECT coalesce(sum(remaining_count),0),min(expires_at) FROM wordweave.extra_credit_balances WHERE owner_id=$1 AND remaining_count>0 AND expires_at>$2`, actor.ID, now).Scan(&result.Remaining, &result.EarliestExpiresAt)
	return result, err
}

func (s *Service) Options(ctx context.Context, actor identity.Actor) (Options, error) {
	var result Options
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	plan, err := Resolve(ctx, tx, actor, c.Now)
	if err != nil {
		return result, err
	}
	result.MaxEntries = plan.MaxEntries
	result.EffectivePlan = EffectivePlan{Code: plan.Code, Origin: plan.Origin, TrialEndsAt: plan.TrialEndsAt}
	if plan.Code != "visitor" {
		result.EffectivePlan.Code = *identity.PlanCode(plan.Code)
	}
	result.Quota, err = Usage(ctx, tx, actor, plan, c.Now)
	if err != nil {
		return result, err
	}
	result.ExtraQuota, err = Extra(ctx, tx, actor, c.Now)
	if err != nil {
		return result, err
	}
	result.Models = make([]Model, 0)
	result.Lengths = make([]string, 0)
	rows, err := tx.Query(ctx, `SELECT m.id,m.display_name,m.description,EXISTS(SELECT 1 FROM wordweave.group_models g WHERE g.model_id=m.id AND g.group_code=$1),
  (SELECT max(c.ends_at) FROM wordweave.model_time_contributions c WHERE c.owner_id=$2 AND c.model_id=m.id AND c.revoked_at IS NULL AND c.ends_at>$3)
  FROM wordweave.ai_models m WHERE m.enabled AND m.retired_at IS NULL AND EXISTS(SELECT 1 FROM wordweave.ai_providers p WHERE p.id=m.provider_id AND p.credential_configured) AND (
   EXISTS(SELECT 1 FROM wordweave.group_models g WHERE g.model_id=m.id AND g.group_code=$1) OR
   ($4 AND EXISTS(SELECT 1 FROM wordweave.model_time_contributions c WHERE c.owner_id=$2 AND c.model_id=m.id AND c.revoked_at IS NULL AND c.starts_at<=$3 AND c.ends_at>$3))) ORDER BY m.created_at,m.id`, plan.Code, actor.ID, c.Now, actor.IsLearner())
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var m Model
		if err = rows.Scan(&m.ID, &m.Name, &m.Description, &m.FromPlan, &m.CardEndsAt); err != nil {
			rows.Close()
			return result, err
		}
		result.Models = append(result.Models, m)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return result, err
	}
	rows.Close()
	rows, err = tx.Query(ctx, `SELECT length_code FROM wordweave.group_lengths WHERE group_code=$1 ORDER BY array_position(ARRAY['short','medium','long','xlong'],length_code)`, plan.Code)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var length string
		if err = rows.Scan(&length); err != nil {
			rows.Close()
			return result, err
		}
		result.Lengths = append(result.Lengths, length)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return result, err
	}
	rows.Close()
	configured, err := s.ai.HasModelCredential(ctx)
	if err != nil {
		return result, err
	}
	var active bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.generation_runs WHERE call_status='active' AND (($2 AND visitor_id=$1) OR (NOT $2 AND account_id=$1)))`, actor.ID, actor.IsVisitor()).Scan(&active); err != nil {
		return result, err
	}
	reason := ""
	switch {
	case !configured:
		reason = "credential_missing"
	case len(result.Models) == 0:
		reason = "no_models"
	case len(result.Lengths) == 0:
		reason = "no_lengths"
	case plan.Limit != nil && *plan.Limit == 0 && result.ExtraQuota.Remaining == 0:
		reason = "quota_disabled"
	case result.Quota.Remaining != nil && *result.Quota.Remaining == 0 && result.ExtraQuota.Remaining == 0:
		reason = "quota_exhausted"
	case active:
		reason = "generation_in_progress"
	}
	if reason != "" {
		result.Reason = &reason
	}
	result.CanGenerate = reason == ""
	result.MeaningLanguages = []string{"zh", "en", "ja"}
	result.Scenarios = []string{"discussion", "story", "business", "news"}
	if err = tx.Commit(ctx); err != nil {
		return Options{}, err
	}
	return result, nil
}

// Reserve runs under the already-held subject lock. It picks one real source
// and records it with the run; a later refund cannot choose a different budget.
func Reserve(ctx context.Context, tx pgx.Tx, actor identity.Actor, p Plan, run uuid.UUID, now time.Time) error {
	quota, err := Usage(ctx, tx, actor, p, now)
	if err != nil {
		return err
	}
	if p.Limit == nil || *quota.Remaining > 0 {
		if actor.IsVisitor() {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.generation_charges(run_id,visitor_id,source_kind,state,charged_at) VALUES($1,$2,'visitor','reserved',$3)`, run, actor.ID, now)
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_at) VALUES($1,$2,$3,'-infinity') ON CONFLICT DO NOTHING`, actor.ID, p.Code, p.Origin); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO wordweave.generation_charges(run_id,account_id,source_kind,plan_code,origin,quota_epoch,state,charged_at) SELECT $1,$2,'plan',$3,$4,reset_epoch,'reserved',$5 FROM wordweave.plan_quota_states WHERE owner_id=$2 AND plan_code=$3 AND origin=$4`, run, actor.ID, p.Code, p.Origin, now)
		return err
	}
	if actor.IsVisitor() {
		return ErrQuotaExhausted
	}
	var item uuid.UUID
	err = tx.QueryRow(ctx, `SELECT item_id FROM wordweave.extra_credit_balances WHERE owner_id=$1 AND remaining_count>0 AND expires_at>$2 ORDER BY expires_at,item_id LIMIT 1 FOR UPDATE`, actor.ID, now).Scan(&item)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrQuotaExhausted
	}
	if err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `UPDATE wordweave.extra_credit_balances SET remaining_count=remaining_count-1 WHERE item_id=$1 AND owner_id=$2 AND remaining_count>0 AND expires_at>$3`, item, actor.ID, now)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrQuotaExhausted
	}
	_, err = tx.Exec(ctx, `INSERT INTO wordweave.generation_charges(run_id,account_id,source_kind,item_id,state,charged_at) VALUES($1,$2,'extra_credit',$3,'reserved',$4)`, run, actor.ID, item, now)
	return err
}
