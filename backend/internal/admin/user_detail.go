package admin

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// GenerationQuota is a read-only projection, not generation availability.
// A nil quota is reserved for administrators; unlimited has a nil Remaining.
type GenerationQuota struct {
	Kind      string
	Remaining *int
}

var errInvalidUserQuota = errors.New("invalid user quota projection")

// Both pool and transaction callers use exactly this statement/snapshot.
// CASE avoids the charged-history scan entirely for unlimited/admin targets.
const userDetailQuery = `
	SELECT account.id,account.username,account.role,account.group_code,account.status,
		account.ui_locale,account.created_at,
		(SELECT count(*) FROM wordweave.learning_batches WHERE owner_id=account.id),
		quota_group.code IS NOT NULL,quota_group.rolling_quota_limit,
		CASE WHEN account.role='learner' AND quota_group.rolling_quota_limit IS NOT NULL
		THEN (SELECT count(*) FROM wordweave.generation_runs
			WHERE account_id=account.id AND quota_charged
			AND started_at >= greatest(statement_timestamp()-interval '24 hours',account.quota_reset_at))
		ELSE 0::bigint END
	FROM wordweave.accounts account
	LEFT JOIN wordweave.entitlement_groups quota_group ON quota_group.code=account.group_code
	WHERE account.id=$1`

type userQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func getUser(ctx context.Context, queryer userQueryer, id uuid.UUID) (User, error) {
	var user User
	var group, locale pgtype.Text
	var hasGroup bool
	var limit pgtype.Int4
	var used int64
	err := queryer.QueryRow(ctx, userDetailQuery, id).Scan(
		&user.ID, &user.Username, &user.Role, &group, &user.Status, &locale, &user.CreatedAt,
		&user.LearningBatchCount, &hasGroup, &limit, &used,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	quota, err := projectGenerationQuota(user.Role, hasGroup, limit, used)
	if err != nil {
		return User{}, err
	}
	applyUserNullable(&user, group, locale)
	user.GenerationQuota = quota
	return user, nil
}

func projectGenerationQuota(role string, hasGroup bool, limit pgtype.Int4, used int64) (*GenerationQuota, error) {
	if used < 0 || (limit.Valid && limit.Int32 < 0) {
		return nil, errInvalidUserQuota
	}
	if role == "admin" && !hasGroup {
		return nil, nil
	}
	if role != "learner" || !hasGroup {
		// A missing LEFT JOIN row must never masquerade as a NULL/unlimited limit.
		return nil, errInvalidUserQuota
	}
	if !limit.Valid {
		return &GenerationQuota{Kind: "unlimited"}, nil
	}
	remaining := 0
	if used < int64(limit.Int32) {
		// Clamp while still int64; the final value fits the SQL integer limit.
		remaining = int(int64(limit.Int32) - used)
	}
	return &GenerationQuota{Kind: "limited", Remaining: &remaining}, nil
}

type userGroupTx interface {
	userQueryer
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Commit(context.Context) error
	Rollback(context.Context) error
}

func changeUserGroup(ctx context.Context, tx userGroupTx, id uuid.UUID, databaseCode string) (User, error) {
	defer func() {
		// Cancellation must still release the row lock/connection. This also
		// safely handles a failed/unknown commit, without ever replaying it.
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanupCtx)
	}()
	var lockedID uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT id FROM wordweave.accounts WHERE id=$1 AND role='learner' FOR UPDATE`, id).Scan(&lockedID)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	result, err := tx.Exec(ctx, `
		UPDATE wordweave.accounts SET group_code=$2,quota_reset_at=clock_timestamp()
		WHERE id=$1 AND role='learner'`, id, databaseCode)
	if err != nil {
		return User{}, err
	}
	if result.RowsAffected() != 1 {
		return User{}, ErrNotFound
	}
	user, err := getUser(ctx, tx, id)
	if err != nil {
		return User{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		// A response is never produced from an uncommitted projection.
		return User{}, err
	}
	return user, nil
}
