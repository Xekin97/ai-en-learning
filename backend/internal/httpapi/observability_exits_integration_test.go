//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/generation"
	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

// Fault injection belongs to the test-only pool, not production service hooks.
// The matching real pgx operation gets a cancelled context; all other SQL and
// transaction cleanup use their original contexts. No persistent database fault.
type obsSQLFault struct {
	needle string
	hits   atomic.Int32
}

func (f *obsSQLFault) TraceQueryStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	if strings.Contains(strings.Join(strings.Fields(d.SQL), " "), f.needle) {
		f.hits.Add(1)
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		return cancelled
	}
	return ctx
}
func (*obsSQLFault) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}
func obsFaultPool(t *testing.T, pool *pgxpool.Pool, needle string) (*pgxpool.Pool, *obsSQLFault) {
	t.Helper()
	cfg := pool.Config()
	if !strings.HasPrefix(cfg.ConnConfig.Database, "wordweave_test_") {
		t.Fatal("not an isolated test database")
	}
	fault := &obsSQLFault{needle: needle}
	cfg.ConnConfig.Tracer = fault
	p, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Close)
	return p, fault
}
func obsCheckFailure(t *testing.T, r *tracetest.Recorder, stage gt.Stage, check string, err error) gt.Summary {
	t.Helper()
	_, summaries := r.Read()
	if err == nil || len(summaries) != 1 {
		t.Fatal("missing injected failure/summary", err)
	}
	s := summaries[0]
	if s.FirstFailure == nil || s.FirstFailure.Stage != stage.String() || s.FirstFailure.Check != check {
		t.Fatalf("wrong failure point: want %s/%s got %+v", stage.String(), check, s.FirstFailure)
	}
	if s.Outcome != "unknown" || s.Refunded {
		t.Fatal("unconfirmed business outcome invented")
	}
	raw, _ := json.Marshal(s)
	if strings.Contains(string(raw), "synthetic-private") {
		t.Fatal("private error reflected")
	}
	return s
}
func TestOBS042DPreflightAndDraftSQLExits(t *testing.T) {
	cases := []struct {
		name, needle, check string
		draft               bool
	}{
		{"start_begin", "begin", "transaction_begin", false},
		{"actor_lock", "FROM wordweave.accounts", "actor_lock", false},
		{"group_read", "FROM wordweave.entitlement_groups", "group_policy", false},
		{"model_read", "FROM wordweave.ai_models", "model_assignment", false},
		{"length_read", "FROM wordweave.group_lengths", "length_assignment", false},
		{"vocabulary_read", "FROM wordweave.vocabulary_entries", "vocabulary", false},
		{"quota_read", "SELECT count(*)", "quota", false},
		{"reserve_insert", "INSERT INTO wordweave.generation_runs", "reserve", false},
		{"entry_insert", "INSERT INTO wordweave.generation_run_entries", "entries", false},
		{"start_commit", "commit", "transaction_commit", false},
		{"draft_begin", "begin", "transaction_begin", true},
		{"draft_cas", "UPDATE wordweave.generation_runs", "cas", true},
		{"draft_insert", "INSERT INTO wordweave.generation_drafts", "draft_insert", true},
		{"draft_commit", "commit", "transaction_commit", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx, api, pool, actor, model, cfg := cr039Harness(t)
			if err := api.credentials.Put(ctx, actor.ID, "synthetic-private-provider-key"); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=50 WHERE code='registered'"); err != nil {
				t.Fatal(err)
			}
			p, fault := obsFaultPool(t, pool, tc.needle)
			service := generation.NewService(p, api.credentials, api.generation.Provider(), cfg.CapabilityKey, cfg.DraftTTL, api.generation.Validator())
			var run generation.Run
			if tc.draft {
				run = cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
			}
			var unobserved error
			for _, on := range []bool{false, true} {
				recorder := &tracetest.Recorder{}
				trace := gt.New("req_sql_fault", recorder)
				active := ctx
				if on {
					active = gt.With(ctx, trace)
				}
				var err error
				stage := gt.Preflight
				if tc.draft {
					stage = gt.DraftCommit
					err = service.CompleteValid(active, run, cr039Snapshot(t))
				} else {
					_, err = service.Start(active, actor, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"grape"}})
				}
				if !on {
					unobserved = err
					continue
				}
				trace.Finish()
				s := obsCheckFailure(t, recorder, stage, tc.check, err)
				if err.Error() != unobserved.Error() || !errors.Is(err, context.Canceled) || s.FirstFailure.State != gt.Cancelled {
					t.Fatal("observer changed injected error", err, unobserved, s.FirstFailure)
				}
				if s.Stages[gt.ProviderOpen].State != gt.NotRun || s.RunID != "" {
					t.Fatal("provider/run falsely reported")
				}
			}
			if fault.hits.Load() != 2 {
				t.Fatalf("fault did not hit exactly twice: %d", fault.hits.Load())
			}
			var runs, drafts int
			if err := pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.generation_drafts)").Scan(&runs, &drafts); err != nil {
				t.Fatal(err)
			}
			want := 0
			if tc.draft {
				want = 1
			}
			if runs != want || drafts != 0 {
				t.Fatalf("fault committed partial data: %d/%d", runs, drafts)
			}
			if tc.draft {
				assertRefundRow(t, ctx, pool, run.ID, "active", true, false)
			}
		})
	}
}
func TestOBS042DCredentialAndPreparationExits(t *testing.T) {
	for _, name := range []string{"missing", "database", "decrypt", "token", "snapshot", "request_create"} {
		t.Run(name, func(t *testing.T) {
			ctx, api, pool, actor, model, cfg := cr039Harness(t)
			if name != "missing" {
				if err := api.credentials.Put(ctx, actor.ID, "synthetic-private-provider-key"); err != nil {
					t.Fatal(err)
				}
			}
			credentials := api.credentials
			if name == "database" {
				p, _ := obsFaultPool(t, pool, "FROM wordweave.openrouter_credentials")
				env, _ := security.NewEnvelope(cfg.MasterKeys, cfg.CurrentKey)
				credentials = ai.NewCredentialStore(p, env)
			}
			if name == "decrypt" {
				if _, err := pool.Exec(ctx, "UPDATE wordweave.openrouter_credentials SET ciphertext=set_byte(ciphertext,0,(get_byte(ciphertext,0)+1)%256)"); err != nil {
					t.Fatal(err)
				}
			}
			key := cfg.CapabilityKey
			if name == "token" {
				key = []byte("short")
			}
			service := generation.NewService(pool, credentials, api.generation.Provider(), key, cfg.DraftTTL, api.generation.Validator())
			for _, stage := range []gt.Stage{gt.Preflight, gt.ProviderOpen} {
				if (name == "token" || name == "snapshot") && stage == gt.ProviderOpen || name == "request_create" && stage == gt.Preflight {
					continue
				}
				recorder := &tracetest.Recorder{}
				trace := gt.New("req_prepare_failure", recorder)
				active := gt.With(ctx, trace)
				var err error
				check := "credentials"
				switch {
				case name == "snapshot":
					stage = gt.DraftCommit
					check = "snapshot"
					err = service.CompleteValid(active, generation.Run{}, ai.ValidatedBatch{})
				case stage == gt.Preflight:
					if name == "token" {
						check = "token"
					}
					_, err = service.Start(active, actor, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"grape"}})
				default:
					base := "http://127.0.0.1:1"
					if name == "request_create" {
						base = "http://[bad"
						check = "request_create"
					}
					provider := ai.NewOpenRouter(base, cfg.PublicOrigin, credentials, api.generation.Validator())
					_, err = provider.Open(active, ai.GenerationSpec{Entries: []string{"grape"}})
				}
				trace.Finish()
				obsCheckFailure(t, recorder, stage, check, err)
			}
		})
	}
}
func TestOBS042DT2LostCommitReceiptRemainsUnconfirmedButCorrelated(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "synthetic-private-provider-key"); err != nil {
		t.Fatal(err)
	}
	proxy, p := newCommitAckProxy(t, pool, "COMMIT")
	service := generation.NewService(p, api.credentials, api.generation.Provider(), cfg.CapabilityKey, cfg.DraftTTL, api.generation.Validator())
	recorder := &tracetest.Recorder{}
	trace := gt.New("req_unknown_t2", recorder)
	proxy.armed.Store(true)
	run, err := service.Start(gt.With(ctx, trace), actor, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"grape"}})
	trace.Finish()
	s := obsCheckFailure(t, recorder, gt.Preflight, "transaction_commit", err)
	if proxy.dropped.Load() != 1 || run.Token != "" || s.RunID != "" {
		t.Fatal("commit receipt fault or public success changed")
	}
	var persisted string
	var charged bool
	if err := pool.QueryRow(ctx, "SELECT id::text,quota_charged FROM wordweave.generation_runs").Scan(&persisted, &charged); err != nil {
		t.Fatal(err)
	}
	if !charged {
		t.Fatal("observer changed persisted quota")
	}
	events, _ := recorder.Read()
	seen := false
	for _, e := range events {
		if e.Kind == "preflight_commit_unknown" {
			seen = e.RelatedRunID == persisted
		}
	}
	if !seen {
		t.Fatal("persisted uncertain T2 cannot be correlated")
	}
}
func TestOBS042DRealTimerHeartbeatWriteFailure(t *testing.T) {
	f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	})
	var logs p0LogBuffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(previous)
	// The full handler's genuine 15-second ticker must reach the failing writer.
	request := obsGenerationRequest(t, f)
	w := &obsHeartbeatWriter{ResponseRecorder: httptest.NewRecorder()}
	started := time.Now()
	f.api.Handler().ServeHTTP(w, request)
	if !w.failed || time.Since(started) < 14*time.Second {
		t.Fatal("real heartbeat was not exercised")
	}
	f.assertSettled(t, "stream_failed", false, 0)
	s := obsSummary(t, &logs)
	if s.FirstFailure == nil || s.FirstFailure.Stage != "delivery" || s.FirstFailure.Check != "heartbeat" || s.Outcome != "failed" || !s.Refunded {
		t.Fatalf("heartbeat evidence missing: %+v", s)
	}
}

func obsGenerationRequest(t *testing.T, f *boundaryHTTPFixture) *http.Request {
	t.Helper()
	body := p0HTTPJSON(map[string]any{"model_id": f.model, "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape", "young"}})
	r := httptest.NewRequest(http.MethodPost, f.base+"/api/v1/generations/stream", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "http://wordweave.test")
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.Header.Set("X-CSRF-Token", f.csrf)
	address, _ := url.Parse(f.base)
	for _, cookie := range f.client.Jar.Cookies(address) {
		r.AddCookie(cookie)
	}
	return r
}

type obsHeartbeatWriter struct {
	*httptest.ResponseRecorder
	failed bool
}

func (w *obsHeartbeatWriter) Write(p []byte) (int, error) {
	if strings.HasPrefix(string(p), ": heartbeat") {
		w.failed = true
		return 0, errors.New("synthetic-private-heartbeat")
	}
	return w.ResponseRecorder.Write(p)
}
func TestOBS042DSettlementReadbackAndGuards(t *testing.T) {
	for _, mode := range []string{"refund_readback", "cancel_readback", "cancel_gone", "cancel_bad_id", "cancel_bad_token", "refund_bad_status", "failure_bad_status"} {
		t.Run(mode, func(t *testing.T) {
			ctx, api, pool, actor, model, cfg := cr039Harness(t)
			run := cr039SeedRun(t, ctx, api, pool, actor, model, "grape")
			service := api.generation
			var fault *obsSQLFault
			if strings.HasSuffix(mode, "readback") {
				var p *pgxpool.Pool
				p, fault = obsFaultPool(t, pool, "wordweave.generation_runs")
				service = generation.NewService(p, api.credentials, api.generation.Provider(), cfg.CapabilityKey, cfg.DraftTTL, api.generation.Validator())
				service.Registry().Register(run.ID, actor, run.Token)
			}
			recorder := &tracetest.Recorder{}
			trace := gt.New("req_settlement_guard", recorder)
			trace.BindRun(run.ID.String(), model.String())
			service.Registry().AttachTrace(run.ID, trace)
			var stopped atomic.Int32
			service.Registry().SetCancel(run.ID, func() { stopped.Add(1) })
			var err error
			switch mode {
			case "refund_readback", "refund_bad_status":
				status := "validation_failed"
				if mode == "refund_bad_status" {
					status = "synthetic-private-status"
				}
				out, e := service.ReconcileFailure(ctx, run.ID, status, "content_validation_failed")
				err = e
				if out.Status != "pending" || out.QuotaRefunded || out.Transitioned {
					t.Fatal("unconfirmed refund reported")
				}
			case "failure_bad_status":
				err = service.CompleteFailure(ctx, run.ID, "synthetic-private-status", "unused")
			default:
				id, token := run.ID.String(), run.Token
				if mode == "cancel_gone" {
					if _, err = pool.Exec(ctx, "DELETE FROM wordweave.generation_runs WHERE id=$1", run.ID); err != nil {
						t.Fatal(err)
					}
				}
				if mode == "cancel_bad_id" {
					id = "synthetic-private-id"
				}
				if mode == "cancel_bad_token" {
					token = "synthetic-private-token"
				}
				out, e := service.Cancel(ctx, actor, id, token)
				err = e
				if out.Status != "" || out.QuotaRefunded {
					t.Fatal("unconfirmed cancellation reported")
				}
			}
			trace.Finish()
			if err == nil || stopped.Load() != 0 {
				t.Fatal("failed cancel stopped provider or guard missed")
			}
			if mode != "cancel_gone" {
				assertRefundRow(t, ctx, pool, run.ID, "active", true, false)
			}
			events, summaries := recorder.Read()
			s := summaries[0]
			if s.Outcome != "unknown" || s.Refunded {
				t.Fatal("unknown outcome fabricated")
			}
			if strings.HasSuffix(mode, "readback") {
				if fault.hits.Load() != 2 || !s.Pending || s.FirstFailure == nil || s.FirstFailure.Stage != "settlement" {
					t.Fatal("CAS and readback failures not recorded")
				}
				found := false
				for _, e := range events {
					if e.Kind == "fact" && e.Fact.Check == "confirm" && e.Fact.Detail.Reason == "transaction_unknown" {
						found = true
					}
				}
				if !found {
					t.Fatal("readback attempt missing")
				}
			}
			raw, _ := json.Marshal(events)
			if strings.Contains(string(raw), "synthetic-private") {
				t.Fatal("private parameter leaked")
			}
		})
	}
}
func TestOBS042DIdentityFallbackAndFailureFacts(t *testing.T) {
	for _, mode := range []string{"expired_session", "expired_visitor", "session_database", "visitor_database"} {
		t.Run(mode, func(t *testing.T) {
			ctx, api, pool, _, _, cfg := cr039Harness(t)
			check := "session_resolve"
			cookieName := api.sessionCookieName()
			reason := "actor_forbidden"
			shouldContinue := true
			var fault *obsSQLFault
			if strings.Contains(mode, "visitor") {
				check = "visitor_resolve"
				cookieName = api.visitorCookieName()
			}
			if strings.Contains(mode, "database") {
				needle := "FROM wordweave.account_sessions"
				if check == "visitor_resolve" {
					needle = "wordweave.visitor_identities"
					shouldContinue = false
				}
				var p *pgxpool.Pool
				p, fault = obsFaultPool(t, pool, needle)
				api.identity = identity.NewService(p, cfg.SessionPepper)
				reason = "context_cancelled"
			}
			recorder := &tracetest.Recorder{}
			trace := gt.New("req_identity", recorder)
			request := httptest.NewRequest(http.MethodPost, "/api/v1/generations/stream", nil)
			request = request.WithContext(gt.With(ctx, trace))
			request.AddCookie(&http.Cookie{Name: cookieName, Value: "synthetic-private-invalid-cookie"})
			called := false
			writer := httptest.NewRecorder()
			api.resolveActor(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				called = true
				actor, ok := r.Context().Value(actorKey).(identity.Actor)
				if !ok || !actor.IsVisitor() {
					t.Fatal("existing visitor fallback changed")
				}
			})).ServeHTTP(writer, request)
			trace.End(gt.Request, gt.OK, gt.Why(""))
			trace.Finish()
			if called != shouldContinue {
				t.Fatalf("identity behavior changed: %s %d", mode, writer.Code)
			}
			if fault != nil && fault.hits.Load() == 0 {
				t.Fatal("SQL injection missed target")
			}
			events, summaries := recorder.Read()
			found := false
			for _, e := range events {
				if e.Kind == "fact" && e.Fact.Check == check && e.Fact.Detail.Reason == reason {
					found = true
				}
			}
			if !found {
				t.Fatalf("identity cause missing: %+v", events)
			}
			s := summaries[0]
			if shouldContinue && s.FirstFailure != nil {
				t.Fatal("recoverable cookie failure incorrectly ended request")
			}
			if !shouldContinue && (writer.Code != http.StatusServiceUnavailable || s.FirstFailure == nil || s.FirstFailure.Check != "identity" || s.FirstFailure.Detail.Reason != "identity_unavailable") {
				t.Fatal("identity outage not isolated")
			}
			if s.Stages[gt.Preflight].State != gt.NotRun || s.RunID != "" {
				t.Fatal("invented provider/run")
			}
			raw, _ := json.Marshal(events)
			if strings.Contains(string(raw), "synthetic-private") {
				t.Fatal("cookie reflected")
			}
		})
	}
}
