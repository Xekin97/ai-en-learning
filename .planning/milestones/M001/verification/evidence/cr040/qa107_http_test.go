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
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

// QA-only overlay: fresh observable scenarios, not a rerun of developer tests.
// Test setup creates a disposable database and simulates the pre-0007 column/
// ledger shape there. No live database, credential or provider is loaded.
func TestQA107CutoverAndCurrentMeaningHTTP(t *testing.T) {
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Fatal("isolated test DB required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	url, cleanup := createTestDatabase(t, ctx, base)
	defer cleanup()
	pool, err := postgres.Open(ctx, url, "qa107-http", 1)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { pool.Close() }()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/chat/completions" {
			http.Error(w, "unexpected request", 404)
			return
		}
		calls.Add(1)
		var request struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if json.NewDecoder(r.Body).Decode(&request) != nil {
			http.Error(w, "bad synthetic input", 400)
			return
		}
		language := "en"
		for _, message := range request.Messages {
			if strings.Contains(message.Content, `"meaning_language":"zh"`) {
				language = "zh"
			}
			if strings.Contains(message.Content, `"meaning_language":"ja"`) {
				language = "ja"
			}
			if strings.Contains(message.Content, "one contextual meaning") {
				t.Error("old prompt instruction reached provider")
			}
		}
		meanings := qa107Meanings(language)
		tag := map[string]string{"zh": "社区", "ja": "学習", "en": "community"}[language]
		passage := strings.TrimSpace("Vulnerability can call for alleviation. " + strings.Repeat("Neighbors share practical ideas and offer thoughtful support to families every day. ", 6))
		candidate := map[string]any{"passage": passage, "tags": []string{tag}, "targets": []map[string]any{
			{"source_entry": "vulnerable", "entry_meaning": meanings["vulnerable"], "hint_phrase": "vulnerable facing vulnerability", "passage_forms": []string{"vulnerability"}, "hint_forms": []string{"vulnerable", "vulnerability"}},
			{"source_entry": "alleviate", "entry_meaning": meanings["alleviate"], "hint_phrase": "alleviate difficulties", "passage_forms": []string{"alleviation"}, "hint_forms": []string{"alleviate"}},
		}}
		raw, _ := json.Marshal(candidate)
		w.Header().Set("Content-Type", "text/event-stream")
		for _, part := range []string{string(raw[:30]), string(raw[30:])} {
			frame, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]any{"content": part}, "finish_reason": nil}}})
			fmt.Fprintf(w, "data: %s\n\n", frame)
			w.(http.Flusher).Flush()
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
	}))
	defer provider.Close()
	cfg := integrationConfig(url, provider.URL)
	api, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	var adminID, modelID uuid.UUID
	password := "qa107-synthetic-password"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "INSERT INTO wordweave.accounts(username,password_hash,role,group_code) VALUES ('qa107_admin',$1,'admin',NULL) RETURNING id", hash).Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES ('QA107 synthetic','qa107/offline',true) RETURNING id").Scan(&modelID); err != nil {
		t.Fatal(err)
	}
	if err := api.credentials.Put(ctx, adminID, "qa107-synthetic-key"); err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(api.Handler())
	adminClient := newBrowserClient(t)
	adminCSRF := bootstrap(t, adminClient, app.URL)
	login := postJSON(t, adminClient, app.URL+"/api/v1/auth/login", adminCSRF, map[string]any{"username": "qa107_admin", "password": password, "browser_ui_locale": "en-US"})
	requireStatus(t, login, 200)
	oldLearner := newBrowserClient(t)
	oldCSRF := bootstrap(t, oldLearner, app.URL)
	registered := postJSON(t, oldLearner, app.URL+"/api/v1/auth/register", oldCSRF, map[string]any{"username": "qa107_learner", "password": password, "password_confirmation": password, "ui_locale": "en-US"})
	requireStatus(t, registered, 201)
	// Source-state preparation is confined to this new, disposable database.
	app.Close()
	pool.Close()
	pool, err = postgres.Open(ctx, url, "qa107-maintenance", 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "ALTER TABLE wordweave.batch_targets RENAME COLUMN entry_meaning TO contextual_meaning; DELETE FROM wordweave.schema_migrations WHERE version='0007_entry_meaning.sql'"); err != nil {
		t.Fatal(err)
	}
	var modelBefore, credentialBefore string
	if err := pool.QueryRow(ctx, "SELECT (SELECT md5(to_jsonb(t)::text) FROM wordweave.ai_models t),(SELECT md5(to_jsonb(t)::text) FROM wordweave.openrouter_credentials t)").Scan(&modelBefore, &credentialBefore); err != nil {
		t.Fatal(err)
	}
	options := postgres.CutoverOptions{WritersStopped: true, LockTimeout: time.Second, StatementTimeout: 20 * time.Second}
	if err := pool.QueryRow(ctx, "SELECT current_database(),system_identifier::text,current_user FROM pg_control_system()").Scan(&options.ExpectedDatabase, &options.ExpectedSystemID, &options.ExpectedRole); err != nil {
		t.Fatal(err)
	}
	result, err := postgres.CutoverEntryMeaning(ctx, pool, options)
	if err != nil || result.Outcome != "committed" {
		t.Fatal("cutover did not commit", err)
	}
	var modelAfter, credentialAfter string
	if err := pool.QueryRow(ctx, "SELECT (SELECT md5(to_jsonb(t)::text) FROM wordweave.ai_models t),(SELECT md5(to_jsonb(t)::text) FROM wordweave.openrouter_credentials t)").Scan(&modelAfter, &credentialAfter); err != nil {
		t.Fatal(err)
	}
	if modelBefore != modelAfter || credentialBefore != credentialAfter {
		t.Fatal("retained model or encrypted credential changed")
	}
	api, err = New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	app = httptest.NewServer(api.Handler())
	defer app.Close()
	requireStatus(t, getJSON(t, oldLearner, app.URL+"/api/v1/me/batches"), http.StatusUnauthorized)
	requireStatus(t, getJSON(t, adminClient, app.URL+"/api/v1/admin/models"), http.StatusUnauthorized)
	adminCSRF = bootstrap(t, adminClient, app.URL)
	login = postJSON(t, adminClient, app.URL+"/api/v1/auth/login", adminCSRF, map[string]any{"username": "qa107_admin", "password": password, "browser_ui_locale": "en-US"})
	requireStatus(t, login, 200)
	adminCSRF = dataString(t, login.body, "csrf_token")
	requireStatus(t, getJSON(t, adminClient, app.URL+"/api/v1/admin/models"), 200)
	t.Log("QA107-01 PASS old learner/admin sessions invalid; original administrator password and model/credential retained")

	client := newBrowserClient(t)
	csrf := bootstrap(t, client, app.URL)
	input := map[string]any{"model_id": modelID.String(), "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"vulnerable", "alleviate"}}
	requireStatus(t, postJSON(t, client, app.URL+"/api/v1/generations/stream", csrf, input), 422)
	registered = postJSON(t, client, app.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "qa107_learner", "password": password, "password_confirmation": password, "ui_locale": "en-US"})
	requireStatus(t, registered, 201)
	csrf = dataString(t, registered.body, "csrf_token")
	requireStatus(t, postJSON(t, client, app.URL+"/api/v1/generations/stream", csrf, input), 422)
	var runs int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM wordweave.generation_runs").Scan(&runs); err != nil || runs != 0 || calls.Load() != 0 {
		t.Fatal("unassigned model consumed a call or accounting event")
	}
	t.Log("QA107-02 PASS visitor/new learner preflight rejects unassigned model; zero calls and generation events")
	group := putJSON(t, adminClient, app.URL+"/api/v1/admin/groups/basic", adminCSRF, map[string]any{"rolling_24h_limit": nil, "max_entries": 5, "allowed_lengths": []string{"short", "medium", "long", "xlong"}, "model_ids": []string{modelID.String()}})
	requireStatus(t, group, 200)
	var learnerID uuid.UUID
	if err := pool.QueryRow(ctx, "SELECT id FROM wordweave.accounts WHERE username='qa107_learner'").Scan(&learnerID); err != nil {
		t.Fatal(err)
	}

	for _, language := range []string{"zh", "en", "ja"} {
		input["meaning_language"] = language
		response := rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/generations/stream", csrf, input, nil)
		if response.StatusCode != 200 {
			t.Fatal("generation failed before stream", response.StatusCode)
		}
		raw, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		events := qa107Events(t, string(raw))
		started := events["generation.started"]
		validated := events["generation.validated"]
		if validated == nil || events["generation.failed"] != nil {
			t.Fatal("candidate did not validate")
		}
		want := qa107Meanings(language)
		qa107AssertMeanings(t, validated["result"].(map[string]any)["targets"], want)
		runID := started["run_id"].(string)
		token := started["generation_token"].(string)
		saved := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/generations/"+runID+"/save", csrf, map[string]any{}, map[string]string{"X-Generation-Token": token}))
		requireStatus(t, saved, 201)
		batchID := dataString(t, saved.body, "batch_id")
		detail := getJSON(t, client, app.URL+"/api/v1/me/batches/"+batchID)
		requireStatus(t, detail, 200)
		qa107AssertMeanings(t, detail.body["data"].(map[string]any)["batch"].(map[string]any)["targets"], want)
		adminDetail := getJSON(t, adminClient, app.URL+"/api/v1/admin/users/"+learnerID.String()+"/batches/"+batchID)
		requireStatus(t, adminDetail, 200)
		qa107AssertMeanings(t, adminDetail.body["data"].(map[string]any)["batch"].(map[string]any)["targets"], want)
		session := postJSON(t, client, app.URL+"/api/v1/me/review-sessions", csrf, map[string]any{"mode": "single_batch", "batch_id": batchID})
		requireStatus(t, session, 201)
		attempt := postJSON(t, client, app.URL+"/api/v1/me/review-sessions/"+dataString(t, session.body, "session_id")+"/attempts", csrf, map[string]any{})
		requireStatus(t, attempt, 201)
		attemptID := dataString(t, attempt.body, "attempt_id")
		attemptToken := dataString(t, attempt.body, "attempt_token")
		item := attempt.body["data"].(map[string]any)["item"].(map[string]any)
		seen := map[string]bool{}
		for range 2 {
			meaning, ok := item["entry_meaning"].(string)
			if !ok || item["stage"] != "spelling" || item["contextual_meaning"] != nil {
				t.Fatal("first/next spelling contract drift")
			}
			matched := false
			for _, expected := range want {
				if meaning == expected {
					matched = true
				}
			}
			if !matched || seen[meaning] {
				t.Fatal("spelling meaning changed or duplicated")
			}
			seen[meaning] = true
			action := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/me/review-attempts/"+attemptID+"/actions", csrf, map[string]any{"action_id": uuid.NewString(), "item_id": item["item_id"], "action": "skip"}, map[string]string{"X-Review-Attempt-Token": attemptToken}))
			requireStatus(t, action, 200)
			item = action.body["data"].(map[string]any)["item"].(map[string]any)
		}
		if item["stage"] != "passage_cloze" || item["entry_meaning"] != nil || item["entry"] != nil {
			t.Fatal("stage two leaked definition/source")
		}
		t.Logf("QA107-03/%s PASS one synthetic call -> SSE -> saved learner/admin detail -> both spelling items; original definitions unchanged", language)
	}
	if calls.Load() != 3 {
		t.Fatalf("synthetic calls=%d want exactly 3", calls.Load())
	}
}

func qa107Meanings(language string) map[string]string {
	switch language {
	case "zh":
		return map[string]string{"vulnerable": "易受伤害的；脆弱的", "alleviate": "缓解；减轻"}
	case "ja":
		return map[string]string{"vulnerable": "傷つきやすい；弱い", "alleviate": "和らげる；軽減する"}
	default:
		return map[string]string{"vulnerable": "open to harm; easily injured", "alleviate": "make pain or difficulty less severe"}
	}
}
func qa107Events(t *testing.T, raw string) map[string]map[string]any {
	t.Helper()
	events := map[string]map[string]any{}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	name := ""
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			name = strings.TrimPrefix(line, "event: ")
		}
		if strings.HasPrefix(line, "data: ") {
			var value map[string]any
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &value) != nil {
				t.Fatal("invalid SSE JSON")
			}
			events[name] = value
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return events
}
func qa107AssertMeanings(t *testing.T, raw any, want map[string]string) {
	t.Helper()
	got := map[string]string{}
	for _, value := range raw.([]any) {
		target := value.(map[string]any)
		if target["contextual_meaning"] != nil {
			t.Fatal("old output key")
		}
		entry := target["entry"].(string)
		meaning, ok := target["entry_meaning"].(string)
		if !ok {
			t.Fatal("new meaning absent")
		}
		got[entry] = meaning
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("meanings changed in projection")
	}
}
