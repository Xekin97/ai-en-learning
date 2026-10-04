//go:build integration

package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

// CR027 / BE4-V01–03: real role resolution and vocabulary reads, no live AI.
func TestVocabularySearchRolesAndBoundaries(t *testing.T) {
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	dbURL, cleanup := createTestDatabase(t, ctx, raw)
	defer cleanup()
	pool, err := postgres.Open(ctx, dbURL, "vocabulary-search-test", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	hash, err := security.HashPassword("vocabulary-test-123")
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "vocab_admin", hash, "admin")
	insertSearchAccount(t, ctx, pool, "vocab_learner", hash, "learner")
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); w.WriteHeader(500) }))
	defer provider.Close()
	api, err := integrationServer(t, integrationConfig(dbURL, provider.URL), pool)
	if err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(api.Handler())
	defer app.Close()
	admin := loginAdminForSearch(t, app.URL, "vocab_admin", "vocabulary-test-123")
	learner := loginAdminForSearch(t, app.URL, "vocab_learner", "vocabulary-test-123")
	visitor := newBrowserClient(t)
	bootstrap(t, visitor, app.URL)
	snapshot := func() []int {
		var result []int
		for _, table := range []string{"generation_runs", "preset_preview_runs", "presets", "learning_batches", "growth_ledger", "plan_trial_uses", "user_masteries"} {
			var n int
			if err := pool.QueryRow(ctx, "SELECT count(*) FROM wordweave."+table).Scan(&n); err != nil {
				t.Fatal(err)
			}
			result = append(result, n)
		}
		return result
	}
	before := snapshot()
	var canonical any
	for _, role := range []struct {
		name   string
		client *http.Client
	}{{"admin", admin}, {"learner", learner}, {"visitor", visitor}} {
		t.Run(role.name, func(t *testing.T) {
			response := getJSON(t, role.client, app.URL+"/api/v1/vocabulary/search?q=RE&limit=20")
			requireStatus(t, response, 200)
			data := response.body["data"].(map[string]any)
			if canonical == nil {
				canonical = data
			} else if !reflect.DeepEqual(canonical, data) {
				t.Fatal("role-dependent public vocabulary result")
			}
			items := data["items"].([]any)
			if len(items) != 20 || len(data) != 2 || data["vocabulary_version"] == "" {
				t.Fatalf("unexpected public projection: %v", data)
			}
			for _, item := range items {
				entry := item.(map[string]any)
				if len(entry) != 1 || !strings.HasPrefix(entry["entry"].(string), "re") {
					t.Fatalf("prefix priority or projection: %v", entry)
				}
			}
		})
	}
	options := getJSON(t, admin, app.URL+"/api/v1/admin/generation-options")
	requireStatus(t, options, 200)
	if dataString(t, options.body, "vocabulary_version") != canonical.(map[string]any)["vocabulary_version"] {
		t.Fatal("vocabulary version mismatch")
	}
	defaultPage := getJSON(t, admin, app.URL+"/api/v1/vocabulary/search?q=a")
	requireStatus(t, defaultPage, 200)
	if len(defaultPage.body["data"].(map[string]any)["items"].([]any)) != 10 {
		t.Fatal("default limit changed")
	}
	for _, word := range []string{"according to", "coup d'etat", "ought to", "owing to"} {
		result := getJSON(t, admin, app.URL+"/api/v1/vocabulary/search?q="+url.QueryEscape(strings.ToUpper(word)))
		requireStatus(t, result, 200)
		items := result.body["data"].(map[string]any)["items"].([]any)
		if len(items) == 0 || items[0].(map[string]any)["entry"] != word {
			t.Fatalf("lost complete entry %s", word)
		}
	}
	empty := getJSON(t, admin, app.URL+"/api/v1/vocabulary/search?q=zzzznomatchzzzz")
	requireStatus(t, empty, 200)
	if len(empty.body["data"].(map[string]any)["items"].([]any)) != 0 {
		t.Fatal("expected empty result")
	}
	for _, c := range []struct {
		query  string
		status int
		code   string
	}{{"q=", 422, "validation_failed"}, {"q=" + strings.Repeat("a", 65), 422, "validation_failed"}, {"q=a&limit=0", 422, "validation_failed"}, {"q=a&limit=21", 422, "validation_failed"}, {"q=a&limit=4294967297", 422, "validation_failed"}, {"q=a&limit=-4294967295", 422, "validation_failed"}, {"q=a&limit=no", 400, "malformed_request"}} {
		t.Run(c.query, func(t *testing.T) {
			response := getJSON(t, admin, app.URL+"/api/v1/vocabulary/search?"+c.query)
			requireStatus(t, response, c.status)
			if response.body["code"] != c.code {
				t.Fatal(response.body)
			}
		})
	}
	csrf := bootstrap(t, admin, app.URL)
	requireStatus(t, postJSON(t, admin, app.URL+"/api/v1/vocabulary/random", csrf, map[string]any{"selected_entries": []string{}}), 403)
	requireStatus(t, getJSON(t, admin, app.URL+"/api/v1/generation-options"), 403)
	requireStatus(t, getJSON(t, admin, app.URL+"/api/v1/me/batches"), 403)
	if !reflect.DeepEqual(before, snapshot()) || calls.Load() != 0 {
		t.Fatal("read search changed business records or called provider")
	}
	// Failure injection is confined to this newly created test database.
	if _, err := pool.Exec(ctx, "ALTER TABLE wordweave.vocabulary_entries RENAME TO vocabulary_entries_unavailable"); err != nil {
		t.Fatal(err)
	}
	failed := getJSON(t, admin, app.URL+"/api/v1/vocabulary/search?q=a")
	requireStatus(t, failed, 500)
	if failed.body["code"] != "internal_error" {
		t.Fatal(failed.body)
	}
}
