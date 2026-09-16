package generationtrace_test

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"

	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

func TestTraceFirstFailureSummaryAndLateExit(t *testing.T) {
	r := &tracetest.Recorder{}
	trace := gt.New("req_synthetic", r)
	ctx := gt.With(context.Background(), trace)
	if gt.From(ctx) != trace || gt.From(context.Background()) != nil {
		t.Fatal("context isolation")
	}
	trace.Begin(gt.Request)
	trace.End(gt.Request, gt.OK, gt.Why(""))
	trace.BindRun("synthetic-run", "synthetic-model")
	trace.Begin(gt.ProviderStream)
	trace.Begin(gt.PassageDecode)
	trace.Check(gt.PassageDecode, "extract", -1)
	trace.End(gt.PassageDecode, gt.Failed, gt.Why("annotation_syntax_invalid"))
	trace.End(gt.Delivery, gt.Failed, gt.Why("write_failed"))
	trace.Finish()
	trace.Finish()
	trace.End(gt.ProviderStream, gt.Cancelled, gt.Why("context_cancelled"))
	trace.Settled("failed", true)
	trace.Settled("failed", true)
	events, summaries := r.Read()
	if len(summaries) != 1 {
		t.Fatal("summary duplicated")
	}
	s := summaries[0]
	if s.FirstFailure == nil || s.FirstFailure.Stage != "passage_decode" || s.Outcome != "unknown" {
		t.Fatalf("incorrect first/known outcome: %+v", s)
	}
	if s.Stages[gt.CandidateDecode].State != gt.NotRun || s.Stages[gt.ProviderStream].State != gt.Incomplete || s.Stages[gt.ProviderStream].EndMS != -1 {
		t.Fatal("unexecuted/incomplete lied")
	}
	confirmed, late := 0, 0
	for i, e := range events {
		if e.Sequence != uint64(i+1) {
			t.Fatal("sequence")
		}
		if e.Kind == "outcome_confirmed" {
			confirmed++
		}
		if e.Kind == "stage_end" && e.Fact.Stage == "provider_stream" && e.Late {
			late++
		}
	}
	if confirmed != 1 || late != 1 {
		t.Fatal("late outcome/provider exit lost or duplicated")
	}
}
func TestTraceConcurrentFinalizeAndOutcome(t *testing.T) {
	r := &tracetest.Recorder{}
	trace := gt.New("req_race", r)
	trace.BindRun("run-race", "model-race")
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			trace.Note(gt.ProviderStream, "content", gt.Why(""))
			trace.Confirm("valid", false)
			trace.Finish()
		}()
	}
	wg.Wait()
	events, summaries := r.Read()
	confirmed, first := 0, 0
	for _, e := range events {
		if e.Kind == "outcome_confirmed" {
			confirmed++
		}
		if e.Kind == "first_provider_content" {
			first++
		}
	}
	if len(summaries) != 1 || confirmed != 1 || first != 1 {
		t.Fatalf("summary=%d confirmed=%d first=%d", len(summaries), confirmed, first)
	}
}
func TestTracePrivacyAndNoop(t *testing.T) {
	var none *gt.Trace
	none.Begin(gt.Request)
	none.Check(gt.Request, "identity", -1)
	none.Note(gt.Request, "body", gt.Why("private"))
	none.End(gt.Request, gt.Failed, gt.Why("private"))
	none.Confirm("valid", false)
	none.Settled("pending", false)
	none.Provider(gt.ProviderOpen, gt.ProviderFact{})
	none.BindRun("", "")
	none.Finish()
	r := &tracetest.Recorder{}
	trace := gt.New("private secret", r)
	trace.Check(gt.ContentValidate, "private secret", 0)
	trace.End(gt.ContentValidate, gt.Failed, gt.Detail{Reason: "private secret", Field: "private secret"})
	trace.Provider(gt.ProviderStream, gt.ProviderFact{ID: "sk-synthetic-secret", RequestID: "private secret", FinishReason: "private secret", ErrorCodeType: "private secret"})
	trace.Finish()
	events, summaries := r.Read()
	raw, _ := json.Marshal(struct {
		E []gt.Event
		S []gt.Summary
	}{events, summaries})
	for _, secret := range []string{"private secret", "sk-synthetic-secret"} {
		if strings.Contains(string(raw), secret) {
			t.Fatal("unsafe projection")
		}
	}
}
