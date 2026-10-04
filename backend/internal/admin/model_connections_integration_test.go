//go:build integration

package admin

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestGenericModelConnectionsAtomicAndIsolated(t *testing.T) {
	pool, ctx := testdb.Open(t)
	actor := testdb.Learner(t, ctx, pool)
	rolePool := func(role string) *pgxpool.Pool {
		cfg := pool.Config()
		cfg.ConnConfig.RuntimeParams["role"] = role
		p, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(p.Close)
		return p
	}
	appPool, aiPool := rolePool("wordweave_app"), rolePool("wordweave_ai")
	envelope, err := security.NewEnvelope(map[int][]byte{1: []byte(strings.Repeat("k", 32))}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(aiPool, envelope)
	s := NewService(appPool, credentials, ai.NewGateway(credentials, "https://wordweave.example", ""), nil, []byte(strings.Repeat("r", 32)))
	revision := func() string {
		_, r, _, err := s.ListModels(ctx, "", nil, 20)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	input := ModelInput{DisplayName: "First", ProviderModelID: "vendor/Case-ID", OutputMode: "prompt", Expected: revision(), Enabled: true, Connection: &ai.ConnectionDraft{Name: "Provider A", Protocol: ai.ProtocolChat, BaseURL: "https://a.example/custom/v1/", APIKey: "synthetic-key-one"}}
	first, err := s.SaveModel(ctx, actor, uuid.Nil, input)
	if err != nil {
		t.Fatal(err)
	}
	if first.Connection.BaseURL != input.Connection.BaseURL || first.ProviderModelID != input.ProviderModelID || !first.Enabled {
		t.Fatal("saved configuration was rewritten")
	}
	input.DisplayName = "Second"
	input.Expected = first.Revision
	input.Connection.Name = "Provider B"
	input.Connection.APIKey = "synthetic-key-two"
	second, err := s.SaveModel(ctx, actor, uuid.Nil, input)
	if err != nil {
		t.Fatal(err)
	}
	if first.Connection.ID == second.Connection.ID {
		t.Fatal("different credentials merged")
	}
	key1, _ := credentials.ConnectionKey(ctx, first.Connection.ID)
	key2, _ := credentials.ConnectionKey(ctx, second.Connection.ID)
	if key1 != "synthetic-key-one" || key2 != "synthetic-key-two" {
		t.Fatal("credential isolation failed")
	}
	// Explicit reuse, with a distinct model ID, creates no additional connection.
	input.DisplayName = "Shared"
	input.ProviderModelID = "Other/ID"
	input.Connection = nil
	input.ConnectionID = &first.Connection.ID
	input.Expected = second.Revision
	shared, err := s.SaveModel(ctx, actor, uuid.Nil, input)
	if err != nil {
		t.Fatal(err)
	}
	if shared.Connection.ID != first.Connection.ID {
		t.Fatal("explicit connection was not reused")
	}
	// Replacing the shared connection's key affects this model only.
	input.Expected = shared.Revision
	input.Connection = &ai.ConnectionDraft{Name: "Replacement", Protocol: ai.ProtocolChat, BaseURL: first.Connection.BaseURL, APIKey: "synthetic-key-three"}
	changed, err := s.SaveModel(ctx, actor, shared.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	if changed.Connection.ID == first.Connection.ID {
		t.Fatal("shared connection was changed in place")
	}
	key1, _ = credentials.ConnectionKey(ctx, first.Connection.ID)
	if key1 != "synthetic-key-one" {
		t.Fatal("other model inherited changed key")
	}
	// Empty key can clone only to the same destination/protocol.
	input.Expected = changed.Revision
	input.ConnectionID = &changed.Connection.ID
	input.Connection.APIKey = ""
	input.Connection.BaseURL = "https://different.example/v1"
	if _, err = s.SaveModel(ctx, actor, shared.ID, input); !errors.Is(err, ai.ErrCredentialMissing) {
		t.Fatalf("old key forwarded to new destination: %v", err)
	}
	if revision() != changed.Revision {
		t.Fatal("failed save advanced configuration")
	}
	input.Connection.BaseURL = changed.Connection.BaseURL
	input.Expected = "stale"
	if _, err = s.SaveModel(ctx, actor, shared.ID, input); err == nil {
		t.Fatal("stale revision accepted")
	} else {
		var conflict *business.RevisionConflict
		if !errors.As(err, &conflict) {
			t.Fatal(err)
		}
	}
	// A pinned generation retains both model identifier and key after an edit.
	pinned := ai.GenerationSpec{ModelID: first.ID.String()}
	if err = credentials.BindSpec(ctx, &pinned); err != nil {
		t.Fatal(err)
	}
	input.Expected = revision()
	input.DisplayName = "First"
	input.ProviderModelID = "new/ID"
	input.ConnectionID = &first.Connection.ID
	input.Connection = nil
	if _, err = s.SaveModel(ctx, actor, first.ID, input); err != nil {
		t.Fatal(err)
	}
	if err = credentials.BindSpec(ctx, &pinned); err != nil || pinned.ProviderModelID != "vendor/Case-ID" {
		t.Fatal("generation snapshot changed")
	}
	if _, err = appPool.Exec(ctx, `SELECT ciphertext FROM wordweave.ai_provider_credentials`); err == nil {
		t.Fatal("application role can read ciphertext")
	}
	var count int
	if err = pool.QueryRow(context.Background(), `SELECT count(*) FROM wordweave.ai_providers`).Scan(&count); err != nil || count != 4 {
		t.Fatalf("failed writes left connections: %d %v", count, err)
	}
}

func TestModelBatchOneConnectionAtomicRollbackAndRevision(t *testing.T) {
	pool, ctx := testdb.Open(t)
	actor := testdb.Learner(t, ctx, pool)
	rolePool := func(role string) *pgxpool.Pool {
		cfg := pool.Config()
		cfg.ConnConfig.RuntimeParams["role"] = role
		p, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(p.Close)
		return p
	}
	envelope, err := security.NewEnvelope(map[int][]byte{1: []byte(strings.Repeat("k", 32))}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(rolePool("wordweave_ai"), envelope)
	s := NewService(rolePool("wordweave_app"), credentials, ai.NewGateway(credentials, "https://wordweave.example", ""), nil, []byte(strings.Repeat("r", 32)))
	_, revision, _, err := s.ListModels(ctx, "", nil, 20)
	if err != nil {
		t.Fatal(err)
	}
	input := ModelBatchInput{Expected: revision, Connection: &ai.ConnectionDraft{Name: "Batch provider", Protocol: ai.ProtocolResponses, BaseURL: "https://batch.example/v1", APIKey: "synthetic-batch-key"}, Models: []NewModelInput{{ProviderModelID: "Vendor/First", OutputMode: "prompt", Enabled: true}, {ProviderModelID: "Vendor/Second", DisplayName: "Named model", OutputMode: "json_schema"}}}
	items, next, err := s.CreateModels(ctx, actor, input)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || next == revision || items[0].Revision != next || items[1].Revision != next || items[0].Connection.ID != items[1].Connection.ID || items[0].DisplayName != "Vendor/First" || items[1].ProviderModelID != "Vendor/Second" {
		t.Fatal("batch mapping/revision/connection mismatch")
	}
	key, err := credentials.ConnectionKey(ctx, items[0].Connection.ID)
	if err != nil || key != "synthetic-batch-key" {
		t.Fatal("shared credential missing")
	}
	var count int
	var generationBefore int64
	if err = pool.QueryRow(ctx, `SELECT revision FROM wordweave.growth_settings`).Scan(&generationBefore); err != nil {
		t.Fatal(err)
	}
	input.Connection = nil
	input.ConnectionID = &items[0].Connection.ID
	input.Expected = next
	// The second INSERT collides with an existing model; the first must roll back.
	input.Models = []NewModelInput{{ProviderModelID: "Vendor/Third", OutputMode: "prompt"}, {ProviderModelID: "Vendor/First", OutputMode: "prompt"}}
	if _, _, err = s.CreateModels(ctx, actor, input); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict: %v", err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.ai_models`).Scan(&count); err != nil || count != 2 {
		t.Fatal("part of failed batch survived")
	}
	var generationAfter int64
	if err = pool.QueryRow(ctx, `SELECT revision FROM wordweave.growth_settings`).Scan(&generationAfter); err != nil || generationBefore != generationAfter {
		t.Fatal("failed batch changed revision")
	}
	input.Expected = revision
	input.Models = []NewModelInput{{ProviderModelID: "Another", OutputMode: "prompt"}}
	var conflict *business.RevisionConflict
	if _, _, err = s.CreateModels(ctx, actor, input); !errors.As(err, &conflict) {
		t.Fatal("stale batch accepted")
	}
	input.Expected = next
	input.ConnectionID = nil
	input.Connection = &ai.ConnectionDraft{Name: "Not persisted", Protocol: ai.ProtocolChat, BaseURL: "https://new.example", APIKey: "synthetic-new-key"}
	input.Models = []NewModelInput{{ProviderModelID: "Same", OutputMode: "prompt"}, {ProviderModelID: "Same", OutputMode: "prompt"}}
	if _, _, err = s.CreateModels(ctx, actor, input); !errors.Is(err, ErrConflict) {
		t.Fatal("duplicate batch accepted")
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.ai_providers WHERE name='Not persisted'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("failed batch left a connection")
	}
	input.Models = []NewModelInput{{ProviderModelID: "Valid", OutputMode: "prompt"}, {ProviderModelID: "Invalid", OutputMode: "unknown"}}
	if _, _, err = s.CreateModels(ctx, actor, input); !errors.Is(err, ErrValidation) {
		t.Fatal("invalid member accepted")
	}
}
