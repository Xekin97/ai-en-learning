package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wordweave/internal/generationtrace"
)

type Gateway struct {
	credentials  *CredentialStore
	client       *http.Client
	legacyClient *http.Client
	legacyURL    string
	publicOrigin string
}

func NewGateway(credentials *CredentialStore, publicOrigin, legacyURL string) *Gateway {
	return &Gateway{credentials: credentials, publicOrigin: publicOrigin, legacyURL: legacyURL,
		client: newConnectionClient(false), legacyClient: newConnectionClient(true)}
}
func newConnectionClient(allowPrivate bool) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{ForceAttemptHTTP2: true, MaxIdleConns: 32, MaxIdleConnsPerHost: 8, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, ErrConnectionInvalid
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil || len(ips) == 0 {
			return nil, ErrConnectionInvalid
		}
		for _, ip := range ips {
			if !allowPrivate && !publicIP(ip.IP) {
				return nil, ErrConnectionInvalid
			}
		}
		for _, ip := range ips {
			conn, e := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
			if e == nil {
				return conn, nil
			}
			err = e
		}
		return nil, err
	}
	return &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func publicIP(ip net.IP) bool {
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	// Shared, benchmark, documentation and metadata-adjacent address ranges are
	// not public provider endpoints, even when net.IP classifies them unicast.
	for _, block := range []string{"100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32"} {
		_, cidr, _ := net.ParseCIDR(block)
		if cidr.Contains(ip) {
			return false
		}
	}
	return true
}

func protocolRequest(spec GenerationSpec, snap connectionSnapshot, probe bool) (string, map[string]any) {
	system, user := systemPrompt(spec), userPrompt(spec)
	schema, _ := json.Marshal(outputSchema(spec))
	system += "\nReturn only JSON matching this schema:\n" + string(schema)
	if probe {
		system = "Reply briefly to the user's message."
		user = "Reply with OK."
	}
	body := map[string]any{"model": spec.ProviderModelID, "stream": true}
	tokens := snap.maxOutputTokens
	if probe {
		n := 256
		tokens = &n
	}
	switch snap.connection.Protocol {
	case ProtocolResponses:
		body["instructions"] = system
		body["input"] = user
		body["store"] = false
		if tokens != nil {
			body["max_output_tokens"] = *tokens
		}
		if !probe && snap.outputMode == "json_schema" {
			body["text"] = map[string]any{"format": map[string]any{"type": "json_schema", "name": "wordweave_learning_batch", "strict": true, "schema": outputSchema(spec)}}
		}
		return "/responses", body
	case ProtocolAnthropic:
		body["system"] = system
		body["messages"] = []map[string]string{{"role": "user", "content": user}}
		n := 4096
		if tokens != nil {
			n = *tokens
		}
		body["max_tokens"] = n
		return "/messages", body
	default:
		body["messages"] = []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}
		if tokens != nil {
			body["max_tokens"] = *tokens
		}
		if !probe && snap.outputMode == "json_schema" {
			body["response_format"] = map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": "wordweave_learning_batch", "strict": true, "schema": outputSchema(spec)}}
		}
		return "/chat/completions", body
	}
}
func (g *Gateway) request(ctx context.Context, spec GenerationSpec, snap connectionSnapshot, probe bool) (*http.Response, *protocolDecoder, error) {
	if !ValidBaseURL(snap.connection.BaseURL) {
		return nil, nil, ErrConnectionInvalid
	}
	trace := generationtrace.From(ctx)
	trace.Check(generationtrace.ProviderOpen, "request_encode", -1)
	path, body := protocolRequest(spec, snap, probe)
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, nil, protocolFailure()
	}
	trace.Check(generationtrace.ProviderOpen, "request_create", -1)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(snap.connection.BaseURL, "/")+path, bytes.NewReader(raw))
	if err != nil {
		return nil, nil, ErrConnectionInvalid
	}
	if snap.connection.Protocol == ProtocolAnthropic {
		req.Header.Set("x-api-key", snap.apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	} else {
		req.Header.Set("Authorization", "Bearer "+snap.apiKey)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	endpoint, _ := url.Parse(snap.connection.BaseURL)
	knownCredits := endpoint.Hostname() == "openrouter.ai" && endpoint.Scheme == "https"
	if knownCredits {
		req.Header.Set("HTTP-Referer", g.publicOrigin)
		req.Header.Set("X-Title", "WordWeave")
	}
	client := g.client
	// Only the exact operator-configured legacy mock/LAN endpoint may use
	// private networking. Administrator configuration cannot add destinations.
	legacyIP := net.ParseIP(endpoint.Hostname())
	if snap.connection.BaseURL == g.legacyURL && (endpoint.Hostname() == "localhost" || (legacyIP != nil && !publicIP(legacyIP))) {
		client = g.legacyClient
	}
	trace.Check(generationtrace.ProviderOpen, "request_send", -1)
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, &ProviderError{Category: FailureUnavailable, Retryable: true, Err: diagnosed("provider_open", "transport_failed", "", -1, nil)}
	}
	trace.Check(generationtrace.ProviderOpen, "response_headers", -1)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, nil, mapOpenRouterStatus(resp.StatusCode)
	}
	mediaType, _, typeErr := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if typeErr != nil || mediaType != "text/event-stream" {
		resp.Body.Close()
		return nil, nil, &ProviderError{Category: FailureProtocol, Retryable: true, Err: diagnosed("provider_open", "response_not_sse", "", -1, nil)}
	}
	return resp, &protocolDecoder{protocol: snap.connection.Protocol, costReportedInCredits: knownCredits}, nil
}
func (g *Gateway) Open(ctx context.Context, spec GenerationSpec) (_ Stream, resultErr error) {
	trace := generationtrace.From(ctx)
	trace.Begin(generationtrace.ProviderOpen)
	defer func() { traceResult(ctx, generationtrace.ProviderOpen, resultErr) }()
	trace.Check(generationtrace.ProviderOpen, "credentials", -1)
	if err := g.credentials.BindSpec(ctx, &spec); err != nil {
		return nil, err
	}
	usage, err := beginUsage(ctx, spec)
	if err != nil {
		return nil, err
	}
	resp, decoder, err := g.request(ctx, spec, *spec.connection, false)
	if err != nil {
		usage.done()
		return nil, err
	}
	trace.Provider(generationtrace.ProviderOpen, generationtrace.ProviderFact{HTTPStatus: resp.StatusCode, RequestID: privateSafeID(resp.Header.Get("X-Request-Id"), spec.connection.apiKey)})
	return &openRouterStream{body: &privateProviderBody{ReadCloser: resp.Body, apiKey: spec.connection.apiKey}, usage: usage, decoder: decoder}, nil
}

// CheckCompatibility's identifier is the internal model UUID, never a global
// provider model name (which is no longer globally unique).
func (g *Gateway) CheckCompatibility(ctx context.Context, modelID string) error {
	spec := GenerationSpec{ModelID: modelID}
	if err := g.credentials.BindSpec(ctx, &spec); err != nil {
		return err
	}
	return g.probe(ctx, spec, *spec.connection)
}
func (g *Gateway) Probe(ctx context.Context, c Connection, key, model string, maxTokens *int, outputMode string) error {
	return g.probe(ctx, GenerationSpec{ProviderModelID: model}, connectionSnapshot{connection: c, apiKey: key, maxOutputTokens: maxTokens, outputMode: outputMode})
}
func (g *Gateway) probe(ctx context.Context, spec GenerationSpec, snap connectionSnapshot) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	resp, decoder, err := g.request(ctx, spec, snap, true)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	scanner := bufio.NewScanner(io.LimitReader(resp.Body, 1<<20))
	scanner.Buffer(make([]byte, 4096), 1<<20)
	var event strings.Builder
	received := false
	process := func() error {
		data := strings.TrimSpace(event.String())
		event.Reset()
		if data == "" {
			return nil
		}
		normalized, err := decoder.event(data)
		if err != nil {
			return err
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if normalized != "[DONE]" {
			_ = json.Unmarshal([]byte(normalized), &chunk)
			for _, c := range chunk.Choices {
				// A full initial Anthropic content block is not evidence of text streaming.
				var kind struct {
					Type string `json:"type"`
				}
				_ = json.Unmarshal([]byte(data), &kind)
				delta := snap.connection.Protocol != ProtocolAnthropic || kind.Type == "content_block_delta"
				received = received || (delta && strings.TrimSpace(c.Delta.Content) != "")
			}
		}
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if err = process(); err != nil {
				return err
			}
			if decoder.finished {
				break
			}
		} else if strings.HasPrefix(line, "data:") {
			event.WriteString(strings.TrimPrefix(line, "data:"))
			event.WriteByte('\n')
		}
	}
	if event.Len() > 0 {
		if err = process(); err != nil {
			return err
		}
	}
	if ctx.Err() != nil {
		return &ProviderError{Category: FailureUnavailable, Retryable: true}
	}
	if scanner.Err() != nil || !decoder.finished || !received {
		return protocolFailure()
	}
	return nil
}
