//go:build integration

package postgres

import (
	"context"
	"io/fs"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/db/migrations"
)

func TestHintOccurrenceMigrationsBackfillAndEnforceLegacyBatches(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	baseURL := integrationDatabaseURL(t)
	databaseURL, cleanup := createMigrationTestDatabase(t, ctx, baseURL)
	defer cleanup()

	pool, err := Open(ctx, databaseURL, "wordweave-migration-test", 2)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	for _, name := range []string{
		"0001_roles_and_schema.sql",
		"0002_core_tables.sql",
		"0003_fixed_groups.sql",
		"0004_vocabulary_m001.sql",
	} {
		applyEmbeddedMigration(t, ctx, pool, name)
	}

	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatal(err)
	}
	var ownerID, batchID, targetID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO wordweave.accounts(username,password_hash,role,group_code)
		VALUES ('legacy_reader','legacy-hash','learner','registered') RETURNING id`).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO wordweave.learning_batches(
			owner_id,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,
			meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version
		) VALUES ($1,'registered','Legacy model','provider/legacy','en','story','short',
			'Learning brings steady progress.',ARRAY['study'],1,'m001-v1')
		RETURNING id`, ownerID).Scan(&batchID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO wordweave.batch_targets(
			owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,
			contextual_meaning,hint_phrase,hint_surface,hint_start,hint_end
		) SELECT $1,$2,id,'learn',0,'gain knowledge','shared learning','learning',7,15
		  FROM wordweave.vocabulary_entries WHERE entry='learn'
		RETURNING id`, ownerID, batchID).Scan(&targetID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO wordweave.passage_occurrences(
			owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset
		) VALUES ($1,$2,$3,0,'Learning',0,8)`, ownerID, batchID, targetID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	applyEmbeddedMigration(t, ctx, pool, "0005_hint_occurrences_expand.sql")
	applyEmbeddedMigration(t, ctx, pool, "0006_hint_occurrences_enforce.sql")
	applyEmbeddedMigration(t, ctx, pool, "0007_entry_meaning.sql")
	if err := Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	var surface string
	var start, end int
	if err := pool.QueryRow(ctx, `
		SELECT surface,start_offset,end_offset
		FROM wordweave.hint_occurrences
		WHERE target_id=$1 AND occurrence_order=0`, targetID).Scan(&surface, &start, &end); err != nil {
		t.Fatal(err)
	}
	if surface != "learning" || start != 7 || end != 15 {
		t.Fatalf("backfilled hint occurrence=(%q,%d,%d)", surface, start, end)
	}

	deleteTx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := deleteTx.Exec(ctx, `DELETE FROM wordweave.hint_occurrences WHERE target_id=$1`, targetID); err != nil {
		_ = deleteTx.Rollback(ctx)
		t.Fatal(err)
	}
	if err := deleteTx.Commit(ctx); err == nil {
		t.Fatal("deleting the final canonical hint occurrence unexpectedly committed")
	}
}

func applyEmbeddedMigration(t *testing.T, ctx context.Context, pool *pgxpool.Pool, name string) {
	t.Helper()
	sqlBytes, err := fs.ReadFile(migrations.Files, name)
	if err != nil {
		t.Fatal(err)
	}
	if err := applyMigration(ctx, pool, name, string(sqlBytes)); err != nil {
		t.Fatal(err)
	}
}

func integrationDatabaseURL(t *testing.T) string {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	return raw
}

func createMigrationTestDatabase(t *testing.T, ctx context.Context, rawURL string) (string, func()) {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	databaseName := "wordweave_migration_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	adminConnection, err := pgx.Connect(ctx, rawURL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := adminConnection.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{databaseName}.Sanitize()); err != nil {
		_ = adminConnection.Close(ctx)
		t.Fatal(err)
	}
	parsed.Path = "/" + databaseName
	return parsed.String(), func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_, _ = adminConnection.Exec(cleanupCtx, "DROP DATABASE "+pgx.Identifier{databaseName}.Sanitize()+" WITH (FORCE)")
		_ = adminConnection.Close(cleanupCtx)
	}
}
