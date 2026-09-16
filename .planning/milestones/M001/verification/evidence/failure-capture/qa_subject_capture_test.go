//go:build uatdiagnostics && integration

package httpapi

import (
 "encoding/json"
 "errors"
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

 "wordweave/internal/ai"
)

// Additional QA method: two real browser visitor identities through HTTP,
// followed by offline replay and a single-field synthetic counterfactual.
func TestQASubjectCaptureVisitorHTTPAndOfflineReplay(t *testing.T) {
 for _, defect := range []string{"passage_absent", "hint_absent", "relation_unknown"} {
  t.Run(defect, func(t *testing.T) {
   ctx, api, pool, owner, model, cfg := cr039Harness(t)
   if err := api.credentials.Put(ctx, owner.ID, "synthetic-qa-only"); err != nil { t.Fatal(err) }
   if _, err := pool.Exec(ctx, "INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)", model); err != nil { t.Fatal(err) }
   candidate := ai.Candidate{
    Passage: "Young people help their neighbors. " + strings.TrimSpace(strings.Repeat("They learn useful skills and share practical ideas. ", 12)),
    Tags: []string{"community"},
    Targets: []ai.CandidateTarget{{SourceEntry:"young", EntryMeaning:"not old", HintPhrase:"young people", PassageForms:[]string{"young"}, HintForms:[]string{"young"}}},
   }
   expectedReason := "mapping_surface_absent"
   switch defect {
   case "passage_absent": candidate.Targets[0].PassageForms = []string{"younger"}
   case "hint_absent": candidate.Targets[0].HintForms = []string{"younger"}
   case "relation_unknown":
    candidate.Targets[0].PassageForms = []string{"zznotarealwordzz"}
    expectedReason = "mapping_relation_unknown"
   }
   var calls atomic.Int32
   provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    calls.Add(1)
    raw, _ := json.Marshal(candidate)
    chunk, _ := json.Marshal(map[string]any{"choices":[]any{map[string]any{"delta":map[string]string{"content":string(raw)}}}})
    w.Header().Set("Content-Type","text/event-stream")
    fmt.Fprintf(w,"data: %s\n\ndata: [DONE]\n\n",chunk)
   }))
   defer provider.Close()
   dir, ticket, _, _ := captureFixture(t)
   ticket.ModelID = model.String()
   writeCaptureTicket(t,dir,ticket)
   cfg.PublicOrigin, cfg.OpenRouterBaseURL = "http://localhost:6001", provider.URL
   api, err := New(cfg,pool,pool)
   if err != nil { t.Fatal(err) }
   defer func(){api.failureCapture.Close()}()
   app := httptest.NewServer(api.Handler())
   defer app.Close()
   selected := newBrowserClient(t)
   selectedCSRF := bootstrap(t,selected,app.URL)
   var visitorID string
   if err := pool.QueryRow(ctx,"SELECT id::text FROM wordweave.visitor_identities").Scan(&visitorID); err != nil {t.Fatal(err)}
   other := newBrowserClient(t)
   otherCSRF := bootstrap(t,other,app.URL)
   api.failureCapture.Close()
   ticket.SubjectHash = captureSubjectHash("visitor:"+visitorID)
   writeCaptureTicket(t,dir,ticket)
   api.failureCapture, err = newFailureCapture(cfg.PublicOrigin)
   if err != nil {t.Fatal(err)}
   issue := func(client *http.Client, csrf, scenario string) string {
    response := rawJSONRequest(t,client,http.MethodPost,app.URL+"/api/v1/generations/stream",csrf,
     map[string]any{"model_id":model.String(),"meaning_language":"en","scenario":scenario,"length":"short","entries":[]string{"young"}},
     map[string]string{"Origin":cfg.PublicOrigin})
    defer response.Body.Close()
    raw, err := io.ReadAll(response.Body)
    if err != nil || response.StatusCode != 200 {t.Fatal("synthetic HTTP generation failed")}
    runID, _, valid := readGenerationSSE(t,strings.NewReader(string(raw)))
    if valid || !strings.Contains(string(raw), `"quota_refunded":true`) {t.Fatal("failure/settlement changed")}
    return runID
   }
   issue(other,otherCSRF,"story")
   assertNoCapture(t,dir)
   runID := issue(selected,selectedCSRF,"discussion")
   raw, err := os.ReadFile(filepath.Join(dir,captureFilename))
   if err != nil {t.Fatal("selected visitor failure was not captured:",err)}
   var got struct {
    RunID string `json:"run_id"`
    Reason string `json:"reason"`
    Candidate ai.Candidate `json:"candidate"`
    Configuration captureConfiguration `json:"configuration"`
   }
   if json.Unmarshal(raw,&got)!=nil || got.RunID!=runID || got.Reason!=expectedReason || !reflect.DeepEqual(got.Candidate,candidate) {t.Fatal("capture changed the diagnostic input")}
   if calls.Load()!=2 || strings.Contains(string(raw),visitorID) || strings.Contains(string(raw),ticket.SubjectHash) {t.Fatal("unexpected calls or identity leak")}
   config := got.Configuration
   spec := ai.GenerationSpec{RunID:runID,ModelID:config.ModelID,MeaningLanguage:config.MeaningLanguage,Scenario:config.Scenario,LengthCode:config.Length,MinimumWords:config.MinimumWords,Entries:config.Entries,PromptVersion:ai.PromptVersion}
   _, err = api.generation.Validator().Validate(ctx,spec,got.Candidate)
   var mapped *ai.MappingValidationError
   if !errors.As(err,&mapped) || mapped.Reason!=expectedReason || mapped.Target!=0 {t.Fatal("offline replay differs from HTTP")}
   if defect=="hint_absent" {got.Candidate.Targets[0].HintForms=[]string{"young"}} else {got.Candidate.Targets[0].PassageForms=[]string{"young"}}
   if _, err := api.generation.Validator().Validate(ctx,spec,got.Candidate); err!=nil {t.Fatal("single-field synthetic correction did not isolate failure:",err)}
   api.failureCapture.Close()
   assertNoCapture(t,dir)
   t.Log("two visitor identities isolated; changed scenario captured; exact offline replay and single-field counterfactual passed; synthetic requests only")
  })
 }
}
