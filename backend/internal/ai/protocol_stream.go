package ai

import (
	"encoding/json"
	"strconv"
	"strings"
	"unicode/utf8"
)

// protocolDecoder normalizes only text and accounting. All protocols then pass
// through the same incremental annotation/schema/content validation pipeline.
type protocolDecoder struct {
	protocol              string
	costReportedInCredits bool
	finished              bool
	stopReason            string
}

func protocolFailure() error { return streamFailure("invalid_stream") }

func streamFailure(reason string) error {
	return &ProviderError{Category: FailureProtocol, Retryable: true, Err: diagnosed("provider_receive", reason, "", -1, nil)}
}

func (d *protocolDecoder) event(data string) (string, error) {
	if !utf8.ValidString(data) {
		return "", streamFailure("sse_event_encoding_invalid")
	}
	if data == "[DONE]" {
		if d.protocol != ProtocolChat {
			return "", protocolFailure()
		}
		d.finished = true
		return "[DONE]", nil
	}
	var root map[string]json.RawMessage
	if json.Unmarshal([]byte(data), &root) != nil || root == nil {
		return "", streamFailure("sse_event_json_invalid")
	}
	if raw, ok := root["error"]; ok && string(raw) != "null" {
		var e struct {
			Code json.RawMessage `json:"code"`
			Type string          `json:"type"`
		}
		if json.Unmarshal(raw, &e) != nil {
			return "", protocolFailure()
		}
		code, _ := strconv.Atoi(strings.Trim(string(e.Code), "\""))
		if code == 0 {
			code = map[string]int{"authentication_error": 401, "permission_error": 403, "not_found_error": 404, "rate_limit_error": 429, "overloaded_error": 529, "api_error": 500}[e.Type]
		}
		if code != 0 {
			return "", mapOpenRouterStatus(code)
		}
		return "", protocolFailure()
	}
	normalized := map[string]any{}
	text := ""
	done := false
	switch d.protocol {
	case ProtocolChat:
		var chunk struct {
			Choices []struct {
				Index  int     `json:"index"`
				Finish *string `json:"finish_reason"`
				Delta  struct {
					Content string          `json:"content"`
					Refusal string          `json:"refusal"`
					Tools   json.RawMessage `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(data), &chunk) != nil {
			return "", protocolFailure()
		}
		for _, c := range chunk.Choices {
			if c.Index != 0 || c.Delta.Refusal != "" || (len(c.Delta.Tools) > 0 && string(c.Delta.Tools) != "null" && string(c.Delta.Tools) != "[]") {
				return "", protocolFailure()
			}
			if c.Finish != nil && *c.Finish != "stop" {
				return "", protocolFailure()
			}
			text += c.Delta.Content
		}
		if id, ok := root["id"]; ok {
			normalized["id"] = id
		}
		if raw, ok := root["usage"]; ok {
			var u map[string]json.RawMessage
			if json.Unmarshal(raw, &u) != nil {
				return "", protocolFailure()
			}
			if !d.costReportedInCredits {
				delete(u, "cost")
			}
			normalized["usage"] = u
		}
	case ProtocolResponses:
		var e struct {
			Type     string `json:"type"`
			Delta    string `json:"delta"`
			Response struct {
				ID     string          `json:"id"`
				Status string          `json:"status"`
				Usage  json.RawMessage `json:"usage"`
			} `json:"response"`
		}
		// Non-text delta event types may have object deltas; decode them only by type.
		var kind string
		_ = json.Unmarshal(root["type"], &kind)
		if kind == "response.output_text.delta" {
			if json.Unmarshal([]byte(data), &e) != nil {
				return "", protocolFailure()
			}
			text = e.Delta
		}
		if kind == "response.completed" {
			if json.Unmarshal([]byte(data), &e) != nil || e.Response.Status != "completed" {
				return "", protocolFailure()
			}
			normalized["id"] = e.Response.ID
			normalized["usage"] = normalizedTokenUsage(e.Response.Usage)
			done = true
		}
		if kind == "error" || kind == "response.failed" || kind == "response.incomplete" || strings.HasPrefix(kind, "response.refusal.") {
			return "", protocolFailure()
		}
	case ProtocolAnthropic:
		var e struct {
			Type  string `json:"type"`
			Delta struct {
				Type       string  `json:"type"`
				Text       string  `json:"text"`
				StopReason *string `json:"stop_reason"`
			} `json:"delta"`
			Message struct {
				ID    string          `json:"id"`
				Usage json.RawMessage `json:"usage"`
			} `json:"message"`
			Content struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content_block"`
			Usage json.RawMessage `json:"usage"`
		}
		if json.Unmarshal([]byte(data), &e) != nil {
			return "", protocolFailure()
		}
		switch e.Type {
		case "message_start":
			normalized["id"] = e.Message.ID
			normalized["usage"] = normalizedTokenUsage(e.Message.Usage)
		case "content_block_start":
			if e.Content.Type == "tool_use" || e.Content.Type == "server_tool_use" {
				return "", protocolFailure()
			}
			if e.Content.Type == "text" {
				text = e.Content.Text
			}
		case "content_block_delta":
			if e.Delta.Type == "text_delta" {
				text = e.Delta.Text
			}
		case "message_delta":
			normalized["usage"] = normalizedTokenUsage(e.Usage)
			if e.Delta.StopReason != nil {
				d.stopReason = *e.Delta.StopReason
				if d.stopReason != "end_turn" && d.stopReason != "stop_sequence" {
					return "", protocolFailure()
				}
			}
		case "message_stop":
			if d.stopReason == "" {
				return "", protocolFailure()
			}
			done = true
		case "error":
			return "", protocolFailure()
		}
	default:
		return "", protocolFailure()
	}
	normalized["choices"] = []any{map[string]any{"delta": map[string]string{"content": text}}}
	if done {
		d.finished = true
	}
	bytes, err := json.Marshal(normalized)
	return string(bytes), err
}
func normalizedTokenUsage(raw json.RawMessage) map[string]json.RawMessage {
	var u map[string]json.RawMessage
	_ = json.Unmarshal(raw, &u)
	out := map[string]json.RawMessage{}
	if v, ok := u["input_tokens"]; ok {
		out["prompt_tokens"] = v
	}
	if v, ok := u["output_tokens"]; ok {
		out["completion_tokens"] = v
	}
	return out
}
