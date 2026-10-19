//go:build integration

package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"wordweave/internal/platform/security"
)

type m003PipelineProvider struct {
	server   *httptest.Server
	mu       sync.Mutex
	calls    int
	reviews  int
	rewrites int
	mode     string
	valid    map[string]any
	invalid  map[string]any
	entries  []string
}

func newM003PipelineProvider(t *testing.T, mode string, entries ...string) *m003PipelineProvider {
	t.Helper()
	passage := "Young(young) people share grapes(grape) at a community table. " + strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support during the calm afternoon. ", 10))
	valid := map[string]any{
		"passage": passage, "tags": []string{"community"},
		"targets": map[string]any{
			"grape": map[string]any{"entry_meaning": "a small fruit", "hint_phrase": "fresh grapes(grape)"},
			"young": map[string]any{"entry_meaning": "not old", "hint_phrase": "young(young) people"},
		},
	}
	invalid := map[string]any{
		"passage": strings.ReplaceAll(passage, "(young)", ""), "tags": valid["tags"], "targets": valid["targets"],
	}
	provider := &m003PipelineProvider{mode: mode, valid: valid, invalid: invalid, entries: entries}
	provider.server = httptest.NewServer(http.HandlerFunc(provider.serve))
	t.Cleanup(provider.server.Close)
	return provider
}

func (provider *m003PipelineProvider) serve(writer http.ResponseWriter, request *http.Request) {
	var envelope map[string]any
	if json.NewDecoder(request.Body).Decode(&envelope) != nil {
		writer.WriteHeader(http.StatusBadRequest)
		return
	}
	provider.mu.Lock()
	defer provider.mu.Unlock()
	provider.calls++
	if isPlanProviderRequest(envelope) {
		writeChatObject(writer, testScenePlan(provider.entries...))
		return
	}
	messages, _ := envelope["messages"].([]any)
	var system, user string
	for _, raw := range messages {
		message, _ := raw.(map[string]any)
		role, _ := message["role"].(string)
		content, _ := message["content"].(string)
		if role == "system" {
			system += content
		} else if role == "user" {
			user = content
		}
	}
	if providerTaskName(envelope) == "wordweave_content_review" || strings.Contains(system, "REVIEW_SCHEMA") {
		provider.reviews++
		if provider.mode == "pass" {
			writeChatObject(writer, map[string]any{"schema_version": 1, "verdict": "pass", "issues": []any{}})
			return
		}
		writeChatObject(writer, map[string]any{"schema_version": 1, "verdict": "issues", "issues": []any{map[string]any{
			"code": "contradiction", "evidence": []string{"Neighbors offer practical ideas"},
			"problem": "The test review identifies a concrete inconsistency.", "repair_goal": "Keep the shared scene internally consistent.",
		}}})
		return
	}
	var task map[string]any
	_ = json.Unmarshal([]byte(user), &task)
	if _, ok := task["issues"]; ok {
		provider.rewrites++
		if provider.mode == "fallback" && provider.rewrites >= 2 {
			writeChatObject(writer, provider.invalid)
			return
		}
		writeChatObject(writer, provider.valid)
		return
	}
	if _, ok := task["field_to_correct"]; ok {
		if provider.mode == "fallback" && provider.rewrites >= 2 {
			writeChatObject(writer, provider.invalid)
			return
		}
		writeChatObject(writer, provider.valid)
		return
	}
	if _, ok := task["draft"]; ok && provider.mode == "limit" {
		writeChatObject(writer, provider.invalid)
		return
	}
	writeChatObject(writer, provider.valid)
}

func (provider *m003PipelineProvider) callCount() int {
	provider.mu.Lock()
	defer provider.mu.Unlock()
	return provider.calls
}

func TestM003EnhancedGatewayHTTPPersistsTruthfulPipelineFacts(t *testing.T) {
	for _, tc := range []struct {
		mode, outcome, stop string
		version, calls      int
		stages              []string
	}{
		{"pass", "review_passed", "", 2, 4, []string{"planning", "generation", "fixed_edit", "content_review"}},
		{"limit", "limit_finalized", "", 4, 9, []string{"planning", "generation", "fixed_edit", "technical_repair", "content_review", "content_repair", "content_review", "content_repair", "content_review"}},
		{"fallback", "service_incomplete", "repair_native_invalid", 3, 9, []string{"planning", "generation", "fixed_edit", "content_review", "content_repair", "content_review", "content_repair", "technical_repair", "technical_repair"}},
	} {
		t.Run(tc.mode, func(t *testing.T) {
			ctx, api, pool, actor, model, cfg := cr039Harness(t)
			provider := newM003PipelineProvider(t, tc.mode, "grape", "young")
			const password = "m003-enhanced-password-123"
			hash, err := security.HashPassword(password)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = pool.Exec(ctx, `UPDATE wordweave.accounts SET password_hash=$2,group_code='pro' WHERE id=$1`, actor.ID, hash); err != nil {
				t.Fatal(err)
			}
			if _, err = pool.Exec(ctx, `UPDATE wordweave.entitlement_groups SET content_review_enabled=true,content_repair_limit=2 WHERE code='pro'`); err != nil {
				t.Fatal(err)
			}
			if _, err = pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('pro',$1) ON CONFLICT DO NOTHING`, model); err != nil {
				t.Fatal(err)
			}
			if err = api.credentials.Put(ctx, actor.ID, "m003-synthetic-provider-key"); err != nil {
				t.Fatal(err)
			}
			cfg.OpenRouterBaseURL = provider.server.URL
			api, err = integrationServer(t, cfg, pool)
			if err != nil {
				t.Fatal(err)
			}
			application := httptest.NewServer(api.Handler())
			defer application.Close()
			client := loginAdminForSearch(t, application.URL, "cr039_learner", password)
			csrf := bootstrap(t, client, application.URL)
			response := rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/stream", csrf, map[string]any{
				"model_id": model.String(), "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape", "young"},
			}, nil)
			raw, readErr := io.ReadAll(response.Body)
			response.Body.Close()
			if readErr != nil || response.StatusCode != http.StatusOK || !strings.Contains(string(raw), "event: generation.validated") {
				t.Fatalf("enhanced stream failed: status=%d err=%v body=%s", response.StatusCode, readErr, raw)
			}
			if tc.mode == "pass" {
				requireM003V6Stream(t, raw, "generation")
			}
			if provider.callCount() != tc.calls {
				t.Fatalf("provider calls=%d want=%d", provider.callCount(), tc.calls)
			}
			var status, outcome string
			var stop *string
			var version int
			var charged, cumulative bool
			var stages, prompts []string
			if err = pool.QueryRow(ctx, `SELECT call_status,content_outcome,content_stop_reason,final_content_version,quota_charged,counts_toward_cumulative,
				ARRAY(SELECT call_stage FROM wordweave.ai_call_usage WHERE user_run_id=r.id ORDER BY call_no),
				ARRAY(SELECT prompt_version FROM wordweave.ai_call_usage WHERE user_run_id=r.id ORDER BY call_no)
				FROM wordweave.generation_runs r ORDER BY started_at DESC LIMIT 1`).Scan(&status, &outcome, &stop, &version, &charged, &cumulative, &stages, &prompts); err != nil {
				t.Fatal(err)
			}
			if status != "valid" || outcome != tc.outcome || version != tc.version || !charged || !cumulative || !equalStrings(stages, tc.stages) {
				t.Fatalf("terminal facts status=%s outcome=%s stop=%v version=%d charged=%t cumulative=%t stages=%v", status, outcome, stop, version, charged, cumulative, stages)
			}
			if (stop == nil) != (tc.stop == "") || stop != nil && *stop != tc.stop {
				got := ""
				if stop != nil {
					got = *stop
				}
				t.Fatalf("stop=%q want=%q", got, tc.stop)
			}
			for index, prompt := range prompts {
				if prompt == "" || len(prompt) > 64 {
					t.Fatalf("missing prompt version at %d: %q", index, prompt)
				}
			}
			var consumed int
			if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_charges WHERE state='consumed'`).Scan(&consumed); err != nil || consumed != 1 {
				t.Fatalf("logical run charged %d times: %v", consumed, err)
			}
			if tc.outcome == "service_incomplete" && !strings.Contains(string(raw), "content_review_incomplete") {
				t.Fatal("fallback completion notice missing")
			}
			if tc.mode == "pass" {
				metricsServer := httptest.NewServer(api.MetricsHandler())
				defer metricsServer.Close()
				metricsResponse, getErr := client.Get(metricsServer.URL + "/internal/metrics")
				if getErr != nil {
					t.Fatal(getErr)
				}
				metricsRaw, metricsErr := io.ReadAll(metricsResponse.Body)
				metricsResponse.Body.Close()
				if metricsErr != nil || metricsResponse.StatusCode != http.StatusOK {
					t.Fatalf("metrics status=%d err=%v", metricsResponse.StatusCode, metricsErr)
				}
				for _, metric := range []string{
					`wordweave_generation_capacity_active{kind="global"} 0`,
					`wordweave_generation_capacity_active{kind="preview"} 0`,
					`wordweave_generation_capacity_active{kind="connection"} 0`,
					`wordweave_generation_first_browser_plan_total{stage="",result=""} 1`,
					`wordweave_generation_first_browser_content_total{stage="",result=""} 1`,
					`wordweave_generation_confirmed_outcome_seconds_sum{stage="",result="valid"}`,
					`wordweave_generation_stage_duration_seconds_sum{stage="preflight",result="ok"}`,
					`wordweave_generation_preflight_guard_completed_total 1`,
				} {
					if !strings.Contains(string(metricsRaw), metric) {
						t.Fatalf("missing runtime observation %q", metric)
					}
				}
			}
		})
	}
}

func TestM003EnhancedPreviewHTTPPersistsTruthfulPipelineFacts(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	provider := newM003PipelineProvider(t, "pass", "grape", "young")
	if err := api.credentials.Put(ctx, actor.ID, "m003-synthetic-preview-key"); err != nil {
		t.Fatal(err)
	}
	const password = "m003-preview-password-123"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "m003_preview_admin", hash, "admin")
	cfg.OpenRouterBaseURL = provider.server.URL
	api, err = integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	admin := loginAdminForSearch(t, application.URL, "m003_preview_admin", password)
	csrf := bootstrap(t, admin, application.URL)
	create := postJSON(t, admin, application.URL+"/api/v1/admin/presets", csrf, map[string]any{
		"title": "M003 enhanced preview", "preview_content_mode": "enhanced",
		"configuration": map[string]any{
			"model_id": model.String(), "entries": []string{"grape", "young"},
			"meaning_language": "en", "scenario": "story", "length": "short",
		},
	})
	requireStatus(t, create, http.StatusCreated)
	id := nestedString(t, create.body, "data", "preset", "id")
	version := nestedString(t, create.body, "data", "preset", "draft_version")
	response := rawJSONRequest(t, admin, http.MethodPost, application.URL+"/api/v1/admin/presets/"+id+"/previews/stream", csrf, map[string]any{
		"draft_version": version, "preview_content_mode": "enhanced",
	}, nil)
	raw, readErr := io.ReadAll(response.Body)
	response.Body.Close()
	if readErr != nil || response.StatusCode != http.StatusOK || !strings.Contains(string(raw), "event: preview.validated") {
		t.Fatalf("enhanced preview failed: status=%d err=%v body=%s", response.StatusCode, readErr, raw)
	}
	requireM003V6Stream(t, raw, "preview")
	if provider.callCount() != 4 {
		t.Fatalf("provider calls=%d want=4", provider.callCount())
	}
	var status, outcome, pipeline string
	var enabled bool
	var limit, finalVersion int
	var stages, prompts []string
	if err = pool.QueryRow(ctx, `SELECT status,content_outcome,pipeline_version_snapshot,
		content_review_enabled_snapshot,content_repair_limit_snapshot,final_content_version,
		ARRAY(SELECT call_stage FROM wordweave.ai_call_usage WHERE preview_run_id=r.id ORDER BY call_no),
		ARRAY(SELECT prompt_version FROM wordweave.ai_call_usage WHERE preview_run_id=r.id ORDER BY call_no)
		FROM wordweave.preset_preview_runs r ORDER BY started_at DESC LIMIT 1`).Scan(
		&status, &outcome, &pipeline, &enabled, &limit, &finalVersion, &stages, &prompts,
	); err != nil {
		t.Fatal(err)
	}
	wantStages := []string{"planning", "generation", "fixed_edit", "content_review"}
	if status != "valid" || outcome != "review_passed" || pipeline != "m003-content-v5" || !enabled || limit != 1 || finalVersion != 2 || !equalStrings(stages, wantStages) {
		t.Fatalf("preview facts status=%s outcome=%s pipeline=%s enabled=%t N=%d V=%d stages=%v", status, outcome, pipeline, enabled, limit, finalVersion, stages)
	}
	for index, prompt := range prompts {
		if prompt == "" || len(prompt) > 64 {
			t.Fatalf("missing preview prompt version at %d: %q", index, prompt)
		}
	}
	var runs, charges int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.generation_charges)`).Scan(&runs, &charges); err != nil {
		t.Fatal(err)
	}
	if runs != 0 || charges != 0 {
		t.Fatalf("preview created user billing facts: runs=%d charges=%d", runs, charges)
	}
}

func requireM003V6Stream(t *testing.T, raw []byte, prefix string) {
	t.Helper()
	type wireEvent struct {
		name string
		data map[string]any
	}
	var events []wireEvent
	for _, block := range strings.Split(string(raw), "\n\n") {
		var name, data string
		for _, line := range strings.Split(block, "\n") {
			if strings.HasPrefix(line, "event: ") {
				name = strings.TrimPrefix(line, "event: ")
			}
			if strings.HasPrefix(line, "data: ") {
				data = strings.TrimPrefix(line, "data: ")
			}
		}
		if name == "" || data == "" {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(data), &payload); err != nil {
			t.Fatalf("decode %s event %q: %v", prefix, name, err)
		}
		events = append(events, wireEvent{name: name, data: payload})
	}
	if len(events) == 0 {
		t.Fatalf("no %s wire events", prefix)
	}
	for index, event := range events {
		seq, ok := event.data["seq"].(float64)
		if !ok || int(seq) != index+1 {
			t.Fatalf("%s event %d has seq=%v: %+v", prefix, index, event.data["seq"], event)
		}
	}
	if events[0].name != prefix+".started" || events[0].data["contract_version"] != "m003-stream-v6" {
		t.Fatalf("%s started contract=%+v", prefix, events[0])
	}

	positions := map[string]int{
		"writing": -1, "initial_begin": -1, "initial_body": -1,
		"improving": -1, "replace_begin": -1, "replace_body": -1, "validated": -1,
	}
	for index, event := range events {
		if event.name == prefix+".activity" {
			if value, _ := event.data["activity"].(string); positions[value] == -1 {
				positions[value] = index
			}
		}
		if event.name == prefix+".draft" {
			action, _ := event.data["action"].(string)
			mode, _ := event.data["mode"].(string)
			version, _ := event.data["content_version"].(float64)
			switch {
			case action == "begin" && mode == "initial" && version == 1:
				positions["initial_begin"] = index
			case action == "body_complete" && version == 1:
				positions["initial_body"] = index
			case action == "begin" && mode == "replace" && version == 2:
				positions["replace_begin"] = index
			case action == "body_complete" && version == 2:
				positions["replace_body"] = index
			}
		}
		if event.name == prefix+".validated" {
			positions["validated"] = index
		}
		if event.name == prefix+".review" {
			t.Fatalf("private review leaked onto %s wire", prefix)
		}
	}
	wantOrder := []string{"writing", "initial_begin", "initial_body", "improving", "replace_begin", "replace_body", "validated"}
	previous := -1
	for _, key := range wantOrder {
		position := positions[key]
		if position <= previous {
			t.Fatalf("%s v6 boundary order %v at %q=%d events=%+v", prefix, positions, key, position, events)
		}
		previous = position
	}
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
