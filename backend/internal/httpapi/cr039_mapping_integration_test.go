//go:build integration

package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
)

func TestCR039BrowserDisconnectRefundsWithoutDraft(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "integration-secret-key"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.ai_models SET provider_model_id='provider/slow' WHERE id=$1`, model); err != nil {
		t.Fatal(err)
	}
	provider := newFakeOpenRouter(t)
	defer provider.Close()
	cfg.OpenRouterBaseURL = provider.URL
	api, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, application.URL)
	registered := postJSON(t, client, application.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "cr039_disconnect", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US"})
	requireStatus(t, registered, http.StatusCreated)
	csrf = dataString(t, registered.body, "csrf_token")
	response := rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/stream", csrf, map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"}}, nil)
	if response.StatusCode != 200 {
		response.Body.Close()
		t.Fatalf("stream=%d", response.StatusCode)
	}
	runID, _ := readGenerationStarted(t, bufio.NewScanner(response.Body))
	response.Body.Close() // Actually terminate the browser HTTP stream.
	deadline := time.Now().Add(5 * time.Second)
	for {
		var status string
		var charged, cumulative bool
		var drafts int
		if err := pool.QueryRow(ctx, `SELECT call_status,quota_charged,counts_toward_cumulative,(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1) FROM wordweave.generation_runs WHERE id=$1`, runID).Scan(&status, &charged, &cumulative, &drafts); err != nil {
			t.Fatal(err)
		}
		if status != "active" {
			if status != "stream_failed" || charged || cumulative || drafts != 0 {
				t.Fatalf("disconnect settlement %s %v %v %d", status, charged, cumulative, drafts)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("disconnect never settled")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestCR039OneExplicitCompatibilityProbeNoStartupCalls(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "integration-secret-key"); err != nil {
		t.Fatal(err)
	}
	delegate := newFakeOpenRouter(t)
	defer delegate.Close()
	var catalogs, chats atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/models" {
			catalogs.Add(1)
		}
		if r.URL.Path == "/chat/completions" {
			chats.Add(1)
		}
		delegate.Config.Handler.ServeHTTP(w, r)
	}))
	defer provider.Close()
	cfg.OpenRouterBaseURL = provider.URL
	api, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	if catalogs.Load() != 0 || chats.Load() != 0 {
		t.Fatal("startup triggered provider calls")
	}
	if err := api.openrouter.CheckCompatibility(ctx, "provider/integration"); err != nil {
		t.Fatal(err)
	}
	if catalogs.Load() != 1 || chats.Load() != 1 {
		t.Fatalf("probe called catalog=%d chat=%d", catalogs.Load(), chats.Load())
	}
	var enabled bool
	if err := pool.QueryRow(ctx, `SELECT enabled FROM wordweave.ai_models WHERE id=$1`, model).Scan(&enabled); err != nil || !enabled {
		t.Fatal("model enabled flag changed")
	}
}

func TestCR039InputVocabularyMappingPersistenceAndTerminalCAS(t *testing.T) {
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "synthetic-unused-credential"); err != nil {
		t.Fatal(err)
	}
	// This disposable database is deliberately a one-word vocabulary stub.
	// The frozen JSON asset and all UAT databases are untouched.
	if _, err := pool.Exec(ctx, `DELETE FROM wordweave.vocabulary_entries WHERE entry<>'vulnerable'`); err != nil {
		t.Fatal(err)
	}
	input := generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "discussion", Length: "short", Entries: []string{"vulnerability"}}
	if _, err := api.generation.Start(ctx, actor, input); !errors.Is(err, generation.ErrInvalidInput) {
		t.Fatalf("nonmember preflight: %v", err)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_runs`).Scan(&count); err != nil || count != 0 {
		t.Fatal("rejected input created a run")
	}
	input.Entries = []string{"vulnerable"}
	run, err := api.generation.Start(ctx, actor, input)
	if err != nil {
		t.Fatal(err)
	}
	passage := "Vulnerability and vulnerabilities remain. " + strings.Repeat("People share practical ideas with neighbors. ", 10)
	candidate := ai.Candidate{Passage: strings.Replace(strings.TrimSpace(passage), "Vulnerability", "Vulnerability(vulnerable)", 1), Tags: []string{"community"}, Targets: []ai.CandidateTarget{{SourceEntry: "vulnerable", EntryMeaning: "open to harm", HintPhrase: "vulnerable(vulnerable) facing vulnerability"}}}
	validated, err := api.generation.Validator().Validate(ctx, run.Spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	if len(validated.Targets[0].PassageOccurrences) != 2 {
		t.Fatal("omitted plural not recovered")
	}
	if err := api.generation.CompleteValid(ctx, run, validated); err != nil {
		t.Fatal(err)
	}
	var payload []byte
	if err := pool.QueryRow(ctx, `SELECT payload FROM wordweave.generation_drafts WHERE run_id=$1`, run.ID).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"passage_forms", "hint_forms", "EvidenceID", "pos-rules", "(vulnerable)"} {
		if strings.Contains(string(payload), private) {
			t.Fatal("private mapping persisted")
		}
	}
	public, _ := json.Marshal(mapGenerationResult(validated))
	for _, private := range []string{"passage_forms", "hint_forms", "EvidenceID", "(vulnerable)"} {
		if strings.Contains(string(public), private) {
			t.Fatal("private mapping in public DTO")
		}
	}
	saved, _, err := api.learning.Save(ctx, actor, run.ID.String(), run.Token)
	if err != nil {
		t.Fatal(err)
	}
	cr039AssertReview(t, ctx, api, actor, saved.ID, validated)
	var visitorID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.visitor_identities(token_hash) VALUES ($1) RETURNING id`, []byte(uuid.NewString())).Scan(&visitorID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)`, model); err != nil {
		t.Fatal(err)
	}
	visitor := identity.Actor{ID: visitorID, Kind: "visitor"}
	visitorRun, err := api.generation.Start(ctx, visitor, input)
	if err != nil {
		t.Fatal(err)
	}
	if err := api.generation.CompleteValid(ctx, visitorRun, validated); err != nil {
		t.Fatal(err)
	}
	claim, err := api.learning.CreateClaim(ctx, visitor, visitorRun.ID.String(), visitorRun.Token)
	if err != nil {
		t.Fatal(err)
	}
	claimed, reused, err := api.learning.ConsumeClaim(ctx, actor, claim.Token)
	if err != nil || reused {
		t.Fatalf("claim: %v", err)
	}
	second, reused, err := api.learning.ConsumeClaim(ctx, actor, claim.Token)
	if err != nil || !reused || second != claimed {
		t.Fatal("claim idempotency failed")
	}
	cr039AssertReview(t, ctx, api, actor, claimed, validated)
	for _, status := range []string{"validation_failed", "stream_failed", "user_cancelled"} {
		t.Run(status, func(t *testing.T) {
			run, err := api.generation.Start(ctx, actor, input)
			if err != nil {
				t.Fatal(err)
			}
			if status == "user_cancelled" {
				out, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token)
				if err != nil || out.QuotaRefunded {
					t.Fatal("cancel quota changed")
				}
			} else {
				if err := api.generation.CompleteFailure(ctx, run.ID, status, "synthetic_failure"); err != nil {
					t.Fatal(err)
				}
			}
			if err := api.generation.CompleteValid(context.Background(), run, validated); !errors.Is(err, generation.ErrTerminalRace) {
				t.Fatalf("late completion won: %v", err)
			}
			if err := api.generation.CompleteFailure(ctx, run.ID, "provider_failed", "late_failure"); !errors.Is(err, generation.ErrTerminalRace) {
				t.Fatal("duplicate terminal transition")
			}
			var charged, cumulative bool
			var drafts int
			if err := pool.QueryRow(ctx, `SELECT quota_charged,counts_toward_cumulative,(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1) FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&charged, &cumulative, &drafts); err != nil {
				t.Fatal(err)
			}
			if charged != (status == "user_cancelled") || cumulative != charged || drafts != 0 {
				t.Fatalf("settlement charged=%v cumulative=%v drafts=%d", charged, cumulative, drafts)
			}
		})
	}
}

func TestCR039InvalidFinalMappingHTTPDoesNotPublishDraft(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "synthetic-unused-credential"); err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		candidate := ai.Candidate{Passage: strings.TrimSpace("Vulnerability matters. A banana(vulnerable) grows. " + strings.Repeat("Neighbors share useful ideas and practical support. ", 10)), Tags: []string{"community"}, Targets: []ai.CandidateTarget{{SourceEntry: "vulnerable", EntryMeaning: "open to harm", HintPhrase: "vulnerable(vulnerable) people"}}}
		body, _ := json.Marshal(candidate)
		chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string(body)}}}})
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", chunk)
	}))
	defer provider.Close()
	cfg.OpenRouterBaseURL = provider.URL
	api, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, application.URL)
	registered := postJSON(t, client, application.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "cr039_http", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US"})
	requireStatus(t, registered, http.StatusCreated)
	csrf = dataString(t, registered.body, "csrf_token")
	response := rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/stream", csrf, map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"vulnerable"}}, nil)
	if response.StatusCode != 200 {
		t.Fatalf("stream status=%d", response.StatusCode)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	// The actual surface is preview text; only its private source annotation
	// must be hidden. In the old fixture banana lived solely in a mapping array.
	if strings.Count(string(body), "event: generation.failed") != 1 || strings.Contains(string(body), "generation.validated") || strings.Contains(string(body), "(vulnerable)") || strings.Contains(string(body), "passage_forms") || calls.Load() != 1 {
		t.Fatalf("invalid terminal behavior or private annotation exposure: calls=%d", calls.Load())
	}
	runID, token, valid := readGenerationSSE(t, strings.NewReader(string(body)))
	if valid || runID == "" {
		t.Fatal("invalid mapping became valid")
	}
	save := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/"+runID+"/save", csrf, map[string]any{}, map[string]string{"X-Generation-Token": token}))
	if save.status >= 200 && save.status < 300 {
		t.Fatal("invalid result saved")
	}
	var drafts, batches int
	var charged bool
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.generation_drafts),(SELECT count(*) FROM wordweave.learning_batches),quota_charged FROM wordweave.generation_runs WHERE id=$1`, runID).Scan(&drafts, &batches, &charged); err != nil {
		t.Fatal(err)
	}
	if drafts != 0 || batches != 0 || charged {
		t.Fatalf("invalid result wrote data or retained quota: %d %d %v", drafts, batches, charged)
	}
}
