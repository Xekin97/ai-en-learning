//go:build integration

package generation

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/testdb"
)

func TestCR313RetiredProviderIsExcludedFromGenerationCandidates(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	var providerID, modelID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_providers(name,protocol,base_url) VALUES('CR313 generation provider','openai_chat','https://synthetic.invalid/v1') RETURNING id`).Scan(&providerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,provider_id,enabled,custom_parameters) VALUES('CR313 generation model','synthetic/cr313',$1,true,'{}') RETURNING id`, providerID).Scan(&modelID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('registered',$1)`, modelID); err != nil {
		t.Fatal(err)
	}
	service := NewService(pool, nil, nil, []byte(strings.Repeat("r", 32)), 30*time.Minute, ai.Validator{})

	options, err := service.AdminGenerationOptions(ctx)
	if err != nil || !containsGenerationModel(options.Models, modelID) {
		t.Fatalf("active provider model missing before retirement: models=%+v err=%v", options.Models, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_providers SET retired_at=clock_timestamp() WHERE id=$1`, providerID); err != nil {
		t.Fatal(err)
	}
	options, err = service.AdminGenerationOptions(ctx)
	if err != nil || containsGenerationModel(options.Models, modelID) {
		t.Fatalf("retired provider model remained a preview candidate: models=%+v err=%v", options.Models, err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, _, validateErr := service.validatePreset(ctx, tx, &PresetInput{Title: "CR313", Configuration: PresetConfigurationInput{ModelID: modelID, Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", Length: "short"}})
	_ = tx.Rollback(ctx)
	if !errors.Is(validateErr, ErrPresetModelUnavailable) {
		t.Fatalf("retired provider preset validation error=%v", validateErr)
	}

	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "registered"}
	_, err = service.Start(ctx, actor, Input{ModelID: modelID.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn"}})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("retired provider generation error=%v", err)
	}
	var runs int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_runs WHERE model_id=$1`, modelID).Scan(&runs); err != nil || runs != 0 {
		t.Fatalf("retired provider created generation run: runs=%d err=%v", runs, err)
	}
}

func containsGenerationModel(models []AdminGenerationModel, id uuid.UUID) bool {
	for _, model := range models {
		if model.ID == id {
			return true
		}
	}
	return false
}
