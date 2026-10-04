package ai

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestBoundaryKnownStatusDoesNotWaitForBody(t *testing.T) {
	for _, status := range []int{200, 401, 429, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var calls atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.WriteHeader(status)
				w.(http.Flusher).Flush()
				<-r.Context().Done() // headers are conclusive; body never arrives
			}))
			defer upstream.Close()
			provider := NewOpenRouter(upstream.URL, "https://synthetic.invalid", nil, Validator{})
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() { done <- provider.ValidateAPIKey(ctx, "synthetic-key") }()
			select {
			case err := <-done:
				if status == 200 && err != nil {
					t.Fatal(err)
				}
				if status != 200 && err == nil {
					t.Fatal("lost error status")
				}
			case <-time.After(300 * time.Millisecond):
				cancel()
				<-done
				t.Error("known HTTP status blocked on an unused response body")
			}
			if calls.Load() != 1 {
				t.Fatal("unexpected provider retry")
			}
		})
	}
}

func TestBoundaryReceiveCancellationUnblocksSilentBody(t *testing.T) {
	reader, writer := io.Pipe()
	defer writer.Close()
	defer reader.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	body := &boundaryReadSignal{ReadCloser: reader, started: make(chan struct{})}
	done := make(chan error, 1)
	go func() {
		_, err := (&openRouterStream{body: body}).Receive(ctx, func(string) error { t.Error("unexpected delta"); return nil })
		done <- err
	}()
	<-body.started // cancel only after Receive is actually blocked in Read
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation identity lost: %v", err)
		}
	case <-time.After(300 * time.Millisecond):
		reader.Close()
		<-done
		t.Error("Receive did not interrupt a silent body on cancellation")
	}
}

type boundaryReadSignal struct {
	io.ReadCloser
	started chan struct{}
	once    sync.Once
}

func (body *boundaryReadSignal) Read(p []byte) (int, error) {
	body.once.Do(func() { close(body.started) })
	return body.ReadCloser.Read(p)
}

func TestBoundaryMalformedPassageCannotTriggerUnboundedFallback(t *testing.T) {
	for _, closed := range []bool{false, true} {
		document := `{"passage":"\q` + strings.Repeat("x", 1<<20)
		if closed {
			document += `"}`
		}
		var extractor passageExtractor
		if _, err := extractor.Extract(context.Background(), document); DescribeFailure(err).Reason != "json_invalid" {
			t.Fatalf("malformed passage was deferred: %v", err)
		}
	}
}

func TestBoundarySchemaSizeCheckedBeforeParsing(t *testing.T) {
	var candidate Candidate
	err := decodeCandidateStrict(context.Background(), []byte(strings.Repeat("{", maxCandidateBytes+1)), &candidate)
	if DescribeFailure(err).Reason != "candidate_byte_limit" {
		t.Fatalf("oversized malformed candidate reached parser: %v", err)
	}
}

func TestBoundaryExtractorHonorsCancelledMalformedInput(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var extractor passageExtractor
	if _, err := extractor.Extract(ctx, `{"passage":"\q`+strings.Repeat("a", 4096)); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled parser still processed malformed input")
	}
}

func TestBoundaryTransportHeaderTimeoutIsNotTotalTimeout(t *testing.T) {
	provider := NewOpenRouter("https://synthetic.invalid", "https://synthetic.invalid", nil, Validator{})
	transport := provider.client.Transport.(*http.Transport)
	if provider.client.Timeout != 0 || transport.ResponseHeaderTimeout != 30*time.Second || transport.TLSHandshakeTimeout <= 0 {
		t.Fatal("transport timeout policy changed")
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer upstream.Close()
	transport.ResponseHeaderTimeout = 30 * time.Millisecond // same transport, test-only accelerated deadline
	provider.baseURL = upstream.URL
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	err := provider.ValidateAPIKey(ctx, "synthetic-key")
	var failure *ProviderError
	if !errors.As(err, &failure) || failure.Category != FailureUnavailable || !failure.Retryable || ctx.Err() != nil {
		t.Fatalf("header timeout: %v", err)
	}
}

func TestBoundaryResourceLimits(t *testing.T) {
	for _, tc := range []struct{ name, wire, reason string }{
		{"line", ":" + strings.Repeat("x", maxCandidateBytes+(1<<20)+1), "sse_line_limit"},
		{"event", "data: " + strings.Repeat("x", 9<<20) + "\ndata: " + strings.Repeat("x", 9<<20) + "\n\n", "sse_event_limit"},
		{"candidate", p0SSE(`{"passage":"grape(grape)","padding":"`) + p0SSE(strings.Repeat("x", 8<<20)) + p0SSE(strings.Repeat("x", 8<<20)), "candidate_byte_limit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			stream := openRouterStream{body: io.NopCloser(strings.NewReader(tc.wire))}
			_, err := stream.Receive(context.Background(), func(string) error { return nil })
			var p *ProviderError
			if !errors.As(err, &p) || p.Retryable || DescribeFailure(err).Reason != tc.reason {
				t.Fatalf("resource classification: %+v / %v", DescribeFailure(err), err)
			}
		})
	}
}
