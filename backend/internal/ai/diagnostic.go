package ai

import (
	"context"
	"errors"
)

// FailureDetail is a bounded, content-free diagnostic projection. Never log the
// underlying error: provider messages and JSON keys may contain private text.
type FailureDetail struct {
	Stage  string
	Reason string
	Field  string
	Target int
	Actual int
	Limit  int
}

type diagnosticError struct {
	detail FailureDetail
	cause  error
}

func (err *diagnosticError) Error() string { return err.detail.Reason }
func (err *diagnosticError) Unwrap() error { return err.cause }

func diagnosed(stage, reason, field string, target int, cause error) error {
	return &diagnosticError{FailureDetail{stage, reason, field, target, -1, -1}, cause}
}

func invalidField(reason, field string, target, actual, limit int) error {
	return &diagnosticError{FailureDetail{"validation", reason, field, target, actual, limit}, ErrInvalidCandidate}
}

func schemaFailure(reason, field string, target int) error {
	return diagnosed("candidate_schema", reason, field, target, nil)
}

func mappingField(err error, field string) error {
	var mapping *MappingValidationError
	if errors.As(err, &mapping) {
		return diagnosed("validation", mapping.Reason, field, mapping.Target, err)
	}
	return err
}

// DescribeFailure never reflects arbitrary error strings or provider payloads.
// Callers supply their local execution stage for unknown failures.
func DescribeFailure(err error) FailureDetail {
	detail := FailureDetail{Stage: "unknown", Reason: "unknown_internal", Target: -1, Actual: -1, Limit: -1}
	if errors.Is(err, context.Canceled) {
		detail.Reason = "context_cancelled"
		return detail
	}
	if errors.Is(err, context.DeadlineExceeded) {
		detail.Reason = "deadline_exceeded"
		return detail
	}
	var diagnostic *diagnosticError
	if errors.As(err, &diagnostic) {
		return diagnostic.detail
	}
	var mapping *MappingValidationError
	if errors.As(err, &mapping) {
		switch mapping.Reason {
		case "annotation_syntax_invalid", "annotation_source_unknown", "annotation_target_mismatch",
			"passage_annotation_missing", "hint_annotation_missing", "mapping_surface_absent",
			"mapping_relation_unknown", "mapping_relation_rejected", "passage_target_missing",
			"hint_occurrence_missing", "passage_occurrence_collision", "compatibility_derivation_missing":
			detail.Stage, detail.Reason, detail.Target = "validation", mapping.Reason, mapping.Target
		}
		return detail
	}
	if errors.Is(err, ErrLexiconUnavailable) {
		detail.Stage, detail.Reason = "validation", "lexicon_unavailable"
	} else if errors.Is(err, ErrCredentialMissing) {
		detail.Reason = "credential_missing"
	} else {
		var provider *ProviderError
		if errors.As(err, &provider) {
			switch provider.Category {
			case FailureAuthentication, FailureAuthorization, FailureRateLimited,
				FailureUnavailable, FailureProtocol, FailureSchema, FailureContent, FailureCancelledByUser:
				detail.Reason = string(provider.Category)
			}
		}
	}
	return detail
}
