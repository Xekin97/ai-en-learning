package admin

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"wordweave/internal/platform/business"
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
 WITH chosen AS (
 SELECT a.*,CASE WHEN t.priority>b.priority THEN t.code ELSE b.code END effective_code,
 CASE WHEN t.priority>b.priority THEN 'trial' ELSE 'base' END origin
 FROM wordweave.accounts a LEFT JOIN wordweave.entitlement_groups b ON b.code=a.group_code
 LEFT JOIN wordweave.plan_trials trial ON trial.owner_id=a.id AND trial.closed_at IS NULL AND trial.ends_at>coalesce($2::timestamptz,statement_timestamp())
 LEFT JOIN wordweave.entitlement_groups t ON t.code=trial.target_plan_code WHERE a.id=$1)
 SELECT a.id,a.username,a.role,a.group_code,a.status,a.ui_locale,a.created_at,
 (SELECT count(*) FROM wordweave.learning_batches WHERE owner_id=a.id),g.code IS NOT NULL,g.rolling_quota_limit,
 CASE WHEN a.role='learner' AND g.rolling_quota_limit IS NOT NULL THEN
 (SELECT count(*) FROM wordweave.generation_charges c JOIN wordweave.plan_quota_states q ON q.owner_id=c.account_id AND q.plan_code=c.plan_code AND q.origin=c.origin AND q.reset_epoch=c.quota_epoch
 WHERE c.account_id=a.id AND c.source_kind='plan' AND c.plan_code=a.effective_code AND c.origin=a.origin AND c.state<>'refunded' AND c.charged_at>=greatest(coalesce($2::timestamptz,statement_timestamp())-interval '24 hours',q.reset_at)) ELSE 0::bigint END,
 a.nickname,a.gender,a.last_login_at,a.last_learning_at,a.effective_code,coalesce(base_quota.reset_epoch,0),(a.quota_reset_at AT TIME ZONE 'UTC')::text,
 CASE WHEN a.role='learner' THEN (SELECT max(level_no) FROM wordweave.growth_levels WHERE min_experience<=coalesce(balance.experience,0)) END,
 coalesce(balance.points,0),coalesce(balance.experience,0),coalesce(progress.mastered_total,0),coalesce(progress.saved_total,0)
 FROM chosen a LEFT JOIN wordweave.entitlement_groups g ON g.code=a.effective_code
 LEFT JOIN wordweave.plan_quota_states base_quota ON base_quota.owner_id=a.id AND base_quota.plan_code=a.group_code AND base_quota.origin='base'
 LEFT JOIN wordweave.growth_balances balance ON balance.owner_id=a.id LEFT JOIN wordweave.user_growth progress ON progress.owner_id=a.id`

type userQueryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func getUser(ctx context.Context, queryer userQueryer, id uuid.UUID) (User, error) {
	return getUserAt(ctx, queryer, id, nil)
}

func getUserAt(ctx context.Context, queryer userQueryer, id uuid.UUID, at *time.Time) (User, error) {
	var user User
	var group, locale pgtype.Text
	var hasGroup bool
	var limit pgtype.Int4
	var used int64
	var level *int64
	var progress UserGrowth
	err := queryer.QueryRow(ctx, userDetailQuery, id, at).Scan(
		&user.ID, &user.Username, &user.Role, &group, &user.Status, &locale, &user.CreatedAt,
		&user.LearningBatchCount, &hasGroup, &limit, &used,
		&user.Nickname, &user.Gender, &user.LastLoginAt, &user.LastLearningAt, &user.EffectivePlanCode, &user.baseEpoch, &user.baseReset,
		&level, &progress.Points, &progress.Experience, &progress.Mastered, &progress.Saved,
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
	if user.EffectivePlanCode != nil {
		value := publicGroupCode(*user.EffectivePlanCode)
		user.EffectivePlanCode = &value
	}
	if level != nil {
		progress.Level = *level
		user.Growth = &progress
	}
	return user, nil
}

func signUserBase(user *User, key []byte) {
	if user.Role != "learner" || user.PlanCode == nil {
		return
	}
	value := business.Revision(key, "user-base:"+user.ID.String()+":"+*user.PlanCode+":"+user.baseReset, user.baseEpoch)
	user.BaseRevision = &value
}

var ErrBasePlanChanged = errors.New("base plan changed")

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

func changeUserGroup(ctx context.Context, tx userGroupTx, id uuid.UUID, databaseCode, expected string, key []byte) (User, error) {
	defer func() {
		// Cancellation must still release the row lock/connection. This also
		// safely handles a failed/unknown commit, without ever replaying it.
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanupCtx)
	}()
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return User{}, err
	}
	var lockedID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM wordweave.accounts WHERE id=$1 AND role='learner' FOR UPDATE`, id).Scan(&lockedID)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, err
	}
	before, err := getUserAt(ctx, tx, id, &c.Now)
	if err != nil {
		return User{}, err
	}
	signUserBase(&before, key)
	if before.BaseRevision == nil || *before.BaseRevision != expected {
		return User{}, ErrBasePlanChanged
	}
	result, err := tx.Exec(ctx, `
		UPDATE wordweave.accounts SET group_code=$2,quota_reset_at=$3
		WHERE id=$1 AND role='learner'`, id, databaseCode, c.Now)
	if err != nil {
		return User{}, err
	}
	if result.RowsAffected() != 1 {
		return User{}, ErrNotFound
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_epoch,reset_at) VALUES($1,$2,'base',1,$3)
 ON CONFLICT(owner_id,plan_code,origin) DO UPDATE SET reset_epoch=wordweave.plan_quota_states.reset_epoch+1,reset_at=EXCLUDED.reset_at`, id, databaseCode, c.Now); err != nil {
		return User{}, err
	}
	user, err := getUserAt(ctx, tx, id, &c.Now)
	if err != nil {
		return User{}, err
	}
	signUserBase(&user, key)
	if err := tx.Commit(ctx); err != nil {
		// A response is never produced from an uncommitted projection.
		return User{}, err
	}
	return user, nil
}
