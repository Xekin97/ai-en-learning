//go:build integration

package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
)

type boundaryHTTPFixture struct {
	ctx               context.Context
	api               *Server
	pool              *pgxpool.Pool
	client            *http.Client
	base, csrf, model string
	calls             atomic.Int32
}

func newBoundaryHTTPFixture(t *testing.T, handler http.HandlerFunc) *boundaryHTTPFixture {
	return newBoundaryHTTPFixtureWithPool(t, handler, nil)
}

func newBoundaryHTTPFixtureWithPool(t *testing.T, handler http.HandlerFunc, wrap func(*pgxpool.Pool) *pgxpool.Pool) *boundaryHTTPFixture {
	t.Helper()
	setupCtx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(setupCtx, actor.ID, "boundary-synthetic-key"); err != nil {
		t.Fatal(err)
	}
	if wrap != nil {
		pool = wrap(pool)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	t.Cleanup(cancel)
	fixture := &boundaryHTTPFixture{ctx: ctx, pool: pool, model: model.String()}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fixture.calls.Add(1)
		handler(w, r)
	}))
	t.Cleanup(upstream.Close)
	cfg.OpenRouterBaseURL = upstream.URL
	var err error
	fixture.api, err = integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewUnstartedServer(fixture.api.Handler())
	// Exercise the stream's explicit write-deadline exemption as well.
	application.Config.WriteTimeout = 5 * time.Second
	application.Start()
	t.Cleanup(application.Close)
	fixture.base = application.URL
	fixture.client = newBrowserClient(t)
	fixture.client.Timeout = 3 * time.Minute
	csrf := bootstrap(t, fixture.client, fixture.base)
	registered := postJSON(t, fixture.client, fixture.base+"/api/v1/auth/register", csrf, map[string]any{
		"username": "boundary_learner", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US",
	})
	requireStatus(t, registered, http.StatusCreated)
	fixture.csrf = dataString(t, registered.body, "csrf_token")
	return fixture
}

func (f *boundaryHTTPFixture) start(t *testing.T) *http.Response {
	t.Helper()
	return rawJSONRequest(t, f.client, http.MethodPost, f.base+"/api/v1/generations/stream", f.csrf, map[string]any{
		"model_id": f.model, "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape", "young"},
	}, nil)
}

func (f *boundaryHTTPFixture) assertSettled(t *testing.T, want string, charged bool, drafts int, callCount ...int32) {
	t.Helper()
	expectedCalls := int32(1)
	if len(callCount) > 0 {
		expectedCalls = callCount[0]
	}
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	for {
		var status string
		var quota, cumulative bool
		var actualDrafts, batches int
		err := f.pool.QueryRow(f.ctx, "SELECT call_status,quota_charged,counts_toward_cumulative,(SELECT count(*) FROM wordweave.generation_drafts),(SELECT count(*) FROM wordweave.learning_batches) FROM wordweave.generation_runs").Scan(&status, &quota, &cumulative, &actualDrafts, &batches)
		if err != nil {
			t.Fatal(err)
		}
		if status == want {
			if quota != charged || cumulative != (want == "valid" || want == "user_cancelled") || actualDrafts != drafts || batches != 0 || f.calls.Load() != expectedCalls {
				t.Fatalf("incorrect persisted outcome: %s charged=%v cumulative=%v drafts=%d batches=%d calls=%d", status, quota, cumulative, actualDrafts, batches, f.calls.Load())
			}
			return
		}
		select {
		case <-deadline.C:
			t.Fatalf("settlement remained %s; want %s", status, want)
		case <-tick.C:
		}
	}
}

func TestBoundaryOpenErrorSilentBodyHTTP(t *testing.T) {
	for _, status := range []int{401, 429, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				w.(http.Flusher).Flush()
				<-r.Context().Done()
			})
			f.client.Timeout = 2 * time.Second
			response := f.start(t)
			raw, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != 503 || strings.Contains(string(raw), "event:") {
				t.Fatal("open failure contract changed")
			}
			f.assertSettled(t, "provider_failed", false, 0)
		})
	}
}

func TestBoundarySilentStreamLifecycleHTTP(t *testing.T) {
	for _, mode := range []string{"cancel", "disconnect"} {
		t.Run(mode, func(t *testing.T) {
			closed := make(chan struct{})
			f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				w.(http.Flusher).Flush()
				<-r.Context().Done()
				close(closed)
			})
			response := f.start(t)
			defer response.Body.Close()
			scanner := bufio.NewScanner(response.Body)
			var started struct {
				RunID string `json:"run_id"`
				Token string `json:"generation_token"`
			}
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "data: ") {
					if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &started); err != nil {
						t.Fatal(err)
					}
				}
				if line == "" && started.RunID != "" {
					break
				}
			}
			if started.RunID == "" || started.Token == "" {
				t.Fatal("missing started event")
			}
			want := "stream_failed"
			charged := false
			if mode == "cancel" {
				result := rawJSONRequest(t, f.client, http.MethodPost, f.base+"/api/v1/generations/"+started.RunID+"/cancel", f.csrf, map[string]any{}, map[string]string{"X-Generation-Token": started.Token})
				requireStatus(t, decodeResponse(t, result), http.StatusOK)
				terminals := 0
				for scanner.Scan() {
					line := scanner.Text()
					if line == "event: generation.cancelled" {
						terminals++
					}
					if line == "event: generation.failed" || line == "event: generation.validated" {
						t.Error("wrong terminal after cancellation")
					}
				}
				if scanner.Err() != nil || terminals != 1 {
					t.Fatal("cancellation did not close with one terminal")
				}
				want, charged = "user_cancelled", true
			} else {
				response.Body.Close()
			}
			select {
			case <-closed:
			case <-time.After(2 * time.Second):
				t.Fatal("upstream remained blocked")
			}
			f.assertSettled(t, want, charged, 0)
		})
	}
}

func boundaryDelta(text string) string {
	return "data: " + p0HTTPJSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": text}}}}) + "\n\n"
}

func TestBoundaryPreflightFieldsHTTP(t *testing.T) {
	f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("invalid input reached provider")
		w.WriteHeader(500)
	})
	type fieldCase struct {
		name   string
		mutate func(map[string]any)
		status int
	}
	cases := []fieldCase{}
	for _, key := range []string{"model_id", "meaning_language", "scenario", "length", "entries"} {
		cases = append(cases, fieldCase{"missing_" + key, func(p map[string]any) { delete(p, key) }, 422})
	}
	for _, tc := range []struct {
		name, key string
		value     any
		status    int
	}{
		{"model_uuid", "model_id", "invalid", 422},
		{"unassigned_model", "model_id", "00000000-0000-0000-0000-000000000001", 422},
		{"language", "meaning_language", "fr", 422},
		{"scenario", "scenario", "custom", 422},
		{"length", "length", "infinite", 422},
		{"empty_entries", "entries", []string{}, 422},
		{"null_entries", "entries", nil, 422},
		{"duplicate", "entries", []string{"grape", "grape"}, 422},
		{"empty_entry", "entries", []string{""}, 422},
		{"outside_vocabulary", "entries", []string{"zzsyntheticwordzz"}, 422},
		{"case_variant", "entries", []string{"Grape"}, 422},
		{"whitespace", "entries", []string{" grape"}, 422},
		{"too_many", "entries", []string{"young", "grape", "weekend", "danger", "enforce", "learn"}, 422},
		{"prompt", "prompt", "synthetic unwanted prompt", 400},
		{"wrong_type", "entries", false, 400},
	} {
		cases = append(cases, fieldCase{tc.name, func(p map[string]any) { p[tc.key] = tc.value }, tc.status})
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			payload := map[string]any{"model_id": f.model, "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape", "young"}}
			tc.mutate(payload)
			response := rawJSONRequest(t, f.client, http.MethodPost, f.base+"/api/v1/generations/stream", f.csrf, payload, nil)
			got := decodeResponse(t, response)
			requireStatus(t, got, tc.status)
			wantCode := "validation_failed"
			if tc.status == 400 {
				wantCode = "malformed_request"
			}
			if got.body["code"] != wantCode {
				t.Fatalf("unexpected problem code: %v", got.body["code"])
			}
			var runs, drafts int
			if err := f.pool.QueryRow(f.ctx, "SELECT (SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.generation_drafts)").Scan(&runs, &drafts); err != nil {
				t.Fatal(err)
			}
			if runs != 0 || drafts != 0 || f.calls.Load() != 0 {
				t.Fatal("invalid input reserved resources or called provider")
			}
		})
	}
}

func TestBoundaryPreflightPolicyHTTP(t *testing.T) {
	for _, tc := range []struct {
		name, sql string
		status    int
		code      string
	}{
		{"disabled_model", "UPDATE wordweave.ai_models SET enabled=false", 422, "validation_failed"},
		{"unassigned_model", "DELETE FROM wordweave.group_models WHERE group_code='registered'", 422, "validation_failed"},
		{"forbidden_length", "DELETE FROM wordweave.group_lengths WHERE group_code='registered' AND length_code='short'", 422, "validation_failed"},
		{"zero_quota", "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=0 WHERE code='registered'", 429, "quota_exhausted"},
		{"no_credential", "DELETE FROM wordweave.openrouter_credentials", 503, "generation_unavailable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				t.Error("forbidden policy reached provider")
				w.WriteHeader(500)
			})
			if _, err := f.pool.Exec(f.ctx, tc.sql); err != nil {
				t.Fatal(err)
			}
			got := decodeResponse(t, f.start(t))
			requireStatus(t, got, tc.status)
			if got.body["code"] != tc.code {
				t.Fatal("wrong problem code")
			}
			var runs int
			if err := f.pool.QueryRow(f.ctx, "SELECT count(*) FROM wordweave.generation_runs").Scan(&runs); err != nil {
				t.Fatal(err)
			}
			if runs != 0 || f.calls.Load() != 0 {
				t.Fatal("forbidden policy consumed quota")
			}
		})
	}
}

func TestBoundarySlowStreamHTTP(t *testing.T) {
	if os.Getenv("WORDWEAVE_SLOW_STREAM_TESTS") != "1" {
		t.Skip("explicit 60/120-second synthetic test")
	}
	for _, duration := range []time.Duration{60 * time.Second, 120 * time.Second} {
		t.Run(duration.String(), func(t *testing.T) {
			t.Parallel()
			candidate := ai.Candidate{
				Passage: "Young(young) people share grapes(grape). " + strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ", 9)),
				Tags:    []string{"fruit"},
				Targets: []ai.CandidateTarget{
					{SourceEntry: "grape", EntryMeaning: "a small fruit", HintPhrase: "fresh grapes(grape)"},
					{SourceEntry: "young", EntryMeaning: "not old", HintPhrase: "young(young) children"},
				},
			}
			document := p0HTTPJSON(candidate)
			split := len(document) / 2
			f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, boundaryDelta(document[:split]))
				w.(http.Flusher).Flush()
				timer := time.NewTimer(duration)
				defer timer.Stop()
				select {
				case <-r.Context().Done():
					return
				case <-timer.C:
				}
				fmt.Fprint(w, boundaryDelta(document[split:])+"data: [DONE]\n\n")
			})
			began := time.Now()
			response := f.start(t)
			defer response.Body.Close()
			scanner := bufio.NewScanner(response.Body)
			var stream strings.Builder
			var final generationResultDTO
			var heartbeatTimes []time.Duration
			var firstDelta time.Duration
			event := ""
			terminals := 0
			for scanner.Scan() {
				line := scanner.Text()
				if line == ": heartbeat" {
					heartbeatTimes = append(heartbeatTimes, time.Since(began))
				}
				if strings.HasPrefix(line, "event: ") {
					event = strings.TrimPrefix(line, "event: ")
				}
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				data := []byte(strings.TrimPrefix(line, "data: "))
				switch event {
				case "passage.delta":
					var delta struct {
						Text string `json:"text"`
					}
					if err := json.Unmarshal(data, &delta); err != nil {
						t.Fatal(err)
					}
					if firstDelta == 0 {
						firstDelta = time.Since(began)
					}
					stream.WriteString(delta.Text)
				case "generation.validated":
					var result struct {
						Result generationResultDTO `json:"result"`
					}
					if err := json.Unmarshal(data, &result); err != nil {
						t.Fatal(err)
					}
					final = result.Result
					terminals++
				case "generation.failed", "generation.cancelled":
					t.Fatal("slow generation ended as failure")
				}
			}
			elapsed := time.Since(began)
			if scanner.Err() != nil {
				t.Fatal(scanner.Err())
			}
			if elapsed < duration || elapsed > duration+10*time.Second || firstDelta == 0 || firstDelta > 3*time.Second || terminals != 1 {
				t.Fatalf("timing/terminal mismatch: elapsed=%s first=%s terminal=%d", elapsed, firstDelta, terminals)
			}
			if len(heartbeatTimes) < int(duration/(15*time.Second))-1 {
				t.Fatalf("missing heartbeat: %v", heartbeatTimes)
			}
			previous := time.Duration(0)
			for _, at := range heartbeatTimes {
				interval := at - previous
				if interval < 12*time.Second || interval > 18*time.Second {
					t.Fatalf("heartbeat interval %s", interval)
				}
				previous = at
			}
			if stream.String() != final.Passage || strings.Contains(final.Passage, "(grape)") || strings.Contains(final.Passage, "(young)") || len(final.Targets) != 2 {
				t.Fatal("clean streamed result contract changed")
			}
			f.assertSettled(t, "valid", true, 1)
			t.Logf("elapsed=%s first_delta=%s heartbeat_count=%d terminal=validated stream_equals_final=true", elapsed, firstDelta, len(heartbeatTimes))
		})
	}
}
