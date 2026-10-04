//go:build integration

package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"wordweave/internal/ai"
	"wordweave/internal/platform/security"
)

func TestGenericModelHTTPAuthorizationSaveAndExplicitProbe(t *testing.T) {
	ctx, _, pool, _, _, cfg := cr039Harness(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var input map[string]any
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Error(err)
		}
		if input["model"] != "Vendor/Exact-ID" {
			t.Error("model ID altered")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		switch r.URL.Path {
		case "/chat/completions":
			if r.Header.Get("Authorization") != "Bearer synthetic-http-key" || input["max_tokens"] != float64(256) {
				t.Error("chat request")
			}
			fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\ndata: [DONE]\n\n")
		case "/responses":
			if r.Header.Get("Authorization") != "Bearer synthetic-http-key" || input["store"] != false || input["max_output_tokens"] != float64(256) {
				t.Error("responses request")
			}
			fmt.Fprint(w, "data: {\"type\":\"response.output_text.delta\",\"delta\":\"OK\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n")
		case "/messages":
			if r.Header.Get("x-api-key") != "synthetic-http-key" || r.Header.Get("anthropic-version") != "2023-06-01" || input["max_tokens"] != float64(256) {
				t.Error("anthropic request")
			}
			fmt.Fprint(w, "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"OK\"}}\n\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\ndata: {\"type\":\"message_stop\"}\n\n")
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer upstream.Close()
	cfg.OpenRouterBaseURL = upstream.URL
	api, err := integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(api.Handler())
	defer app.Close()
	hash, err := security.HashPassword("synthetic-admin-password-123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role) VALUES('generic_admin',$1,'admin')`, hash); err != nil {
		t.Fatal(err)
	}
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, app.URL)
	requireStatus(t, getJSON(t, client, app.URL+"/api/v1/admin/model-connections"), 401)
	login := postJSON(t, client, app.URL+"/api/v1/auth/login", csrf, map[string]any{"username": "generic_admin", "password": "synthetic-admin-password-123", "browser_ui_locale": "en-US"})
	requireStatus(t, login, 200)
	csrf = dataString(t, login.body, "csrf_token")
	input := map[string]any{"display_name": "Generic configured model", "provider_model_id": "Vendor/Exact-ID", "output_mode": "prompt", "enabled": true, "expected_revision": configurationRevisionHTTP(t, client, app.URL), "connection": map[string]any{"name": "Remote provider", "protocol": "openai_responses", "base_url": "https://models.example/custom/v1/", "api_key": "synthetic-http-key"}}
	created := postJSON(t, client, app.URL+"/api/v1/admin/models", csrf, input)
	requireStatus(t, created, 201)
	if calls.Load() != 0 || strings.Contains(created.raw, "synthetic-http-key") || !nestedBool(t, created.body, "data", "model", "connection", "credential_configured") {
		t.Fatal("save called upstream or leaked/missed credential")
	}

	batch := map[string]any{"connection_id": nestedString(t, created.body, "data", "model", "connection", "id"), "expected_revision": configurationRevisionHTTP(t, client, app.URL), "models": []map[string]any{{"provider_model_id": "Batch/A", "output_mode": "prompt", "enabled": false}, {"provider_model_id": "Batch/B", "display_name": "Second", "output_mode": "prompt", "enabled": false}}}
	savedBatch := postJSON(t, client, app.URL+"/api/v1/admin/models/batch", csrf, batch)
	requireStatus(t, savedBatch, 201)
	if calls.Load() != 0 || strings.Contains(savedBatch.raw, "synthetic-http-key") {
		t.Fatal("batch save called upstream or leaked key")
	}
	batch["expected_revision"] = configurationRevisionHTTP(t, client, app.URL)
	batch["models"] = []map[string]any{{"provider_model_id": "Batch/rolled-back", "output_mode": "prompt"}, {"provider_model_id": "Batch/A", "output_mode": "prompt"}}
	requireStatus(t, postJSON(t, client, app.URL+"/api/v1/admin/models/batch", csrf, batch), 409)
	var partial int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.ai_models WHERE provider_model_id='Batch/rolled-back'`).Scan(&partial); err != nil || partial != 0 {
		t.Fatal("HTTP batch partially saved")
	}
	listed := getJSON(t, client, app.URL+"/api/v1/admin/model-connections")
	requireStatus(t, listed, 200)
	if strings.Contains(listed.raw, "synthetic-http-key") {
		t.Fatal("connection list leaked secret")
	}
	requireStatus(t, getJSON(t, client, app.URL+"/api/v1/admin/openrouter-credential"), 404)
	// Provider-centric creation and editing use one connection and preserve model identities.
	workspace := map[string]any{"connection": map[string]any{"name": "Workspace", "protocol": "openai_chat", "base_url": "https://workspace.example/v1", "api_key": "synthetic-workspace-key"}, "expected_revision": configurationRevisionHTTP(t, client, app.URL), "models": []map[string]any{{"id": nil, "provider_model_id": "Workspace/A", "output_mode": "prompt", "enabled": false}, {"id": nil, "provider_model_id": "Workspace/B", "output_mode": "prompt", "enabled": false}}}
	requireStatus(t, postJSON(t, client, app.URL+"/api/v1/admin/model-providers", "", workspace), 403)
	providerCreated := postJSON(t, client, app.URL+"/api/v1/admin/model-providers", csrf, workspace)
	requireStatus(t, providerCreated, 201)
	providerID := nestedString(t, providerCreated.body, "data", "provider", "connection", "id")
	data := providerCreated.body["data"].(map[string]any)
	provider := data["provider"].(map[string]any)
	existing := provider["models"].([]any)
	entries := []map[string]any{}
	for _, raw := range existing {
		m := raw.(map[string]any)
		entries = append(entries, map[string]any{"id": m["id"], "display_name": m["display_name"], "provider_model_id": m["provider_model_id"], "output_mode": "prompt", "enabled": true})
	}
	firstID := entries[0]["id"]
	entries[0]["display_name"] = "Edited together"
	entries = append(entries, map[string]any{"id": nil, "provider_model_id": "Workspace/C", "output_mode": "prompt", "enabled": false})
	workspace["models"] = entries
	workspace["expected_revision"] = data["revision"]
	workspace["connection"] = map[string]any{"name": "Renamed workspace", "protocol": "openai_chat", "base_url": "https://workspace.example/v1", "api_key": ""}
	edited := decodeResponse(t, rawJSONRequest(t, client, http.MethodPatch, app.URL+"/api/v1/admin/model-providers/"+providerID, csrf, workspace, nil))
	requireStatus(t, edited, 200)
	if nestedString(t, edited.body, "data", "provider", "connection", "id") != providerID || strings.Contains(edited.raw, "synthetic-workspace-key") {
		t.Fatal("provider identity changed or secret leaked")
	}
	listedProviders := getJSON(t, client, app.URL+"/api/v1/admin/model-providers")
	requireStatus(t, listedProviders, 200)
	found := false
	for _, raw := range listedProviders.body["data"].(map[string]any)["items"].([]any) {
		p := raw.(map[string]any)
		if p["connection"].(map[string]any)["id"] == providerID {
			found = true
			models := p["models"].([]any)
			if len(models) != 3 {
				t.Fatal("provider model count")
			}
			hasOriginal := false
			for _, rawModel := range models {
				m := rawModel.(map[string]any)
				if m["id"] == firstID {
					hasOriginal = true
					if m["display_name"] != "Edited together" {
						t.Fatal("model edit missing")
					}
				}
			}
			if !hasOriginal {
				t.Fatal("model ID changed")
			}
		}
	}
	if !found || calls.Load() != 0 {
		t.Fatal("provider missing or save called upstream")
	}
	requireStatus(t, decodeResponse(t, rawJSONRequest(t, client, http.MethodPatch, app.URL+"/api/v1/admin/model-providers/"+providerID, csrf, workspace, nil)), 409)

	for _, protocol := range []string{ai.ProtocolChat, ai.ProtocolResponses, ai.ProtocolAnthropic} {
		input["connection_id"] = ai.LegacyProviderID
		input["connection"] = map[string]any{"name": "Isolated probe", "protocol": protocol, "base_url": upstream.URL, "api_key": "synthetic-http-key"}
		result := postJSON(t, client, app.URL+"/api/v1/admin/model-connection-test", csrf, input)
		requireStatus(t, result, 200)
		if strings.Contains(result.raw, "synthetic-http-key") {
			t.Fatal("test leaked secret")
		}
	}
	if calls.Load() != 3 {
		t.Fatalf("test calls=%d want exactly three", calls.Load())
	}
	var runs, charges int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.generation_charges)`).Scan(&runs, &charges); err != nil || runs != 0 || charges != 0 {
		t.Fatal("connection tests consumed user quota")
	}
}
