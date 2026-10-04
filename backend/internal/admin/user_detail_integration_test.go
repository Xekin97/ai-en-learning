//go:build integration

package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/ai"
	"wordweave/internal/entitlement"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

func TestAdminQuotaDatabase(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool := quotaDatabase(t, ctx)
	service := NewService(pool, nil, nil, nil, []byte("admin-test-key"))
	model := quotaModel(t, ctx, pool)
	for _, testName := range []string{"charged facts", "reset boundary", "window boundary", "group reset", "read failure rollback", "uncertain commit", "deferred commit rollback", "canceled request", "missing user"} {
		t.Run(testName, func(t *testing.T) {
			quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=5 WHERE code='registered'")
			id := quotaAccount(t, ctx, pool, "learner")
			other := quotaAccount(t, ctx, pool, "learner")
			now := time.Now().UTC().Truncate(time.Microsecond)
			switch testName {
			case "charged facts":
				active := quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, now.Add(-time.Hour), "active", "pending")
				quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, now.Add(-time.Hour), "valid", "saved")
				quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, now.Add(-time.Hour), "user_cancelled", "pending")
				for _, status := range []string{"provider_failed", "server_failed", "stream_failed", "validation_failed"} {
					quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, now.Add(-time.Hour), status, "pending")
				}
				quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, now.Add(-25*time.Hour), "valid", "abandoned")
				quotaRun(t, ctx, pool, other, uuid.Nil, uuid.Nil, model, now, "valid", "pending")
				var visitor uuid.UUID
				if err := pool.QueryRow(ctx, "INSERT INTO wordweave.visitor_identities(token_hash) VALUES ($1) RETURNING id", []byte(uuid.NewString())).Scan(&visitor); err != nil {
					t.Fatal(err)
				}
				quotaRun(t, ctx, pool, uuid.Nil, visitor, id, model, now, "valid", "saved")
				assertQuota(t, mustQuotaUser(t, ctx, service, id), "limited", 2)
				assertQuota(t, mustQuotaUser(t, ctx, service, other), "limited", 4)
				// On stationary data, the existing generation-options projection agrees.
				options, err := entitlement.NewService(pool, pool).Options(ctx, identity.Actor{ID: id, Kind: "account", Role: "learner", GroupCode: "registered"})
				if err != nil || options.Quota.Remaining == nil || *options.Quota.Remaining != 2 {
					t.Fatalf("options quota mismatch: %v", err)
				}
				generator := generation.NewService(pool, nil, nil, nil, time.Minute, ai.Validator{})
				if err := generator.CompleteFailure(ctx, active, "provider_failed", "test_refund"); err != nil {
					t.Fatal(err)
				}
				assertQuota(t, mustQuotaUser(t, ctx, service, id), "limited", 3)
				for _, limit := range []int{2, 0} {
					quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=$1 WHERE code='registered'", limit)
					assertQuota(t, mustQuotaUser(t, ctx, service, id), "limited", 0)
				}
				quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=NULL WHERE code='registered'")
				quotaExec(t, ctx, pool, "DELETE FROM wordweave.group_lengths WHERE group_code='registered'")
				assertQuota(t, mustQuotaUser(t, ctx, service, id), "unlimited", 0)
				assertQuota(t, mustQuotaUser(t, ctx, service, quotaAccount(t, ctx, pool, "admin")), "", 0)
			case "reset boundary", "window boundary":
				for _, zone := range []string{"UTC", "Asia/Shanghai", "America/New_York"} {
					id = quotaAccount(t, ctx, pool, "learner")
					// Cross the spring DST boundary: 24 hours, never a calendar day.
					fixed := time.Date(2026, 3, 9, 5, 30, 0, 0, time.UTC)
					boundary := fixed.Add(-24 * time.Hour)
					if testName == "reset boundary" {
						boundary = fixed.Add(-time.Hour)
					}
					reset := fixed.Add(-48 * time.Hour)
					if testName == "reset boundary" {
						reset = boundary
					}
					quotaExec(t, ctx, pool, "UPDATE wordweave.accounts SET quota_reset_at=$2 WHERE id=$1", id, reset)
					for _, offset := range []time.Duration{-time.Microsecond, 0, time.Microsecond} {
						quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, boundary.Add(offset), "valid", "pending")
					}
					tx, err := pool.Begin(ctx)
					if err != nil {
						t.Fatal(err)
					}
					if _, err := tx.Exec(ctx, "SELECT set_config('TimeZone',$1,true)", zone); err != nil {
						t.Fatal(err)
					}
					user, err := getUser(ctx, frozenQuotaClock{queryer: tx, now: fixed}, id)
					_ = tx.Rollback(ctx)
					if err != nil {
						t.Fatal(err)
					}
					assertQuota(t, user, "limited", 3) // equal and +1µs count; -1µs does not
				}
			case "group reset":
				active := quotaRun(t, ctx, pool, id, uuid.Nil, uuid.Nil, model, now.Add(-time.Minute), "active", "pending")
				for _, group := range []string{"pro", "plus", "basic"} {
					dbCode, _ := databaseGroupCode(group)
					quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=7 WHERE code=$1", dbCode)
					user, err := service.ChangeUserGroup(ctx, id, group, true, *mustQuotaUser(t, ctx, service, id).BaseRevision)
					if err != nil {
						t.Fatal(err)
					}
					if user.PlanCode == nil || *user.PlanCode != group {
						t.Fatalf("wrong plan: %v", user.PlanCode)
					}
					assertQuota(t, user, "limited", 7)
				}
				var beforeReset time.Time
				if err := pool.QueryRow(ctx, "SELECT quota_reset_at FROM wordweave.accounts WHERE id=$1", id).Scan(&beforeReset); err != nil {
					t.Fatal(err)
				}
				// Finishing a pre-reset active run must not charge the new window.
				quotaExec(t, ctx, pool, "UPDATE wordweave.generation_runs SET call_status='user_cancelled',counts_toward_cumulative=true,completed_at=clock_timestamp() WHERE id=$1", active)
				assertQuota(t, mustQuotaUser(t, ctx, service, id), "limited", 7)
				var afterReset time.Time
				var groupSnapshot string
				if err := pool.QueryRow(ctx, "SELECT quota_reset_at FROM wordweave.accounts WHERE id=$1", id).Scan(&afterReset); err != nil {
					t.Fatal(err)
				}
				if err := pool.QueryRow(ctx, "SELECT group_code_snapshot FROM wordweave.generation_runs WHERE id=$1", active).Scan(&groupSnapshot); err != nil {
					t.Fatal(err)
				}
				if !beforeReset.Equal(afterReset) || groupSnapshot != "registered" {
					t.Fatal("read/reset rewrote history")
				}
			case "read failure rollback", "uncertain commit":
				var reset time.Time
				if err := pool.QueryRow(ctx, "SELECT quota_reset_at FROM wordweave.accounts WHERE id=$1", id).Scan(&reset); err != nil {
					t.Fatal(err)
				}
				tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
				if err != nil {
					t.Fatal(err)
				}
				fault := &faultQuotaTx{Tx: tx, failDetail: testName == "read failure rollback"}
				user, err := changeUserGroup(ctx, fault, id, "pro", *mustQuotaUser(t, ctx, service, id).BaseRevision, service.key)
				if err == nil || user.ID != uuid.Nil {
					t.Fatal("fault produced a success")
				}
				actual := mustQuotaUser(t, ctx, service, id)
				var after time.Time
				if err := pool.QueryRow(ctx, "SELECT quota_reset_at FROM wordweave.accounts WHERE id=$1", id).Scan(&after); err != nil {
					t.Fatal(err)
				}
				if fault.failDetail {
					if *actual.PlanCode != "basic" || !after.Equal(reset) || fault.commits != 0 {
						t.Fatal("projection failure did not roll back")
					}
				} else if *actual.PlanCode != "pro" || !after.After(reset) || fault.commits != 1 {
					t.Fatal("unknown commit was replayed or lost")
				}
			case "deferred commit rollback":
				quotaExec(t, ctx, pool, fmt.Sprintf(`CREATE FUNCTION wordweave.reject_quota_commit() RETURNS trigger LANGUAGE plpgsql AS $$
				BEGIN RAISE EXCEPTION 'injected deferred commit failure'; END $$;
				CREATE CONSTRAINT TRIGGER quota_commit_failure AFTER UPDATE ON wordweave.accounts
				DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.id='%s'::uuid)
				EXECUTE FUNCTION wordweave.reject_quota_commit()`, id))
				user, err := service.ChangeUserGroup(ctx, id, "pro", true, *mustQuotaUser(t, ctx, service, id).BaseRevision)
				if err == nil || user.ID != uuid.Nil {
					t.Fatal("failed commit returned user")
				}
				if *mustQuotaUser(t, ctx, service, id).PlanCode != "basic" {
					t.Fatal("failed commit persisted change")
				}
			case "canceled request":
				canceled, stop := context.WithCancel(ctx)
				stop()
				if user, err := service.GetUser(canceled, id); err == nil || user.ID != uuid.Nil {
					t.Fatal("canceled read returned success")
				}
				if user, err := service.ChangeUserGroup(canceled, id, "pro", true, "canceled-revision"); err == nil || user.ID != uuid.Nil {
					t.Fatal("canceled change returned success")
				}
				if *mustQuotaUser(t, ctx, service, id).PlanCode != "basic" {
					t.Fatal("canceled change committed")
				}
			case "missing user":
				quotaExec(t, ctx, pool, "DELETE FROM wordweave.accounts WHERE id=$1", id)
				if _, err := service.GetUser(ctx, id); !errors.Is(err, ErrNotFound) {
					t.Fatal(err)
				}
				if err := service.RequireUser(ctx, id); !errors.Is(err, ErrNotFound) {
					t.Fatal(err)
				}
				if _, err := service.ChangeUserGroup(ctx, id, "pro", true, "deleted-revision"); !errors.Is(err, ErrNotFound) {
					t.Fatal(err)
				}
				adminID := quotaAccount(t, ctx, pool, "admin")
				if _, err := service.ChangeUserGroup(ctx, adminID, "pro", true, "admin-revision"); !errors.Is(err, ErrNotFound) {
					t.Fatal(err)
				}
			}
		})
	}
}

// Only the test queryer replaces the database clock; no production/public
// time parameter or clock dependency is introduced.
type frozenQuotaClock struct {
	queryer userQueryer
	now     time.Time
}

func (clock frozenQuotaClock) QueryRow(ctx context.Context, query string, args ...any) pgx.Row {
	if query != userDetailQuery {
		panic("unexpected fixed-clock query")
	}
	args[1] = clock.now
	return clock.queryer.QueryRow(ctx, query, args...)
}

type faultQuotaTx struct {
	pgx.Tx
	failDetail  bool
	commits     int
	detailReads int
}

func (tx *faultQuotaTx) QueryRow(ctx context.Context, query string, args ...any) pgx.Row {
	if query == userDetailQuery {
		tx.detailReads++
	}
	if tx.failDetail && query == userDetailQuery && tx.detailReads == 2 {
		return quotaTestRow(func(...any) error { return errors.New("injected detail read failure") })
	}
	return tx.Tx.QueryRow(ctx, query, args...)
}
func (tx *faultQuotaTx) Commit(ctx context.Context) error {
	tx.commits++
	if err := tx.Tx.Commit(ctx); err != nil {
		return err
	}
	return errors.New("simulated connection loss after successful commit")
}

func TestAdminQuotaConcurrentSnapshots(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool := quotaDatabase(t, ctx)
	service := NewService(pool, nil, nil, nil, []byte("admin-test-key"))
	id := quotaAccount(t, ctx, pool, "learner")
	quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=CASE code WHEN 'registered' THEN 5 WHEN 'pro' THEN 7 ELSE 9 END")
	first, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		t.Fatal(err)
	}
	entered, release := make(chan struct{}), make(chan struct{})
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	firstResult := make(chan quotaUserResult, 1)
	go func() {
		user, err := changeUserGroup(ctx, &gatedQuotaTx{Tx: first, entered: entered, release: release}, id, "pro", *mustQuotaUser(t, ctx, service, id).BaseRevision, service.key)
		firstResult <- quotaUserResult{user, err}
	}()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	// An ordinary SELECT does not wait for the account lock and sees the old
	// plan and old quota together while the first transaction is uncommitted.
	readCtx, stopRead := context.WithTimeout(ctx, 2*time.Second)
	old, err := service.GetUser(readCtx, id)
	stopRead()
	if err != nil || old.PlanCode == nil || *old.PlanCode != "basic" {
		t.Fatalf("old snapshot: %v", err)
	}
	assertQuota(t, old, "limited", 5)
	second, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		t.Fatal(err)
	}
	secondPID := second.Conn().PgConn().PID()
	secondResult := make(chan quotaUserResult, 1)
	go func() {
		user, err := changeUserGroup(ctx, second, id, "plus", *old.BaseRevision, service.key)
		secondResult <- quotaUserResult{user, err}
	}()
	waitQuotaLock(t, ctx, pool, secondPID)
	// A second administrator with the same base revision must refresh after
	// waiting for the first reset. Global plan writers use their own config lock.
	close(release)
	a, b := <-firstResult, <-secondResult
	if a.err != nil || !errors.Is(b.err, ErrBasePlanChanged) {
		t.Fatalf("first=%v second=%v", a.err, b.err)
	}
	if *a.user.PlanCode != "pro" || b.user.ID != uuid.Nil {
		t.Fatal("stale concurrent reset returned a success")
	}
	assertQuota(t, a.user, "limited", 7)
	current := mustQuotaUser(t, ctx, service, id)
	assertQuota(t, current, "limited", 7)
	retried, err := service.ChangeUserGroup(ctx, id, "plus", true, *current.BaseRevision)
	if err != nil {
		t.Fatal(err)
	}
	assertQuota(t, retried, "limited", 9)
}

type quotaUserResult struct {
	user User
	err  error
}
type gatedQuotaTx struct {
	pgx.Tx
	entered chan struct{}
	release <-chan struct{}
	gated   bool
}

func (tx *gatedQuotaTx) QueryRow(ctx context.Context, query string, args ...any) pgx.Row {
	if query == userDetailQuery && !tx.gated {
		tx.gated = true
		close(tx.entered)
		select {
		case <-tx.release:
		case <-ctx.Done():
			return quotaTestRow(func(...any) error { return ctx.Err() })
		}
	}
	return tx.Tx.QueryRow(ctx, query, args...)
}
func waitQuotaLock(t *testing.T, ctx context.Context, pool *pgxpool.Pool, pid uint32) {
	t.Helper()
	deadline, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		var waiting bool
		if err := pool.QueryRow(deadline, "SELECT coalesce((SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=$1),false)", int64(pid)).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		select {
		case <-deadline.Done():
			t.Fatal("second operation did not wait for account lock")
		case <-ticker.C:
		}
	}
}

func TestAdminQuotaGenerationWaitsForGroupReset(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool := quotaDatabase(t, ctx)
	service := NewService(pool, nil, nil, nil, []byte("admin-test-key"))
	id, adminID := quotaAccount(t, ctx, pool, "learner"), quotaAccount(t, ctx, pool, "admin")
	model := quotaModel(t, ctx, pool)
	quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=7 WHERE code='pro'")
	quotaExec(t, ctx, pool, "UPDATE wordweave.ai_models SET enabled=true WHERE id=$1", model)
	quotaExec(t, ctx, pool, "INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('pro',$1)", model)
	quotaExec(t, ctx, pool, "INSERT INTO wordweave.group_lengths(group_code,length_code) VALUES ('pro','short') ON CONFLICT DO NOTHING")
	envelope, err := security.NewEnvelope(map[int][]byte{1: []byte(strings.Repeat("k", 32))}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(pool, envelope)
	if err := credentials.Put(ctx, adminID, "fake-key-never-sent-to-provider"); err != nil {
		t.Fatal(err)
	}
	generationPool, err := postgres.Open(ctx, pool.Config().ConnConfig.ConnString(), "wordweave-quota-generation", 1)
	if err != nil {
		t.Fatal(err)
	}
	defer generationPool.Close()
	connection, err := generationPool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	pid := connection.Conn().PgConn().PID()
	connection.Release()
	generator := generation.NewService(generationPool, credentials, nil, []byte(strings.Repeat("c", 32)), time.Minute, ai.Validator{})
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		t.Fatal(err)
	}
	entered, release := make(chan struct{}), make(chan struct{})
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	changed := make(chan quotaUserResult, 1)
	go func() {
		user, err := changeUserGroup(ctx, &gatedQuotaTx{Tx: tx, entered: entered, release: release}, id, "pro", *mustQuotaUser(t, ctx, service, id).BaseRevision, service.key)
		changed <- quotaUserResult{user, err}
	}()
	select {
	case <-entered:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	type runResult struct {
		run generation.Run
		err error
	}
	started := make(chan runResult, 1)
	go func() {
		run, err := generator.Start(ctx, identity.Actor{Kind: "account", ID: id, Role: "learner", GroupCode: "registered"}, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn"}})
		started <- runResult{run, err}
	}()
	waitQuotaLock(t, ctx, pool, pid)
	close(release)
	change, result := <-changed, <-started
	if change.err != nil || result.err != nil {
		t.Fatalf("change=%v generation=%v", change.err, result.err)
	}
	assertQuota(t, change.user, "limited", 7)
	assertQuota(t, mustQuotaUser(t, ctx, service, id), "limited", 6)
	var group string
	if err := pool.QueryRow(ctx, "SELECT group_code_snapshot FROM wordweave.generation_runs WHERE id=$1", result.run.ID).Scan(&group); err != nil {
		t.Fatal(err)
	}
	if group != "pro" {
		t.Fatal("new generation used stale group")
	}
	if err := generator.CompleteFailure(ctx, result.run.ID, "server_failed", "test_cleanup"); err != nil {
		t.Fatal(err)
	}
	assertQuota(t, mustQuotaUser(t, ctx, service, id), "limited", 7)
}

func TestAdminQuotaQueryPlan(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool := quotaDatabase(t, ctx)
	id, other, adminID := quotaAccount(t, ctx, pool, "learner"), quotaAccount(t, ctx, pool, "learner"), quotaAccount(t, ctx, pool, "admin")
	model := quotaModel(t, ctx, pool)
	quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=500 WHERE code='registered'")
	quotaExec(t, ctx, pool, `INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,
		provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,disposition,
		quota_charged,counts_toward_cumulative,started_at,completed_at)
		SELECT CASE WHEN n<=10000 THEN $1::uuid ELSE $2::uuid END,CASE WHEN n<=10000 THEN $1::uuid ELSE $2::uuid END,
		'registered',$3,'Quota fixture','test/quota','en','story','short',30,5,'valid','abandoned',true,true,
		CASE WHEN n<=100 THEN statement_timestamp()-interval '1 hour' ELSE statement_timestamp()-interval '25 hours' END,statement_timestamp()
		FROM generate_series(1,30000) n`, id, other, model)
	quotaExec(t, ctx, pool, `INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_at) SELECT id,group_code,'base',quota_reset_at FROM wordweave.accounts WHERE role='learner' ON CONFLICT DO NOTHING`)
	quotaExec(t, ctx, pool, `INSERT INTO wordweave.generation_charges(run_id,account_id,source_kind,plan_code,origin,quota_epoch,state,charged_at,settled_at) SELECT id,account_id,'plan',group_code_snapshot,'base',0,'consumed',started_at,completed_at FROM wordweave.generation_runs WHERE account_id IS NOT NULL`)
	quotaExec(t, ctx, pool, "ANALYZE wordweave.generation_charges")
	quotaExec(t, ctx, pool, "ANALYZE wordweave.plan_quota_states")
	quotaExec(t, ctx, pool, "ANALYZE wordweave.generation_runs")
	quotaExec(t, ctx, pool, "ANALYZE wordweave.accounts")
	for _, kind := range []string{"limited", "unlimited", "admin"} {
		target := id
		if kind == "unlimited" {
			quotaExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=NULL WHERE code='registered'")
		}
		if kind == "admin" {
			target = adminID
		}
		var raw []byte
		if err := pool.QueryRow(ctx, "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+userDetailQuery, target, nil).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var plans []map[string]any
		if err := json.Unmarshal(raw, &plans); err != nil {
			t.Fatal(err)
		}
		var indexes []map[string]any
		var walk func(any)
		walk = func(value any) {
			switch node := value.(type) {
			case map[string]any:
				if name, ok := node["Index Name"].(string); ok && name == "generation_charges_plan_window" {
					indexes = append(indexes, map[string]any{"index": name, "loops": node["Actual Loops"], "rows": node["Actual Rows"]})
				}
				for _, child := range node {
					walk(child)
				}
			case []any:
				for _, child := range node {
					walk(child)
				}
			}
		}
		walk(plans[0]["Plan"])
		if len(indexes) == 0 {
			t.Fatal("representative quota query did not use the account quota index")
		}
		for _, index := range indexes {
			if kind == "limited" && index["loops"].(float64) == 0 {
				t.Fatal("finite scan not executed")
			}
			if kind != "limited" && index["loops"].(float64) != 0 {
				t.Fatal("unlimited/admin scanned charged history")
			}
		}
		summary, _ := json.Marshal(map[string]any{"kind": kind, "execution_ms": plans[0]["Execution Time"], "indexes": indexes, "total_runs": 30000})
		t.Logf("CR033_QUERY_PLAN %s", summary)
	}
}

func quotaDatabase(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	connection, err := pgx.Connect(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	name := "wordweave_quota_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := connection.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		_ = connection.Close(ctx)
		t.Fatal(err)
	}
	parsed.Path = "/" + name
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, err := connection.Exec(cleanup, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)")
		if err != nil {
			t.Error(err)
		}
		_ = connection.Close(cleanup)
	})
	pool, err := postgres.Open(ctx, parsed.String(), "wordweave-quota-test", 8)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	return pool
}
func quotaExec(t *testing.T, ctx context.Context, pool *pgxpool.Pool, query string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(ctx, query, args...); err != nil {
		t.Fatal(err)
	}
}
func quotaAccount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, role string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	var group any = "registered"
	if role == "admin" {
		group = nil
	}
	err := pool.QueryRow(ctx, "INSERT INTO wordweave.accounts(username,password_hash,role,group_code,quota_reset_at) VALUES ($1,'test-only-hash',$2,$3,'2026-01-01T00:00:00Z') RETURNING id", "quota_"+strings.ReplaceAll(uuid.NewString(), "-", "")[:20], role, group).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}
func quotaModel(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := pool.QueryRow(ctx, "INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES ('Quota fixture','test/quota',false) RETURNING id").Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
func quotaRun(t *testing.T, ctx context.Context, pool *pgxpool.Pool, account, visitor, credit, model uuid.UUID, at time.Time, status, disposition string) uuid.UUID {
	t.Helper()
	var accountValue, visitorValue, creditValue, completed any
	group := "registered"
	if account != uuid.Nil {
		accountValue, creditValue = account, account
	} else {
		visitorValue, group = visitor, "visitor"
		if credit != uuid.Nil {
			creditValue = credit
		}
	}
	charged := status == "active" || status == "valid" || status == "user_cancelled"
	cumulative := status == "valid" || status == "user_cancelled"
	if status != "active" {
		completed = at.Add(time.Second)
	}
	var id uuid.UUID
	err := pool.QueryRow(ctx, `INSERT INTO wordweave.generation_runs(
		account_id,visitor_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,
		meaning_language,scenario,length_code,minimum_words_snapshot,quota_limit_snapshot,max_entries_snapshot,
		call_status,disposition,quota_charged,counts_toward_cumulative,started_at,completed_at)
		VALUES ($1,$2,$3,$4,$5,'Quota fixture','test/quota','en','story','short',30,999,5,$6,$7,$8,$9,$10,$11) RETURNING id`,
		accountValue, visitorValue, creditValue, group, model, status, disposition, charged, cumulative, at, completed).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	state := "consumed"
	if status == "active" {
		state = "reserved"
	} else if !charged {
		state = "refunded"
	}
	if account != uuid.Nil {
		quotaExec(t, ctx, pool, `INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_at) SELECT id,group_code,'base',quota_reset_at FROM wordweave.accounts WHERE id=$1 ON CONFLICT DO NOTHING`, account)
		quotaExec(t, ctx, pool, `INSERT INTO wordweave.generation_charges(run_id,account_id,source_kind,plan_code,origin,quota_epoch,state,charged_at,settled_at) SELECT $1,$2,'plan',$3,'base',reset_epoch,$4,$5,$6 FROM wordweave.plan_quota_states WHERE owner_id=$2 AND plan_code=$3 AND origin='base'`, id, account, group, state, at, completed)
	} else {
		quotaExec(t, ctx, pool, `INSERT INTO wordweave.generation_charges(run_id,visitor_id,source_kind,state,charged_at,settled_at) VALUES($1,$2,'visitor',$3,$4,$5)`, id, visitor, state, at, completed)
	}
	return id
}
func mustQuotaUser(t *testing.T, ctx context.Context, service *Service, id uuid.UUID) User {
	t.Helper()
	user, err := service.GetUser(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	return user
}
func assertQuota(t *testing.T, user User, kind string, remaining int) {
	t.Helper()
	if kind == "" {
		if user.GenerationQuota != nil {
			t.Fatal("admin quota must be nil")
		}
		return
	}
	if user.GenerationQuota == nil || user.GenerationQuota.Kind != kind {
		t.Fatalf("quota=%v kind=%s", user.GenerationQuota, kind)
	}
	if kind == "limited" {
		if user.GenerationQuota.Remaining == nil || *user.GenerationQuota.Remaining != remaining {
			t.Fatalf("remaining=%v want=%d", user.GenerationQuota.Remaining, remaining)
		}
	} else if user.GenerationQuota.Remaining != nil {
		t.Fatal("unlimited remaining must be nil")
	}
}
