package postgres

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	vocabularyasset "wordweave/assets/vocabulary"
	"wordweave/db/migrations"
)

const vocabularyMigration = "0004_vocabulary_m001.sql"

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		CREATE SCHEMA IF NOT EXISTS wordweave;
		CREATE TABLE IF NOT EXISTS wordweave.schema_migrations (
			version text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
		)`); err != nil {
		return fmt.Errorf("prepare migration ledger: %w", err)
	}

	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		return fmt.Errorf("list embedded migrations: %w", err)
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	slices.Sort(names)

	for _, name := range names {
		var applied bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM wordweave.schema_migrations WHERE version=$1)`, name).Scan(&applied); err != nil {
			return fmt.Errorf("read migration %s state: %w", name, err)
		}
		if applied {
			continue
		}
		sqlBytes, err := fs.ReadFile(migrations.Files, name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if err := applyMigration(ctx, pool, name, string(sqlBytes)); err != nil {
			return err
		}
	}
	return Verify(ctx, pool)
}

func applyMigration(ctx context.Context, pool *pgxpool.Pool, name, sqlText string) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", name, err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := applyMigrationTx(ctx, tx, name, sqlText); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", name, err)
	}
	return nil
}

// applyMigrationTx never starts or commits a transaction. The cutover command
// uses it to keep cleanup, structural changes and the ledger atomic.
func applyMigrationTx(ctx context.Context, tx pgx.Tx, name, sqlText string) error {
	if strings.TrimSpace(sqlText) != "" {
		if _, err := tx.Exec(ctx, sqlText); err != nil {
			return fmt.Errorf("execute migration %s: %w", name, err)
		}
	}
	if name == vocabularyMigration {
		if err := seedVocabulary(ctx, tx); err != nil {
			return fmt.Errorf("execute migration %s: %w", name, err)
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.schema_migrations(version) VALUES ($1)`, name); err != nil {
		return fmt.Errorf("record migration %s: %w", name, err)
	}
	return nil
}

func seedVocabulary(ctx context.Context, tx pgx.Tx) error {
	digest := sha256.Sum256(vocabularyasset.M001)
	if len(vocabularyasset.M001) != vocabularyasset.ExpectedBytes || hex.EncodeToString(digest[:]) != vocabularyasset.ExpectedSHA {
		return errors.New("embedded M001 vocabulary byte size or SHA-256 does not match the approved asset")
	}
	decoder := json.NewDecoder(bytes.NewReader(vocabularyasset.M001))
	var words []string
	if err := decoder.Decode(&words); err != nil {
		return fmt.Errorf("decode vocabulary: %w", err)
	}
	if len(words) != vocabularyasset.ExpectedCount {
		return fmt.Errorf("vocabulary has %d entries, want %d", len(words), vocabularyasset.ExpectedCount)
	}
	seen := make(map[string]struct{}, len(words))
	rows := make([][]any, 0, len(words))
	for index, word := range words {
		if word == "" || strings.TrimSpace(word) != word || strings.ToLower(word) != word {
			return fmt.Errorf("vocabulary entry %d is not a nonempty trimmed lowercase value", index)
		}
		if _, exists := seen[word]; exists {
			return fmt.Errorf("duplicate vocabulary entry %q", word)
		}
		seen[word] = struct{}{}
		rows = append(rows, []any{word, index})
	}

	var snapshotID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO wordweave.vocabulary_snapshots(version, sha256, byte_size, entry_count)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text`, vocabularyasset.Version, vocabularyasset.ExpectedSHA, vocabularyasset.ExpectedBytes, vocabularyasset.ExpectedCount).Scan(&snapshotID); err != nil {
		return fmt.Errorf("insert vocabulary snapshot: %w", err)
	}
	copyRows := make([][]any, 0, len(rows))
	for _, row := range rows {
		copyRows = append(copyRows, []any{snapshotID, row[0], row[1]})
	}
	inserted, err := tx.CopyFrom(ctx, pgx.Identifier{"wordweave", "vocabulary_entries"}, []string{"snapshot_id", "entry", "source_order"}, pgx.CopyFromRows(copyRows))
	if err != nil {
		return fmt.Errorf("copy vocabulary entries: %w", err)
	}
	if inserted != int64(vocabularyasset.ExpectedCount) {
		return fmt.Errorf("copied %d vocabulary entries, want %d", inserted, vocabularyasset.ExpectedCount)
	}
	return nil
}

type databaseReader interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func Verify(ctx context.Context, pool *pgxpool.Pool) error {
	return verifyCurrent(ctx, pool)
}

func verifyCurrent(ctx context.Context, pool databaseReader) error {
	if err := verifyMigrationLedger(ctx, pool); err != nil {
		return err
	}

	var version, digest string
	var byteSize, count int
	if err := pool.QueryRow(ctx, `
		SELECT version, btrim(sha256), byte_size, entry_count
		FROM wordweave.vocabulary_snapshots
		WHERE version = 'm001'`).Scan(&version, &digest, &byteSize, &count); err != nil {
		return fmt.Errorf("verify vocabulary snapshot metadata: %w", err)
	}
	if version != vocabularyasset.Version || digest != vocabularyasset.ExpectedSHA || byteSize != vocabularyasset.ExpectedBytes || count != vocabularyasset.ExpectedCount {
		return errors.New("database vocabulary snapshot metadata differs from the approved M001 asset")
	}
	var actualCount, distinctCount int
	if err := pool.QueryRow(ctx, `SELECT count(*), count(DISTINCT entry) FROM wordweave.vocabulary_entries`).Scan(&actualCount, &distinctCount); err != nil {
		return fmt.Errorf("verify vocabulary rows: %w", err)
	}
	if actualCount != vocabularyasset.ExpectedCount || distinctCount != vocabularyasset.ExpectedCount {
		return fmt.Errorf("database vocabulary rows are incomplete: count=%d distinct=%d", actualCount, distinctCount)
	}
	var databaseGroups []string
	groupRows, err := pool.Query(ctx, `SELECT code FROM wordweave.entitlement_groups ORDER BY code`)
	if err != nil {
		return fmt.Errorf("verify fixed groups: %w", err)
	}
	for groupRows.Next() {
		var code string
		if err := groupRows.Scan(&code); err != nil {
			groupRows.Close()
			return fmt.Errorf("verify fixed groups: %w", err)
		}
		databaseGroups = append(databaseGroups, code)
	}
	if err := groupRows.Err(); err != nil {
		groupRows.Close()
		return fmt.Errorf("verify fixed groups: %w", err)
	}
	groupRows.Close()
	if !slices.Equal(databaseGroups, []string{"plus", "pro", "registered", "visitor"}) {
		return fmt.Errorf("database fixed groups differ from the approved set: %v", databaseGroups)
	}

	var targetCount, hintCoveredCount, passageCoveredCount, shadowMismatchCount int
	if err := pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM wordweave.batch_targets),
			(SELECT count(DISTINCT target_id) FROM wordweave.hint_occurrences),
			(SELECT count(DISTINCT target_id) FROM wordweave.passage_occurrences),
			(SELECT count(*)
			 FROM wordweave.batch_targets target
			 LEFT JOIN wordweave.hint_occurrences occurrence
			   ON occurrence.target_id=target.id AND occurrence.occurrence_order=0
			 WHERE occurrence.id IS NULL
			    OR occurrence.surface<>target.hint_surface
			    OR occurrence.start_offset<>target.hint_start
			    OR occurrence.end_offset<>target.hint_end)
	`).Scan(&targetCount, &hintCoveredCount, &passageCoveredCount, &shadowMismatchCount); err != nil {
		return fmt.Errorf("verify saved occurrence coverage: %w", err)
	}
	if hintCoveredCount != targetCount || passageCoveredCount != targetCount || shadowMismatchCount != 0 {
		return fmt.Errorf(
			"saved occurrence coverage is incomplete: targets=%d hints=%d passages=%d shadow_mismatches=%d",
			targetCount, hintCoveredCount, passageCoveredCount, shadowMismatchCount,
		)
	}

	var assetWords []string
	if err := json.Unmarshal(vocabularyasset.M001, &assetWords); err != nil {
		return fmt.Errorf("verify embedded vocabulary: %w", err)
	}
	wordRows, err := pool.Query(ctx, `
		SELECT entry FROM wordweave.vocabulary_entries
		WHERE snapshot_id=(SELECT id FROM wordweave.vocabulary_snapshots WHERE version='m001')
		ORDER BY source_order`)
	if err != nil {
		return fmt.Errorf("verify vocabulary content: %w", err)
	}
	index := 0
	for wordRows.Next() {
		var word string
		if err := wordRows.Scan(&word); err != nil {
			wordRows.Close()
			return fmt.Errorf("verify vocabulary content: %w", err)
		}
		if index >= len(assetWords) || word != assetWords[index] {
			wordRows.Close()
			return fmt.Errorf("database vocabulary differs from the approved asset at source order %d", index)
		}
		index++
	}
	if err := wordRows.Err(); err != nil {
		wordRows.Close()
		return fmt.Errorf("verify vocabulary content: %w", err)
	}
	wordRows.Close()
	if index != len(assetWords) {
		return fmt.Errorf("database vocabulary has %d ordered rows, want %d", index, len(assetWords))
	}
	if err := verifyEntryMeaningColumn(ctx, pool); err != nil {
		return err
	}
	return verifyM002Structure(ctx, pool)
}

func verifyEntryMeaningColumn(ctx context.Context, db databaseReader) error {
	var columnOK bool
	var expression string
	err := db.QueryRow(ctx, `
		SELECT
			(SELECT count(*)=1 FROM information_schema.columns
			 WHERE table_schema='wordweave' AND table_name='batch_targets'
			   AND column_name='entry_meaning' AND data_type='text' AND is_nullable='NO')
			AND NOT EXISTS (SELECT 1 FROM information_schema.columns
			 WHERE table_schema='wordweave' AND table_name='batch_targets' AND column_name='contextual_meaning'),
			COALESCE((SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint
			 WHERE conrelid='wordweave.batch_targets'::regclass
			   AND conname='batch_targets_text_nonempty' AND contype='c' AND convalidated), '')
	`).Scan(&columnOK, &expression)
	if err != nil {
		return fmt.Errorf("verify entry meaning column: %w", err)
	}
	normalized := strings.NewReplacer(" ", "", "\n", "", "\t", "", "(", "", ")", "").Replace(expression)
	const expected = "source_entry_snapshot<>''::textANDentry_meaning<>''::textANDhint_phrase<>''::textANDhint_surface<>''::text"
	if !columnOK || normalized != expected {
		return errors.New("entry meaning column or nonempty constraint differs from current schema")
	}
	return nil
}

func expectedMigrationNames() ([]string, error) {
	entries, err := fs.ReadDir(migrations.Files, ".")
	if err != nil {
		return nil, fmt.Errorf("list embedded migrations: %w", err)
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	slices.Sort(names)
	return names, nil
}

func verifyMigrationLedger(ctx context.Context, pool databaseReader) error {
	expectedMigrations, err := expectedMigrationNames()
	if err != nil {
		return err
	}
	rows, err := pool.Query(ctx, `SELECT version FROM wordweave.schema_migrations ORDER BY version`)
	if err != nil {
		return fmt.Errorf("verify migration ledger: %w", err)
	}
	var actualMigrations []string
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			rows.Close()
			return fmt.Errorf("verify migration ledger: %w", err)
		}
		actualMigrations = append(actualMigrations, version)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("verify migration ledger: %w", err)
	}
	rows.Close()
	if !slices.Equal(actualMigrations, expectedMigrations) {
		return fmt.Errorf("database migration ledger differs from embedded migrations: got %v want %v", actualMigrations, expectedMigrations)
	}

	return nil
}
