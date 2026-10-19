package ai

import (
	"context"
	"encoding/json"
	"errors"
	"unicode/utf8"

	gt "wordweave/internal/generationtrace"
)

type correctionShapeError struct{ code, key string }

func (e *correctionShapeError) Error() string { return e.code }
func (e *correctionShapeError) Unwrap() error {
	return schemaFailure("correction_response_shape", "correction", -1)
}

func correctionShapeFailure(code, key string) error {
	return &ProviderError{Category: FailureSchema, Err: &correctionShapeError{code, key}}
}

func correctionShapeFeedback(err error) string {
	var shape *correctionShapeError
	if errors.As(err, &shape) {
		if shape.key != "" {
			return shape.code + " at requested key " + shape.key
		}
		return shape.code
	}
	return "correction_response_shape"
}

// Decode the entire envelope before applying anything. A malformed field type,
// missing/unknown key or duplicate invalidates the whole response. Value-level
// failures are intentionally handled independently by applyCorrection.
func decodeCorrection(ctx context.Context, raw []byte, plan *contentCorrection) (Candidate, error) {
	if err := ctx.Err(); err != nil {
		return Candidate{}, err
	}
	if len(raw) == 0 || len(raw) > maxCandidateBytes || !utf8.Valid(raw) {
		return Candidate{}, correctionShapeFailure("response_encoding_or_size_invalid", "")
	}
	if err := rejectDuplicateJSONKeys(raw); err != nil {
		code := DescribeFailure(err).Reason
		switch code {
		case "json_duplicate_key", "json_null", "json_trailing_content":
		default:
			code = "json_invalid"
		}
		return Candidate{}, correctionShapeFailure(code, "")
	}
	var values map[string]json.RawMessage
	if json.Unmarshal(raw, &values) != nil {
		return Candidate{}, correctionShapeFailure("response_object_required", "")
	}
	if len(values) != len(plan.Tasks) {
		return Candidate{}, correctionShapeFailure("response_key_set_mismatch", "")
	}
	decoded := make([]any, len(plan.Tasks))
	for i, task := range plan.Tasks {
		value, ok := values[task.Key]
		if !ok {
			return Candidate{}, correctionShapeFailure("response_key_missing", task.Key)
		}
		if task.Field == "tags" {
			var tags []string
			if json.Unmarshal(value, &tags) != nil {
				return Candidate{}, correctionShapeFailure("response_string_array_required", task.Key)
			}
			decoded[i] = tags
		} else {
			var text string
			if json.Unmarshal(value, &text) != nil {
				return Candidate{}, correctionShapeFailure("response_string_required", task.Key)
			}
			decoded[i] = text
		}
	}
	result := cloneCorrectionCandidate(plan.base)
	for i, task := range plan.Tasks {
		setRepairValue(&result, task, decoded[i])
	}
	return result, ctx.Err()
}

func (stream *openRouterStream) receiveFieldCorrection(ctx context.Context) (candidate Candidate, resultErr error) {
	trace := gt.From(ctx)
	trace.Begin(gt.ProviderStream)
	defer func() { traceResult(ctx, gt.ProviderStream, resultErr) }()
	// The legacy OpenRouter path otherwise uses its inline Chat decoder. Raw
	// tasks require the shared decoder to prove normal protocol termination.
	if stream.decoder == nil {
		stream.decoder = &protocolDecoder{protocol: ProtocolChat, costReportedInCredits: true}
	}
	raw, err := stream.receiveRawJSON(ctx, maxCandidateBytes, nil)
	if err != nil {
		return Candidate{}, err
	}
	return decodeCorrection(ctx, raw, stream.correction)
}
