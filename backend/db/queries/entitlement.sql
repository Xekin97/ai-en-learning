-- name: GetEntitlementGroup :one
SELECT code, rolling_quota_limit, max_entries_per_run, updated_at
FROM wordweave.entitlement_groups
WHERE code = sqlc.arg(code);

-- name: ListGroupModels :many
SELECT m.id, m.display_name, m.description, m.enabled
FROM wordweave.group_models gm
JOIN wordweave.ai_models m ON m.id = gm.model_id
WHERE gm.group_code = sqlc.arg(group_code) AND m.enabled
ORDER BY lower(m.display_name), m.id;

-- name: ListGroupLengths :many
SELECT length_code
FROM wordweave.group_lengths
WHERE group_code = sqlc.arg(group_code)
ORDER BY CASE length_code WHEN 'short' THEN 1 WHEN 'medium' THEN 2 WHEN 'long' THEN 3 WHEN 'xlong' THEN 4 END;

-- name: HasOpenRouterCredential :one
SELECT EXISTS(SELECT 1 FROM wordweave.openrouter_credentials WHERE provider = 'openrouter');

-- name: CountAccountRollingUsage :one
SELECT count(*)::integer AS used,
       extract(epoch FROM coalesce((min(started_at) FILTER (
         WHERE started_at >= greatest(clock_timestamp() - interval '24 hours', sqlc.arg(quota_reset_at)::timestamptz)
       )), '1970-01-01 00:00:00+00'::timestamptz))::bigint AS oldest_charge_unix
FROM wordweave.generation_runs
WHERE account_id = sqlc.arg(account_id)
  AND quota_charged
  AND started_at >= greatest(clock_timestamp() - interval '24 hours', sqlc.arg(quota_reset_at)::timestamptz);

-- name: CountVisitorRollingUsage :one
SELECT count(*)::integer AS used,
       extract(epoch FROM coalesce(min(started_at), '1970-01-01 00:00:00+00'::timestamptz))::bigint AS oldest_charge_unix
FROM wordweave.generation_runs
WHERE visitor_id = sqlc.arg(visitor_id)
  AND quota_charged
  AND started_at >= clock_timestamp() - interval '24 hours';

-- name: HasActiveAccountGeneration :one
SELECT EXISTS(
  SELECT 1 FROM wordweave.generation_runs
  WHERE account_id = sqlc.arg(account_id) AND call_status = 'active'
);

-- name: HasActiveVisitorGeneration :one
SELECT EXISTS(
  SELECT 1 FROM wordweave.generation_runs
  WHERE visitor_id = sqlc.arg(visitor_id) AND call_status = 'active'
);
