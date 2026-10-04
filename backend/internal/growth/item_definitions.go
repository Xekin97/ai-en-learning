package growth

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type DomainError struct {
	Code   string
	Status int
}

func (e *DomainError) Error() string       { return e.Code }
func reject(code string, status int) error { return &DomainError{code, status} }

var ErrNotFound = errors.New("growth resource not found")

type EffectInput struct {
	Kind       string          `json:"kind"`
	ExtraCount int64           `json:"extra_count,omitempty"`
	Models     []uuid.UUID     `json:"model_ids,omitempty"`
	Seconds    int64           `json:"trial_seconds,omitempty"`
	Retirement business.Amount `json:"retirement_points,omitempty"`
	Plan       string          `json:"target_plan_code,omitempty"`
}

func (e EffectInput) MarshalJSON() ([]byte, error) {
	switch e.Kind {
	case "makeup":
		return json.Marshal(struct {
			Kind string `json:"kind"`
		}{e.Kind})
	case "extra_credit":
		return json.Marshal(struct {
			Kind  string `json:"kind"`
			Count int64  `json:"extra_count"`
		}{e.Kind, e.ExtraCount})
	case "model_trial":
		return json.Marshal(struct {
			Kind       string          `json:"kind"`
			Models     []uuid.UUID     `json:"model_ids"`
			Seconds    int64           `json:"trial_seconds"`
			Retirement business.Amount `json:"retirement_points"`
		}{e.Kind, e.Models, e.Seconds, e.Retirement})
	case "plan_trial":
		return json.Marshal(struct {
			Kind    string `json:"kind"`
			Plan    string `json:"target_plan_code"`
			Seconds int64  `json:"trial_seconds"`
		}{e.Kind, e.Plan, e.Seconds})
	default:
		return nil, errors.New("invalid effect kind")
	}
}

type ItemInput struct {
	Kind        string             `json:"kind"`
	Name        business.Bilingual `json:"name"`
	Description business.Bilingual `json:"description"`
	Price       business.Amount    `json:"exchange_price"`
	TTL         int64              `json:"activation_ttl_seconds"`
	Effect      EffectInput        `json:"effect"`
}
type ItemConfig struct {
	ID uuid.UUID `json:"id"`
	ItemInput
	Listed     bool      `json:"listed"`
	EverIssued bool      `json:"ever_issued"`
	References int       `json:"reference_count"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
type DefinitionCursor struct {
	At       time.Time `json:"at"`
	ID       uuid.UUID `json:"id"`
	Revision string    `json:"revision"`
}
type DefinitionFilter struct {
	Query, Kind string
	Listed      *bool
}
type ItemReference struct {
	Kind    string    `json:"kind"`
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	Enabled bool      `json:"enabled"`
}
type ReferenceCursor struct {
	Kind string    `json:"kind"`
	ID   uuid.UUID `json:"id"`
}

func validItemKind(kind string) bool {
	switch kind {
	case "makeup", "extra_credit", "model_trial", "plan_trial":
		return true
	}
	return false
}
func dbPlan(code string) string {
	if code == "basic" {
		return "registered"
	}
	return code
}
func apiPlan(code string) string {
	if code == "registered" {
		return "basic"
	}
	return code
}

func readDefinition(ctx context.Context, tx pgx.Tx, id uuid.UUID) (ItemConfig, error) {
	var r ItemConfig
	var extra, seconds *int64
	var plan *string
	var retirement *business.Amount
	err := tx.QueryRow(ctx, `SELECT d.id,d.kind,d.name_zh,d.name_en,d.description_zh,d.description_en,d.exchange_price,d.activation_ttl_seconds,d.listed,d.ever_issued,d.created_at,d.updated_at,d.extra_count,d.trial_seconds,d.target_plan_code,d.retirement_points,
 (SELECT count(*) FROM wordweave.growth_levels WHERE item_definition_id=d.id)+(SELECT count(*) FROM wordweave.achievement_tiers WHERE item_definition_id=d.id)
 FROM wordweave.item_definitions d WHERE d.id=$1`, id).Scan(&r.ID, &r.Kind, &r.Name.ZH, &r.Name.EN, &r.Description.ZH, &r.Description.EN, &r.Price, &r.TTL, &r.Listed, &r.EverIssued, &r.CreatedAt, &r.UpdatedAt, &extra, &seconds, &plan, &retirement, &r.References)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, ErrNotFound
	}
	if err != nil {
		return r, err
	}
	r.Effect.Kind = r.Kind
	if extra != nil {
		r.Effect.ExtraCount = *extra
	}
	if seconds != nil {
		r.Effect.Seconds = *seconds
	}
	if plan != nil {
		r.Effect.Plan = apiPlan(*plan)
	}
	if retirement != nil {
		r.Effect.Retirement = *retirement
	}
	if r.Kind == "model_trial" {
		rows, err := tx.Query(ctx, `SELECT model_id FROM wordweave.item_definition_models WHERE definition_id=$1 ORDER BY model_id`, id)
		if err != nil {
			return r, err
		}
		defer rows.Close()
		r.Effect.Models = make([]uuid.UUID, 0)
		for rows.Next() {
			var model uuid.UUID
			if err = rows.Scan(&model); err != nil {
				return r, err
			}
			r.Effect.Models = append(r.Effect.Models, model)
		}
		if err = rows.Err(); err != nil {
			return r, err
		}
	}
	return r, nil
}
func (s *Service) Definition(ctx context.Context, id uuid.UUID) (ItemConfig, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ItemConfig{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return ItemConfig{}, "", err
	}
	r, err := readDefinition(ctx, tx, id)
	return r, s.revision(c), err
}
func validateDefinition(ctx context.Context, tx pgx.Tx, definitionID uuid.UUID, in ItemInput) (ItemInput, error) {
	v := &ValidationError{}
	in.Name = normalizeBilingual(in.Name, false, 200, "/name", v)
	in.Description = normalizeBilingual(in.Description, false, 2000, "/description", v)
	if !validItemKind(in.Kind) {
		v.Add("/kind", "out_of_range")
	}
	if in.Effect.Kind != in.Kind {
		v.Add("/effect/kind", "invalid_reference")
	}
	if in.Price < 0 {
		v.Add("/exchange_price", "out_of_range")
	}
	if in.TTL <= 0 {
		v.Add("/activation_ttl_seconds", "out_of_range")
	}
	// PostgreSQL timestamp arithmetic validates representability; no business
	// duration cap is inferred from the transport's int64 representation.
	var representable bool
	if in.TTL > 0 {
		err := tx.QueryRow(ctx, `SELECT $1::numeric < (extract(epoch FROM ('9999-12-31T23:59:59Z'::timestamptz-clock_timestamp())))`, in.TTL).Scan(&representable)
		if err != nil {
			return in, err
		}
		if !representable {
			v.Add("/activation_ttl_seconds", "out_of_range")
		}
	}
	switch in.Kind {
	case "extra_credit":
		if in.Effect.ExtraCount < 1 || in.Effect.ExtraCount > 2147483647 {
			v.Add("/effect/extra_count", "out_of_range")
		}
	case "model_trial":
		if len(in.Effect.Models) == 0 {
			v.Add("/effect/model_ids", "required")
		}
		seen := map[uuid.UUID]bool{}
		for _, id := range in.Effect.Models {
			if seen[id] {
				v.Add("/effect/model_ids", "duplicate_id")
				continue
			}
			seen[id] = true
			var exists bool
			// Retirement must not prevent maintaining an existing definition's
			// refund price. Only references still on this definition are retained;
			// creation and re-adding a removed reference require a live identity.
			// SaveDefinition holds the exclusive configuration lock throughout.
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.ai_models m WHERE m.id=$1 AND
 (m.retired_at IS NULL OR EXISTS(SELECT 1 FROM wordweave.item_definition_models dm WHERE dm.definition_id=$2 AND dm.model_id=m.id)))`, id, definitionID).Scan(&exists); err != nil {
				return in, err
			}
			if !exists {
				v.Add("/effect/model_ids", "invalid_reference")
			}
		}
		if in.Effect.Retirement < 0 {
			v.Add("/effect/retirement_points", "out_of_range")
		}
	case "plan_trial":
		if in.Effect.Plan != "basic" && in.Effect.Plan != "pro" && in.Effect.Plan != "plus" {
			v.Add("/effect/target_plan_code", "invalid_reference")
		}
	}
	if in.Kind == "model_trial" || in.Kind == "plan_trial" {
		if in.Effect.Seconds <= 0 {
			v.Add("/effect/trial_seconds", "out_of_range")
		} else {
			if err := tx.QueryRow(ctx, `SELECT $1::numeric < (extract(epoch FROM ('9999-12-31T23:59:59Z'::timestamptz-clock_timestamp())))`, in.Effect.Seconds).Scan(&representable); err != nil {
				return in, err
			}
			if !representable {
				v.Add("/effect/trial_seconds", "out_of_range")
			}
		}
	}
	return in, v.Result()
}
func (s *Service) SaveDefinition(ctx context.Context, actor, id uuid.UUID, expected string, in ItemInput) (ItemConfig, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ItemConfig{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return ItemConfig{}, "", err
	}
	if id != uuid.Nil {
		if err = s.requireRevision(c, expected); err != nil {
			return ItemConfig{}, "", err
		}
		old, err := readDefinition(ctx, tx, id)
		if err != nil {
			return ItemConfig{}, "", err
		}
		if old.Kind != in.Kind {
			return ItemConfig{}, "", reject("item_type_immutable", 422)
		}
	}
	in, err = validateDefinition(ctx, tx, id, in)
	if err != nil {
		return ItemConfig{}, "", err
	}
	var extra, seconds, plan, retirement any
	switch in.Kind {
	case "extra_credit":
		extra = in.Effect.ExtraCount
	case "model_trial":
		seconds = in.Effect.Seconds
		retirement = int64(in.Effect.Retirement)
	case "plan_trial":
		seconds = in.Effect.Seconds
		plan = dbPlan(in.Effect.Plan)
	}
	if id == uuid.Nil {
		err = tx.QueryRow(ctx, `INSERT INTO wordweave.item_definitions(kind,name_zh,name_en,description_zh,description_en,exchange_price,activation_ttl_seconds,extra_count,trial_seconds,target_plan_code,retirement_points,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`, in.Kind, in.Name.ZH, in.Name.EN, in.Description.ZH, in.Description.EN, int64(in.Price), in.TTL, extra, seconds, plan, retirement, actor, c.Now).Scan(&id)
	} else {
		_, err = tx.Exec(ctx, `UPDATE wordweave.item_definitions SET name_zh=$2,name_en=$3,description_zh=$4,description_en=$5,exchange_price=$6,activation_ttl_seconds=$7,extra_count=$8,trial_seconds=$9,target_plan_code=$10,retirement_points=$11,updated_by=$12,updated_at=$13,revision=revision+1 WHERE id=$1`, id, in.Name.ZH, in.Name.EN, in.Description.ZH, in.Description.EN, int64(in.Price), in.TTL, extra, seconds, plan, retirement, actor, c.Now)
	}
	if err != nil {
		return ItemConfig{}, "", err
	}
	if in.Kind == "model_trial" {
		if _, err = tx.Exec(ctx, `DELETE FROM wordweave.item_definition_models WHERE definition_id=$1`, id); err != nil {
			return ItemConfig{}, "", err
		}
		for _, model := range in.Effect.Models {
			if _, err = tx.Exec(ctx, `INSERT INTO wordweave.item_definition_models(definition_id,model_id) VALUES($1,$2)`, id, model); err != nil {
				return ItemConfig{}, "", err
			}
		}
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return ItemConfig{}, "", err
	}
	out, err := readDefinition(ctx, tx, id)
	if err != nil {
		return ItemConfig{}, "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return ItemConfig{}, "", err
	}
	return out, s.revision(c), nil
}
func (s *Service) ListDefinitions(ctx context.Context, filter DefinitionFilter, cursor *DefinitionCursor, limit int) ([]ItemConfig, string, bool, error) {
	if limit < 1 || limit > 100 || filter.Kind != "" && !validItemKind(filter.Kind) {
		return nil, "", false, &ValidationError{[]FieldError{{"/filter", "out_of_range"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", false, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return nil, "", false, err
	}
	if cursor != nil && cursor.Revision != s.revision(c) {
		return nil, "", false, &business.RevisionConflict{Current: s.revision(c)}
	}
	var at, id any
	if cursor != nil {
		at = cursor.At
		id = cursor.ID
	}
	rows, err := tx.Query(ctx, `SELECT id FROM wordweave.item_definitions WHERE ($1='' OR position($1 in lower(coalesce(name_zh,'')))>0 OR position($1 in lower(coalesce(name_en,'')))>0) AND ($2='' OR kind=$2) AND ($3::boolean IS NULL OR listed=$3) AND ($4::timestamptz IS NULL OR created_at<$4 OR (created_at=$4 AND id>$5)) ORDER BY created_at DESC,id ASC LIMIT $6`, strings.ToLower(strings.TrimSpace(filter.Query)), filter.Kind, filter.Listed, at, id, limit+1)
	if err != nil {
		return nil, "", false, err
	}
	ids := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, "", false, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, "", false, err
	}
	more := len(ids) > limit
	if more {
		ids = ids[:limit]
	}
	out := make([]ItemConfig, 0, len(ids))
	for _, id := range ids {
		item, err := readDefinition(ctx, tx, id)
		if err != nil {
			return nil, "", false, err
		}
		out = append(out, item)
	}
	return out, s.revision(c), more, nil
}
func (s *Service) SetDefinitionListing(ctx context.Context, actor, id uuid.UUID, expected string, listed bool) (ItemConfig, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ItemConfig{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return ItemConfig{}, "", err
	}
	if err = s.requireRevision(c, expected); err != nil {
		return ItemConfig{}, "", err
	}
	tag, err := tx.Exec(ctx, `UPDATE wordweave.item_definitions SET listed=$2,revision=revision+1,updated_by=$3,updated_at=$4 WHERE id=$1`, id, listed, actor, c.Now)
	if err != nil {
		return ItemConfig{}, "", err
	}
	if tag.RowsAffected() == 0 {
		return ItemConfig{}, "", ErrNotFound
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return ItemConfig{}, "", err
	}
	out, err := readDefinition(ctx, tx, id)
	if err != nil {
		return ItemConfig{}, "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return ItemConfig{}, "", err
	}
	return out, s.revision(c), nil
}
func (s *Service) DeleteDefinition(ctx context.Context, id uuid.UUID, expected string, confirmed bool) error {
	if !confirmed {
		return &ValidationError{[]FieldError{{"/confirmed", "required"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return err
	}
	if err = s.requireRevision(c, expected); err != nil {
		return err
	}
	def, err := readDefinition(ctx, tx, id)
	if err != nil {
		return err
	}
	if def.EverIssued {
		return reject("item_has_history", 409)
	}
	if def.References > 0 {
		return reject("item_in_use", 409)
	}
	if _, err = tx.Exec(ctx, `DELETE FROM wordweave.item_definitions WHERE id=$1`, id); err != nil {
		return err
	}
	if _, err = business.AdvanceConfiguration(ctx, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (s *Service) DefinitionReferences(ctx context.Context, id uuid.UUID, locale string, cursor *ReferenceCursor, limit int) (bool, []ItemReference, bool, error) {
	if limit < 1 || limit > 100 {
		return false, nil, false, &ValidationError{[]FieldError{{"/limit", "out_of_range"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, nil, false, err
	}
	defer tx.Rollback(ctx)
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return false, nil, false, err
	}
	definition, err := readDefinition(ctx, tx, id)
	if err != nil {
		return false, nil, false, err
	}
	var kind, rowID any
	if cursor != nil {
		kind = cursor.Kind
		rowID = cursor.ID
	}
	rows, err := tx.Query(ctx, `WITH refs AS (
  SELECT 'level'::text kind,id,CASE WHEN $2='en-US' THEN 'Level ' ELSE '等级 ' END||level_no::text name,reward_enabled enabled FROM wordweave.growth_levels WHERE item_definition_id=$1
  UNION ALL SELECT 'achievement',id,CASE WHEN $2='en-US' THEN coalesce(name_en,name_zh) ELSE coalesce(name_zh,name_en) END,enabled FROM wordweave.achievement_tiers WHERE item_definition_id=$1)
 SELECT kind,id,name,enabled FROM refs WHERE ($3::text IS NULL OR (kind,id)>($3,$4)) ORDER BY kind,id LIMIT $5`, id, locale, kind, rowID, limit+1)
	if err != nil {
		return false, nil, false, err
	}
	defer rows.Close()
	out := make([]ItemReference, 0)
	for rows.Next() {
		var r ItemReference
		if err = rows.Scan(&r.Kind, &r.ID, &r.Name, &r.Enabled); err != nil {
			return false, nil, false, err
		}
		out = append(out, r)
	}
	if err = rows.Err(); err != nil {
		return false, nil, false, err
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	return definition.EverIssued, out, more, nil
}
