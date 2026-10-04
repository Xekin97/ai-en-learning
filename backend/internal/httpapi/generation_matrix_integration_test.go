//go:build integration

package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"wordweave/internal/ai"
)

type p0LogBuffer struct {
	mu   sync.Mutex
	data bytes.Buffer
}

func (b *p0LogBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.data.Write(p)
}
func (b *p0LogBuffer) String() string { b.mu.Lock(); defer b.mu.Unlock(); return b.data.String() }

func p0HTTPJSON(value any) string { raw, _ := json.Marshal(value); return string(raw) }
func p0HTTPWire(candidate ai.Candidate) string {
	targets := make(map[string]any, len(candidate.Targets))
	for _, target := range candidate.Targets {
		targets[target.SourceEntry] = map[string]string{"entry_meaning": target.EntryMeaning, "hint_phrase": target.HintPhrase}
	}
	wire := struct {
		Passage string         `json:"passage"`
		Tags    []string       `json:"tags"`
		Targets map[string]any `json:"targets"`
	}{candidate.Passage, candidate.Tags, targets}
	return "data: " + p0HTTPJSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": p0HTTPJSON(wire)}}}}) + "\n\ndata: [DONE]\n\n"
}

// Each case owns a disposable database. No real model, credential or UAT data.
func TestP0GenerationHTTPMatrix(t *testing.T) {
	for _, tc := range []struct{ name, mode, reason, phase string }{
		{"valid", "valid", "", ""},
		{"open_401", "open_401", "authentication", "provider_open"},
		{"open_403", "open_403", "authorization", "provider_open"},
		{"open_404", "open_404", "authorization", "provider_open"},
		{"open_429", "open_429", "rate_limited", "provider_open"},
		{"open_500", "open_500", "provider_unavailable", "provider_open"},
		{"not_sse", "not_sse", "response_not_sse", "provider_open"},
		{"stream_429", "stream_429", "rate_limited", "provider_receive"},
		{"bad_event", "bad_event", "sse_event_json_invalid", "provider_receive"},
		{"truncated", "truncated", "stream_incomplete", "provider_receive"},
		{"short", "short", "passage_too_short", "validation"},
		{"passage_space", "passage_space", "passage_content_invalid", "validation"},
		{"passage_language", "passage_language", "passage_language_invalid", "validation"},
		{"tags_count", "tags_count", "tag_count_invalid", "provider_receive"},
		{"tag_language", "tag_language", "tag_content_or_language_invalid", "validation"},
		{"tag_duplicate", "tag_duplicate", "tag_duplicate", "validation"},
		{"target_count", "target_count", "target_count_mismatch", "validation"},
		{"target_source", "target_source", "target_source_mismatch", "validation"},
		{"meaning", "meaning", "meaning_content_or_language_invalid", "validation"},
		{"meaning_repeat", "meaning_repeat", "meaning_repeats_entry", "validation"},
		{"hint_language", "hint_language", "hint_content_or_language_invalid", "validation"},
		{"source_unknown", "source_unknown", "annotation_source_unknown", "validation"},
		{"passage_missing", "passage_missing", "passage_annotation_missing", "validation"},
		{"hint_missing", "hint_missing", "hint_annotation_missing", "validation"},
		{"hint_wrong_source", "hint_wrong_source", "annotation_target_mismatch", "validation"},
		{"hint_syntax", "hint_syntax", "annotation_syntax_invalid", "validation"},
		{"surface_boundary", "surface_boundary", "mapping_surface_absent", "validation"},
		{"relation_unknown", "relation_unknown", "mapping_relation_unknown", "validation"},
		{"relation_rejected", "relation_rejected", "mapping_relation_rejected", "validation"},
	} {
		t.Run(tc.name, func(t *testing.T) { p0RunHTTPCase(t, tc.mode, tc.reason, tc.phase, "") })
	}
}

func p0RunHTTPCase(t *testing.T, mode, reason, phase, fault string) {
	t.Helper()
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	const secret = "p0-synthetic-key-must-never-be-logged"
	if err := api.credentials.Put(ctx, actor.ID, secret); err != nil {
		t.Fatal(err)
	}
	candidate := ai.Candidate{
		Passage: "Young(young) people share grapes(grape) and another grape. " + strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ", 9)),
		Tags:    []string{"fruit"},
		Targets: []ai.CandidateTarget{{SourceEntry: "grape", EntryMeaning: "a small fruit", HintPhrase: "fresh grapes(grape) beside a grape"}, {SourceEntry: "young", EntryMeaning: "not old", HintPhrase: "young(young) children"}},
	}
	switch mode {
	case "short":
		candidate.Passage = "Young(young) people share grapes(grape)."
	case "passage_space":
		candidate.Passage = " " + candidate.Passage
	case "passage_language":
		candidate.Passage = strings.TrimSpace(strings.Repeat("葡萄 年轻 水果 分享 ", 55))
	case "tags_count":
		candidate.Tags = []string{}
	case "tag_language":
		candidate.Tags = []string{"水果"}
	case "tag_duplicate":
		candidate.Tags = []string{"Fruit", "fruit"}
	case "target_count":
		candidate.Targets = candidate.Targets[:1]
	case "target_source":
		candidate.Targets[1].SourceEntry = "Young"
	case "meaning":
		candidate.Targets[1].EntryMeaning = "年轻"
	case "meaning_repeat":
		candidate.Targets[1].EntryMeaning = "YOUNG"
	case "hint_language":
		candidate.Targets[1].HintPhrase = "年轻的孩子"
	case "source_unknown":
		candidate.Passage = strings.Replace(candidate.Passage, "(young)", "(Young)", 1)
	case "passage_missing":
		candidate.Passage = strings.ReplaceAll(candidate.Passage, "(young)", "")
	case "hint_missing":
		candidate.Targets[1].HintPhrase = "young (young) children"
	case "hint_wrong_source":
		candidate.Targets[1].HintPhrase = "young(grape) children"
	case "hint_syntax":
		candidate.Targets[1].HintPhrase = "young(young children"
	case "surface_boundary":
		candidate.Targets[1].HintPhrase = "young(young)ness"
	case "relation_unknown":
		candidate.Targets[1].HintPhrase = "zzsyntheticwordzz(young) children"
	case "relation_rejected":
		candidate.Targets[1].HintPhrase = "bananas(young) for children"
	}
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempt := calls.Add(1)
		if strings.HasPrefix(mode, "open_") {
			status, _ := strconv.Atoi(strings.TrimPrefix(mode, "open_"))
			w.WriteHeader(status)
			fmt.Fprint(w, "private provider response")
			return
		}
		if mode == "not_sse" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, "private response")
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		if strings.HasPrefix(mode, "stream_") {
			status, _ := strconv.Atoi(strings.TrimPrefix(mode, "stream_"))
			fmt.Fprintf(w, "data: %s\n\n", p0HTTPJSON(map[string]any{"error": map[string]any{"code": status, "message": "private provider response"}}))
			return
		}
		if mode == "bad_event" {
			fmt.Fprint(w, "data: NOT JSON\n\n")
			return
		}
		wire := p0HTTPWire(candidate)
		if mode == "short" && attempt > 1 {
			// A bounded unsuccessful continuation must still reach the strict
			// content gate, refund once and never publish a draft.
			wire = p0HTTPWire(ai.Candidate{Passage: "They went home.", Tags: []string{"fruit"}, Targets: []ai.CandidateTarget{}})
		}
		if mode == "truncated" {
			wire = "data: " + p0HTTPJSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": "{\"passage\":\"unfinished"}}}}) + "\n\n"
		}
		fmt.Fprint(w, wire)
	}))
	t.Cleanup(provider.Close)
	cfg.OpenRouterBaseURL = provider.URL
	var err error
	api, err = integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	t.Cleanup(application.Close)
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, application.URL)
	registered := postJSON(t, client, application.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "p0_learner", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US"})
	requireStatus(t, registered, http.StatusCreated)
	csrf = dataString(t, registered.body, "csrf_token")
	if fault != "" {
		function := "CREATE FUNCTION wordweave.p0_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private failure'; END $$"
		if _, err := pool.Exec(ctx, function); err != nil {
			t.Fatal(err)
		}
		trigger := ""
		switch fault {
		case "start":
			trigger = "CREATE TRIGGER p0_fault BEFORE INSERT ON wordweave.generation_runs FOR EACH ROW EXECUTE FUNCTION wordweave.p0_fail()"
		case "draft":
			trigger = "CREATE TRIGGER p0_fault BEFORE INSERT ON wordweave.generation_drafts FOR EACH ROW EXECUTE FUNCTION wordweave.p0_fail()"
		case "commit":
			trigger = "CREATE CONSTRAINT TRIGGER p0_fault AFTER INSERT ON wordweave.generation_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wordweave.p0_fail()"
		case "refund":
			trigger = "CREATE TRIGGER p0_fault BEFORE UPDATE ON wordweave.generation_runs FOR EACH ROW WHEN (NEW.call_status='validation_failed') EXECUTE FUNCTION wordweave.p0_fail()"
		default:
			t.Fatal("unknown synthetic fault")
		}
		if _, err := pool.Exec(ctx, trigger); err != nil {
			t.Fatal(err)
		}
	}
	var logs p0LogBuffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })
	defer assertOBS042HTTPMatrixSummary(t, &logs, mode, fault)
	response := rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/stream", csrf, map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape", "young"}}, nil)
	raw, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if fault == "start" {
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM wordweave.generation_runs").Scan(&count); err != nil {
			t.Fatal(err)
		}
		if response.StatusCode != 500 || calls.Load() != 0 || count != 0 || !strings.Contains(logs.String(), "\"phase\":\"preflight\"") {
			t.Fatal("preflight failure escaped")
		}
		return
	}
	var runID, status string
	var charged, cumulative bool
	var drafts, batches int
	if err := pool.QueryRow(ctx, "SELECT id::text,call_status,quota_charged,counts_toward_cumulative,(SELECT count(*) FROM wordweave.generation_drafts d WHERE d.run_id=r.id),(SELECT count(*) FROM wordweave.learning_batches b WHERE b.generation_run_id=r.id) FROM wordweave.generation_runs r").Scan(&runID, &status, &charged, &cumulative, &drafts, &batches); err != nil {
		t.Fatal(err)
	}
	isValid := mode == "valid" && fault == ""
	expectedCalls := int32(1)
	if p0ExpectsCorrections(mode) {
		expectedCalls = 3
	}
	if calls.Load() != expectedCalls || batches != 0 {
		t.Fatalf("provider calls=%d want=%d, saved batches=%d", calls.Load(), expectedCalls, batches)
	}
	if fault == "refund" {
		t.Logf("fault evidence: terminal=%s charged=%v cumulative=%v drafts=%d browser_claims_refund=%v settlement_failure_logged=%v", status, charged, cumulative, drafts, strings.Contains(string(raw), "\"quota_refunded\":true"), strings.Contains(logs.String(), "ai_generation_settlement_failed"))
		if charged && strings.Contains(string(raw), "\"quota_refunded\":true") {
			t.Error("P0-CONFLICT-REFUND: browser claims refunded while database still charges the active run")
		}
		if !strings.Contains(logs.String(), "ai_generation_settlement_failed") {
			t.Error("refund persistence error invisible")
		}
		if status != "active" || !charged || cumulative || drafts != 0 ||
			strings.Count(string(raw), "event: generation.failed") != 1 ||
			!strings.Contains(string(raw), "\"quota_refunded\":false") ||
			!strings.Contains(string(raw), "\"code\":\"content_validation_failed\"") ||
			len(api.generation.Registry().PendingFailures(10)) != 1 {
			t.Error("unconfirmed settlement must remain queued and preserve the existing failure event")
		}
		return
	}
	if isValid {
		if response.StatusCode != 200 || status != "valid" || !charged || !cumulative || drafts != 1 || !strings.Contains(string(raw), "event: generation.validated") {
			t.Fatal("valid positive control failed")
		}
	} else {
		if status == "active" || status == "valid" || charged || cumulative || drafts != 0 {
			t.Fatalf("failure persistence incorrect: %s/%v/%v/%d", status, charged, cumulative, drafts)
		}
		if strings.HasPrefix(mode, "open_") || mode == "not_sse" {
			if response.StatusCode != 503 || strings.Contains(string(raw), "event:") {
				t.Fatal("pre-stream failure is not Problem JSON")
			}
		} else {
			if response.StatusCode != 200 || strings.Count(string(raw), "event: generation.failed") != 1 || strings.Contains(string(raw), "event: generation.validated") || !strings.Contains(string(raw), "\"quota_refunded\":true") {
				t.Fatal("failure terminal contract changed")
			}
		}
		if reason != "" && (!strings.Contains(logs.String(), "\"reason\":\""+reason+"\"") || !strings.Contains(logs.String(), "\"phase\":\""+phase+"\"")) {
			t.Fatalf("missing failure diagnostic %s/%s; logs=%s", phase, reason, logs.String())
		}
		if !strings.Contains(logs.String(), runID) {
			t.Fatal("lost run correlation")
		}
	}
	if mode == "stream_401" {
		if strings.Contains(string(raw), "\"retryable\":true") {
			t.Error("P0-CONFLICT-RETRY: provider authentication failure has Retryable=false but public stream says true")
		}
	}
	// Give asynchronous HTTP request logging a bounded opportunity to finish.
	deadline := time.Now().Add(time.Second)
	for !strings.Contains(logs.String(), "ai_generation_request_finished") && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	for _, private := range []string{secret, "private provider response", "synthetic private failure", candidate.Passage, candidate.Targets[0].EntryMeaning, candidate.Targets[0].HintPhrase, "generation_token", "source_entry"} {
		// Field names source_entry are intentionally permitted as schema-owned diagnostics.
		if private == "source_entry" {
			continue
		}
		if strings.Contains(logs.String(), private) {
			t.Fatalf("diagnostic leaked protected content category")
		}
	}
}

func TestP0DatabaseFaultMatrix(t *testing.T) {
	for _, fault := range []string{"start", "draft", "commit"} {
		t.Run(fault, func(t *testing.T) { p0RunHTTPCase(t, "valid", "", "", fault) })
	}
}

// Regression gates for truthful accounting and preserved provider retryability.
// CR-041 preserves the red test's truthfulness assertion and adds pending checks.
func TestP0RefundClaimMatchesPersistence(t *testing.T) {
	p0RunHTTPCase(t, "hint_missing", "", "", "refund")
}
func TestP0ProviderRetryabilityPreserved(t *testing.T) {
	p0RunHTTPCase(t, "stream_401", "authentication", "provider_receive", "")
}

func p0ExpectsCorrections(mode string) bool {
	switch mode {
	case "short", "tag_language", "tag_duplicate", "meaning", "meaning_repeat",
		"hint_language", "source_unknown", "passage_missing", "hint_missing",
		"hint_wrong_source", "hint_syntax", "surface_boundary", "relation_unknown", "relation_rejected":
		return true
	}
	return false
}
