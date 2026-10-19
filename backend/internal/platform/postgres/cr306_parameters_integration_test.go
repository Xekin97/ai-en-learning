//go:build integration

package postgres

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestCR306RequestParameterConstraintsAndImmutability(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	databaseURL, cleanup := createMigrationTestDatabase(t, ctx, integrationDatabaseURL(t))
	defer cleanup()
	pool, err := Open(ctx, databaseURL, "cr306-parameters-test", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	var accountID, modelID uuid.UUID
	if err = pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code) VALUES($1,'fixture','learner','registered') RETURNING id`, "cr306_"+uuid.NewString()[:8]).Scan(&accountID); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,custom_parameters) VALUES($1,$2,$3) RETURNING id`, "CR306", "cr306/model", `{"temperature":0.2}`).Scan(&modelID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET custom_parameters='[]'::jsonb WHERE id=$1`, modelID); err == nil {
		t.Fatal("ai_models accepted a non-object custom_parameters value")
	}

	snapshot := `{"version":"custom-parameters-v1","custom_parameters":{"temperature":0.2},"output_mode":"prompt","max_output_tokens":null,"structured_route":"unchanged"}`
	var runID uuid.UUID
	if err = pool.QueryRow(ctx, `INSERT INTO wordweave.generation_runs(
		account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,
		meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,content_policy_version,
		configuration_revision_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,pipeline_version_snapshot,
		plan_origin_snapshot,model_request_parameters_snapshot)
		VALUES($1,$1,'registered',$2,'CR306','cr306/model','en','story','short',80,20,1,1,false,0,'m003-content-v5','base',$3) RETURNING id`, accountID, modelID, snapshot).Scan(&runID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.generation_runs SET model_request_parameters_snapshot=model_request_parameters_snapshot WHERE id=$1`, runID); err != nil {
		t.Fatalf("JSONB-equal reassignment rejected: %v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.generation_runs SET model_request_parameters_snapshot=jsonb_set(model_request_parameters_snapshot,'{custom_parameters,temperature}','0.3') WHERE id=$1`, runID); err == nil {
		t.Fatal("generation snapshot mutation was accepted")
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.generation_runs SET disposition='pending' WHERE id=$1`, runID); err != nil {
		t.Fatalf("unrelated generation update rejected: %v", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	presetID, versionID := uuid.New(), uuid.New()
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.presets(id,draft_version_id) VALUES($1,$2)`, presetID, versionID); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.preset_versions(id,preset_id,version_no,title,model_id,meaning_language,scenario,length_code,configuration,config_hash) VALUES($1,$2,1,'CR306',$3,'en','story','short','{}',decode('00','hex'))`, versionID, presetID, modelID); err != nil {
		t.Fatal(err)
	}
	var previewID uuid.UUID
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.preset_preview_runs(preset_id,version_id,requested_by,model_id,model_name_snapshot,provider_model_snapshot,config_hash,content_policy_version,configuration_revision_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,pipeline_version_snapshot,model_request_parameters_snapshot) VALUES($1,$2,$3,$4,'CR306','cr306/model',decode('00','hex'),1,1,false,0,'m003-content-v5',$5) RETURNING id`, presetID, versionID, accountID, modelID, snapshot).Scan(&previewID); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET model_request_parameters_snapshot=model_request_parameters_snapshot WHERE id=$1`, previewID); err != nil {
		t.Fatalf("preview JSONB-equal reassignment rejected: %v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET model_request_parameters_snapshot=jsonb_set(model_request_parameters_snapshot,'{output_mode}','"json_schema"') WHERE id=$1`, previewID); err == nil {
		t.Fatal("preview snapshot mutation was accepted")
	}
}
