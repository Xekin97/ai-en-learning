//go:build integration

// QA132: isolated real HTTP/DB/browser verification; never contacts a model service.
package httpapi

import (
 "context"
 "encoding/json"
 "fmt"
 "log/slog"
 "net/http"
 "net/http/httptest"
 "strings"
 "sync/atomic"
 "testing"
 "time"
 "wordweave/internal/ai"
 evidence "wordweave/internal/generationevidence"
 "wordweave/internal/platform/security"
)

func TestQA132BrowserBoundary(t *testing.T) {
 setup, first, pool, actor, model, cfg := cr039Harness(t)
 if err:=first.credentials.Put(setup,actor.ID,"qa132-synthetic-not-a-provider-secret"); err!=nil {t.Fatal(err)}
 hash,err:=security.HashPassword("qa132-synthetic-password")
 if err!=nil {t.Fatal(err)}
 _,err=pool.Exec(setup,`INSERT INTO wordweave.accounts(id,username,password_hash,role,group_code,ui_locale) VALUES ($1,'qa132_dedicated',$2,'learner','registered','en-US')`,evidence.DedicatedAccountID,hash)
 if err!=nil {t.Fatal(err)}
 var mode atomic.Value
 mode.Store("valid")
 var calls,attempt atomic.Int32
 var logs p0LogBuffer
 previousLogger:=slog.Default()
 slog.SetDefault(slog.New(slog.NewJSONHandler(&logs,nil)))
 defer slog.SetDefault(previousLogger)
 full:="Fresh grapes(grape) are delicious. "+strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ",12))
 upstream:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
  calls.Add(1)
  nth:=attempt.Add(1)
  selected:=mode.Load().(string)
  if nth>3 {t.Error("exceeded initial plus two corrections");w.WriteHeader(500);return}
  w.Header().Set("Content-Type","text/event-stream")
  if selected=="hold-correction" && nth==2 {
   w.(http.Flusher).Flush()
   <-r.Context().Done()
   return
  }
  candidate:=ai.Candidate{Passage:full,Tags:[]string{"fruit"},Targets:[]ai.CandidateTarget{{SourceEntry:"grape",EntryMeaning:"a small fruit",HintPhrase:"fresh grapes(grape)"}}}
  switch selected {
  case "two-corrections":
   if nth==1 {candidate.Passage=strings.ReplaceAll(full,"grapes(grape)","grapes(grapes)")}
   if nth<3 {candidate.Targets[0].HintPhrase="fresh grapes(grapes)"}
  case "exhausted","hold-correction":
   candidate.Passage=strings.ReplaceAll(full,"grapes(grape)","grapes(grapes)")
  case "continuation":
   if nth==1 {candidate.Passage="Fresh grapes(grape) are delicious."} else {
    candidate.Passage=strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ",12))
    candidate.Targets=[]ai.CandidateTarget{}
   }
  case "malformed","refund-pending":
   fmt.Fprint(w,"data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"passage\\\":\\\"Fresh grapes(grape) are delicious.\\\"xxx}\"}}]}\n\ndata: [DONE]\n\n")
   return
  }
  fmt.Fprint(w,p0HTTPWire(candidate))
 }))
 defer upstream.Close()
 cfg.PublicOrigin="http://127.0.0.1:16011"
 cfg.OpenRouterBaseURL=upstream.URL
 api,err:=New(cfg,pool,pool)
 if err!=nil {t.Fatal(err)}
 manager,dir,_:=testEvidenceManager(t)
 api.evidence=manager
 api.metrics.BindGenerationCapture(manager)
 maintenanceCtx,stopMaintenance:=context.WithCancel(context.Background())
 defer stopMaintenance()
 go api.RunMaintenance(maintenanceCtx)
 app:=&http.Server{Addr:":38080",Handler:api.Handler(),WriteTimeout:5*time.Second}
 go app.ListenAndServe()
 defer app.Close()
 stop:=make(chan struct{},1)
 control:=http.NewServeMux()
 reply:=func(w http.ResponseWriter,v any) {w.Header().Set("Content-Type","application/json");json.NewEncoder(w).Encode(v)}
 control.HandleFunc("/health",func(w http.ResponseWriter,r *http.Request){reply(w,map[string]any{"ready":true,"model_id":model.String()})})
 control.HandleFunc("/mode",func(w http.ResponseWriter,r *http.Request) {
  if r.Method!="POST" {w.WriteHeader(405);return}
  selected:=r.URL.Query().Get("value")
  switch selected {case "valid","two-corrections","exhausted","continuation","hold-correction","malformed","refund-pending":default:w.WriteHeader(400);return}
  if selected=="refund-pending" {
   _,err:=pool.Exec(r.Context(),`CREATE FUNCTION wordweave.qa132_block_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.call_status IN ('validation_failed','server_failed','stream_failed','provider_failed') THEN RAISE EXCEPTION 'qa132 synthetic settlement outage'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER qa132_refund BEFORE UPDATE ON wordweave.generation_runs FOR EACH ROW EXECUTE FUNCTION wordweave.qa132_block_refund();`)
   if err!=nil {w.WriteHeader(500);return}
  }
  mode.Store(selected);attempt.Store(0)
  reply(w,map[string]any{"mode":selected,"calls":calls.Load()})
 })
 control.HandleFunc("/restore-refund",func(w http.ResponseWriter,r *http.Request) {
  if r.Method!="POST" {w.WriteHeader(405);return}
  _,err:=pool.Exec(r.Context(),"DROP TRIGGER qa132_refund ON wordweave.generation_runs; DROP FUNCTION wordweave.qa132_block_refund()")
  if err!=nil {w.WriteHeader(500);return}
  reply(w,map[string]bool{"restored":true})
 })
 control.HandleFunc("/state",func(w http.ResponseWriter,r *http.Request) {
  rows,err:=pool.Query(r.Context(),`SELECT g.id::text,g.call_status,g.quota_charged,g.counts_toward_cumulative,g.disposition,
 (SELECT count(*) FROM wordweave.generation_drafts d WHERE d.run_id=g.id),
 (SELECT count(*) FROM wordweave.learning_batches b WHERE b.generation_run_id=g.id)
 FROM wordweave.generation_runs g ORDER BY g.started_at`)
  if err!=nil {w.WriteHeader(500);return};defer rows.Close()
  runs:=[]map[string]any{}
  for rows.Next() {
   var id,status,disposition string;var charged,cumulative bool;var drafts,batches int
   if err:=rows.Scan(&id,&status,&charged,&cumulative,&disposition,&drafts,&batches);err!=nil {w.WriteHeader(500);return}
   runs=append(runs,map[string]any{"run_id":id,"status":status,"charged":charged,"cumulative":cumulative,"disposition":disposition,"drafts":drafts,"batches":batches})
  }
  reply(w,map[string]any{"runs":runs,"provider_calls":calls.Load(),"attempt":attempt.Load()})
 })
 control.HandleFunc("/evidence",func(w http.ResponseWriter,r *http.Request) {
  // Export only assertion metadata; no tokens, credentials, or model text.
  result:=[]map[string]any{}
  for _,id:=range manager.IDs() {
   view,err:=evidence.Read(dir,id,time.Now())
   if err!=nil {w.WriteHeader(503);return}
   item:=map[string]any{"id":id,"incomplete":view.Incomplete,"bytes":view.Bytes}
   modelEnds,chunks:=0,0
   stages:=map[string]int{}
   for _,record:=range view.Records {
    if record.ModelEnd!=nil {modelEnds++}
    if record.Chunk!=nil {chunks++}
    if record.Event!=nil {stages[record.Event.Kind]++}
    if record.Summary!=nil {item["summary"]=record.Summary}
   }
   item["model_ends"]=modelEnds;item["chunks"]=chunks;item["event_kinds"]=stages
   result=append(result,item)
  }
  ordinary:=logs.String()
  summaries:=[]json.RawMessage{}
  for _,line:=range strings.Split(ordinary,"\n") {
   if strings.Contains(line,"\"msg\":\"generation_summary\"") {summaries=append(summaries,json.RawMessage(line))}
  }
  leaked:=false
  for _,secret:=range []string{"qa132-synthetic-password","qa132-synthetic-not-a-provider-secret","a small fruit","Fresh grapes","generation_token","csrf_token"} {
   if strings.Contains(ordinary,secret) {leaked=true}
  }
  reply(w,map[string]any{"bundles":result,"ordinary_summaries":summaries,"ordinary_leak":leaked})
 })
 control.HandleFunc("/stop",func(w http.ResponseWriter,r *http.Request) {
  if r.Method!="POST" {w.WriteHeader(405);return};reply(w,map[string]bool{"stopping":true});stop<-struct{}{}
 })
 server:=&http.Server{Addr:":38081",Handler:control}
 go server.ListenAndServe();defer server.Close()
 t.Log("QA132 ready: synthetic provider and disposable database only")
 select {case <-stop:case <-time.After(12*time.Minute):t.Error("QA132 timeout")}
}
