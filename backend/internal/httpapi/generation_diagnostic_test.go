package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"wordweave/internal/ai"
	"wordweave/internal/generation"
)

func TestGenerationDiagnosticTraceAndPrivacy(t *testing.T) {
	const secret = "synthetic-private-content-key-token-prompt"
	ctx := context.WithValue(context.Background(), requestIDKey, "req_synthetic_trace")
	spec := ai.GenerationSpec{RunID: "synthetic-run", ModelID: "synthetic-model", PromptVersion: ai.PromptVersion, Entries: []string{secret}, Scenario: secret}
	cases := []struct {
		phase, reason string
		err           error
	}{
		{"preflight", "input_invalid", generation.ErrInvalidInput},
		{"preflight", "actor_forbidden", generation.ErrForbidden},
		{"preflight", "quota_exhausted", generation.ErrQuotaExhausted},
		{"preflight", "generation_in_progress", generation.ErrGenerationInProgress},
		{"preflight", "generation_unavailable", generation.ErrGenerationUnavailable},
		{"provider_open", "credential_missing", ai.ErrCredentialMissing},
		{"provider_receive", "context_cancelled", context.Canceled},
		{"provider_receive", "deadline_exceeded", context.DeadlineExceeded},
		{"validation", "lexicon_unavailable", ai.ErrLexiconUnavailable},
	}
	for _, phase := range []string{"preflight", "provider_open", "provider_receive", "validation", "draft_publish"} {
		cases = append(cases, struct {
			phase, reason string
			err           error
		}{phase, "unknown_internal", errors.New(secret)})
	}
	for _, category := range []ai.FailureCategory{ai.FailureAuthentication, ai.FailureAuthorization, ai.FailureRateLimited, ai.FailureUnavailable, ai.FailureProtocol, ai.FailureSchema} {
		cases = append(cases, struct {
			phase, reason string
			err           error
		}{"provider_receive", string(category), &ai.ProviderError{Category: category, Retryable: true, Err: errors.New(secret)}})
	}
	for _, reason := range []string{"annotation_syntax_invalid", "annotation_source_unknown", "annotation_target_mismatch", "passage_annotation_missing", "hint_annotation_missing", "mapping_surface_absent", "mapping_relation_unknown", "mapping_relation_rejected", "passage_target_missing", "hint_occurrence_missing", "passage_occurrence_collision"} {
		cases = append(cases, struct {
			phase, reason string
			err           error
		}{"validation", reason, &ai.MappingValidationError{Reason: reason, Target: 1}})
	}
	for _, tc := range cases {
		t.Run(tc.phase+"/"+tc.reason, func(t *testing.T) {
			var log bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&log, nil)))
			defer slog.SetDefault(previous)
			logGenerationDiagnostic(ctx, spec, tc.phase, tc.err)
			if strings.Contains(log.String(), secret) {
				t.Fatal("private error/spec reflected in ordinary log")
			}
			var record map[string]any
			if err := json.Unmarshal(log.Bytes(), &record); err != nil {
				t.Fatal(err)
			}
			for key, want := range map[string]string{"request_id": "req_synthetic_trace", "run_id": spec.RunID, "model_id": spec.ModelID, "prompt_version": spec.PromptVersion, "validator_version": ai.ValidatorVersion, "phase": tc.phase, "reason": tc.reason} {
				if record[key] != want {
					t.Fatalf("trace field %s missing or changed", key)
				}
			}
			if record["stage"] == nil || record["field"] == nil || record["target_index"] == nil {
				t.Fatal("missing diagnostic context")
			}
			var provider *ai.ProviderError
			if errors.As(tc.err, &provider) && record["provider_retryable"] != true {
				t.Fatal("provider retryability lost")
			}
		})
	}
}
