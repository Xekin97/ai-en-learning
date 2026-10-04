//go:build integration

package httpapi

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"wordweave/internal/platform/security"
)

func TestM002AdminPresetHTTPPreviewAndVisitorFlow(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "integration-secret-key"); err != nil {
		t.Fatal(err)
	}
	provider := newFakeOpenRouter(t)
	defer provider.Close()
	cfg.OpenRouterBaseURL = provider.URL
	api, err := integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := security.HashPassword("m002-admin-password")
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "m002_admin", hash, "admin")
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	visitor := newBrowserClient(t)
	visitorCSRF := bootstrap(t, visitor, application.URL)
	denied := getJSON(t, visitor, application.URL+"/api/v1/admin/generation-options")
	requireStatus(t, denied, http.StatusUnauthorized)
	admin := loginAdminForSearch(t, application.URL, "m002_admin", "m002-admin-password")
	csrf := bootstrap(t, admin, application.URL)
	options := getJSON(t, admin, application.URL+"/api/v1/admin/generation-options")
	requireStatus(t, options, 200)
	data := options.body["data"].(map[string]any)
	if len(data) != 7 || data["quota"] != nil || data["max_entries"] != nil || strings.Contains(options.raw, "provider_model_id") || len(data["lengths"].([]any)) != 4 {
		t.Fatalf("admin DTO leaked ordinary rights: %s", options.raw)
	}
	create := postJSON(t, admin, application.URL+"/api/v1/admin/presets", csrf, map[string]any{"title": "Learning together", "configuration": map[string]any{"model_id": model.String(), "entries": []string{"learn"}, "meaning_language": "en", "scenario": "story", "length": "short"}})
	requireStatus(t, create, 201)
	id := nestedString(t, create.body, "data", "preset", "id")
	version := nestedString(t, create.body, "data", "preset", "draft_version")
	stream := rawJSONRequest(t, admin, http.MethodPost, application.URL+"/api/v1/admin/presets/"+id+"/previews/stream", csrf, map[string]any{"draft_version": version}, nil)
	if stream.StatusCode != 200 {
		raw, _ := io.ReadAll(stream.Body)
		stream.Body.Close()
		t.Fatalf("preview status=%d %s", stream.StatusCode, raw)
	}
	scanner := bufio.NewScanner(stream.Body)
	event := ""
	valid := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event:") {
			event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		}
		if strings.HasPrefix(line, "data:") {
			var value map[string]any
			if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &value); err != nil {
				t.Fatal(err)
			}
			if value["generation_token"] != nil || value["quota_refunded"] != nil {
				t.Fatal("preview exposed user-generation fields")
			}
			if event == "preview.validated" {
				valid = true
				usage := value["usage"].(map[string]any)
				if usage["provider_calls"].(float64) != 1 || usage["cost"] != nil || usage["input_tokens"] != nil || usage["unknown_calls"].(float64) != 1 {
					t.Fatalf("fabricated unknown provider usage: %+v", usage)
				}
			}
			if event == "preview.failed" {
				t.Fatalf("preview failed: %+v", value)
			}
		}
	}
	stream.Body.Close()
	if scanner.Err() != nil || !valid {
		t.Fatal("preview never validated")
	}
	var runs int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_runs`).Scan(&runs); err != nil || runs != 0 {
		t.Fatal("admin preview became a user generation")
	}
	current := getJSON(t, admin, application.URL+"/api/v1/admin/presets/"+id)
	requireStatus(t, current, 200)
	published := postJSON(t, admin, application.URL+"/api/v1/admin/presets/"+id+"/publish", csrf, map[string]any{"draft_version": version, "expected_revision": dataString(t, current.body, "revision"), "confirmed": true})
	requireStatus(t, published, 200)
	detail := getJSON(t, visitor, application.URL+"/api/v1/presets/"+id)
	requireStatus(t, detail, 200)
	if !dataBool(t, detail.body, "can_start") {
		t.Fatal("visitor preset exception unavailable")
	}
	override := postJSON(t, visitor, application.URL+"/api/v1/presets/"+id+"/generations/stream", visitorCSRF, map[string]any{"published_version": version, "entries": []string{"wrong"}})
	requireStatus(t, override, 400)
	generated := rawJSONRequest(t, visitor, http.MethodPost, application.URL+"/api/v1/presets/"+id+"/generations/stream", visitorCSRF, map[string]any{"published_version": version}, nil)
	if generated.StatusCode != 200 {
		raw, _ := io.ReadAll(generated.Body)
		generated.Body.Close()
		t.Fatalf("visitor generation %d %s", generated.StatusCode, raw)
	}
	run, token, ok := readGenerationSSE(t, generated.Body)
	generated.Body.Close()
	if !ok {
		t.Fatal("visitor preset failed")
	}
	claim := decodeResponse(t, rawJSONRequest(t, visitor, http.MethodPost, application.URL+"/api/v1/generations/"+run+"/visitor-claim", visitorCSRF, map[string]any{}, map[string]string{"X-Generation-Token": token}))
	requireStatus(t, claim, 200)
	if dataString(t, claim.body, "claim_token") == "" {
		t.Fatal("lost registration handoff")
	}
}
