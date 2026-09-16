package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

type traceFaultWriter struct {
	*httptest.ResponseRecorder
	writeFail, flushFail bool
	failEvent            string
	triggered            bool
}

func (w *traceFaultWriter) Write(p []byte) (int, error) {
	if w.failEvent == "" || strings.Contains(string(p), "event: "+w.failEvent) {
		w.triggered = true
	}
	if w.writeFail && w.triggered {
		return 0, errors.New("private writer failure")
	}
	return w.ResponseRecorder.Write(p)
}
func (w *traceFaultWriter) FlushError() error {
	if w.flushFail && w.triggered {
		return errors.New("private flush failure")
	}
	w.ResponseRecorder.Flush()
	return nil
}

func TestOBS042AllSSEWritesAndFlushes(t *testing.T) {
	for _, event := range []string{"generation.started", "passage.delta", "generation.validated", "generation.failed", "generation.cancelled", "heartbeat"} {
		for _, mode := range []string{"ok", "write", "flush"} {
			t.Run(event+"/"+mode, func(t *testing.T) {
				r := &tracetest.Recorder{}
				trace := gt.New("req_delivery", r)
				ctx := gt.With(context.Background(), trace)
				trace.Begin(gt.Delivery)
				trace.Confirm("valid", false)
				w := &traceFaultWriter{ResponseRecorder: httptest.NewRecorder(), writeFail: mode == "write", flushFail: mode == "flush"}
				var err error
				if event == "heartbeat" {
					err = writeTracedHeartbeat(ctx, w)
				} else {
					err = writeTracedSSE(ctx, w, event, map[string]string{"generation_token": "synthetic-private-token", "text": "synthetic private passage"})
				}
				if event == "heartbeat" && mode == "ok" && w.Body.String() != ": heartbeat\n\n" {
					t.Fatal("heartbeat wire changed")
				}
				trace.End(gt.Delivery, gt.OK, gt.Why(""))
				trace.Finish()
				events, summaries := r.Read()
				s := summaries[0]
				if (err == nil) != (mode == "ok") {
					t.Fatal("writer result changed")
				}
				want := gt.OK
				if mode != "ok" {
					want = gt.Failed
				}
				if s.Outcome != "valid" || s.Refunded || s.Stages[gt.Delivery].State != want {
					t.Fatalf("delivery reversed outcome: %+v", s)
				}
				if mode != "ok" && s.Stages[gt.Delivery].Detail.Reason != mode+"_failed" {
					t.Fatal("write/flush conflated")
				}
				if mode != "ok" {
					check := strings.TrimPrefix(event, "generation.")
					if event == "passage.delta" {
						check = "delta"
					}
					if s.FirstFailure == nil || s.FirstFailure.Check != check {
						t.Fatal("failed delivery event category lost")
					}
				}
				raw, _ := json.Marshal(events)
				for _, private := range []string{"synthetic-private-token", "synthetic private passage", "private writer", "private flush"} {
					if strings.Contains(string(raw), private) {
						t.Fatal("delivery content leak")
					}
				}
			})
		}
	}
}
func TestOBS042MiddlewareRejections(t *testing.T) {
	for _, mode := range []string{"origin", "fetch_site", "content_type", "csrf", "body", "panic"} {
		t.Run(mode, func(t *testing.T) {
			r := &tracetest.Recorder{}
			trace := gt.New("req_rejected", r)
			trace.Begin(gt.Request)
			request := httptest.NewRequest(http.MethodPost, "/api/v1/generations/stream", strings.NewReader(`{"private secret":1}`))
			request = request.WithContext(gt.With(request.Context(), trace))
			request.Header.Set("Origin", "http://localhost")
			request.Header.Set("Sec-Fetch-Site", "same-origin")
			request.Header.Set("Content-Type", "application/json")
			server := &Server{}
			server.cfg.PublicOrigin = "http://localhost"
			next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("rejection reached handler") })
			w := httptest.NewRecorder()
			want := ""
			switch mode {
			case "origin":
				request.Header.Set("Origin", "http://other.invalid")
				want = "origin_rejected"
			case "fetch_site":
				request.Header.Del("Sec-Fetch-Site")
				want = "origin_rejected"
			case "content_type":
				request.Header.Set("Content-Type", "text/plain")
				want = "content_type_rejected"
			case "csrf":
				want = "csrf_rejected"
			case "body":
				server.generationStream(w, request)
				want = "request_body_invalid"
			case "panic":
				server.recoverPanic(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("private secret") })).ServeHTTP(w, request)
				want = "panic"
			}
			if mode != "body" && mode != "panic" {
				server.requireSafeWrite(next).ServeHTTP(w, request)
			}
			trace.Finish()
			_, summaries := r.Read()
			s := summaries[0]
			if s.FirstFailure == nil || s.FirstFailure.Detail.Reason != want || s.Stages[gt.Preflight].State != gt.NotRun {
				t.Fatalf("rejection trace: %+v", s)
			}
		})
	}
}
