package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

const genericCandidate = `{"passage":"We learn(learn) together.","tags":["study"],"targets":{"learn":{"entry_meaning":"学习","hint_phrase":"learn(learn) together"}}}`

func protocolFrames(protocol, text string) string {
	encode := func(v any) string { b, _ := json.Marshal(v); return "data: " + string(b) + "\n\n" }
	switch protocol {
	case ProtocolChat:
		return encode(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": text}}}, "usage": map[string]any{"prompt_tokens": 10, "completion_tokens": 20, "cost": 0.5}}) + "data: [DONE]\n\n"
	case ProtocolResponses:
		return encode(map[string]any{"type": "response.output_text.delta", "delta": text}) + encode(map[string]any{"type": "response.completed", "response": map[string]any{"id": "resp_test", "status": "completed", "usage": map[string]int{"input_tokens": 10, "output_tokens": 20}}})
	default:
		return encode(map[string]any{"type": "message_start", "message": map[string]any{"id": "msg_test", "usage": map[string]int{"input_tokens": 10}}}) + encode(map[string]any{"type": "content_block_delta", "delta": map[string]string{"type": "text_delta", "text": text}}) + encode(map[string]any{"type": "message_delta", "delta": map[string]string{"stop_reason": "end_turn"}, "usage": map[string]int{"output_tokens": 20}}) + encode(map[string]string{"type": "message_stop"})
	}
}
func TestGatewayThreeProtocols(t *testing.T) {
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		t.Run(protocol, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				path := map[string]string{ProtocolChat: "/custom/v1/chat/completions", ProtocolResponses: "/custom/v1/responses", ProtocolAnthropic: "/custom/v1/messages"}[protocol]
				if r.URL.Path != path {
					t.Errorf("path %q", r.URL.Path)
				}
				if protocol == ProtocolAnthropic {
					if r.Header.Get("x-api-key") != "synthetic-secret" || r.Header.Get("anthropic-version") != "2023-06-01" || r.Header.Get("Authorization") != "" {
						t.Error("anthropic auth")
					}
				} else if r.Header.Get("Authorization") != "Bearer synthetic-secret" || r.Header.Get("x-api-key") != "" {
					t.Error("bearer auth")
				}
				var body map[string]any
				if json.NewDecoder(r.Body).Decode(&body) != nil {
					t.Error("body")
				}
				if body["model"] != "vendor/Case-Sensitive-ID" || body["stream"] != true || body["provider"] != nil {
					t.Error("model or provider-specific body leaked")
				}
				if protocol == ProtocolResponses && (body["store"] != false || body["instructions"] == nil || body["input"] == nil) {
					t.Error("responses body")
				}
				if protocol == ProtocolAnthropic && (body["max_tokens"] != float64(4096) || body["system"] == nil) {
					t.Error("anthropic body")
				}
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, protocolFrames(protocol, genericCandidate))
			}))
			defer server.Close()
			g := NewGateway(nil, "https://wordweave.example", "")
			g.client = server.Client()
			spec := GenerationSpec{ProviderModelID: "vendor/Case-Sensitive-ID", Entries: []string{"learn"}, connection: &connectionSnapshot{connection: Connection{ID: uuid.New(), Protocol: protocol, BaseURL: server.URL + "/custom/v1/"}, apiKey: "synthetic-secret", outputMode: "prompt"}}
			// An already pinned run must not require another database lookup.
			stream, err := g.Open(context.Background(), spec)
			if err != nil {
				t.Fatal(err)
			}
			defer stream.Close()
			var passage string
			candidate, err := stream.Receive(context.Background(), func(delta string) error { passage += delta; return nil })
			if err != nil || candidate.Passage != "We learn(learn) together." || passage != "We learn together." || calls.Load() != 1 {
				t.Fatalf("receive failed: %v, %q", err, passage)
			}
			usage := stream.(*openRouterStream).usage.usage
			if usage.InputTokens == nil || *usage.InputTokens != 10 || usage.OutputTokens == nil || *usage.OutputTokens != 20 || usage.Cost != nil {
				t.Fatalf("wrong token accounting or guessed cost: %+v", usage)
			}
		})
	}
}
func TestGenericDecoderRejectsTruncationAndErrors(t *testing.T) {
	cases := []struct{ protocol, data string }{
		{ProtocolChat, `{"choices":[{"delta":{"content":"x"},"finish_reason":"length"}]}`},
		{ProtocolChat, `{"error":{"message":"secret"}}`},
		{ProtocolResponses, `{"type":"response.incomplete","response":{"status":"incomplete"}}`},
		{ProtocolResponses, `{"type":"response.refusal.delta","delta":"no"}`},
		{ProtocolAnthropic, `{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}`},
		{ProtocolAnthropic, `{"type":"message_stop"}`},
		{ProtocolAnthropic, `{"type":"error","error":{"type":"overloaded_error"}}`},
	}
	for _, c := range cases {
		if _, err := (&protocolDecoder{protocol: c.protocol}).event(c.data); err == nil || strings.Contains(err.Error(), "secret") {
			t.Errorf("accepted or leaked %s", c.protocol)
		}
	}
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		frames := protocolFrames(protocol, genericCandidate)
		end := strings.LastIndex(strings.TrimSuffix(frames, "\n\n"), "data:")
		frames = frames[:end]
		stream := &openRouterStream{body: &privateProviderBody{ReadCloser: io.NopCloser(strings.NewReader(frames))}, decoder: &protocolDecoder{protocol: protocol}}
		if _, err := stream.Receive(context.Background(), func(string) error { return nil }); err == nil {
			t.Errorf("accepted incomplete %s stream", protocol)
		}
	}
}
func TestGenericNetworkBoundary(t *testing.T) {
	for _, raw := range []string{"http://user:key@example.com/v1", "https://example.com/v1?key=private", "https://example.com/v1/messages", "file:///etc/passwd", "https://example.com/#key"} {
		if ValidBaseURL(raw) {
			t.Error("unsafe URL accepted")
		}
	}
	if !ValidBaseURL("https://example.com/custom/v1/") {
		t.Error("custom URL changed/rejected")
	}
	for _, raw := range []string{"127.0.0.1", "::1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::ffff:127.0.0.1"} {
		if publicIP(net.ParseIP(raw)) {
			t.Error("non-public IP accepted")
		}
	}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(200) }))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if resp, err := newConnectionClient(false).Get(server.URL); err == nil {
		resp.Body.Close()
		t.Error("private network accessible")
	}
	if calls.Load() != 0 {
		t.Error("key could reach private network")
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL, nil)
	_ = req
}
