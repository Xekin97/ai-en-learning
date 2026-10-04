package admin

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
)

type ModelInput struct {
	DisplayName     string              `json:"display_name"`
	Description     *string             `json:"description"`
	ProviderModelID string              `json:"provider_model_id"`
	ConnectionID    *uuid.UUID          `json:"connection_id"`
	Connection      *ai.ConnectionDraft `json:"connection"`
	MaxOutputTokens *int                `json:"max_output_tokens"`
	OutputMode      string              `json:"output_mode"`
	Enabled         bool                `json:"enabled"`
	Expected        string              `json:"expected_revision"`
}

const connectionSelect = `SELECT id,name,protocol,base_url,credential_configured,masked_hint FROM wordweave.ai_providers`

func scanConnection(row interface{ Scan(...any) error }) (ai.Connection, error) {
	var c ai.Connection
	err := row.Scan(&c.ID, &c.Name, &c.Protocol, &c.BaseURL, &c.CredentialConfigured, &c.MaskedHint)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return c, err
}
func (s *Service) Connections(ctx context.Context) ([]ai.Connection, error) {
	rows, err := s.pool.Query(ctx, connectionSelect+` ORDER BY created_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ai.Connection{}
	for rows.Next() {
		c, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func validGenericModel(in ModelInput) bool {
	return validModelFields(in.DisplayName, in.Description, in.ProviderModelID) && in.ProviderModelID == strings.TrimSpace(in.ProviderModelID) &&
		(in.OutputMode == "prompt" || in.OutputMode == "json_schema") && (in.MaxOutputTokens == nil || (*in.MaxOutputTokens > 0 && *in.MaxOutputTokens <= 1048576))
}
func (s *Service) SaveModel(ctx context.Context, actor, id uuid.UUID, in ModelInput) (Model, error) {
	if !validGenericModel(in) || (in.Connection != nil && !ai.ValidConnection(*in.Connection)) {
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
	if err = s.requireRevision(c, in.Expected); err != nil {
		return Model{}, err
	}
	if id != uuid.Nil {
		current, e := readModel(ctx, tx, id)
		if e != nil {
			return Model{}, e
		}
		if current.RetiredAt != nil {
			return Model{}, ErrModelRetired
		}
		if in.ConnectionID == nil {
			in.ConnectionID = &current.Connection.ID
		}
	}
	var connectionID uuid.UUID
	if in.Connection != nil {
		connectionID, err = s.credentials.WriteConnection(ctx, tx, actor, *in.Connection, in.ConnectionID)
	} else if in.ConnectionID != nil {
		connectionID = *in.ConnectionID
		_, err = scanConnection(tx.QueryRow(ctx, connectionSelect+` WHERE id=$1`, connectionID))
	} else {
		return Model{}, ErrValidation
	}
	if err != nil {
		return Model{}, mapWriteError(err)
	}
	if in.Enabled {
		var configured bool
		if err = tx.QueryRow(ctx, `SELECT credential_configured FROM wordweave.ai_providers WHERE id=$1`, connectionID).Scan(&configured); err != nil {
			return Model{}, err
		}
		if !configured {
			return Model{}, ai.ErrCredentialMissing
		}
	}
	if id == uuid.Nil {
		err = tx.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,description,provider_model_id,provider_id,max_output_tokens,output_mode,enabled,created_at,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`, strings.TrimSpace(in.DisplayName), trimmedOptional(in.Description), in.ProviderModelID, connectionID, in.MaxOutputTokens, in.OutputMode, in.Enabled, c.Now).Scan(&id)
	} else {
		_, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET display_name=$2,description=$3,provider_model_id=$4,provider_id=$5,max_output_tokens=$6,output_mode=$7,enabled=$8,updated_at=$9 WHERE id=$1`, id, strings.TrimSpace(in.DisplayName), trimmedOptional(in.Description), in.ProviderModelID, connectionID, in.MaxOutputTokens, in.OutputMode, in.Enabled, c.Now)
	}
	if err != nil {
		return Model{}, mapWriteError(err)
	}
	return s.finishModel(ctx, tx, id)
}
func (s *Service) TestConnection(ctx context.Context, in ModelInput) error {
	// Name/description/revision are irrelevant to an unsaved connection probe.
	check := in
	check.DisplayName = "probe"
	check.Description = nil
	if !validGenericModel(check) {
		return ErrValidation
	}
	var connection ai.Connection
	key := ""
	if in.ConnectionID != nil {
		c, err := scanConnection(s.pool.QueryRow(ctx, connectionSelect+` WHERE id=$1`, in.ConnectionID))
		if err != nil {
			return err
		}
		connection = c
	}
	if in.Connection != nil {
		d := *in.Connection
		if !ai.ValidConnection(d) {
			return ErrValidation
		}
		if d.APIKey == "" && (connection.BaseURL != d.BaseURL || connection.Protocol != d.Protocol) {
			return ai.ErrCredentialMissing
		}
		connection.Name = d.Name
		connection.Protocol = d.Protocol
		connection.BaseURL = d.BaseURL
		key = d.APIKey
	}
	if !ai.ValidBaseURL(connection.BaseURL) {
		return ErrValidation
	}
	if key == "" {
		var err error
		key, err = s.credentials.ConnectionKey(ctx, connection.ID)
		if err != nil {
			return err
		}
	}
	gateway, ok := s.provider.(*ai.Gateway)
	if !ok {
		return ErrModelIncompatible
	}
	return gateway.Probe(ctx, connection, key, in.ProviderModelID, in.MaxOutputTokens, in.OutputMode)
}
