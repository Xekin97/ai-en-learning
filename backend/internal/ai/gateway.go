package ai

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"wordweave/internal/capacity"
	"wordweave/internal/generationtrace"
)

type Gateway struct {
	credentials  *CredentialStore
	client       *http.Client
	legacyClient *http.Client
	legacyURL    string
	publicOrigin string
	capacity     *capacity.Gate
}

type ModelRequestRejected struct{ UpstreamStatus int }

func (e *ModelRequestRejected) Error() string { return "model request rejected" }

func (g *Gateway) SetCapacityGate(gate *capacity.Gate) { g.capacity = gate }

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
	path, body, _ := protocolRequestChecked(spec, snap, probe)
	return path, body
}

func protocolRequestChecked(spec GenerationSpec, snap connectionSnapshot, probe bool) (string, map[string]any, error) {
	system, user := systemPrompt(spec), userPrompt(spec)
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
			body["text"] = map[string]any{"format": map[string]any{"type": "json_schema", "name": taskSchemaName(spec), "strict": true, "schema": taskOutputSchema(spec)}}
		}
		return mergeCustomParametersChecked("/responses", body, snap)
	case ProtocolAnthropic:
		body["system"] = system
		body["messages"] = []map[string]string{{"role": "user", "content": user}}
		n := 4096
		if tokens != nil {
			n = *tokens
		}
		body["max_tokens"] = n
		return mergeCustomParametersChecked("/messages", body, snap)
	default:
		body["messages"] = []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}
		if tokens != nil {
			body["max_tokens"] = *tokens
		}
		if !probe && snap.outputMode == "json_schema" {
			body["response_format"] = map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": taskSchemaName(spec), "strict": true, "schema": taskOutputSchema(spec)}}
		}
		if !probe && snap.outputMode == "json_schema" && officialOpenRouter(snap.connection) {
			body["provider"] = map[string]any{"require_parameters": true}
		}
		return mergeCustomParametersChecked("/chat/completions", body, snap)
	}
}

func mergeCustomParametersChecked(path string, body map[string]any, snap connectionSnapshot) (string, map[string]any, error) {
	custom, err := decodeCanonicalCustomParameters(snap.customParameters)
	if err != nil {
		return "", nil, err
	}
	for key, value := range custom {
		if _, controlled := body[key]; controlled {
			return "", nil, &CustomParameterError{ProblemCode: "custom_parameter_conflict", FieldCode: "controlled_field_conflict", Pointer: "/" + escapeJSONPointer(key)}
		}
		body[key] = value
	}
	return path, body, nil
}
func (g *Gateway) request(ctx context.Context, spec GenerationSpec, snap connectionSnapshot, probe bool, usage *callUsage) (*http.Response, *protocolDecoder, error) {
	if !ValidBaseURL(snap.connection.BaseURL) {
		known := false
		if err := markUsageInvoked(ctx, usage, &known); err != nil {
			return nil, nil, err
		}
		return nil, nil, ErrConnectionInvalid
	}
	trace := generationtrace.From(ctx)
	trace.Check(generationtrace.ProviderOpen, "request_encode", -1)
	path, body, err := protocolRequestChecked(spec, snap, probe)
	if err != nil {
		return nil, nil, err
	}
	raw, err := json.Marshal(body)
	if err != nil {
		known := false
		if markErr := markUsageInvoked(ctx, usage, &known); markErr != nil {
			return nil, nil, markErr
		}
		return nil, nil, protocolFailure()
	}
	trace.Check(generationtrace.ProviderOpen, "request_create", -1)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(snap.connection.BaseURL, "/")+path, bytes.NewReader(raw))
	if err != nil {
		known := false
		if markErr := markUsageInvoked(ctx, usage, &known); markErr != nil {
			return nil, nil, markErr
		}
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
	wroteRequest := false
	writeUnknown := false
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), &httptrace.ClientTrace{WroteRequest: func(info httptrace.WroteRequestInfo) {
		wroteRequest = info.Err == nil
		writeUnknown = info.Err != nil
	}}))
	resp, err := client.Do(req)
	var invoked *bool
	if resp != nil || wroteRequest {
		v := true
		invoked = &v
	} else if !writeUnknown {
		v := false
		invoked = &v
	}
	if markErr := markUsageInvoked(ctx, usage, invoked); markErr != nil {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil, markErr
	}
	if observerErr := notifyInvoked(ctx, invoked); observerErr != nil {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil, observerErr
	}
	if err != nil {
		return nil, nil, &ProviderError{Category: FailureUnavailable, Retryable: true, Err: diagnosed("provider_open", "transport_failed", "", -1, nil)}
	}
	trace.Check(generationtrace.ProviderOpen, "response_headers", -1)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == http.StatusTooManyRequests && g.capacity != nil {
			g.capacity.Cooldown(connectionCapacityKey(spec, snap), retryAfterDuration(resp.Header.Get("Retry-After")))
		}
		resp.Body.Close()
		if probe && (resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnprocessableEntity) {
			return nil, nil, &ModelRequestRejected{UpstreamStatus: resp.StatusCode}
		}
		return nil, nil, mapOpenRouterStatus(resp.StatusCode)
	}
	mediaType, _, typeErr := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if typeErr != nil || mediaType != "text/event-stream" {
		resp.Body.Close()
		return nil, nil, &ProviderError{Category: FailureProtocol, Retryable: true, Err: diagnosed("provider_open", "response_not_sse", "", -1, nil)}
	}
	return resp, &protocolDecoder{protocol: snap.connection.Protocol, costReportedInCredits: knownCredits}, nil
}

func markUsageInvoked(ctx context.Context, usage *callUsage, invoked *bool) error {
	if usage == nil {
		return nil
	}
	return usage.markInvoked(ctx, invoked)
}

func connectionCapacityKey(spec GenerationSpec, snap connectionSnapshot) string {
	if key := spec.ConnectionCapacityKey(); key != "" {
		return key
	}
	if snap.connection.ID != uuid.Nil {
		return snap.connection.ID.String()
	}
	digest := sha256.Sum256([]byte(snap.connection.Protocol + "\x00" + snap.connection.BaseURL))
	return "unsaved-connection-" + fmt.Sprintf("%x", digest[:8])
}

func retryAfterDuration(raw string) time.Duration {
	raw = strings.TrimSpace(raw)
	if seconds, err := strconv.Atoi(raw); err == nil && seconds > 0 {
		return min(time.Duration(seconds)*time.Second, 600*time.Second)
	}
	if at, err := http.ParseTime(raw); err == nil {
		if duration := time.Until(at); duration > 0 {
			return min(duration, 600*time.Second)
		}
	}
	return 30 * time.Second
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
	resp, decoder, err := g.request(ctx, spec, *spec.connection, false, usage)
	if err != nil {
		if finishErr := usage.done(); finishErr != nil {
			return nil, finishErr
		}
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
func (g *Gateway) Probe(ctx context.Context, c Connection, key, model string, maxTokens *int, outputMode string, parameters ...json.RawMessage) error {
	customParameters := json.RawMessage(`{}`)
	if len(parameters) > 0 {
		customParameters = parameters[0]
	}
	canonical, err := CanonicalCustomParameters(customParameters)
	if err != nil {
		return err
	}
	return g.probe(ctx, GenerationSpec{ProviderModelID: model}, connectionSnapshot{connection: c, apiKey: key, maxOutputTokens: maxTokens, outputMode: outputMode, customParameters: canonical})
}
func (g *Gateway) probe(ctx context.Context, spec GenerationSpec, snap connectionSnapshot) error {
	var lease *capacity.Lease
	if g.capacity != nil {
		key := connectionCapacityKey(spec, snap)
		var err error
		lease, err = g.capacity.TryAcquire(capacity.Probe, key)
		if err != nil {
			return err
		}
		defer lease.Release()
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	resp, decoder, err := g.request(ctx, spec, snap, true, nil)
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
