//go:build integration

package generation

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestCR306InvalidConfigurationIsNotAcceptedAndSnapshotIsStable(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	var model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,output_mode,custom_parameters,enabled) VALUES('CR306 generation','test/cr306','json_schema','{"model":"forbidden"}',true) RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('registered',$1)`, model); err != nil {
		t.Fatal(err)
	}
	envelope, err := security.NewEnvelope(map[int][]byte{1: make([]byte, 32)}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(pool, envelope)
	if err = credentials.Put(ctx, owner, "synthetic-not-a-real-key"); err != nil {
		t.Fatal(err)
	}
	service := NewService(pool, credentials, nil, []byte(strings.Repeat("c", 32)), 30*time.Minute, ai.Validator{})
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "registered"}
	input := Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn", "weave"}}
	if _, err = service.Start(ctx, actor, input); !errors.Is(err, ErrGenerationConfigurationInvalid) {
		t.Fatalf("invalid stored configuration error=%v", err)
	}
	var runs, charges int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.generation_charges)`).Scan(&runs, &charges); err != nil || runs != 0 || charges != 0 {
		t.Fatalf("invalid configuration was accepted: runs=%d charges=%d err=%v", runs, charges, err)
	}

	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET custom_parameters='{"temperature":0.2,"reasoning":{"max_tokens":64}}' WHERE id=$1`, model); err != nil {
		t.Fatal(err)
	}
	run, err := service.Start(ctx, actor, input)
	if err != nil {
		t.Fatal(err)
	}
	var before, after []byte
	if err = pool.QueryRow(ctx, `SELECT model_request_parameters_snapshot FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET custom_parameters='{"temperature":0.9}' WHERE id=$1`, model); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT model_request_parameters_snapshot FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatalf("accepted run snapshot changed: before=%s after=%s", before, after)
	}
	var snapshot struct {
		Version          string         `json:"version"`
		CustomParameters map[string]any `json:"custom_parameters"`
		OutputMode       string         `json:"output_mode"`
		MaxOutputTokens  *int           `json:"max_output_tokens"`
		StructuredRoute  string         `json:"structured_route"`
	}
	if err = json.Unmarshal(before, &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Version != "custom-parameters-v1" || snapshot.OutputMode != "json_schema" || snapshot.MaxOutputTokens != nil || snapshot.StructuredRoute != "openrouter_require_parameters" || snapshot.CustomParameters["temperature"] != 0.2 {
		t.Fatalf("unexpected accepted snapshot: %+v", snapshot)
	}
}
