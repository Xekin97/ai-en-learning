//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/ai"
	evidence "wordweave/internal/generationevidence"
	"wordweave/internal/platform/security"
)

type evidenceOutcome struct {
	Status         int
	Events         []string
	Passage        string
	Valid, Charged bool
	Drafts         int
	Batch          ai.ValidatedBatch
}

func waitEvidence(t *testing.T, m *evidence.Manager, dir string) evidence.View {
	t.Helper()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		ids := m.IDs()
		if len(ids) == 1 {
			view, err := evidence.Read(dir, ids[0], time.Now())
			if err == nil && !view.Incomplete {
				return view
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("evidence did not finish")
	return evidence.View{}
}

// Replaces old one-shot capture integration assertions with current account-wide
// storage, including failures BEFORE a Candidate exists. Only isolated test DBs.
func TestOBS042CGenerationCaptureServiceEquivalence(t *testing.T) {
	for _, name := range []string{"valid", "passage_annotation", "hint_missing", "relation", "candidate_json", "bad_envelope", "unknown_input", "csrf", "unassigned_model", "other_account", "visitor", "write_failure", "key_echo", "changed_configuration"} {
		t.Run(name, func(t *testing.T) {
			ctx, api, pool, credentialActor, model, cfg := cr039Harness(t)
			const secret = "sk-synthetic-OBS042-private-key"
			if err := api.credentials.Put(ctx, credentialActor.ID, secret); err != nil {
				t.Fatal(err)
			}
			userID := uuid.MustParse(evidence.DedicatedAccountID)
			if name == "other_account" {
				userID = uuid.New()
			}
			hash, err := security.HashPassword("synthetic-login-123")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = pool.Exec(ctx, `INSERT INTO wordweave.accounts(id,username,password_hash,role,group_code) VALUES ($1,'obs042_fixture',$2,'learner','registered')`, userID, hash); err != nil {
				t.Fatal(err)
			}
			if name == "visitor" {
				if _, err = pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)`, model); err != nil {
					t.Fatal(err)
				}
			}
			candidate := ai.Candidate{Passage: "Vulnerability(vulnerable) matters. " + strings.TrimSpace(strings.Repeat("Neighbors share useful ideas and practical support. ", 20)),
				Tags: []string{"community"}, Targets: []ai.CandidateTarget{{SourceEntry: "vulnerable", EntryMeaning: "open to harm", HintPhrase: "vulnerable(vulnerable) people"}}}
			expectedValid := name == "valid" || name == "other_account" || name == "visitor" || name == "write_failure"
			body := map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"vulnerable"}}
			switch name {
			case "passage_annotation":
				candidate.Passage = "Vulnerability(vulnerable " + candidate.Passage
			case "hint_missing":
				candidate.Targets[0].HintPhrase = "vulnerable people"
			case "relation":
				candidate.Passage = strings.Replace(candidate.Passage, "Vulnerability(vulnerable)", "zznotawordzz(vulnerable)", 1)
			case "unknown_input":
				body["private_extra"] = "private rejected configuration"
			case "unassigned_model":
				body["model_id"] = uuid.NewString()
			case "changed_configuration":
				body["meaning_language"] = "ja"
				body["scenario"] = "news"
				body["length"] = "xlong"
				body["entries"] = []string{"young", "grape", "weekend", "danger", "enforce"}
				candidate.Passage = "Young(young) people pick a grape(grape)extra each weekend(weekend) and avoid danger(danger) as they enforce(enforce) rules. " + strings.TrimSpace(strings.Repeat("Neighbors share useful ideas and practical support. ", 200))
				candidate.Tags = []string{"学習"}
				candidate.Targets = nil
				for _, entry := range body["entries"].([]string) {
					candidate.Targets = append(candidate.Targets, ai.CandidateTarget{SourceEntry: entry, EntryMeaning: "学ぶ", HintPhrase: entry + "(" + entry + ") examples"})
				}
			}
			m, dir, fp := testEvidenceManager(t)
			var captureOn atomic.Bool
			var calls atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if name == "write_failure" && captureOn.Load() {
					for _, id := range m.IDs() {
						if err := os.Chmod(filepath.Join(dir, id+".jsonl"), 0400); err != nil {
							t.Error(err)
						}
					}
				}
				targets := make(map[string]any, len(candidate.Targets))
				for _, target := range candidate.Targets {
					targets[target.SourceEntry] = map[string]any{"entry_meaning": target.EntryMeaning, "hint_phrase": target.HintPhrase}
				}
				raw, _ := json.Marshal(map[string]any{"passage": candidate.Passage, "tags": candidate.Tags, "targets": targets})
				if name == "candidate_json" {
					raw = raw[:len(raw)-2]
				}
				if name == "key_echo" {
					raw = []byte(strings.TrimSuffix(string(raw), "}") + ",\"credential\":\"" + secret + "\"}")
				}
				w.Header().Set("Content-Type", "text/event-stream")
				if name == "bad_envelope" {
					fmt.Fprint(w, "data: invalid synthetic private envelope\n\n")
					return
				}
				chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string(raw)}}}})
				fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", chunk)
			}))
			defer provider.Close()
			cfg.OpenRouterBaseURL = provider.URL
			api, err = integrationServer(t, cfg, pool)
			if err != nil {
				t.Fatal(err)
			}
			app := httptest.NewServer(api.Handler())
			defer app.Close()
			client := newBrowserClient(t)
			csrf := bootstrap(t, client, app.URL)
			if name != "visitor" {
				response := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/auth/login", csrf, map[string]any{"username": "obs042_fixture", "password": "synthetic-login-123", "browser_ui_locale": "en-US"}, nil))
				requireStatus(t, response, 200)
				csrf = bootstrap(t, client, app.URL)
			}
			var previous evidenceOutcome
			for _, on := range []bool{false, true} {
				captureOn.Store(on)
				if on {
					api.evidence = m
					api.metrics.BindGenerationCapture(m)
				}
				callBefore := calls.Load()
				token := csrf
				if name == "csrf" {
					token = "invalid-synthetic-csrf"
				}
				response := rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/generations/stream", token, body, nil)
				raw, err := io.ReadAll(response.Body)
				response.Body.Close()
				if err != nil {
					t.Fatal(err)
				}
				result := evidenceOutcome{Status: response.StatusCode}
				var runID, capability string
				if response.StatusCode == 200 {
					runID, capability, result.Valid = readGenerationSSE(t, strings.NewReader(string(raw)))
					if runID == "" || result.Valid != expectedValid {
						t.Fatalf("wrong business result in %s: valid=%v expected=%v", name, result.Valid, expectedValid)
					}
					if err = pool.QueryRow(ctx, `SELECT quota_charged,(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1) FROM wordweave.generation_runs WHERE id=$1`, runID).Scan(&result.Charged, &result.Drafts); err != nil {
						t.Fatal(err)
					}
					if result.Valid {
						var payload []byte
						if err = pool.QueryRow(ctx, `SELECT payload FROM wordweave.generation_drafts WHERE run_id=$1`, runID).Scan(&payload); err != nil {
							t.Fatal(err)
						}
						if err = json.Unmarshal(payload, &result.Batch); err != nil {
							t.Fatal(err)
						}
					}
					if result.Charged != result.Valid || result.Drafts != map[bool]int{true: 1, false: 0}[result.Valid] {
						t.Fatal("capture changed charging or draft persistence")
					}
					var current string
					for _, line := range strings.Split(string(raw), "\n") {
						if strings.HasPrefix(line, "event: ") {
							current = strings.TrimPrefix(line, "event: ")
							result.Events = append(result.Events, current)
						}
						if current == "passage.delta" && strings.HasPrefix(line, "data: ") {
							var d struct {
								Text string `json:"text"`
							}
							json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &d)
							result.Passage += d.Text
						}
					}
					if !result.Valid && (strings.Count(string(raw), "event: generation.failed") != 1 || !strings.Contains(string(raw), "\"quota_refunded\":true")) {
						t.Fatal("failure/refund projection changed")
					}
					expectedCalls := int32(1)
					if name == "hint_missing" || name == "relation" || name == "changed_configuration" {
						expectedCalls = 3
					}
					if calls.Load()-callBefore != expectedCalls {
						t.Fatalf("unexpected provider call count: got %d want %d", calls.Load()-callBefore, expectedCalls)
					}
				} else if calls.Load() != callBefore {
					t.Fatal("rejected input invoked provider")
				}
				if strings.Contains(string(raw), secret) || strings.Contains(result.Passage, "(vulnerable)") || strings.Contains(string(raw), "private rejected configuration") {
					t.Fatal("private data in public response")
				}
				if !on {
					previous = result
					continue
				}
				if !reflect.DeepEqual(previous, result) {
					t.Fatalf("observer altered result: before=%+v after=%+v", previous, result)
				}
				if name == "other_account" || name == "visitor" {
					if len(m.IDs()) != 0 {
						t.Fatal("non-dedicated identity captured")
					}
					continue
				}
				if name == "write_failure" {
					if m.Health().WriteFailed == 0 {
						t.Fatal("write failure not observed")
					}
					for _, id := range m.IDs() {
						os.Chmod(filepath.Join(dir, id+".jsonl"), 0600)
					}
					continue
				}
				view := waitEvidence(t, m, dir)
				encoded, _ := json.Marshal(view)
				if strings.Contains(string(encoded), secret) || capability != "" && strings.Contains(string(encoded), capability) || strings.Contains(string(encoded), "synthetic-login-123") {
					t.Fatal("credential leaked to evidence")
				}
				if response.StatusCode != 200 {
					for _, r := range view.Records {
						if r.Spec != nil || r.Chunk != nil {
							t.Fatal("unapproved input captured")
						}
					}
					continue
				}
				if name == "bad_envelope" {
					if strings.Contains(string(encoded), "invalid synthetic private envelope") {
						t.Fatal("unsafe envelope dumped")
					}
					continue
				}
				report := ai.ReplayEvidence(context.Background(), view, fp, ai.ReplayStream, api.generation.Validator())
				if name == "hint_missing" || name == "relation" || name == "changed_configuration" {
					if report.Status != "unavailable" || report.Reason != "multiple_model_attempts" {
						t.Fatalf("multi-call capture incorrectly replayed as one: %+v", report)
					}
					continue
				}
				if name == "key_echo" {
					if report.Status != "unavailable" {
						t.Fatal("redacted capture replayed")
					}
					continue
				}
				if report.Status != "reproduced" {
					var states []evidence.State
					for _, record := range view.Records {
						if record.State != nil {
							states = append(states, *record.State)
						}
					}
					t.Fatalf("same HTTP model failure not reproduced: %+v; records=%d health=%+v states=%+v", report, len(view.Records), m.Health(), states)
				}
				if name == "valid" {
					deleted := rawJSONRequest(t, client, http.MethodDelete, app.URL+"/api/v1/me/account", csrf, map[string]any{"current_password": "synthetic-login-123", "confirmed": true}, nil)
					deleted.Body.Close()
					if deleted.StatusCode != 204 {
						t.Fatal("account deletion failed")
					}
					if _, err := evidence.Read(dir, view.Manifest.ID, time.Now()); err == nil {
						t.Fatal("deleted account retained readable evidence")
					}
					if m.Admit("account", evidence.DedicatedAccountID, "req_late", time.Now()) != nil {
						t.Fatal("deleted account readmitted")
					}
				}
			}
		})
	}
}
