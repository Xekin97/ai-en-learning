//go:build integration

// QA-only overlay: real application HTTP and PG; synthetic provider only.
package httpapi

import (
 "context"
 "encoding/json"
 "fmt"
 "net"
 "net/http"
 "net/http/httptest"
 "strings"
 "sync/atomic"
 "testing"
 "time"
 "wordweave/internal/ai"
)

func TestQA127BrowserBoundary(t *testing.T) {
 setup, first, pool, actor, model, cfg := cr039Harness(t)
 if err := first.credentials.Put(setup, actor.ID, "qa127-synthetic-not-a-provider-secret"); err != nil { t.Fatal(err) }
 var mode atomic.Value
 mode.Store("valid")
 var calls atomic.Int32
 upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
  calls.Add(1)
  selected := mode.Load().(string)
  if selected == "open-error" { w.WriteHeader(503); return }
  w.Header().Set("Content-Type","text/event-stream")
  w.(http.Flusher).Flush()
  send := func(s string) bool {
   payload,_ := json.Marshal(map[string]any{"choices":[]any{map[string]any{"delta":map[string]string{"content":s}}}})
   _,err := fmt.Fprintf(w,"data: %s\n\n",payload)
   w.(http.Flusher).Flush()
   return err == nil
  }
  if selected == "hold" {
   send("{\"passage\":\"Fresh grapes(grape) are delicious. ")
   <-r.Context().Done()
   return
  }
  if selected == "slow" {
   select { case <-time.After(20*time.Second): case <-r.Context().Done(): return }
  }
  repeats := 12
  if selected == "large" { repeats = 22000 }
  passage := "Fresh grapes(grape) are delicious. " + strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ",repeats))
  if selected == "invalid" || selected == "refund-pending" { passage = "Fresh grapes(grape)." }
  candidate := ai.Candidate{Passage:passage,Tags:[]string{"fruit"},Targets:[]ai.CandidateTarget{{SourceEntry:"grape",EntryMeaning:"a small fruit",HintPhrase:"fresh grapes(grape)"}}}
  raw,_ := json.Marshal(candidate)
  // Keep upstream frames small; test the final application SSE, not upstream scanner limits.
  for len(raw)>0 {
   size:=4096
   if len(raw)<size { size=len(raw) }
   if !send(string(raw[:size])) { return }
   raw=raw[size:]
  }
  fmt.Fprint(w,"data: [DONE]\n\n")
 }))
 t.Cleanup(upstream.Close)
 cfg.PublicOrigin="http://127.0.0.1:16011"
 cfg.OpenRouterBaseURL=upstream.URL
 api,err:=New(cfg,pool,pool)
 if err!=nil { t.Fatal(err) }
 maintenanceCtx, stopMaintenance:=context.WithCancel(context.Background())
 defer stopMaintenance()
 go api.RunMaintenance(maintenanceCtx)
 appListener,err:=net.Listen("tcp",":38080")
 if err!=nil { t.Fatal(err) }
 app:=&http.Server{Handler:api.Handler(),WriteTimeout:5*time.Second}
 go app.Serve(appListener)
 defer app.Close()
 stop:=make(chan struct{},1)
 control:=http.NewServeMux()
 reply:=func(w http.ResponseWriter,v any) { w.Header().Set("Content-Type","application/json"); json.NewEncoder(w).Encode(v) }
 control.HandleFunc("/health",func(w http.ResponseWriter,r *http.Request) { reply(w,map[string]any{"ready":true,"model_id":model.String()}) })
 control.HandleFunc("/mode",func(w http.ResponseWriter,r *http.Request) {
  if r.Method!="POST" { w.WriteHeader(405); return }
  m:=r.URL.Query().Get("value")
  switch m { case "valid","invalid","open-error","hold","slow","large","refund-pending": default:w.WriteHeader(400);return }
  if m=="refund-pending" {
   _,err:=pool.Exec(r.Context(),`
CREATE FUNCTION wordweave.qa127_block_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.call_status IN ('validation_failed','server_failed','stream_failed','provider_failed') THEN RAISE EXCEPTION 'qa127 synthetic settlement outage'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER qa127_refund BEFORE UPDATE ON wordweave.generation_runs FOR EACH ROW EXECUTE FUNCTION wordweave.qa127_block_refund();`)
   if err!=nil { w.WriteHeader(500);return }
  }
  mode.Store(m)
  reply(w,map[string]any{"mode":m,"calls":calls.Load()})
 })
 control.HandleFunc("/restore-refund",func(w http.ResponseWriter,r *http.Request) {
  if r.Method!="POST" { w.WriteHeader(405);return }
  _,err:=pool.Exec(r.Context(),"DROP TRIGGER qa127_refund ON wordweave.generation_runs; DROP FUNCTION wordweave.qa127_block_refund()")
  if err!=nil { w.WriteHeader(500);return }
  // Production maintenance timer, not a direct manual settlement call.
  reply(w,map[string]any{"restored":true})
 })
 control.HandleFunc("/state",func(w http.ResponseWriter,r *http.Request) {
  rows,err:=pool.Query(r.Context(),`SELECT a.username, g.call_status, g.quota_charged, g.counts_toward_cumulative,
 g.disposition, (SELECT count(*) FROM wordweave.generation_drafts d WHERE d.run_id=g.id),
 (SELECT count(*) FROM wordweave.learning_batches b WHERE b.generation_run_id=g.id)
 FROM wordweave.generation_runs g JOIN wordweave.accounts a ON a.id=g.account_id ORDER BY g.started_at`)
  if err!=nil { w.WriteHeader(500); fmt.Fprint(w,"qa127 state query failed"); return }
  defer rows.Close()
  result:=[]map[string]any{}
  for rows.Next() {
   var username,status,disposition string
   var charged,cumulative bool
   var drafts,batches int
   if err:=rows.Scan(&username,&status,&charged,&cumulative,&disposition,&drafts,&batches);err!=nil {w.WriteHeader(500);return}
   result=append(result,map[string]any{"username":username,"status":status,"charged":charged,"cumulative":cumulative,"disposition":disposition,"drafts":drafts,"batches":batches})
  }
  reply(w,map[string]any{"runs":result,"provider_calls":calls.Load()})
 })
 control.HandleFunc("/stop",func(w http.ResponseWriter,r *http.Request) { if r.Method!="POST" {w.WriteHeader(405);return}; reply(w,map[string]bool{"stopping":true});stop<-struct{}{} })
 controlServer:=&http.Server{Addr:":38081",Handler:control}
 go controlServer.ListenAndServe()
 defer controlServer.Close()
 t.Log("QA127 ready: isolated HTTP, PG, synthetic provider; control excludes credentials and generated text")
 select { case <-stop: case <-time.After(15*time.Minute):t.Error("QA browser harness timed out") }
}
