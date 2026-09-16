package ai

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"

	"wordweave/internal/generationtrace"
)

func traceResult(ctx context.Context, stage generationtrace.Stage, err error) {
	state := generationtrace.OK
	d := generationtrace.Why("")
	if err != nil {
		state = generationtrace.Failed
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			state = generationtrace.Cancelled
		}
		detail := DescribeFailure(err)
		d.Reason, d.Field, d.Target, d.Actual, d.Limit = detail.Reason, detail.Field, detail.Target, detail.Actual, detail.Limit
		var syntax *json.SyntaxError
		if errors.As(err, &syntax) {
			d.Start, d.End = syntax.Offset-1, syntax.Offset
		}
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) {
			d.Start, d.End = typeErr.Offset-1, typeErr.Offset
			switch typeErr.Type.Kind() {
			case reflect.String:
				d.ExpectedType = "string"
			case reflect.Slice, reflect.Array:
				d.ExpectedType = "array"
			case reflect.Map, reflect.Struct:
				d.ExpectedType = "object"
			case reflect.Bool:
				d.ExpectedType = "boolean"
			}
			for _, kind := range []string{"string", "number", "bool", "array", "object", "null"} {
				if typeErr.Value == kind || strings.HasPrefix(typeErr.Value, kind+" ") {
					d.ActualType = kind
					if kind == "bool" {
						d.ActualType = "boolean"
					}
					break
				}
			}
		}
	}
	generationtrace.From(ctx).End(stage, state, d)
}

// Observe just the permitted envelope fields. In particular error.message,
// metadata, reasoning and arbitrary headers never enter the trace. This decoder
// does not decide whether the business receiver accepts the frame.
func observeProviderEnvelope(ctx context.Context, data string, frame int64, apiKey string) {
	trace := generationtrace.From(ctx)
	if trace == nil {
		return
	}
	base := generationtrace.ProviderFact{Frame: frame, Bytes: int64(len(data)), SyntaxOffset: -1}
	var envelope struct {
		ID      string `json:"id"`
		Choices []struct {
			Index        *int    `json:"index"`
			FinishReason *string `json:"finish_reason"`
		} `json:"choices"`
		Usage *struct {
			Prompt     int64 `json:"prompt_tokens"`
			Completion int64 `json:"completion_tokens"`
			Total      int64 `json:"total_tokens"`
		} `json:"usage"`
		Error json.RawMessage `json:"error"`
	}
	if err := json.Unmarshal([]byte(data), &envelope); err != nil {
		var syntax *json.SyntaxError
		if errors.As(err, &syntax) {
			base.SyntaxOffset = syntax.Offset
		}
		trace.Provider(generationtrace.ProviderStream, base)
		return
	}
	base.ID = privateSafeID(envelope.ID, apiKey)
	if envelope.Usage != nil {
		base.UsageProvided = true
		base.PromptTokens, base.CompletionTokens, base.TotalTokens = envelope.Usage.Prompt, envelope.Usage.Completion, envelope.Usage.Total
	}
	if len(envelope.Error) > 0 && string(envelope.Error) != "null" {
		base.ErrorPresent = true
		var upstreamError struct {
			Code json.RawMessage `json:"code"`
		}
		if json.Unmarshal(envelope.Error, &upstreamError) != nil {
			base.ErrorCodeType = "other"
		} else if len(upstreamError.Code) == 0 {
			base.ErrorCodeType = "not_provided"
		} else if string(upstreamError.Code) == "null" {
			base.ErrorCodeType = "null"
		} else if upstreamError.Code[0] == '"' {
			base.ErrorCodeType = "string"
		} else if json.Unmarshal(upstreamError.Code, &base.ErrorCode) == nil {
			base.ErrorCodeType = "number"
		} else {
			base.ErrorCodeType = "other"
		}
	}
	if len(envelope.Choices) == 0 {
		trace.Provider(generationtrace.ProviderStream, base)
	}
	for _, choice := range envelope.Choices {
		fact := base
		if choice.Index != nil {
			fact.Choice, fact.ChoiceProvided = *choice.Index, true
		}
		if choice.FinishReason != nil {
			fact.FinishReason = *choice.FinishReason
		}
		trace.Provider(generationtrace.ProviderStream, fact)
	}
}
