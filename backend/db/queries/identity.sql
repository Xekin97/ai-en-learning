-- name: FindAccountByUsername :one
SELECT id, username, password_hash, role, group_code, status, ui_locale,
       quota_reset_at, created_at, updated_at
FROM wordweave.accounts
WHERE lower(username) = lower(sqlc.arg(username))
LIMIT 1;

-- name: FindAccountByID :one
SELECT id, username, password_hash, role, group_code, status, ui_locale,
       quota_reset_at, created_at, updated_at
FROM wordweave.accounts
WHERE id = sqlc.arg(id)
LIMIT 1;

-- name: FindAccountSession :one
SELECT s.id AS session_id, s.account_id, s.created_at AS session_created_at,
       s.last_seen_at, s.expires_at,
       a.username, a.password_hash, a.role, a.group_code, a.status, a.ui_locale,
       a.quota_reset_at, a.created_at AS account_created_at
FROM wordweave.account_sessions s
JOIN wordweave.accounts a ON a.id = s.account_id
WHERE s.token_hash = sqlc.arg(token_hash)
LIMIT 1;

-- name: CreateAccount :one
INSERT INTO wordweave.accounts(username, password_hash, role, group_code, ui_locale)
VALUES (sqlc.arg(username), sqlc.arg(password_hash), sqlc.arg(role), sqlc.narg(group_code), sqlc.narg(ui_locale))
RETURNING id, username, password_hash, role, group_code, status, ui_locale,
          quota_reset_at, created_at, updated_at;

-- name: CreateAccountSession :one
INSERT INTO wordweave.account_sessions(account_id, token_hash, expires_at)
VALUES (sqlc.arg(account_id), sqlc.arg(token_hash), sqlc.arg(expires_at))
RETURNING id, account_id, created_at, last_seen_at, expires_at;

-- name: DeleteAccountSession :execrows
DELETE FROM wordweave.account_sessions
WHERE id = sqlc.arg(session_id) AND account_id = sqlc.arg(account_id);

-- name: DeleteOtherAccountSessions :execrows
DELETE FROM wordweave.account_sessions
WHERE account_id = sqlc.arg(account_id) AND id <> sqlc.arg(current_session_id);

-- name: DeleteAllAccountSessions :execrows
DELETE FROM wordweave.account_sessions WHERE account_id = sqlc.arg(account_id);

-- name: TouchAccountSession :exec
UPDATE wordweave.account_sessions
SET last_seen_at = clock_timestamp()
WHERE id = sqlc.arg(session_id) AND last_seen_at < clock_timestamp() - interval '5 minutes';

-- name: UpdateAccountLocale :one
UPDATE wordweave.accounts
SET ui_locale = sqlc.arg(ui_locale)
WHERE id = sqlc.arg(account_id)
RETURNING ui_locale;

-- name: UpdateAccountPassword :exec
UPDATE wordweave.accounts
SET password_hash = sqlc.arg(password_hash)
WHERE id = sqlc.arg(account_id);

-- name: DeleteAccount :execrows
DELETE FROM wordweave.accounts WHERE id = sqlc.arg(account_id);

-- name: FindVisitorIdentity :one
SELECT id, created_at, last_seen_at
FROM wordweave.visitor_identities
WHERE token_hash = sqlc.arg(token_hash)
LIMIT 1;

-- name: CreateVisitorIdentity :one
INSERT INTO wordweave.visitor_identities(token_hash)
VALUES (sqlc.arg(token_hash))
RETURNING id, created_at, last_seen_at;

-- name: TouchVisitorIdentity :exec
UPDATE wordweave.visitor_identities
SET last_seen_at = clock_timestamp()
WHERE id = sqlc.arg(id) AND last_seen_at < clock_timestamp() - interval '5 minutes';

