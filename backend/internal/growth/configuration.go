package growth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

type Service struct {
	pool   *pgxpool.Pool
	key    []byte
	signer security.CursorSigner
}

func NewService(pool *pgxpool.Pool, key []byte) *Service {
	return &Service{pool: pool, key: append([]byte(nil), key...), signer: security.NewCursorSigner(key)}
}

type FieldError struct {
	Field string `json:"field"`
	Code  string `json:"code"`
}
type ValidationError struct{ Fields []FieldError }

func (e *ValidationError) Error() string { return "growth configuration validation failed" }
func (e *ValidationError) Add(field, code string) {
	e.Fields = append(e.Fields, FieldError{field, code})
}
func (e *ValidationError) Result() error {
	if len(e.Fields) == 0 {
		return nil
	}
	return e
}

var ErrImpactChanged = errors.New("confirmation does not match current changes")
var ErrPreviewStale = errors.New("confirmation expired or invalid")

func (s *Service) revision(c business.Configuration) string {
	return business.Revision(s.key, "configuration", c.Revision)
}
func (s *Service) requireRevision(c business.Configuration, expected string) error {
	if expected != s.revision(c) {
		return &business.RevisionConflict{Current: s.revision(c)}
	}
	return nil
}

type CheckinValues struct {
	Base       business.Amount `json:"base_points"`
	Step       business.Amount `json:"step_points"`
	Cap        business.Amount `json:"cap_points"`
	Experience business.Amount `json:"normal_experience"`
}
type CheckinRule struct {
	EffectiveDay string `json:"effective_day"`
	CheckinValues
}
type Settings struct {
	LearningDay string          `json:"learning_day"`
	Mastery     business.Amount `json:"mastery_experience"`
	StartedAt   *time.Time      `json:"growth_started_at"`
	Current     *CheckinRule    `json:"current"`
	Pending     *CheckinRule    `json:"pending"`
	Revision    string          `json:"revision"`
}
type SettingsInput struct {
	Mastery business.Amount `json:"mastery_experience"`
	CheckinValues
	Expected string `json:"expected_revision"`
}

func (s *Service) GetSettings(ctx context.Context) (Settings, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Settings{}, err
	}
	return s.readSettings(ctx, tx, c)
}
func (s *Service) readSettings(ctx context.Context, tx pgx.Tx, c business.Configuration) (Settings, error) {
	day := business.LearningDay(c.Now)
	out := Settings{LearningDay: day.Format("2006-01-02"), Mastery: business.Amount(c.MasteryExperience), StartedAt: c.ActivatedAt, Revision: s.revision(c)}
	for _, pending := range []bool{false, true} {
		var r CheckinRule
		var date time.Time
		err := tx.QueryRow(ctx, `SELECT effective_day,base_points,step_points,cap_points,normal_experience FROM wordweave.checkin_rules WHERE CASE WHEN $2 THEN effective_day>$1 ELSE effective_day<=$1 END ORDER BY effective_day DESC LIMIT 1`, day, pending).Scan(&date, &r.Base, &r.Step, &r.Cap, &r.Experience)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return out, err
		}
		r.EffectiveDay = date.Format("2006-01-02")
		if pending {
			out.Pending = &r
		} else {
			out.Current = &r
		}
	}
	return out, nil
}
func (s *Service) SaveSettings(ctx context.Context, actor uuid.UUID, in SettingsInput) (Settings, error) {
	validation := &ValidationError{}
	for field, value := range map[string]business.Amount{"/mastery_experience": in.Mastery, "/base_points": in.Base, "/step_points": in.Step, "/cap_points": in.Cap, "/normal_experience": in.Experience} {
		if value < 0 {
			validation.Add(field, "out_of_range")
		}
	}
	if in.Cap < in.Base {
		validation.Add("/cap_points", "out_of_range")
	}
	if err := validation.Result(); err != nil {
		return Settings{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Settings{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return Settings{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.growth_settings SET mastery_experience=$1 WHERE singleton`, int64(in.Mastery)); err != nil {
		return Settings{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience,updated_by) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(effective_day) DO UPDATE SET base_points=EXCLUDED.base_points,step_points=EXCLUDED.step_points,cap_points=EXCLUDED.cap_points,normal_experience=EXCLUDED.normal_experience,updated_by=EXCLUDED.updated_by,revision=wordweave.checkin_rules.revision+1`, business.LearningDay(c.Now).AddDate(0, 0, 1), int64(in.Base), int64(in.Step), int64(in.Cap), int64(in.Experience), actor); err != nil {
		return Settings{}, err
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return Settings{}, err
	}
	c.MasteryExperience = int64(in.Mastery)
	result, err := s.readSettings(ctx, tx, c)
	if err != nil {
		return Settings{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Settings{}, err
	}
	return result, nil
}

type RewardInput struct {
	Points business.Amount `json:"points"`
	ItemID *uuid.UUID      `json:"item_definition_id" nullable:"true"`
	Count  int64           `json:"item_count"`
}

// All configuration writers hold the same singleton lock, so validation and
// publication observe the same reward definitions without a race with removal.
func validateReward(ctx context.Context, tx pgx.Tx, r RewardInput, path string, v *ValidationError) error {
	if r.Points < 0 {
		v.Add(path+"/points", "out_of_range")
	}
	if r.Count < 0 || r.Count > 2147483647 || (r.ItemID == nil && r.Count != 0) || (r.ItemID != nil && r.Count == 0) {
		v.Add(path+"/item_count", "out_of_range")
	}
	if r.ItemID == nil {
		return nil
	}
	var available bool
	err := tx.QueryRow(ctx, `SELECT CASE WHEN d.kind='model_trial' THEN EXISTS(SELECT 1 FROM wordweave.item_definition_models dm JOIN wordweave.ai_models m ON m.id=dm.model_id WHERE dm.definition_id=d.id AND m.enabled AND m.retired_at IS NULL) ELSE true END FROM wordweave.item_definitions d WHERE d.id=$1`, *r.ItemID).Scan(&available)
	if errors.Is(err, pgx.ErrNoRows) {
		v.Add(path+"/item_definition_id", "invalid_reference")
		return nil
	}
	if err != nil {
		return err
	}
	if !available {
		v.Add(path, "reward_unavailable")
	}
	return nil
}
