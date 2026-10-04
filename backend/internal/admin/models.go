package admin

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"strings"
	"time"
	"unicode/utf8"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
)

var ErrModelRetired = errors.New("model retired")

type Model struct {
	ID                   uuid.UUID
	DisplayName          string
	Description          *string
	ProviderModelID    string
	Enabled              bool
	RetiredAt            *time.Time
	AssignedGroupCodes   []string
	CreatedAt, UpdatedAt time.Time
	Revision             string
	Connection           ai.Connection
	MaxOutputTokens      *int
	OutputMode           string
}
type ModelCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        uuid.UUID `json:"id"`
	Revision  string    `json:"revision"`
}
type ModelPatch struct {
	DisplayNameSet       bool
	DisplayName          string
	DescriptionSet       bool
	Description          *string
	ProviderModelIDSet bool
	ProviderModelID    string
}

func (s *Service) revision(c business.Configuration) string {
	return business.Revision(s.key, "configuration", c.Revision)
}
func (s *Service) requireRevision(c business.Configuration, expected string) error {
	if expected != s.revision(c) {
		return &business.RevisionConflict{Current: s.revision(c)}
	}
	return nil
}

const modelSelect = `SELECT m.id,m.display_name,m.description,m.provider_model_id,m.enabled,m.retired_at,m.created_at,m.updated_at,
 coalesce((SELECT array_agg(CASE gm.group_code WHEN 'registered' THEN 'basic' ELSE gm.group_code END ORDER BY CASE gm.group_code WHEN 'visitor' THEN 1 WHEN 'registered' THEN 2 WHEN 'pro' THEN 3 ELSE 4 END) FROM wordweave.group_models gm WHERE gm.model_id=m.id),ARRAY[]::text[]),p.id,p.name,p.protocol,p.base_url,p.credential_configured,p.masked_hint,m.max_output_tokens,m.output_mode FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id`

func scanModel(row interface{ Scan(...any) error }) (Model, error) {
	var m Model
	err := row.Scan(&m.ID, &m.DisplayName, &m.Description, &m.ProviderModelID, &m.Enabled, &m.RetiredAt, &m.CreatedAt, &m.UpdatedAt, &m.AssignedGroupCodes, &m.Connection.ID, &m.Connection.Name, &m.Connection.Protocol, &m.Connection.BaseURL, &m.Connection.CredentialConfigured, &m.Connection.MaskedHint, &m.MaxOutputTokens, &m.OutputMode)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return m, err
}
func readModel(ctx context.Context, tx pgx.Tx, id uuid.UUID) (Model, error) {
	return scanModel(tx.QueryRow(ctx, modelSelect+` WHERE m.id=$1`, id))
}
func (s *Service) GetModel(ctx context.Context, id uuid.UUID) (Model, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Model{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Model{}, err
	}
	m, err := readModel(ctx, tx, id)
	m.Revision = s.revision(c)
	return m, err
}
func (s *Service) ListModels(ctx context.Context, status string, cursor *ModelCursor, limit int) ([]Model, string, bool, error) {
	if limit < 1 || limit > 100 || status != "" && status != "enabled" && status != "disabled" && status != "retired" {
		return nil, "", false, ErrValidation
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
	revision := s.revision(c)
	if cursor != nil && cursor.Revision != revision {
		return nil, "", false, &business.RevisionConflict{Current: revision}
	}
	var at, id any
	if cursor != nil {
		at = cursor.CreatedAt
		id = cursor.ID
	}
	rows, err := tx.Query(ctx, modelSelect+` WHERE ($1='' OR CASE WHEN m.retired_at IS NOT NULL THEN 'retired' WHEN m.enabled THEN 'enabled' ELSE 'disabled' END=$1) AND ($2::timestamptz IS NULL OR (m.created_at,m.id)>($2,$3)) ORDER BY m.created_at,m.id LIMIT $4`, status, at, id, limit+1)
	if err != nil {
		return nil, "", false, err
	}
	defer rows.Close()
	out := make([]Model, 0)
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, "", false, err
		}
		m.Revision = revision
		out = append(out, m)
	}
	if err = rows.Err(); err != nil {
		return nil, "", false, err
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	return out, revision, more, nil
}
func (s *Service) finishModel(ctx context.Context, tx pgx.Tx, id uuid.UUID) (Model, error) {
	revision, err := business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return Model{}, err
	}
	model, err := readModel(ctx, tx, id)
	if err != nil {
		return Model{}, err
	}
	model.Revision = business.Revision(s.key, "configuration", revision)
	if err = tx.Commit(ctx); err != nil {
		return Model{}, err
	}
	return model, nil
}
func (s *Service) CreateModel(ctx context.Context, name string, description *string, provider string) (Model, error) {
	if !validModelFields(name, description, provider) {
		return Model{}, ErrValidation
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Model{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Model{}, err
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,description,provider_model_id,enabled,created_at,updated_at) VALUES($1,$2,$3,false,$4,$4) RETURNING id`, strings.TrimSpace(name), trimmedOptional(description), strings.TrimSpace(provider), c.Now).Scan(&id)
	if err != nil {
		return Model{}, mapWriteError(err)
	}
	return s.finishModel(ctx, tx, id)
}
func (s *Service) PatchModel(ctx context.Context, id uuid.UUID, expected string, patch ModelPatch) (Model, error) {
	if !patch.DisplayNameSet && !patch.DescriptionSet && !patch.ProviderModelIDSet {
		return Model{}, ErrValidation
	}
	if patch.DisplayNameSet && (strings.TrimSpace(patch.DisplayName) == "" || utf8.RuneCountInString(strings.TrimSpace(patch.DisplayName)) > 200) {
		return Model{}, ErrValidation
	}
	if patch.ProviderModelIDSet && (strings.TrimSpace(patch.ProviderModelID) == "" || utf8.RuneCountInString(strings.TrimSpace(patch.ProviderModelID)) > 500) {
		return Model{}, ErrValidation
	}
	if patch.DescriptionSet {
		patch.Description = trimmedOptional(patch.Description)
		if patch.Description != nil && utf8.RuneCountInString(*patch.Description) > 1000 {
			return Model{}, ErrValidation
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Model{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Model{}, err
	}
	if err = s.requireRevision(c, expected); err != nil {
		return Model{}, err
	}
	model, err := readModel(ctx, tx, id)
	if err != nil {
		return Model{}, err
	}
	if model.RetiredAt != nil {
		return Model{}, ErrModelRetired
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET display_name=CASE WHEN $2 THEN $3 ELSE display_name END,description=CASE WHEN $4 THEN $5 ELSE description END,provider_model_id=CASE WHEN $6 THEN $7 ELSE provider_model_id END,enabled=CASE WHEN $6 AND provider_model_id<>$7 THEN false ELSE enabled END,updated_at=$8 WHERE id=$1`, id, patch.DisplayNameSet, strings.TrimSpace(patch.DisplayName), patch.DescriptionSet, patch.Description, patch.ProviderModelIDSet, strings.TrimSpace(patch.ProviderModelID), c.Now)
	if err != nil {
		return Model{}, mapWriteError(err)
	}
	return s.finishModel(ctx, tx, id)
}
func (s *Service) SetModelEnabled(ctx context.Context, id uuid.UUID, expected string, enabled bool) (Model, error) {
	model, err := s.GetModel(ctx, id)
	if err != nil {
		return Model{}, err
	}
	if model.Revision != expected {
		return Model{}, &business.RevisionConflict{Current: model.Revision}
	}
	if model.RetiredAt != nil {
		return Model{}, ErrModelRetired
	}
	// Enabling is an explicit configuration change, never an implicit paid call.
	if enabled && !model.Connection.CredentialConfigured {
		return Model{}, ai.ErrCredentialMissing
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Model{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Model{}, err
	}
	if err = s.requireRevision(c, expected); err != nil {
		return Model{}, err
	}
	model, err = readModel(ctx, tx, id)
	if err != nil {
		return Model{}, err
	}
	if model.RetiredAt != nil {
		return Model{}, ErrModelRetired
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=$2,updated_at=$3 WHERE id=$1`, id, enabled, c.Now); err != nil {
		return Model{}, err
	}
	return s.finishModel(ctx, tx, id)
}
