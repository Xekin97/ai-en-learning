package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestProbeRequiresStreamingTextAndCleanTermination(t *testing.T) {
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		t.Run(protocol, func(t *testing.T) {
			frames := protocolFrames(protocol, "OK")
			end := strings.LastIndex(strings.TrimSuffix(frames, "\n\n"), "data:")
			cases := []struct {
				name, contentType, body string
				ok                      bool
			}{
				{"stream", "text/event-stream; charset=utf-8", frames, true},
				{"ordinary_json", "application/json", `{"message":"OK"}`, false},
				{"fake_sse_type", "text/event-stream-fake", frames, false},
				{"plain_text_as_sse", "text/event-stream", "OK", false},
				{"missing_terminal", "text/event-stream", frames[:end], false},
				{"no_text", "text/event-stream", protocolFrames(protocol, ""), false},
			}
			if protocol == ProtocolAnthropic {
				cases = append(cases, struct {
					name, contentType, body string
					ok                      bool
				}{"initial_full_content_only", "text/event-stream", "data: {\"type\":\"content_block_start\",\"content_block\":{\"type\":\"text\",\"text\":\"OK\"}}\n\n" + protocolFrames(protocol, ""), false})
			}
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						var in map[string]any
						_ = json.NewDecoder(r.Body).Decode(&in)
						if in["stream"] != true || in["model"] != "Exact/Model" {
							t.Error("probe did not request selected model streaming")
						}
						w.Header().Set("Content-Type", tc.contentType)
						fmt.Fprint(w, tc.body)
					}))
					defer server.Close()
					g := NewGateway(nil, "", "")
					g.client = server.Client()
					err := g.Probe(context.Background(), Connection{Protocol: protocol, BaseURL: server.URL}, "synthetic-probe", "Exact/Model", nil, "prompt")
					if tc.ok {
						if err != nil {
							t.Fatal(err)
						}
					} else {
						var failure *ProviderError
						if !errors.As(err, &failure) || failure.Category != FailureProtocol {
							t.Fatalf("not rejected as invalid streaming: %v", err)
						}
					}
				})
			}
			t.Run("wait_for_terminal", func(t *testing.T) {
				flushed := make(chan struct{})
				finish := make(chan struct{})
				defer close(finish)
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "text/event-stream")
					fmt.Fprint(w, frames[:end])
					w.(http.Flusher).Flush()
					close(flushed)
					select {
					case <-finish:
						fmt.Fprint(w, frames[end:])
					case <-r.Context().Done():
					}
				}))
				g := NewGateway(nil, "", "")
				g.client = server.Client()
				ctx, cancel := context.WithCancel(context.Background())
				defer server.Close()
				defer cancel()
				result := make(chan error, 1)
				go func() {
					result <- g.Probe(ctx, Connection{Protocol: protocol, BaseURL: server.URL}, "synthetic-probe", "Exact/Model", nil, "prompt")
				}()
				<-flushed
				select {
				case err := <-result:
					t.Fatalf("probe finished before terminal: %v", err)
				case <-time.After(30 * time.Millisecond):
				}
				// Release by sending rather than closing: the deferred close is safe on failures.
				finish <- struct{}{}
				select {
				case err := <-result:
					if err != nil {
						t.Fatal(err)
					}
				case <-time.After(time.Second):
					t.Fatal("probe did not finish")
				}
			})
		})
	}
}
