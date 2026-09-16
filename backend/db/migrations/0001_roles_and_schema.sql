DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wordweave_owner') THEN
    CREATE ROLE wordweave_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wordweave_migrator') THEN
    CREATE ROLE wordweave_migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wordweave_app') THEN
    CREATE ROLE wordweave_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wordweave_ai') THEN
    CREATE ROLE wordweave_ai NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wordweave_maintenance') THEN
    CREATE ROLE wordweave_maintenance NOLOGIN;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS wordweave AUTHORIZATION wordweave_owner;
ALTER SCHEMA wordweave OWNER TO wordweave_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA wordweave FROM PUBLIC;
GRANT USAGE ON SCHEMA wordweave TO wordweave_app, wordweave_ai, wordweave_maintenance;

CREATE TABLE IF NOT EXISTS wordweave.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
ALTER TABLE wordweave.schema_migrations OWNER TO wordweave_owner;

