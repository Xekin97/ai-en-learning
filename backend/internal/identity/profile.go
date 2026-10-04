package identity

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type Welcome struct {
	Kind               string     `json:"kind"`
	DisplayName        string     `json:"display_name"`
	DaysSinceLearning  *int       `json:"days_since_learning"`
	PreviousLearningAt *time.Time `json:"previous_learning_at"`
}

func welcome(name string, previous *time.Time, now time.Time) *Welcome {
	result := &Welcome{Kind: "no_learning", DisplayName: name, PreviousLearningAt: previous}
	if previous == nil {
		return result
	}
	days := max(0, int(business.LearningDay(now).Sub(business.LearningDay(*previous))/(24*time.Hour)))
	result.DaysSinceLearning = &days
	result.Kind = "same_day"
	if days > 0 {
		result.Kind = "returning"
	}
	return result
}

type Account struct {
	Username          string     `json:"username"`
	Nickname          *string    `json:"nickname"`
	DisplayName       string     `json:"display_name"`
	Gender            *string    `json:"gender"`
	UILocale          string     `json:"ui_locale"`
	BasePlanCode      string     `json:"base_plan_code"`
	EffectivePlanCode string     `json:"effective_plan_code"`
	LastLoginAt       *time.Time `json:"last_login_at"`
	LastLearningAt    *time.Time `json:"last_learning_at"`
}
type profileReader interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func readAccount(ctx context.Context, q profileReader, id uuid.UUID) (Account, error) {
	var result Account
	var base, effective string
	err := q.QueryRow(ctx, `SELECT a.username,a.nickname,coalesce(a.nickname,a.username),a.gender,coalesce(a.ui_locale,'zh-CN'),a.group_code,
   CASE WHEN trial.priority>base.priority THEN trial.code ELSE base.code END,a.last_login_at,a.last_learning_at
   FROM wordweave.accounts a JOIN wordweave.entitlement_groups base ON base.code=a.group_code
   LEFT JOIN wordweave.plan_trials t ON t.owner_id=a.id AND t.closed_at IS NULL AND t.ends_at>statement_timestamp()
   LEFT JOIN wordweave.entitlement_groups trial ON trial.code=t.target_plan_code
   WHERE a.id=$1 AND a.role='learner'`, id).Scan(&result.Username, &result.Nickname, &result.DisplayName, &result.Gender, &result.UILocale, &base, &effective, &result.LastLoginAt, &result.LastLearningAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	result.BasePlanCode = *PlanCode(base)
	result.EffectivePlanCode = *PlanCode(effective)
	return result, nil
}

func (s *Service) Account(ctx context.Context, actor Actor) (Account, error) {
	if !actor.IsLearner() {
		return Account{}, ErrForbidden
	}
	return readAccount(ctx, s.pool, actor.ID)
}

func (s *Service) UpdateProfile(ctx context.Context, actor Actor, nickname, gender *string) (Account, error) {
	if !actor.IsLearner() {
		return Account{}, ErrForbidden
	}
	if nickname != nil {
		normalized := strings.TrimSpace(*nickname)
		if !utf8.ValidString(normalized) || utf8.RuneCountInString(normalized) > 64 {
			return Account{}, ErrValidation
		}
		if normalized == "" {
			nickname = nil
		} else {
			nickname = &normalized
		}
	}
	if gender != nil && *gender != "female" && *gender != "male" {
		return Account{}, ErrValidation
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return Account{}, err
	}
	if err = business.LockLearner(ctx, tx, actor.ID); err != nil {
		return Account{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.accounts SET nickname=$2,gender=$3 WHERE id=$1`, actor.ID, nickname, gender); err != nil {
		return Account{}, err
	}
	result, err := readAccount(ctx, tx, actor.ID)
	if err != nil {
		return Account{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return result, nil
}
