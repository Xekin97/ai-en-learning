//go:build integration

// Package testdb creates a separate, disposable database for each integration
// fixture. TEST_DATABASE_URL must name an explicitly isolated test cluster.
package testdb

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/postgres"
)

func Open(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := "wordweave_m002_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		admin.Close(ctx)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := admin.Exec(cleanup, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)"); err != nil {
			t.Errorf("remove isolated database: %v", err)
		}
		admin.Close(cleanup)
	})
	parsed, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	parsed.Path = "/" + name
	pool, err := postgres.Open(ctx, parsed.String(), "m002-integration", 8)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err = postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	return pool, ctx
}

func Learner(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale) VALUES($1,'fixture-only','learner','registered','en-US') RETURNING id`, "reader_"+uuid.NewString()[:8]).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func Batch(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner uuid.UUID) uuid.UUID {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var batch, target uuid.UUID
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.learning_batches(owner_id,title,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version)
  VALUES($1,'learn','registered','Fixture model','test/model','en','story','short','Learning and learned.',ARRAY['study'],1,'m002-test') RETURNING id`, owner).Scan(&batch); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO wordweave.batch_targets(owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,entry_meaning,hint_phrase,hint_surface,hint_start,hint_end)
  SELECT $1,$2,id,'learn',0,'gain knowledge','learning while learning','learning',0,8 FROM wordweave.vocabulary_entries WHERE entry='learn' RETURNING id`, owner, batch).Scan(&target); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES($1,$2,$3,0,'learning',0,8),($1,$2,$3,1,'learning',15,23)`, owner, batch, target); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES($1,$2,$3,0,'Learning',0,8),($1,$2,$3,1,'learned',13,20)`, owner, batch, target); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return batch
}
