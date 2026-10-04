package postgres

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
)

// VerifyMaintenance needs only the migration ledger and schema catalogs. It
// does not expand an operational role's access to accounts or learning text.
func VerifyMaintenance(ctx context.Context, pool *pgxpool.Pool) error {
	if err := verifyMigrationLedger(ctx, pool); err != nil {
		return err
	}
	return verifyM002Structure(ctx, pool)
}
func verifyM002Structure(ctx context.Context, db databaseReader) error {
	var valid bool
	err := db.QueryRow(ctx, `SELECT
 to_regclass('wordweave.review_results') IS NULL
 AND to_regclass('wordweave.generation_charges') IS NOT NULL
 AND to_regclass('wordweave.growth_ledger') IS NOT NULL
 AND to_regclass('wordweave.preset_versions') IS NOT NULL
 AND to_regclass('wordweave.analytics_daily') IS NOT NULL
 AND (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='wordweave.review_attempts'::regclass AND attname IN('has_answer','has_unanswered','attempt_no') AND NOT attisdropped)
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='wordweave.review_attempts'::regclass AND attname IN('answers','comparison','answer_hash') AND NOT attisdropped)
 AND (SELECT count(*)=2 FROM pg_attribute WHERE attrelid='wordweave.learning_batches'::regclass AND attname IN('title','title_revision') AND attnotnull AND NOT attisdropped)
 AND (SELECT count(*)=1 FROM pg_attribute WHERE attrelid='wordweave.vocabulary_entries'::regclass AND attname='lexeme_id' AND attnotnull AND NOT attisdropped)
 AND NOT has_table_privilege('wordweave_app','wordweave.openrouter_credentials','SELECT')
 AND NOT has_table_privilege('wordweave_app','wordweave.ai_provider_credentials','SELECT')
 AND has_table_privilege('wordweave_ai','wordweave.ai_provider_credentials','SELECT')
 AND (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='wordweave.ai_models'::regclass AND attname IN('provider_id','max_output_tokens','output_mode') AND NOT attisdropped)
 AND NOT has_table_privilege('wordweave_app','wordweave.growth_ledger','UPDATE')
 AND NOT has_table_privilege('wordweave_app','wordweave.growth_ledger','DELETE')
 AND NOT has_table_privilege('wordweave_app','wordweave.ai_models','DELETE')
 AND NOT has_table_privilege('wordweave_app','wordweave.entitlement_groups','INSERT')
 AND NOT has_table_privilege('wordweave_app','wordweave.entitlement_groups','DELETE')
 AND NOT has_table_privilege('wordweave_ai','wordweave.accounts','SELECT')`).Scan(&valid)
	if err != nil {
		return fmt.Errorf("verify M002 schema: %w", err)
	}
	if !valid {
		return errors.New("M002 schema or role boundaries differ from the approved structure")
	}
	return nil
}
