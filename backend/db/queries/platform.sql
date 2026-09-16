-- name: DatabaseNow :one
SELECT clock_timestamp()::timestamptz;

-- name: CurrentMigrationVersion :one
SELECT version FROM wordweave.schema_migrations ORDER BY version DESC LIMIT 1;

