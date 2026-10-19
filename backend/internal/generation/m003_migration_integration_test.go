//go:build integration

package generation_test

import (
	"strings"
	"testing"

	"wordweave/internal/testdb"
)

func TestM003CurrentSchemaDefaultsAndBoundaries(t *testing.T) {
	pool, ctx := testdb.Open(t)
	var latest string
	if err := pool.QueryRow(ctx, `SELECT version FROM wordweave.schema_migrations ORDER BY version DESC LIMIT 1`).Scan(&latest); err != nil || latest != "0018_m002_config_portability.sql" {
		t.Fatalf("latest migration=%q err=%v", latest, err)
	}
	for _, table := range []string{"generation_runs", "preset_preview_runs"} {
		var defaultValue *string
		if err := pool.QueryRow(ctx, `SELECT column_default FROM information_schema.columns WHERE table_schema='wordweave' AND table_name=$1 AND column_name='content_policy_version'`, table).Scan(&defaultValue); err != nil || defaultValue == nil || !strings.Contains(*defaultValue, "1") {
			t.Fatalf("%s policy default=%v err=%v", table, defaultValue, err)
		}
	}
	var basicReview bool
	var basicLimit, proLimit, plusLimit int
	if err := pool.QueryRow(ctx, `SELECT (SELECT content_review_enabled FROM wordweave.entitlement_groups WHERE code='registered'),(SELECT content_repair_limit FROM wordweave.entitlement_groups WHERE code='registered'),(SELECT content_repair_limit FROM wordweave.entitlement_groups WHERE code='pro'),(SELECT content_repair_limit FROM wordweave.entitlement_groups WHERE code='plus')`).Scan(&basicReview, &basicLimit, &proLimit, &plusLimit); err != nil || basicReview || basicLimit != 0 || proLimit != 1 || plusLimit != 1 {
		t.Fatalf("initial content service=%v/%d/%d/%d err=%v", basicReview, basicLimit, proLimit, plusLimit, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.entitlement_groups SET content_review_enabled=true,content_repair_limit=99 WHERE code='pro'`); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{
		`UPDATE wordweave.entitlement_groups SET content_repair_limit=100 WHERE code='pro'`,
		`UPDATE wordweave.entitlement_groups SET content_repair_limit=-1 WHERE code='pro'`,
		`UPDATE wordweave.entitlement_groups SET content_review_enabled=true,content_repair_limit=1 WHERE code='registered'`,
	} {
		if _, err := pool.Exec(ctx, query); err == nil {
			t.Fatalf("invalid content configuration accepted: %s", query)
		}
	}
}
