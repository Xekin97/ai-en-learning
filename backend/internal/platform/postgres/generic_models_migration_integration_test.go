//go:build integration

package postgres

import (
	"github.com/google/uuid"
	"testing"
)

func TestGenericModelMigrationPreservesOriginalRows(t *testing.T) {
	pool, ctx := m002Database(t, true)
	for _, name := range []string{"0008_m002_identity_vocabulary.sql", "0009_m002_review_facts.sql", "0010_m002_growth_items.sql", "0011_m002_presets_quota.sql", "0012_m002_notices_analytics.sql", "0013_m002_operational_privileges.sql", "0014_notice_remind_once.sql"} {
		applyEmbeddedMigration(t, ctx, pool, name)
	}
	var id uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled,updated_at) VALUES('Legacy service','Vendor/Exact-ID',true,'2026-01-01') RETURNING id`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.openrouter_credentials(ciphertext,nonce,encryption_key_version,display_fingerprint) VALUES(decode('abcd','hex'),decode('1234','hex'),1,'synthetic-hint')`); err != nil {
		t.Fatal(err)
	}
	var modelBefore, keyBefore string
	if err := pool.QueryRow(ctx, `SELECT to_jsonb(m)::text FROM wordweave.ai_models m WHERE id=$1`, id).Scan(&modelBefore); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT to_jsonb(c)::text FROM wordweave.openrouter_credentials c`).Scan(&keyBefore); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var modelAfter, keyAfter, mode, defaultMode string
	if err := pool.QueryRow(ctx, `SELECT (to_jsonb(m)-'provider_id'-'max_output_tokens'-'output_mode')::text,output_mode FROM wordweave.ai_models m WHERE id=$1`, id).Scan(&modelAfter, &mode); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT to_jsonb(c)::text FROM wordweave.openrouter_credentials c`).Scan(&keyAfter); err != nil {
		t.Fatal(err)
	}
	if modelBefore != modelAfter || keyBefore != keyAfter || mode != "json_schema" {
		t.Fatal("legacy identity, metadata, timestamps or ciphertext changed")
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id) VALUES('New service','new-id') RETURNING output_mode`).Scan(&defaultMode); err != nil {
		t.Fatal(err)
	}
	if defaultMode != "prompt" {
		t.Fatal("new model must use portable prompt output by default")
	}
}
