//go:build integration

package httpapi

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"wordweave/internal/ai"
	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

func obsSummary(t *testing.T, logs *p0LogBuffer) gt.Summary {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		var summaries []gt.Summary
		for _, line := range strings.Split(logs.String(), "\n") {
			var item struct {
				Message string     `json:"msg"`
				Summary gt.Summary `json:"summary"`
			}
			if json.Unmarshal([]byte(line), &item) == nil && item.Message == "generation_summary" {
				summaries = append(summaries, item.Summary)
			}
		}
		if len(summaries) > 0 {
			if len(summaries) != 1 {
				t.Fatal("summary duplicated")
			}
			return summaries[0]
		}
		if time.Now().After(deadline) {
			t.Fatal("missing generation summary")
		}
		time.Sleep(time.Millisecond)
	}
}

// Used by the existing entire HTTP and SQL fault matrix, retaining all original
// public DTO, quota, persistence and privacy assertions alongside trace checks.
func assertOBS042HTTPMatrixSummary(t *testing.T, logs *p0LogBuffer, mode, fault string) {
	t.Helper()
	s := obsSummary(t, logs)
	if mode == "valid" && fault == "" {
		if s.FirstFailure != nil || s.Outcome != "valid" || s.Refunded {
			t.Fatalf("positive trace: %+v", s)
		}
		return
	}
	want := "content_validate"
	if p0ExpectsCorrections(mode) {
		want = "continuation"
	}
	switch {
	case fault == "start":
		want = "preflight"
	case fault == "draft" || fault == "commit":
		want = "draft_commit"
	case strings.HasPrefix(mode, "open_") || mode == "not_sse":
		want = "provider_open"
	case strings.HasPrefix(mode, "stream_") || mode == "bad_event":
		want = "provider_stream"
	case mode == "truncated" || mode == "tags_count":
		want = "candidate_decode"
	}
	if s.FirstFailure == nil || s.FirstFailure.Stage != want {
		t.Fatalf("actual failure site missing: want %s got %+v", want, s.FirstFailure)
	}
	if fault == "start" {
		if s.RunID != "" || s.Stages[gt.ProviderOpen].State != gt.NotRun {
			t.Fatal("invented run/provider")
		}
		return
	}
	if fault == "refund" {
		if s.Outcome != "unknown" || s.Refunded {
			t.Fatal("unconfirmed refund reported")
		}
		return
	}
	if s.Outcome != "failed" || !s.Refunded {
		t.Fatalf("confirmed failure lost %+v", s)
	}
}

func TestOBS042ValidCommitSurvivesTerminalDeliveryFailure(t *testing.T) {
	for _, mode := range []string{"write", "flush"} {
		t.Run(mode, func(t *testing.T) {
			candidate := ai.Candidate{Passage: "Young(young) people share grapes(grape). " + strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ", 9)), Tags: []string{"fruit"}, Targets: []ai.CandidateTarget{{SourceEntry: "grape", EntryMeaning: "a small fruit", HintPhrase: "fresh grapes(grape)"}, {SourceEntry: "young", EntryMeaning: "not old", HintPhrase: "young(young) children"}}}
			f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, p0HTTPWire(candidate))
			})
			var logs p0LogBuffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
			defer slog.SetDefault(previous)
			body := p0HTTPJSON(map[string]any{"model_id": f.model, "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape", "young"}})
			r := httptest.NewRequest(http.MethodPost, f.base+"/api/v1/generations/stream", strings.NewReader(body))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Origin", "http://wordweave.test")
			r.Header.Set("Sec-Fetch-Site", "same-origin")
			r.Header.Set("X-CSRF-Token", f.csrf)
			address, _ := url.Parse(f.base)
			for _, cookie := range f.client.Jar.Cookies(address) {
				r.AddCookie(cookie)
			}
			w := &traceFaultWriter{ResponseRecorder: httptest.NewRecorder(), writeFail: mode == "write", flushFail: mode == "flush", failEvent: "generation.validated"}
			f.api.Handler().ServeHTTP(w, r)
			if !w.triggered {
				t.Fatal("terminal writer fault did not fire")
			}
			f.assertSettled(t, "valid", true, 1)
			s := obsSummary(t, &logs)
			if s.Outcome != "valid" || s.Refunded || s.Stages[gt.Delivery].State != gt.Failed || s.Stages[gt.Delivery].Detail.Reason != mode+"_failed" {
				t.Fatalf("valid and delivery facts confused %+v", s)
			}
		})
	}
}

func TestOBS042DeferredSettlementTrace(t *testing.T) {
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	recorder := &tracetest.Recorder{}
	trace := gt.New("req_refund_trace", recorder)
	trace.BindRun(run.ID.String(), model.String())
	api.generation.Registry().AttachTrace(run.ID, trace)
	refundFault(t, ctx, pool)
	out, err := api.generation.ReconcileFailure(ctx, run.ID, "validation_failed", "content_validation_failed")
	if err == nil || out.QuotaRefunded {
		t.Fatal("fault not applied")
	}
	trace.Finish()
	_, summaries := recorder.Read()
	if !summaries[0].Pending || summaries[0].Outcome != "unknown" || summaries[0].Refunded {
		t.Fatal("pending summary lied")
	}
	if _, err := pool.Exec(ctx, `DROP TRIGGER refund_fault ON wordweave.generation_runs`); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); api.generation.RetryPendingFailures(ctx, 200) }()
	}
	wg.Wait()
	assertRefundRow(t, ctx, pool, run.ID, "validation_failed", false, false)
	events, summaries := recorder.Read()
	confirmed, recovered := 0, 0
	for _, e := range events {
		if e.Kind == "outcome_confirmed" {
			confirmed++
			if !e.Late || !e.Refunded {
				t.Fatal("late confirmed facts lost")
			}
		}
		if e.Kind == "settlement_recovered" {
			recovered++
		}
	}
	if confirmed != 1 || recovered != 1 || len(summaries) != 1 {
		t.Fatalf("duplicate settlement observations: %d/%d/%d", confirmed, recovered, len(summaries))
	}
}
