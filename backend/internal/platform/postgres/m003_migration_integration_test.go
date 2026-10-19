//go:build integration

package postgres

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestM003EmptyDatabaseInitializesCurrentSchema(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	databaseURL, cleanup := createMigrationTestDatabase(t, ctx, integrationDatabaseURL(t))
	defer cleanup()
	pool, err := Open(ctx, databaseURL, "m003-empty-init-test", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = Migrate(ctx, pool); err != nil {
		t.Fatalf("initialize empty database: %v", err)
	}
	var latest string
	if err = pool.QueryRow(ctx, `SELECT version FROM wordweave.schema_migrations ORDER BY version DESC LIMIT 1`).Scan(&latest); err != nil || latest != "0018_m002_config_portability.sql" {
		t.Fatalf("latest migration=%q err=%v", latest, err)
	}
	var definition string
	if err = pool.QueryRow(ctx, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='generation_runs_m003_content_facts_valid'`).Scan(&definition); err != nil {
		t.Fatal(err)
	}
	for _, fact := range []string{"m003-content-v5", "fixed_edit_native_invalid", "repair_native_invalid"} {
		if !strings.Contains(definition, fact) {
			t.Fatalf("current constraint omits %q: %s", fact, definition)
		}
	}
	if err = Verify(ctx, pool); err != nil {
		t.Fatalf("verify current empty schema: %v", err)
	}
}
