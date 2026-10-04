package admin

import (
	"context"
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestGenerationQuotaProjection(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name, role, kind string
		hasGroup         bool
		limit            pgtype.Int4
		used             int64
		remaining        int
		invalid          bool
	}{
		{name: "limited", role: "learner", hasGroup: true, limit: pgtype.Int4{Int32: 5, Valid: true}, used: 3, kind: "limited", remaining: 2},
		{name: "exhausted", role: "learner", hasGroup: true, limit: pgtype.Int4{Int32: 5, Valid: true}, used: 5, kind: "limited"},
		{name: "zero limit", role: "learner", hasGroup: true, limit: pgtype.Int4{Valid: true}, kind: "limited"},
		{name: "lowered limit", role: "learner", hasGroup: true, limit: pgtype.Int4{Int32: 2, Valid: true}, used: 5, kind: "limited"},
		{name: "bigint used", role: "learner", hasGroup: true, limit: pgtype.Int4{Int32: math.MaxInt32, Valid: true}, used: math.MaxInt64, kind: "limited"},
		{name: "max remaining", role: "learner", hasGroup: true, limit: pgtype.Int4{Int32: math.MaxInt32, Valid: true}, kind: "limited", remaining: math.MaxInt32},
		{name: "unlimited", role: "learner", hasGroup: true, used: math.MaxInt64, kind: "unlimited"},
		{name: "admin", role: "admin"},
		{name: "missing group", role: "learner", invalid: true},
		{name: "admin with group", role: "admin", hasGroup: true, invalid: true},
		{name: "unknown role", role: "visitor", hasGroup: true, invalid: true},
		{name: "negative usage", role: "learner", hasGroup: true, used: -1, invalid: true},
		{name: "negative limit", role: "learner", hasGroup: true, limit: pgtype.Int4{Int32: -1, Valid: true}, invalid: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			quota, err := projectGenerationQuota(test.role, test.hasGroup, test.limit, test.used)
			if test.invalid {
				if !errors.Is(err, errInvalidUserQuota) || quota != nil {
					t.Fatalf("invalid projection: quota=%v err=%v", quota, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if test.role == "admin" {
				if quota != nil {
					t.Fatal("admin must be not applicable")
				}
				return
			}
			if quota == nil || quota.Kind != test.kind {
				t.Fatalf("quota=%v", quota)
			}
			if test.kind == "unlimited" {
				if quota.Remaining != nil {
					t.Fatal("unlimited remaining must be nil")
				}
			} else if quota.Remaining == nil || *quota.Remaining != test.remaining {
				t.Fatalf("remaining=%v want=%d", quota.Remaining, test.remaining)
			}
		})
	}
}

type quotaTestRow func(...any) error

func (row quotaTestRow) Scan(dest ...any) error { return row(dest...) }

type quotaTestTx struct {
	calls              []string
	failAt             string
	failure            error
	group              string
	cancel             context.CancelFunc
	rollbackContextErr error
	updated            bool
}

func (tx *quotaTestTx) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	step := "lock"
	if query == userDetailQuery {
		step = "detail"
		if !tx.updated {
			step = "before"
		}
	} else if strings.Contains(query, "growth_settings") {
		step = "configuration"
	} else if strings.Contains(query, "SELECT clock_timestamp()") {
		step = "clock"
	} else if !strings.Contains(query, "FOR UPDATE") {
		panic("unexpected SQL")
	}
	tx.calls = append(tx.calls, step)
	return quotaTestRow(func(dest ...any) error {
		if tx.failAt == step {
			return tx.failure
		}
		if step == "configuration" {
			*dest[0].(*int64) = 1
			return nil
		}
		if step == "clock" {
			*dest[0].(*time.Time) = time.Date(2026, 9, 20, 1, 0, 0, 0, time.UTC)
			return nil
		}
		*dest[0].(*uuid.UUID) = uuid.MustParse("11111111-1111-4111-8111-111111111111")
		if step == "lock" {
			return nil
		}
		*dest[1].(*string) = "quota_reader"
		*dest[2].(*string) = "learner"
		*dest[3].(*pgtype.Text) = pgtype.Text{String: tx.group, Valid: true}
		*dest[4].(*string) = "active"
		*dest[5].(*pgtype.Text) = pgtype.Text{String: "en-US", Valid: true}
		*dest[6].(*time.Time) = time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC)
		*dest[7].(*int) = 7
		*dest[8].(*bool) = true
		*dest[9].(*pgtype.Int4) = pgtype.Int4{Int32: 5, Valid: true}
		*dest[10].(*int64) = 0
		if tx.updated {
			*dest[16].(*int64) = 1
		}
		return nil
	})
}
func (tx *quotaTestTx) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	step := "update"
	if strings.Contains(query, "plan_quota_states") {
		step = "quota"
	}
	tx.calls = append(tx.calls, step)
	if tx.failAt == step {
		return pgconn.CommandTag{}, tx.failure
	}
	tx.group = args[1].(string)
	tx.updated = true
	return pgconn.NewCommandTag("UPDATE 1"), nil
}
func (tx *quotaTestTx) Commit(context.Context) error {
	tx.calls = append(tx.calls, "commit")
	if tx.cancel != nil {
		tx.cancel()
	}
	if tx.failAt == "commit" {
		return tx.failure
	}
	return nil
}
func (tx *quotaTestTx) Rollback(ctx context.Context) error {
	tx.calls = append(tx.calls, "rollback")
	tx.rollbackContextErr = ctx.Err()
	return nil
}

func TestUserGroupTransactionOrderingAndFailures(t *testing.T) {
	t.Parallel()
	for _, failureStep := range []string{"", "configuration", "clock", "lock", "before", "update", "quota", "detail", "commit"} {
		t.Run("failure_"+failureStep, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			failure := errors.New("injected transaction failure")
			tx := &quotaTestTx{failAt: failureStep, failure: failure, cancel: cancel, group: "registered"}
			plan := "basic"
			before := User{ID: uuid.MustParse("11111111-1111-4111-8111-111111111111"), Role: "learner", PlanCode: &plan}
			key := []byte("test-base")
			signUserBase(&before, key)
			user, err := changeUserGroup(ctx, tx, before.ID, "pro", *before.BaseRevision, key)
			if failureStep != "" {
				if !errors.Is(err, failure) || user.ID != uuid.Nil || user.GenerationQuota != nil {
					t.Fatalf("partial success: user=%v err=%v", user, err)
				}
			} else if err != nil || user.PlanCode == nil || *user.PlanCode != "pro" || *user.GenerationQuota.Remaining != 5 {
				t.Fatalf("user=%v err=%v", user, err)
			}
			want := []string{"configuration", "clock", "lock", "before", "update", "quota", "detail", "commit"}
			if failureStep != "" {
				for i, step := range want {
					if step == failureStep {
						want = want[:i+1]
						break
					}
				}
			}
			want = append(want, "rollback")
			if !reflect.DeepEqual(tx.calls, want) {
				t.Fatalf("calls=%v want=%v", tx.calls, want)
			}
			if tx.rollbackContextErr != nil {
				t.Fatal("rollback reused canceled request context")
			}
		})
	}
}

func TestUserGroupRejectsInvalidInputBeforeDatabase(t *testing.T) {
	t.Parallel()
	service := NewService(nil, nil, nil, nil, []byte("admin-test-key"))
	for _, group := range []string{"visitor", "registered", "admin", "unknown"} {
		if _, err := service.ChangeUserGroup(context.Background(), uuid.New(), group, true, "revision"); !errors.Is(err, ErrValidation) {
			t.Fatalf("group=%s err=%v", group, err)
		}
	}
	if _, err := service.ChangeUserGroup(context.Background(), uuid.New(), "pro", false, "revision"); !errors.Is(err, ErrValidation) {
		t.Fatal(err)
	}
}

func TestUserDetailNoRowsNeverReturnsPartialUser(t *testing.T) {
	t.Parallel()
	tx := &quotaTestTx{failAt: "before", failure: pgx.ErrNoRows}
	user, err := getUser(context.Background(), tx, uuid.New())
	if !errors.Is(err, ErrNotFound) || user.ID != uuid.Nil || user.GenerationQuota != nil {
		t.Fatalf("user=%v err=%v", user, err)
	}
}
