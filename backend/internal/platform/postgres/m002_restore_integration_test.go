//go:build integration

package postgres

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
)

// Called on the populated M001->M002 migration fixture, not on a production DB.
func verifyM002BackupRestore(t *testing.T, ctx context.Context, source *pgxpool.Pool) {
	t.Helper()
	bin := os.Getenv("TEST_POSTGRES_BIN")
	locate := func(name string) string {
		t.Helper()
		if bin != "" {
			return filepath.Join(bin, name)
		}
		path, err := exec.LookPath(name)
		if err != nil {
			t.Skip("PostgreSQL backup tools not available; restore rehearsal requires TEST_POSTGRES_BIN")
		}
		return path
	}
	dumpTool, restoreTool := locate("pg_dump"), locate("pg_restore")
	url, cleanup := createMigrationTestDatabase(t, ctx, integrationDatabaseURL(t))
	defer cleanup()
	dump := filepath.Join(t.TempDir(), "m002-fixture.dump")
	before := databaseDigests(t, ctx, source)
	for _, cmd := range []*exec.Cmd{
		exec.CommandContext(ctx, dumpTool, "--format=custom", "--file="+dump, "--dbname="+source.Config().ConnString()),
		exec.CommandContext(ctx, restoreTool, "--exit-on-error", "--dbname="+url, dump),
	} {
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("isolated backup/restore failed: %v %s", err, output)
		}
	}
	restored, err := Open(ctx, url, "m002-restore-verification", 2)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	if err = Verify(ctx, restored); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, databaseDigests(t, ctx, restored)) {
		t.Fatal("restored rows differ from backup source")
	}
	if err = Migrate(ctx, restored); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, databaseDigests(t, ctx, restored)) {
		t.Fatal("migration replay changed restored data")
	}
	t.Logf("restored and compared %d tables; migration replay preserved every row", len(before))
}
func databaseDigests(t *testing.T, ctx context.Context, pool *pgxpool.Pool) map[string]string {
	t.Helper()
	rows, err := pool.Query(ctx, `SELECT tablename FROM pg_tables WHERE schemaname='wordweave' ORDER BY tablename`)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	result := map[string]string{}
	for _, name := range names {
		var digest string
		if err = pool.QueryRow(ctx, `SELECT md5(coalesce(jsonb_agg(r ORDER BY r)::text,'[]')) FROM(SELECT to_jsonb(t) r FROM `+pgx.Identifier{"wordweave", name}.Sanitize()+` t) s`).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result[name] = digest
	}
	return result
}
