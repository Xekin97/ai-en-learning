#!/usr/bin/env python3
"""Create a sanitized preservation/readiness fingerprint for the real UAT database."""
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

RUNTIME = Path("/tmp/wordweave-m003-uat-real-003")
PSQL = "/opt/homebrew/bin/psql"


def query(database_url: str, sql: str) -> str:
    result = subprocess.run(
        [PSQL, database_url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "LC_ALL": "C", "LANG": "C"},
    )
    if result.returncode:
        raise RuntimeError("read-only database fingerprint query failed: " + result.stderr.strip())
    return result.stdout.strip()


def table_fingerprint(database_url: str, table: str, projection: str = "t") -> dict:
    sql = f"""
      SELECT json_build_object(
        'rows', count(*),
        'content_hash_md5', md5(COALESCE(string_agg(row_to_json({projection})::text, E'\\n' ORDER BY row_to_json({projection})::text), ''))
      )
      FROM wordweave.{table} t;
    """
    return json.loads(query(database_url, sql))


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: db_snapshot.py OUTPUT.json")
    output = Path(sys.argv[1])
    private_path = RUNTIME / "private-env.json"
    database_url = json.loads(private_path.read_text())["APP_DATABASE_URL"]

    protected_tables = [
        "ai_models", "ai_provider_credentials", "ai_providers", "openrouter_credentials",
        "entitlement_groups", "group_lengths", "group_models", "item_definition_models",
        "item_definitions", "preset_previews", "preset_version_entries", "preset_versions", "presets",
        "batch_targets", "hint_occurrences", "learning_batches", "passage_occurrences",
        "review_attempts", "review_session_batches", "review_session_targets", "review_sessions",
        "user_checkins", "user_growth", "user_item_models", "user_items", "user_learning_days", "user_masteries",
        "lexemes", "vocabulary_entries", "vocabulary_snapshots", "schema_migrations",
    ]
    fingerprints = {table: table_fingerprint(database_url, table) for table in protected_tables}
    # Password and session material never leaves PostgreSQL. last_login_at is excluded because real login readiness updates it.
    fingerprints["accounts_stable"] = table_fingerprint(
        database_url,
        "accounts",
        "ROW(t.id,t.username,t.role,t.group_code,t.status,t.ui_locale,t.quota_reset_at,t.created_at,t.nickname,t.gender,t.last_learning_at)",
    )

    active = json.loads(query(database_url, """
      SELECT json_build_object(
        'generation_incomplete', (SELECT count(*) FROM wordweave.generation_runs WHERE completed_at IS NULL),
        'generation_statuses', (SELECT COALESCE(json_object_agg(call_status,n), '{}'::json) FROM (SELECT call_status,count(*) n FROM wordweave.generation_runs GROUP BY call_status) s),
        'preview_incomplete', (SELECT count(*) FROM wordweave.preset_preview_runs WHERE completed_at IS NULL),
        'preview_statuses', (SELECT COALESCE(json_object_agg(status,n), '{}'::json) FROM (SELECT status,count(*) n FROM wordweave.preset_preview_runs GROUP BY status) s)
      );
    """))
    ledger = json.loads(query(database_url, """
      SELECT json_build_object(
        'ai_call_usage_rows', count(*),
        'provider_invoked_rows', count(*) FILTER (WHERE provider_invoked),
        'completed_rows', count(*) FILTER (WHERE completed_at IS NOT NULL),
        'ledger_content_hash_md5', md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), ''))
      ) FROM wordweave.ai_call_usage t;
    """))
    safe_models = json.loads(query(database_url, """
      SELECT COALESCE(json_agg(json_build_object(
        'display_name',m.display_name,'provider_model_id',m.provider_model_id,'enabled',m.enabled,
        'max_output_tokens',m.max_output_tokens,'output_mode',m.output_mode,'custom_parameters',m.custom_parameters,
        'provider_name',p.name,'protocol',p.protocol,'base_url',p.base_url,
        'credential_configured',p.credential_configured,'masked_hint',p.masked_hint
      ) ORDER BY m.display_name,m.provider_model_id), '[]'::json)
      FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id;
    """))
    schema = {
        "migration_versions": query(database_url, "SELECT string_agg(version, ',' ORDER BY version) FROM wordweave.schema_migrations"),
        "schema_content_hash_md5": query(database_url, """
          SELECT md5(string_agg(table_name||':'||column_name||':'||data_type||':'||is_nullable, E'\\n' ORDER BY table_name,ordinal_position))
          FROM information_schema.columns WHERE table_schema='wordweave';
        """),
    }
    payload = {
        "captured_at": datetime.now().astimezone().isoformat(),
        "scope": "sanitized real-UAT preservation fingerprint; no secret values exported",
        "runtime": str(RUNTIME),
        "active_work": active,
        "provider_call_ledger": ledger,
        "safe_models": safe_models,
        "schema": schema,
        "protected_data": fingerprints,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    os.chmod(output, 0o600)
    print(json.dumps({
        "captured_at": payload["captured_at"],
        "active_work": active,
        "provider_call_ledger": ledger,
        "model_count": len(safe_models),
        "protected_fingerprint_count": len(fingerprints),
        "schema": schema,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
