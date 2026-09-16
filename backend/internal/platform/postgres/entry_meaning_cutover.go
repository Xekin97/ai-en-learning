package postgres

import (
	"context"
	"errors"
	"io/fs"
	"slices"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/db/migrations"
)

const entryMeaningMigration = "0007_entry_meaning.sql"

type CutoverOptions struct {
	ExpectedDatabase string
	ExpectedSystemID string
	ExpectedRole     string
	WritersStopped   bool
	LockTimeout      time.Duration
	StatementTimeout time.Duration
}

type CutoverResult struct {
	Outcome string
	Deleted map[string]int64
}

// CutoverError intentionally omits database diagnostics and retained row values.
type CutoverError struct{ Stage, Outcome string }

func (e *CutoverError) Error() string {
	return "entry-meaning cutover: " + e.Stage + " (" + e.Outcome + ")"
}

type cutoverHooks struct {
	at     func(string, pgx.Tx) error
	commit func(context.Context, pgx.Tx) error
}

// CutoverEntryMeaning is an explicit, one-time offline operation, never called
// by Migrate, Verify, readiness or the application process.
func CutoverEntryMeaning(ctx context.Context, pool *pgxpool.Pool, options CutoverOptions) (CutoverResult, error) {
	return cutoverEntryMeaning(ctx, pool, options, cutoverHooks{})
}

func cutoverEntryMeaning(ctx context.Context, pool *pgxpool.Pool, options CutoverOptions, hooks cutoverHooks) (CutoverResult, error) {
	result := CutoverResult{Outcome: "not_started", Deleted: make(map[string]int64)}
	fail := func(stage, outcome string) (CutoverResult, error) {
		result.Outcome = outcome
		// Counts are provisional until a confirmed COMMIT.
		if outcome != "committed" {
			result.Deleted = nil
		}
		return result, &CutoverError{Stage: stage, Outcome: outcome}
	}
	if options.ExpectedDatabase == "" || options.ExpectedSystemID == "" || options.ExpectedRole == "" ||
		!options.WritersStopped || options.LockTimeout < time.Millisecond || options.StatementTimeout < time.Millisecond {
		return fail("explicit_target_and_maintenance_confirmation_required", "not_started")
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fail("begin", "not_started")
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		_ = tx.Rollback(rollbackCtx)
	}()
	step := func(name string) error {
		if hooks.at != nil {
			return hooks.at(name, tx)
		}
		return nil
	}
	if _, err = tx.Exec(ctx, `SELECT set_config('lock_timeout',$1,true),set_config('statement_timeout',$2,true)`,
		strconv.FormatInt(options.LockTimeout.Milliseconds(), 10)+"ms", strconv.FormatInt(options.StatementTimeout.Milliseconds(), 10)+"ms"); err != nil {
		return fail("timeouts", "rolled_back")
	}
	if err = checkCutoverTarget(ctx, tx, options); err != nil {
		return fail("target_or_writers", "rolled_back")
	}
	if err = checkCutoverPrestate(ctx, tx); err != nil {
		return fail("prestate", "rolled_back")
	}
	if err = step("before_lock"); err != nil {
		return fail("before_lock", "rolled_back")
	}
	names := make([]string, 0, len(cutoverColumns))
	for name := range cutoverColumns {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if _, err = tx.Exec(ctx, "LOCK TABLE "+pgx.Identifier{"wordweave", name}.Sanitize()+" IN ACCESS EXCLUSIVE MODE"); err != nil {
			return fail("lock", "rolled_back")
		}
	}
	if err = checkCutoverTarget(ctx, tx, options); err != nil {
		return fail("target_or_writers_after_lock", "rolled_back")
	}
	if err = checkCutoverPrestate(ctx, tx); err != nil {
		return fail("prestate_after_lock", "rolled_back")
	}
	for _, keep := range cutoverKeeps {
		if _, err = tx.Exec(ctx, "CREATE TEMP TABLE "+pgx.Identifier{keep.temp}.Sanitize()+" ON COMMIT DROP AS "+keep.query); err != nil {
			return fail("retained_baseline", "rolled_back")
		}
	}
	for _, table := range cutoverDeleteOrder {
		tag, err := tx.Exec(ctx, "DELETE FROM "+pgx.Identifier{"wordweave", table}.Sanitize())
		if err != nil {
			return fail("delete_"+table, "rolled_back")
		}
		result.Deleted[table] = tag.RowsAffected()
		if err = step("delete_" + table); err != nil {
			return fail("delete_"+table, "rolled_back")
		}
	}
	tag, err := tx.Exec(ctx, "DELETE FROM wordweave.accounts WHERE role='learner'")
	if err != nil {
		return fail("delete_learners", "rolled_back")
	}
	result.Deleted["learner_accounts"] = tag.RowsAffected()
	if _, err = tx.Exec(ctx, `
		UPDATE wordweave.entitlement_groups
		SET rolling_quota_limit=CASE WHEN code='visitor' THEN 5 ELSE NULL END,max_entries_per_run=5;
		INSERT INTO wordweave.group_lengths(group_code,length_code)
		SELECT g,l FROM (VALUES ('visitor'),('registered'),('pro'),('plus')) AS groups(g)
		CROSS JOIN (VALUES ('short'),('medium'),('long'),('xlong')) AS lengths(l);
	`); err != nil {
		return fail("group_defaults", "rolled_back")
	}
	if err = step("before_constraints"); err != nil {
		return fail("constraints", "rolled_back")
	}
	if _, err = tx.Exec(ctx, "SET CONSTRAINTS ALL IMMEDIATE"); err != nil {
		return fail("constraints", "rolled_back")
	}
	if err = step("before_migration"); err != nil {
		return fail("migration", "rolled_back")
	}
	body, err := fs.ReadFile(migrations.Files, entryMeaningMigration)
	if err != nil {
		return fail("migration_source", "rolled_back")
	}
	if err = applyMigrationTx(ctx, tx, entryMeaningMigration, string(body)); err != nil {
		return fail("migration_or_ledger", "rolled_back")
	}
	if err = step("after_migration"); err != nil {
		return fail("post_migration", "rolled_back")
	}
	if err = verifyCurrent(ctx, tx); err != nil {
		return fail("current_schema", "rolled_back")
	}
	if err = checkCutoverResult(ctx, tx); err != nil {
		return fail("postconditions", "rolled_back")
	}
	if err = step("before_commit"); err != nil {
		return fail("before_commit", "rolled_back")
	}
	commit := hooks.commit
	if commit == nil {
		commit = func(ctx context.Context, tx pgx.Tx) error { return tx.Commit(ctx) }
	}
	if err = commit(ctx, tx); err != nil {
		if errors.Is(err, pgx.ErrTxCommitRollback) {
			return fail("commit", "rolled_back")
		}
		return fail("commit_requires_read_only_reconciliation", "unknown")
	}
	result.Outcome = "committed"
	return result, nil
}

func checkCutoverTarget(ctx context.Context, tx pgx.Tx, o CutoverOptions) error {
	var database, systemID, role string
	var version, otherClients int
	var controlledRole bool
	err := tx.QueryRow(ctx, `
		SELECT current_database(),system_identifier::text,current_user,
		       current_setting('server_version_num')::int,
		       (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
		        AND pid<>pg_backend_pid() AND backend_type='client backend'),
		       current_user NOT IN ('wordweave_app','wordweave_ai','wordweave_maintenance')
		       AND (current_user=(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
		            OR pg_has_role(current_user,'wordweave_owner','MEMBER'))
		FROM pg_control_system()
	`).Scan(&database, &systemID, &role, &version, &otherClients, &controlledRole)
	if err != nil || database != o.ExpectedDatabase || systemID != o.ExpectedSystemID || role != o.ExpectedRole ||
		version < 180000 || version >= 190000 || otherClients != 0 || !controlledRole {
		return errors.New("target, role, server version or stopped writers do not match")
	}
	return nil
}

func checkCutoverPrestate(ctx context.Context, tx pgx.Tx) error {
	rows, err := tx.Query(ctx, `
		SELECT c.relname,c.relkind::text,COALESCE(array_agg(a.attname::text ORDER BY a.attname)
		       FILTER (WHERE a.attnum>0 AND NOT a.attisdropped),ARRAY[]::text[])
		FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
		LEFT JOIN pg_attribute a ON a.attrelid=c.oid
		WHERE n.nspname='wordweave' AND c.relkind IN ('r','p','v','m','f')
		GROUP BY c.relname,c.relkind ORDER BY c.relname
	`)
	if err != nil {
		return err
	}
	count := 0
	for rows.Next() {
		var name, kind string
		var columns []string
		if err = rows.Scan(&name, &kind, &columns); err != nil {
			rows.Close()
			return err
		}
		if kind != "r" || !slices.Equal(columns, cutoverColumns[name]) {
			rows.Close()
			return errors.New("unknown or changed table/column")
		}
		count++
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if count != len(cutoverColumns) {
		return errors.New("missing table")
	}
	expected, err := expectedMigrationNames()
	if err != nil {
		return err
	}
	if expected[len(expected)-1] != entryMeaningMigration {
		return errors.New("migration set changed")
	}
	var actual []string
	if err = tx.QueryRow(ctx, `SELECT array_agg(version ORDER BY version) FROM wordweave.schema_migrations`).Scan(&actual); err != nil {
		return err
	}
	if !slices.Equal(actual, expected[:len(expected)-1]) {
		return errors.New("not the one-time migration prestate")
	}
	var valid bool
	if err = tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM wordweave.accounts WHERE role='admin')
		AND NOT EXISTS (SELECT 1 FROM wordweave.openrouter_credentials c
		    JOIN wordweave.accounts a ON a.id=c.updated_by WHERE a.role<>'admin')
		AND (SELECT count(*)=4 FROM wordweave.entitlement_groups)
		AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='wordweave'
		    AND table_name='batch_targets' AND column_name='contextual_meaning' AND data_type='text' AND is_nullable='NO')
	`).Scan(&valid); err != nil {
		return err
	}
	if !valid {
		return errors.New("administrator, credential reference or source column invalid")
	}
	return nil
}

type cutoverKeep struct{ temp, query string }

var cutoverKeeps = []cutoverKeep{
	{"cr040_keep_models", "SELECT to_jsonb(t) AS row FROM wordweave.ai_models t"},
	{"cr040_keep_credentials", "SELECT to_jsonb(t) AS row FROM wordweave.openrouter_credentials t"},
	{"cr040_keep_admins", "SELECT to_jsonb(t) AS row FROM wordweave.accounts t WHERE role='admin'"},
	{"cr040_keep_snapshots", "SELECT to_jsonb(t) AS row FROM wordweave.vocabulary_snapshots t"},
	{"cr040_keep_entries", "SELECT to_jsonb(t) AS row FROM wordweave.vocabulary_entries t"},
	{"cr040_keep_groups", "SELECT to_jsonb(t)-'updated_at'-'rolling_quota_limit'-'max_entries_per_run' AS row FROM wordweave.entitlement_groups t"},
	{"cr040_keep_ledger", "SELECT to_jsonb(t) AS row FROM wordweave.schema_migrations t WHERE version<>'0007_entry_meaning.sql'"},
}
var cutoverDeleteOrder = []string{
	"visitor_claims", "review_results", "review_session_targets", "review_session_batches", "review_sessions",
	"passage_occurrences", "hint_occurrences", "batch_targets", "learning_batches",
	"generation_drafts", "generation_run_entries", "generation_runs", "account_sessions", "visitor_identities",
	"group_models", "group_lengths",
}

func checkCutoverResult(ctx context.Context, tx pgx.Tx) error {
	for _, keep := range cutoverKeeps {
		var unchanged bool
		err := tx.QueryRow(ctx, "SELECT NOT EXISTS ((SELECT row FROM pg_temp."+pgx.Identifier{keep.temp}.Sanitize()+
			" EXCEPT ALL "+keep.query+") UNION ALL ("+keep.query+" EXCEPT ALL SELECT row FROM pg_temp."+
			pgx.Identifier{keep.temp}.Sanitize()+"))").Scan(&unchanged)
		if err != nil {
			return err
		}
		if !unchanged {
			return errors.New("retained rows changed")
		}
	}
	for _, table := range cutoverDeleteOrder {
		if table == "group_lengths" {
			continue
		}
		var empty bool
		if err := tx.QueryRow(ctx, "SELECT NOT EXISTS (SELECT 1 FROM "+pgx.Identifier{"wordweave", table}.Sanitize()+")").Scan(&empty); err != nil {
			return err
		}
		if !empty {
			return errors.New("cleanup incomplete")
		}
	}
	var valid bool
	err := tx.QueryRow(ctx, `
		SELECT NOT EXISTS (SELECT 1 FROM wordweave.accounts WHERE role<>'admin')
		AND NOT EXISTS (SELECT 1 FROM wordweave.entitlement_groups
		   WHERE max_entries_per_run<>5 OR rolling_quota_limit IS DISTINCT FROM CASE WHEN code='visitor' THEN 5 ELSE NULL END)
		AND (SELECT count(*)=16 FROM wordweave.group_lengths)
	`).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		return errors.New("group defaults or accounts differ")
	}
	return nil
}

// This source-prestate allowlist is derived from the immutable 0001-0006
// migrations. New/unknown tables or columns stop before any deletion.
var cutoverColumns = map[string][]string{
	"account_sessions":       {"account_id", "created_at", "expires_at", "id", "last_seen_at", "token_hash"},
	"accounts":               {"created_at", "group_code", "id", "password_hash", "quota_reset_at", "role", "status", "ui_locale", "updated_at", "username"},
	"ai_models":              {"created_at", "description", "display_name", "enabled", "id", "provider_model_id", "updated_at"},
	"batch_targets":          {"batch_id", "contextual_meaning", "hint_end", "hint_phrase", "hint_start", "hint_surface", "id", "input_order", "owner_id", "source_entry_snapshot", "vocabulary_entry_id"},
	"entitlement_groups":     {"code", "max_entries_per_run", "rolling_quota_limit", "updated_at"},
	"generation_drafts":      {"access_token_hash", "expires_at", "payload", "run_id", "validated_at"},
	"generation_run_entries": {"input_order", "run_id", "source_entry_snapshot", "vocabulary_entry_id"},
	"generation_runs":        {"account_id", "call_status", "completed_at", "counts_toward_cumulative", "credited_account_id", "disposition", "failure_code", "group_code_snapshot", "id", "length_code", "max_entries_snapshot", "meaning_language", "minimum_words_snapshot", "model_display_name_snapshot", "model_id", "provider_model_id_snapshot", "quota_charged", "quota_limit_snapshot", "scenario", "started_at", "visitor_id"},
	"group_lengths":          {"group_code", "length_code"},
	"group_models":           {"group_code", "model_id"},
	"hint_occurrences":       {"batch_id", "end_offset", "id", "occurrence_order", "owner_id", "start_offset", "surface", "target_id"},
	"learning_batches":       {"expected_target_count", "generation_run_id", "group_code_snapshot", "id", "length_code", "meaning_language", "model_display_name_snapshot", "owner_id", "participates_in_range_review", "passage", "provider_model_id_snapshot", "saved_at", "scenario", "tags", "validator_version"},
	"openrouter_credentials": {"ciphertext", "display_fingerprint", "encryption_key_version", "nonce", "provider", "updated_at", "updated_by"},
	"passage_occurrences":    {"batch_id", "end_offset", "id", "occurrence_order", "owner_id", "start_offset", "surface", "target_id"},
	"review_results":         {"batch_id", "completed_at", "error_count", "id", "owner_id", "session_id", "skip_count", "stage1_completed", "stage2_completed", "successful"},
	"review_session_batches": {"batch_id", "batch_order", "owner_id", "session_id"},
	"review_session_targets": {"batch_id", "session_id", "target_id", "target_order"},
	"review_sessions":        {"completed_at", "created_at", "id", "mode", "owner_id", "range_end_date", "range_start_date", "single_batch_id", "status", "timezone_name", "updated_at"},
	"schema_migrations":      {"applied_at", "version"},
	"visitor_claims":         {"consumed_account_id", "consumed_at", "consumed_batch_id", "created_at", "expires_at", "id", "run_id", "status", "token_hash", "visitor_id"},
	"visitor_identities":     {"created_at", "id", "last_seen_at", "token_hash"},
	"vocabulary_entries":     {"entry", "id", "snapshot_id", "source_order"},
	"vocabulary_snapshots":   {"byte_size", "entry_count", "id", "imported_at", "sha256", "version"},
}
