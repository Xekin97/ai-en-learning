package admin

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
)

type ModelProvider struct {
	Connection ai.Connection
	Models     []Model
}

type ProviderModelInput struct {
	ID *uuid.UUID `json:"id"`
	NewModelInput
}

type ModelProviderInput struct {
	Connection ai.ConnectionDraft   `json:"connection"`
	Models     []ProviderModelInput `json:"models"`
	Expected   string               `json:"expected_revision"`
}

func readProviders(ctx context.Context, tx pgx.Tx, id *uuid.UUID, revision string) ([]ModelProvider, error) {
	rows, err := tx.Query(ctx, connectionSelect+` WHERE ($1::uuid IS NULL OR id=$1) ORDER BY created_at,id`, id)
	if err != nil {
		return nil, err
	}
	providers := []ModelProvider{}
	indices := map[uuid.UUID]int{}
	for rows.Next() {
		c, err := scanConnection(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		indices[c.ID] = len(providers)
		providers = append(providers, ModelProvider{Connection: c, Models: []Model{}})
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	rows, err = tx.Query(ctx, modelSelect+` WHERE m.retired_at IS NULL AND ($1::uuid IS NULL OR m.provider_id=$1) ORDER BY m.created_at,m.id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		model, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		model.Revision = revision
		index := indices[model.Connection.ID]
		providers[index].Models = append(providers[index].Models, model)
	}
	return providers, rows.Err()
}

func (s *Service) ModelProviders(ctx context.Context) ([]ModelProvider, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return nil, "", err
	}
	revision := s.revision(c)
	providers, err := readProviders(ctx, tx, nil, revision)
	return providers, revision, err
}

func (s *Service) SaveProvider(ctx context.Context, actor, id uuid.UUID, in ModelProviderInput) (ModelProvider, string, error) {
	invalid := func(err error) (ModelProvider, string, error) { return ModelProvider{}, "", err }
	if !ai.ValidConnection(in.Connection) || len(in.Models) > 1000 || (id == uuid.Nil && len(in.Models) == 0) {
		return invalid(ErrValidation)
	}
	identifiers := map[string]bool{}
	uids := map[uuid.UUID]bool{}
	for index := range in.Models {
		m := &in.Models[index]
		m.DisplayName = strings.TrimSpace(m.DisplayName)
		if m.DisplayName == "" {
			chars := []rune(m.ProviderModelID)
			if len(chars) > 200 {
				chars = chars[:200]
			}
			m.DisplayName = string(chars)
		}
		if !validGenericModel(ModelInput{DisplayName: m.DisplayName, Description: m.Description, ProviderModelID: m.ProviderModelID, OutputMode: m.OutputMode, MaxOutputTokens: m.MaxOutputTokens}) {
			return invalid(ErrValidation)
		}
		if identifiers[m.ProviderModelID] {
			return invalid(ErrConflict)
		}
		identifiers[m.ProviderModelID] = true
		if m.ID != nil {
			if id == uuid.Nil || *m.ID == uuid.Nil || uids[*m.ID] {
				return invalid(ErrValidation)
			}
			uids[*m.ID] = true
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return invalid(err)
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return invalid(err)
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return invalid(err)
	}
	old := map[uuid.UUID]Model{}
	if id != uuid.Nil {
		providers, e := readProviders(ctx, tx, &id, s.revision(c))
		if e != nil {
			return invalid(e)
		}
		if len(providers) == 0 {
			return invalid(ErrNotFound)
		}
		for _, m := range providers[0].Models {
			old[m.ID] = m
		}
		if len(old) != len(uids) {
			return invalid(ErrValidation)
		}
		for uid := range uids {
			if _, ok := old[uid]; !ok {
				return invalid(ErrValidation)
			}
		}
		if err = s.credentials.UpdateConnection(ctx, tx, actor, id, in.Connection); err != nil {
			return invalid(mapWriteError(err))
		}
	} else {
		id, err = s.credentials.WriteConnection(ctx, tx, actor, in.Connection, nil)
		if err != nil {
			return invalid(mapWriteError(err))
		}
	}
	// Free changed identifiers inside the transaction so two models can swap IDs
	// without violating the immediate partial unique index. UUIDs and references
	// never change, and an error rolls temporary identifiers back with everything else.
	for _, m := range in.Models {
		if m.ID != nil && (old[*m.ID].ProviderModelID != m.ProviderModelID || old[*m.ID].DisplayName != m.DisplayName) {
			if _, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET provider_model_id=$2,display_name=$2 WHERE id=$1`, m.ID, "__editing_"+uuid.NewString()); err != nil {
				return invalid(mapWriteError(err))
			}
		}
	}
	for _, m := range in.Models {
		if m.ID == nil {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.ai_models(display_name,description,provider_model_id,provider_id,max_output_tokens,output_mode,enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)`, m.DisplayName, trimmedOptional(m.Description), m.ProviderModelID, id, m.MaxOutputTokens, m.OutputMode, m.Enabled, c.Now)
		} else {
			_, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET display_name=$2,description=$3,provider_model_id=$4,max_output_tokens=$5,output_mode=$6,enabled=$7,updated_at=$8 WHERE id=$1`, m.ID, m.DisplayName, trimmedOptional(m.Description), m.ProviderModelID, m.MaxOutputTokens, m.OutputMode, m.Enabled, c.Now)
		}
		if err != nil {
			return invalid(mapWriteError(err))
		}
	}
	number, err := business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return invalid(err)
	}
	revision := business.Revision(s.key, "configuration", number)
	providers, err := readProviders(ctx, tx, &id, revision)
	if err != nil {
		return invalid(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return invalid(err)
	}
	return providers[0], revision, nil
}
