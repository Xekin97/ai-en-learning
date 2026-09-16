package httpapi

import (
	"context"
	"errors"
	"log/slog"

	"wordweave/internal/ai"
	"wordweave/internal/generation"
)

func logGenerationDiagnostic(ctx context.Context, spec ai.GenerationSpec, phase string, err error) {
	detail := ai.DescribeFailure(err)
	if detail.Stage == "unknown" {
		detail.Stage = phase
	}
	// DescribeFailure describes a shared parser error, not its invocation site.
	// An annotation error while Receive runs has not reached target validation.
	if phase == "provider_receive" {
		switch detail.Stage {
		case "validation":
			detail.Stage = "passage_decode"
		case "candidate_schema":
			detail.Stage = "candidate_decode"
		case "provider_receive":
			detail.Stage = "provider_stream"
		}
	}
	if phase == "preflight" {
		switch {
		case errors.Is(err, generation.ErrInvalidInput):
			detail.Reason = "input_invalid"
		case errors.Is(err, generation.ErrForbidden):
			detail.Reason = "actor_forbidden"
		case errors.Is(err, generation.ErrQuotaExhausted):
			detail.Reason = "quota_exhausted"
		case errors.Is(err, generation.ErrGenerationInProgress):
			detail.Reason = "generation_in_progress"
		case errors.Is(err, generation.ErrGenerationUnavailable):
			detail.Reason = "generation_unavailable"
		}
	}
	// All strings below are server-owned IDs, fixed codes or schema field names.
	// No err.Error(), request body, candidate, actor or provider message.
	attrs := []any{
		"request_id", requestID(ctx), "run_id", spec.RunID, "model_id", spec.ModelID,
		"prompt_version", spec.PromptVersion, "validator_version", ai.ValidatorVersion,
		"phase", phase, "stage", detail.Stage, "reason", detail.Reason,
		"field", detail.Field, "target_index", detail.Target,
	}
	if detail.Actual >= 0 {
		attrs = append(attrs, "actual", detail.Actual)
	}
	if detail.Limit >= 0 {
		attrs = append(attrs, "limit", detail.Limit)
	}
	var provider *ai.ProviderError
	if errors.As(err, &provider) {
		attrs = append(attrs, "provider_retryable", provider.Retryable)
	}
	event := "ai_generation_failure"
	if phase == "validation" {
		event = "ai_candidate_validation_failed"
		attrs = append(attrs, "category", "content_invalid")
	}
	slog.WarnContext(ctx, event, attrs...)
}
