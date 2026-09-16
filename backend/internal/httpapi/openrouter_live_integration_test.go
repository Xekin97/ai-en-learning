//go:build integration && liveintegration

package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"wordweave/internal/ai"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

// TestOpenRouterLiveMatrix is an opt-in provider smoke test. It uses an isolated
// temporary database, exercises the same encrypted credential/admin/model/group
// and learner generation APIs as production, and never logs the supplied API key.
func TestOpenRouterLiveMatrix(t *testing.T) {
	apiKey := os.Getenv("OPENROUTER_TEST_API_KEY")
	modelName := os.Getenv("OPENROUTER_TEST_MODEL")
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if apiKey == "" || modelName == "" || databaseURL == "" {
		t.Skip("OPENROUTER_TEST_API_KEY, OPENROUTER_TEST_MODEL, and TEST_DATABASE_URL are required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()
	testURL, cleanupDatabase := createTestDatabase(t, ctx, databaseURL)
	defer cleanupDatabase()

	pool, err := postgres.Open(ctx, testURL, "wordweave-openrouter-live", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	assertSeedBaseline(t, ctx, pool)

	cfg := integrationConfig(testURL, "https://openrouter.ai/api/v1")
	apiServer, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	apiServer.SetReady(true)
	application := newLiveApplicationServer(t, apiServer.Handler())
	defer application.Close()

	adminPassword := "live-admin-password-123"
	adminHash, err := security.HashPassword(adminPassword)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO wordweave.accounts(username,password_hash,role,group_code)
		VALUES ('live_openrouter_admin',$1,'admin',NULL)`, adminHash); err != nil {
		t.Fatal(err)
	}

	adminClient := newBrowserClient(t)
	adminClient.Timeout = 3 * time.Minute
	adminCSRF := bootstrap(t, adminClient, application.URL)
	login := postJSON(t, adminClient, application.URL+"/api/v1/auth/login", adminCSRF, map[string]any{
		"username": "live_openrouter_admin", "password": adminPassword, "browser_ui_locale": "en-US",
	})
	requireStatus(t, login, http.StatusOK)
	adminCSRF = dataString(t, login.body, "csrf_token")

	credentialStarted := time.Now()
	credential := putJSON(t, adminClient, application.URL+"/api/v1/admin/openrouter-credential", adminCSRF, map[string]any{
		"api_key": apiKey, "confirmed": true,
	})
	requireStatus(t, credential, http.StatusOK)
	if strings.Contains(credential.raw, apiKey) || !dataBool(t, credential.body, "configured") {
		t.Fatal("credential projection leaked the key or was not configured")
	}
	t.Logf("credential validation passed in %s", time.Since(credentialStarted).Round(time.Millisecond))

	createdModel := postJSON(t, adminClient, application.URL+"/api/v1/admin/models", adminCSRF, map[string]any{
		"display_name": "OpenRouter live smoke model", "description": "Ephemeral live compatibility test", "openrouter_model_id": modelName,
	})
	requireStatus(t, createdModel, http.StatusCreated)
	modelID := nestedString(t, createdModel.body, "data", "model", "id")

	compatibilityStarted := time.Now()
	if os.Getenv("OPENROUTER_TEST_BYPASS_COMPATIBILITY") == "1" {
		if _, err := pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=true WHERE id=$1`, modelID); err != nil {
			t.Fatal(err)
		}
		t.Log("model compatibility was bypassed for sample capture after a separately completed live compatibility check")
	} else {
		enabledModel := postJSON(t, adminClient, application.URL+"/api/v1/admin/models/"+modelID+"/enable", adminCSRF, map[string]any{})
		requireStatus(t, enabledModel, http.StatusOK)
		if !nestedBool(t, enabledModel.body, "data", "model", "enabled") {
			t.Fatal("live model compatibility check did not enable the model")
		}
		t.Logf("model compatibility passed for %s in %s", modelName, time.Since(compatibilityStarted).Round(time.Millisecond))
	}

	group := putJSON(t, adminClient, application.URL+"/api/v1/admin/groups/basic", adminCSRF, map[string]any{
		"rolling_24h_limit": nil,
		"max_entries":       5,
		"allowed_lengths":   []string{"short", "medium", "long", "xlong"},
		"model_ids":         []string{modelID},
	})
	requireStatus(t, group, http.StatusOK)

	learnerClient := newBrowserClient(t)
	learnerClient.Timeout = 6 * time.Minute
	learnerCSRF := bootstrap(t, learnerClient, application.URL)
	registered := postJSON(t, learnerClient, application.URL+"/api/v1/auth/register", learnerCSRF, map[string]any{
		"username": "live_openrouter_learner", "password": "live-learner-password-123",
		"password_confirmation": "live-learner-password-123", "ui_locale": "zh-CN",
	})
	requireStatus(t, registered, http.StatusCreated)
	learnerCSRF = dataString(t, registered.body, "csrf_token")

	testCases := []struct {
		name            string
		meaningLanguage string
		scenario        string
		length          string
		minimumWords    int
		entries         []string
	}{
		{name: "zh_story_short", meaningLanguage: "zh", scenario: "story", length: "short", minimumWords: 50, entries: []string{"learn", "weave"}},
		{name: "en_discussion_medium", meaningLanguage: "en", scenario: "discussion", length: "medium", minimumWords: 100, entries: []string{"build", "change"}},
		{name: "ja_business_long", meaningLanguage: "ja", scenario: "business", length: "long", minimumWords: 200, entries: []string{"market", "plan"}},
		{name: "zh_news_xlong", meaningLanguage: "zh", scenario: "news", length: "xlong", minimumWords: 400, entries: []string{"policy", "future"}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			started := time.Now()
			response := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/stream", learnerCSRF, map[string]any{
				"model_id": modelID, "meaning_language": testCase.meaningLanguage,
				"scenario": testCase.scenario, "length": testCase.length, "entries": testCase.entries,
			}, nil)
			if response.StatusCode != http.StatusOK {
				raw, _ := io.ReadAll(io.LimitReader(response.Body, 64<<10))
				response.Body.Close()
				t.Fatalf("generation status=%d body=%s", response.StatusCode, raw)
			}

			result := readLiveGenerationSSE(t, response.Body)
			response.Body.Close()
			assertLiveGenerationResult(t, result, testCase.entries, testCase.minimumWords)
			t.Logf(
				"validated language=%s scenario=%s length=%s words=%d targets=%d tags=%q first_delta=%s total=%s passage=%q",
				testCase.meaningLanguage, testCase.scenario, testCase.length,
				ai.CountWords(result.Passage), len(result.Targets), result.Tags,
				result.FirstDelta.Round(time.Millisecond), time.Since(started).Round(time.Millisecond), passagePreview(result.Passage),
			)
			if os.Getenv("OPENROUTER_TEST_LOG_RESULTS") == "1" {
				t.Logf("OPENROUTER_SAMPLE[%s]=%s", testCase.name, result.ResultJSON)
			}
		})
	}
}

type liveApplicationServer struct {
	URL   string
	Close func()
}

func newLiveApplicationServer(t *testing.T, handler http.Handler) liveApplicationServer {
	t.Helper()
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	listener := newLocalListener(t)
	go func() {
		_ = server.Serve(listener)
	}()
	return liveApplicationServer{
		URL: "http://" + listener.Addr().String(),
		Close: func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = server.Shutdown(ctx)
		},
	}
}

type liveGenerationResult struct {
	Passage     string
	Tags        []string
	Targets     []map[string]any
	Streamed    string
	FirstDelta  time.Duration
	RawTerminal string
	ResultJSON  string
}

func readLiveGenerationSSE(t *testing.T, body io.Reader) liveGenerationResult {
	t.Helper()
	started := time.Now()
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64<<10), 4<<20)
	var event string
	var streamed strings.Builder
	var firstDelta time.Duration
	var result liveGenerationResult
	foundStarted := false
	foundTerminal := false

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			event = strings.TrimPrefix(line, "event: ")
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		raw := strings.TrimPrefix(line, "data: ")
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			t.Fatalf("decode SSE %s payload: %v", event, err)
		}
		switch event {
		case "generation.started":
			foundStarted = payload["run_id"] != "" && payload["generation_token"] != ""
		case "passage.delta":
			if firstDelta == 0 {
				firstDelta = time.Since(started)
			}
			text, _ := payload["text"].(string)
			streamed.WriteString(text)
		case "generation.failed":
			t.Fatalf("generation failed: code=%v retryable=%v", payload["code"], payload["retryable"])
		case "generation.cancelled":
			t.Fatal("generation was unexpectedly cancelled")
		case "generation.validated":
			encoded, err := json.Marshal(payload["result"])
			if err != nil {
				t.Fatal(err)
			}
			var terminal struct {
				Passage string           `json:"passage"`
				Tags    []string         `json:"tags"`
				Targets []map[string]any `json:"targets"`
			}
			if err := json.Unmarshal(encoded, &terminal); err != nil {
				t.Fatal(err)
			}
			result.Passage, result.Tags, result.Targets = terminal.Passage, terminal.Tags, terminal.Targets
			result.RawTerminal = raw
			result.ResultJSON = string(encoded)
			foundTerminal = true
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if !foundStarted || !foundTerminal {
		t.Fatalf("stream missing lifecycle event: started=%v validated=%v", foundStarted, foundTerminal)
	}
	result.Streamed = streamed.String()
	result.FirstDelta = firstDelta
	return result
}

func assertLiveGenerationResult(t *testing.T, result liveGenerationResult, entries []string, minimumWords int) {
	t.Helper()
	if result.Passage == "" || result.Streamed != result.Passage {
		t.Fatalf("streamed passage does not exactly match terminal passage: streamed=%d terminal=%d", len(result.Streamed), len(result.Passage))
	}
	if result.FirstDelta <= 0 {
		t.Fatal("stream did not emit a passage delta before validation")
	}
	if words := ai.CountWords(result.Passage); words < minimumWords {
		t.Fatalf("passage words=%d minimum=%d", words, minimumWords)
	}
	if len(result.Tags) < 1 || len(result.Tags) > 3 || len(result.Targets) != len(entries) {
		t.Fatalf("unexpected result cardinality: tags=%d targets=%d", len(result.Tags), len(result.Targets))
	}
	for index, target := range result.Targets {
		if target["entry"] != entries[index] {
			t.Fatalf("target %d entry=%v want=%s", index, target["entry"], entries[index])
		}
		for _, field := range []string{"entry_meaning", "hint_phrase", "hint_blanks", "occurrences"} {
			if target[field] == nil {
				t.Fatalf("target %d omitted %s", index, field)
			}
		}
		if _, stale := target["hint_blank"]; stale {
			t.Fatalf("target %d exposed stale singular hint_blank", index)
		}
		if _, leaked := target["hint_surface"]; leaked {
			t.Fatalf("target %d leaked hint_surface", index)
		}
	}
	if strings.Contains(result.RawTerminal, "generation_token") || strings.Contains(result.RawTerminal, "provider_model_id") {
		t.Fatal("validated terminal event leaked a capability or provider model ID")
	}
}

func passagePreview(passage string) string {
	const limit = 140
	value := []rune(passage)
	if len(value) <= limit {
		return passage
	}
	return string(value[:limit]) + "…"
}

func newLocalListener(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	return listener
}
