//go:build integration && uatdiagnostics

package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"wordweave/internal/ai"
)

func TestQA122VisitorCapture(t *testing.T) {
	ctx, initial, pool, actor, model, cfg := cr039Harness(t)
	if err := initial.credentials.Put(ctx, actor.ID, "synthetic-qa122-key"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)", model); err != nil {
		t.Fatal(err)
	}
	var invalid atomic.Bool
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		label := "vulnerable"
		hint := "fresh grapes(grape)"
		if invalid.Load() {
			hint = "fresh grapes (grape)"
		}
		candidate := ai.Candidate{
			Passage: "Vulnerability(" + label + ") and grapes(grape) matter. " + strings.TrimSpace(strings.Repeat("Neighbors share useful ideas and practical support. ", 10)),
			Tags:    []string{"community"}, Targets: []ai.CandidateTarget{{SourceEntry: "vulnerable", EntryMeaning: "open to harm", HintPhrase: "vulnerable(vulnerable) people"}, {SourceEntry: "grape", EntryMeaning: "a small fruit", HintPhrase: hint}},
		}
		raw, _ := json.Marshal(candidate)
		w.Header().Set("Content-Type", "text/event-stream")
		for i := 0; i < len(raw); i += 3 {
			end := i + 3
			if end > len(raw) {
				end = len(raw)
			}
			chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string(raw[i:end])}}}})
			fmt.Fprintf(w, "data: %s\n\n", chunk)
		}
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()
	cfg.OpenRouterBaseURL = provider.URL
	cfg.PublicOrigin = "http://localhost:6001"
	api, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	first := newBrowserClient(t)
	firstCSRF := bootstrap(t, first, application.URL)
	var firstID string
	if err := pool.QueryRow(ctx, "SELECT id::text FROM wordweave.visitor_identities ORDER BY created_at DESC,id DESC LIMIT 1").Scan(&firstID); err != nil {
		t.Fatal(err)
	}
	second := newBrowserClient(t)
	secondCSRF := bootstrap(t, second, application.URL)
	dir, ticket, _, _ := hintFixture(t)
	ticket.ModelID = model.String()
	ticket.SubjectHash = captureSubjectHash("visitor:" + firstID)
	writeCaptureTicket(t, dir, ticket)
	api.failureCapture = openTestCapture(t)
	for _, step := range []struct {
		name         string
		client       *http.Client
		csrf         string
		bad, capture bool
	}{
		{"other_visitor_failure", second, secondCSRF, true, false},
		{"bound_visitor_success", first, firstCSRF, false, false},
		{"bound_visitor_failure", first, firstCSRF, true, true},
	} {
		invalid.Store(step.bad)
		resp := rawJSONRequest(t, step.client, http.MethodPost, application.URL+"/api/v1/generations/stream", step.csrf, map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"vulnerable", "grape"}}, map[string]string{"Origin": cfg.PublicOrigin})
		if resp.StatusCode != 200 {
			resp.Body.Close()
			t.Fatalf("%s unexpected status", step.name)
		}
		raw, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		run, _, valid := readGenerationSSE(t, strings.NewReader(string(raw)))
		if run == "" || valid == step.bad || strings.Contains(string(raw), "banana") || strings.Contains(string(raw), "(vulnerable)") {
			t.Fatal("consumer stream changed or leaked annotation")
		}
		var charged bool
		var drafts int
		if err := pool.QueryRow(ctx, "SELECT quota_charged,(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1) FROM wordweave.generation_runs WHERE id=$1", run).Scan(&charged, &drafts); err != nil {
			t.Fatal(err)
		}
		if charged == step.bad || drafts != map[bool]int{true: 0, false: 1}[step.bad] {
			t.Fatal("quota/draft mismatch")
		}
		if step.bad && (strings.Count(string(raw), "event: generation.failed") != 1 || !strings.Contains(string(raw), `"quota_refunded":true`)) {
			t.Fatal("failure terminal mismatch")
		}
		if !step.capture {
			assertNoHint(t, dir)
			continue
		}
		sample, err := os.ReadFile(filepath.Join(dir, hintCaptureFilename))
		if err != nil {
			t.Fatal(err)
		}
		var data map[string]json.RawMessage
		var hint string
		var index int
		if json.Unmarshal(sample, &data) != nil || len(data) != 8 || json.Unmarshal(data["hint_phrase"], &hint) != nil || hint != "fresh grapes (grape)" || json.Unmarshal(data["target_index"], &index) != nil || index != 1 {
			t.Fatal("incorrect indexed hint sample")
		}
		for _, forbidden := range []string{"Neighbors", "community", "open to harm", "vulnerable people", "synthetic-qa122-key", firstID, "candidate", "configuration"} {
			if strings.Contains(string(sample), forbidden) {
				t.Fatal("sample exceeded scope")
			}
		}
		var capturedRun string
		json.Unmarshal(data["run_id"], &capturedRun)
		if capturedRun != run {
			t.Fatal("wrong sample run")
		}
	}
	if calls.Load() != 3 {
		t.Fatal("unexpected provider calls")
	}
	api.failureCapture.Close()
	assertNoHint(t, dir)
	t.Log("PASS: two visitors, success preserves slot, matching failure alone captures only second raw hint, clean SSE and quota/draft behavior unchanged")
}
