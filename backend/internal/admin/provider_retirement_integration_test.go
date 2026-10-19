//go:build integration

package admin

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/testdb"
)

func TestCR313RetiredProviderIsAbsentFromCurrentAdminReadsAndEdits(t *testing.T) {
	pool, ctx := testdb.Open(t)
	service := NewService(pool, nil, nil, nil, []byte("cr313-admin-provider-retirement"))

	var providerID, modelID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_providers(name,protocol,base_url) VALUES('CR313 provider','openai_chat','https://synthetic.invalid/v1') RETURNING id`).Scan(&providerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,provider_id,enabled,custom_parameters) VALUES('CR313 model','synthetic/cr313',$1,true,'{}') RETURNING id`, providerID).Scan(&modelID); err != nil {
		t.Fatal(err)
	}

	models, revision, _, err := service.ListModels(ctx, "", nil, 20)
	if err != nil || !containsAdminModel(models, modelID) {
		t.Fatalf("active model missing before provider retirement: models=%+v err=%v", models, err)
	}
	connections, err := service.Connections(ctx)
	if err != nil || !containsAdminConnection(connections, providerID) {
		t.Fatalf("active provider missing before retirement: connections=%+v err=%v", connections, err)
	}

	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_providers SET retired_at=clock_timestamp() WHERE id=$1`, providerID); err != nil {
		t.Fatal(err)
	}
	models, revision, _, err = service.ListModels(ctx, "", nil, 20)
	if err != nil || containsAdminModel(models, modelID) {
		t.Fatalf("retired provider model remained in current list: models=%+v err=%v", models, err)
	}
	retiredModels, _, _, err := service.ListModels(ctx, "retired", nil, 20)
	if err != nil || containsAdminModel(retiredModels, modelID) {
		t.Fatalf("active model of retired provider leaked through history filter: models=%+v err=%v", retiredModels, err)
	}
	connections, err = service.Connections(ctx)
	if err != nil || containsAdminConnection(connections, providerID) {
		t.Fatalf("retired provider remained in connection list: connections=%+v err=%v", connections, err)
	}
	providers, _, err := service.ModelProviders(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, provider := range providers {
		if provider.Connection.ID == providerID {
			t.Fatal("retired provider remained in provider workspace")
		}
	}
	if _, err = service.GetModel(ctx, modelID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("retired provider model get error=%v", err)
	}
	if _, err = service.PatchModel(ctx, modelID, revision, ModelPatch{DisplayNameSet: true, DisplayName: "revived"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("retired provider model edit error=%v", err)
	}
	if _, err = service.SaveModel(ctx, uuid.Nil, modelID, ModelInput{DisplayName: "revived", ProviderModelID: "synthetic/cr313", ConnectionID: &providerID, OutputMode: "prompt", CustomParameters: json.RawMessage(`{}`), Expected: revision}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("retired provider model save error=%v", err)
	}
	if err = service.TestConnection(ctx, ModelInput{ProviderModelID: "synthetic/cr313", ConnectionID: &providerID, OutputMode: "prompt", CustomParameters: json.RawMessage(`{}`)}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("retired provider probe error=%v", err)
	}
	if _, _, err = service.SaveProvider(ctx, uuid.Nil, providerID, ModelProviderInput{Connection: ai.ConnectionDraft{Name: "revived", Protocol: ai.ProtocolChat, BaseURL: "https://synthetic.invalid/v1"}, Expected: revision}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("retired provider aggregate edit error=%v", err)
	}
}

func containsAdminModel(models []Model, id uuid.UUID) bool {
	for _, model := range models {
		if model.ID == id {
			return true
		}
	}
	return false
}

func containsAdminConnection(connections []ai.Connection, id uuid.UUID) bool {
	for _, connection := range connections {
		if connection.ID == id {
			return true
		}
	}
	return false
}
