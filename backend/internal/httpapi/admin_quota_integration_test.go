//go:build integration

package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

func TestAdminQuotaHTTPV14(t *testing.T) {
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	databaseURL, cleanup := createTestDatabase(t, ctx, raw)
	defer cleanup()
	pool, err := postgres.Open(ctx, databaseURL, "wordweave-quota-http-owner", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	const password = "quota-http-test-password"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	adminID := insertSearchAccount(t, ctx, pool, "quota_admin", hash, "admin")
	id := insertSearchAccount(t, ctx, pool, "quota_reader", hash, "learner")
	other := insertSearchAccount(t, ctx, pool, "quota_other", hash, "learner")
	quotaHTTPExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=CASE code WHEN 'registered' THEN 5 WHEN 'pro' THEN 7 ELSE NULL END")
	quotaHTTPExec(t, ctx, pool, "UPDATE wordweave.accounts SET quota_reset_at='2026-01-01T00:00:00Z' WHERE id=$1", id)
	var runID uuid.UUID
	if err := pool.QueryRow(ctx, `WITH model AS (
		INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES ('Quota fixture','test/quota',false) RETURNING id
	), runs AS (
		INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,
		provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,disposition,
		quota_charged,counts_toward_cumulative,started_at,completed_at)
		SELECT $1,$1,'registered',model.id,'Quota fixture','test/quota','en','story','short',30,5,'valid','saved',
		true,true,statement_timestamp()-interval '1 hour',statement_timestamp() FROM model CROSS JOIN generate_series(1,3)
		RETURNING id) SELECT id FROM runs LIMIT 1`, id).Scan(&runID); err != nil {
		t.Fatal(err)
	}

	// Run HTTP through the real least-privileged application role. The AI
	// pool is closed: any accidental dependency on credentials/options fails.
	appConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	appConfig.MaxConns = 4
	appConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE wordweave_app")
		return err
	}
	appPool, err := pgxpool.NewWithConfig(ctx, appConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer appPool.Close()
	unavailableAI, err := postgres.Open(ctx, databaseURL, "wordweave-quota-no-ai", 1)
	if err != nil {
		t.Fatal(err)
	}
	unavailableAI.Close()
	api, err := New(integrationConfig(databaseURL, "http://127.0.0.1:1"), appPool, unavailableAI)
	if err != nil {
		t.Fatal(err)
	}
	api.SetReady(true)
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	adminClient := loginAdminForSearch(t, application.URL, "quota_admin", password)
	learnerClient := loginAdminForSearch(t, application.URL, "quota_reader", password)
	visitorClient := newBrowserClient(t)
	endpoint := application.URL + "/api/v1/admin/users/" + id.String()
	for _, actor := range []struct {
		name   string
		client *http.Client
		status int
		code   string
	}{
		{"visitor", visitorClient, 401, "authentication_required"}, {"learner", learnerClient, 403, "forbidden"},
	} {
		for _, target := range []string{id.String(), uuid.NewString(), "invalid-id"} {
			response := getJSON(t, actor.client, application.URL+"/api/v1/admin/users/"+target)
			requireStatus(t, response, actor.status)
			if response.body["code"] != actor.code || response.body["data"] != nil {
				t.Fatalf("unsafe %s response", actor.name)
			}
		}
	}
	for _, target := range []string{uuid.NewString(), "invalid-id"} {
		requireStatus(t, getJSON(t, adminClient, application.URL+"/api/v1/admin/users/"+target), 404)
	}
	assertQuotaHTTP(t, adminClient, endpoint, "limited", 2)
	assertQuotaHTTP(t, adminClient, application.URL+"/api/v1/admin/users/"+other.String(), "limited", 5)
	assertQuotaHTTP(t, adminClient, application.URL+"/api/v1/admin/users/"+adminID.String(), "", 0)
	// Input-only attempts to override the snapshot cannot affect server data.
	assertQuotaHTTP(t, adminClient, endpoint+"?remaining=999&group_code=plus&used=0", "limited", 2)

	batchID := quotaHTTPBatch(t, ctx, pool, id, runID)
	detail := assertQuotaHTTP(t, adminClient, endpoint, "limited", 2)
	if nestedValue(t, detail.body, "data", "user", "learning_batch_count") != float64(1) {
		t.Fatal("saved batch not counted")
	}
	batchEndpoint := endpoint + "/batches/" + batchID.String()
	material := getJSON(t, adminClient, batchEndpoint)
	requireStatus(t, material, 200)
	if strings.Contains(material.raw, "generation_quota") {
		t.Fatal("quota leaked into material")
	}
	learnerCSRF := bootstrap(t, learnerClient, application.URL)
	deleted := decodeResponse(t, rawJSONRequest(t, learnerClient, http.MethodDelete, application.URL+"/api/v1/me/batches/"+batchID.String(), learnerCSRF, nil, nil))
	requireStatus(t, deleted, 204)
	detail = assertQuotaHTTP(t, adminClient, endpoint, "limited", 2)
	if nestedValue(t, detail.body, "data", "user", "learning_batch_count") != float64(0) {
		t.Fatal("deleted batch remained in count")
	}
	// Recreate a separate readable batch for the no-history-access checks below.
	batchID = quotaHTTPBatch(t, ctx, pool, id, runID)
	batchEndpoint = endpoint + "/batches/" + batchID.String()

	csrf := bootstrap(t, adminClient, application.URL)
	for _, group := range []string{"pro", "plus", "basic"} {
		changed := putJSON(t, adminClient, endpoint+"/group", csrf, map[string]any{"group_code": group, "confirmed": true})
		requireStatus(t, changed, 200)
		if err := validateAdminQuotaEnvelope([]byte(changed.raw), true); err != nil {
			t.Fatal(err)
		}
		if nestedString(t, changed.body, "data", "user", "plan_code") != group {
			t.Fatal("wrong group")
		}
		if group == "plus" {
			assertQuotaHTTP(t, adminClient, endpoint, "unlimited", 0)
		} else {
			want := 5
			if group == "pro" {
				want = 7
			}
			quota := nestedValue(t, changed.body, "data", "user", "generation_quota").(map[string]any)
			if quota["remaining"] != float64(want) {
				t.Fatalf("quota=%v", quota)
			}
		}
	}
	quotaHTTPExec(t, ctx, pool, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=0 WHERE code='registered'")
	assertQuotaHTTP(t, adminClient, endpoint, "limited", 0)
	zero := putJSON(t, adminClient, endpoint+"/group", csrf, map[string]any{"group_code": "basic", "confirmed": true})
	requireStatus(t, zero, 200)
	if err := validateAdminQuotaEnvelope([]byte(zero.raw), true); err != nil {
		t.Fatal(err)
	}
	if nestedValue(t, zero.body, "data", "user", "generation_quota", "remaining") != float64(0) {
		t.Fatal("zero was not preserved")
	}
	for _, test := range []struct {
		body   map[string]any
		status int
		code   string
	}{
		{map[string]any{"group_code": "visitor", "confirmed": true}, 422, "validation_failed"},
		{map[string]any{"group_code": "pro", "confirmed": false}, 422, "validation_failed"},
		{map[string]any{"group_code": "pro", "confirmed": true, "generation_quota": map[string]any{"kind": "unlimited", "remaining": nil}}, 400, "malformed_request"},
		{map[string]any{"group_code": "pro", "confirmed": true, "quota_reset_at": "2030-01-01"}, 400, "malformed_request"},
	} {
		response := putJSON(t, adminClient, endpoint+"/group", csrf, test.body)
		requireStatus(t, response, test.status)
		if response.body["code"] != test.code {
			t.Fatal("wrong rejection code")
		}
	}
	requireStatus(t, putJSON(t, adminClient, endpoint+"/group", "", map[string]any{"group_code": "pro", "confirmed": true}), 403)
	badOrigin := decodeResponse(t, rawJSONRequest(t, adminClient, http.MethodPut, endpoint+"/group", csrf, map[string]any{"group_code": "pro", "confirmed": true}, map[string]string{"Origin": "https://not-wordweave.invalid"}))
	requireStatus(t, badOrigin, 403)
	requireStatus(t, putJSON(t, adminClient, application.URL+"/api/v1/admin/users/"+adminID.String()+"/group", csrf, map[string]any{"group_code": "pro", "confirmed": true}), 404)

	// Real SELECT privilege failure after UPDATE must return a safe problem
	// and roll back both group and reset time, without harming read-only pages.
	var reset time.Time
	if err := pool.QueryRow(ctx, "SELECT quota_reset_at FROM wordweave.accounts WHERE id=$1", id).Scan(&reset); err != nil {
		t.Fatal(err)
	}
	quotaHTTPExec(t, ctx, pool, "REVOKE SELECT ON wordweave.generation_runs FROM wordweave_app")
	for _, response := range []testResponse{
		getJSON(t, adminClient, endpoint),
		putJSON(t, adminClient, endpoint+"/group", csrf, map[string]any{"group_code": "pro", "confirmed": true}),
	} {
		requireStatus(t, response, 500)
		if response.body["code"] != "internal_error" || response.body["data"] != nil || strings.Contains(response.raw, "generation_runs") {
			t.Fatal("unsafe partial/detail failure")
		}
	}
	var after time.Time
	var actualGroup string
	if err := pool.QueryRow(ctx, "SELECT group_code,quota_reset_at FROM wordweave.accounts WHERE id=$1", id).Scan(&actualGroup, &after); err != nil {
		t.Fatal(err)
	}
	if actualGroup != "registered" || !reset.Equal(after) {
		t.Fatal("read failure partially committed group change")
	}
	results := getJSON(t, adminClient, application.URL+"/api/v1/admin/users?username=quota")
	requireStatus(t, results, 200)
	if strings.Contains(results.raw, "generation_quota") {
		t.Fatal("search DTO expanded")
	}
	requireStatus(t, getJSON(t, adminClient, endpoint+"/batches"), 200)
	requireStatus(t, getJSON(t, adminClient, batchEndpoint), 200)
	quotaHTTPExec(t, ctx, pool, "GRANT SELECT ON wordweave.generation_runs TO wordweave_app")
	quotaHTTPExec(t, ctx, pool, "DELETE FROM wordweave.accounts WHERE id=$1", other)
	requireStatus(t, getJSON(t, adminClient, application.URL+"/api/v1/admin/users/"+other.String()), 404)
}

func quotaHTTPExec(t *testing.T, ctx context.Context, pool *pgxpool.Pool, query string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(ctx, query, args...); err != nil {
		t.Fatal(err)
	}
}
func assertQuotaHTTP(t *testing.T, client *http.Client, endpoint, kind string, remaining int) testResponse {
	t.Helper()
	response, err := client.Get(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	if response.Header.Get("Cache-Control") != "no-store" || response.Header.Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatal("private response headers changed")
	}
	decoded := decodeResponse(t, response)
	requireStatus(t, decoded, 200)
	if err := validateAdminQuotaEnvelope([]byte(decoded.raw), false); err != nil {
		t.Fatalf("wire contract: %v", err)
	}
	value := nestedValue(t, decoded.body, "data", "user", "generation_quota")
	if kind == "" {
		if value != nil {
			t.Fatal("admin quota must be null")
		}
		return decoded
	}
	quota := value.(map[string]any)
	if quota["kind"] != kind {
		t.Fatal("quota kind mismatch")
	}
	if kind == "limited" && quota["remaining"] != float64(remaining) {
		t.Fatalf("remaining=%v want=%d", quota["remaining"], remaining)
	}
	return decoded
}
func quotaHTTPBatch(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner, runID uuid.UUID) uuid.UUID {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var batch, target uuid.UUID
	if err := tx.QueryRow(ctx, `INSERT INTO wordweave.learning_batches(owner_id,generation_run_id,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,
		meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version)
		VALUES ($1,$2,'registered','Quota fixture','test/quota','en','story','short','Learning works.',ARRAY['study'],1,'m001-v2') RETURNING id`, owner, runID).Scan(&batch); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO wordweave.batch_targets(owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,entry_meaning,hint_phrase,hint_surface,hint_start,hint_end)
		SELECT $1,$2,id,'learn',0,'gain knowledge','learning together','learning',0,8 FROM wordweave.vocabulary_entries WHERE entry='learn' RETURNING id`, owner, batch).Scan(&target); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES ($1,$2,$3,0,'learning',0,8)`, owner, batch, target); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES ($1,$2,$3,0,'Learning',0,8)`, owner, batch, target); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return batch
}
