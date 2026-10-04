package admin

import (
	"context"
	"github.com/google/uuid"
	"strings"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
)

type NewModelInput struct {
	DisplayName     string  `json:"display_name"`
	Description     *string `json:"description"`
	ProviderModelID string  `json:"provider_model_id"`
	MaxOutputTokens *int    `json:"max_output_tokens"`
	OutputMode      string  `json:"output_mode"`
	Enabled         bool    `json:"enabled"`
}
type ModelBatchInput struct {
	ConnectionID *uuid.UUID          `json:"connection_id"`
	Connection   *ai.ConnectionDraft `json:"connection"`
	Expected     string              `json:"expected_revision"`
	Models       []NewModelInput     `json:"models"`
}

// CreateModels shares one connection and commits the entire batch exactly once.
func (s *Service) CreateModels(ctx context.Context, actor uuid.UUID, in ModelBatchInput) ([]Model, string, error) {
	if len(in.Models) < 1 || len(in.Models) > 100 || (in.Connection != nil && !ai.ValidConnection(*in.Connection)) {
		return nil, "", ErrValidation
	}
	seen := make(map[string]bool, len(in.Models))
	requireKey := false
	for i := range in.Models {
		item := &in.Models[i]
		item.DisplayName = strings.TrimSpace(item.DisplayName)
		if item.DisplayName == "" {
			name := []rune(item.ProviderModelID)
			if len(name) > 200 {
				name = name[:200]
			}
			item.DisplayName = string(name)
		}
		if !validGenericModel(ModelInput{DisplayName: item.DisplayName, Description: item.Description, ProviderModelID: item.ProviderModelID, MaxOutputTokens: item.MaxOutputTokens, OutputMode: item.OutputMode}) {
			return nil, "", ErrValidation
		}
		if seen[item.ProviderModelID] {
			return nil, "", ErrConflict
		}
		seen[item.ProviderModelID] = true
		requireKey = requireKey || item.Enabled
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(ctx)
	config, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return nil, "", err
	}
	if err = s.requireRevision(config, in.Expected); err != nil {
		return nil, "", err
	}
	var connectionID uuid.UUID
	if in.Connection != nil {
		connectionID, err = s.credentials.WriteConnection(ctx, tx, actor, *in.Connection, in.ConnectionID)
	} else if in.ConnectionID != nil {
		connectionID = *in.ConnectionID
		_, err = scanConnection(tx.QueryRow(ctx, connectionSelect+` WHERE id=$1`, connectionID))
	} else {
		return nil, "", ErrValidation
	}
	if err != nil {
		return nil, "", mapWriteError(err)
	}
	if requireKey {
		var configured bool
		if err = tx.QueryRow(ctx, `SELECT credential_configured FROM wordweave.ai_providers WHERE id=$1`, connectionID).Scan(&configured); err != nil {
			return nil, "", err
		}
		if !configured {
			return nil, "", ai.ErrCredentialMissing
		}
	}
	ids := make([]uuid.UUID, 0, len(in.Models))
	for _, item := range in.Models {
		var id uuid.UUID
		err = tx.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,description,provider_model_id,provider_id,max_output_tokens,output_mode,enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`, item.DisplayName, trimmedOptional(item.Description), item.ProviderModelID, connectionID, item.MaxOutputTokens, item.OutputMode, item.Enabled, config.Now).Scan(&id)
		if err != nil {
			return nil, "", mapWriteError(err)
		}
		ids = append(ids, id)
	}
	number, err := business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return nil, "", err
	}
	revision := business.Revision(s.key, "configuration", number)
	models := make([]Model, 0, len(ids))
	for _, id := range ids {
		model, err := readModel(ctx, tx, id)
		if err != nil {
			return nil, "", err
		}
		model.Revision = revision
		models = append(models, model)
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, "", err
	}
	return models, revision, nil
}
