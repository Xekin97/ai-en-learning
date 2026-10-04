package ai

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"strings"
	"time"

	evidence "wordweave/internal/generationevidence"
	gt "wordweave/internal/generationtrace"
)

type ReplayMode string

const (
	ReplayModel  ReplayMode = "model"
	ReplayStream ReplayMode = "stream"
)

// ReplayReport is content-free. "reproduced" refers only to the model pipeline;
// it never asserts a database settlement, a refund or a browser delivery.
type ReplayReport struct {
	Mode               ReplayMode    `json:"mode"`
	Scope              string        `json:"scope"`
	Status             string        `json:"status"` // reproduced, differs, unavailable
	Reason             string        `json:"reason"`
	Failure            *gt.StageFact `json:"failure,omitempty"`
	CandidateSHA256    string        `json:"candidate_sha256,omitempty"`
	ValidatedSHA256    string        `json:"validated_sha256,omitempty"`
	PassageDeltaSHA256 string        `json:"passage_delta_sha256,omitempty"`
}
type replayTrace struct{ summary gt.Summary }

func (*replayTrace) Event(gt.Event)         {}
func (r *replayTrace) Summary(s gt.Summary) { r.summary = s }

// ReplayEvidence is completely offline. It accepts an existing validator, has
// no provider/DB/client configuration, and never writes or extends retention.
func ReplayEvidence(ctx context.Context, view evidence.View, current evidence.Fingerprint, mode ReplayMode, validator Validator) ReplayReport {
	report := ReplayReport{Mode: mode, Scope: "model_pipeline", Status: "unavailable"}
	if mode != ReplayModel && mode != ReplayStream {
		report.Reason = "invalid_mode"
		return report
	}
	if validator.lexicon == nil {
		report.Reason = "validator_unavailable"
		return report
	}
	m, reason := evidence.Reconstruct(view, current, time.Now())
	if reason != "" {
		report.Reason = reason
		return report
	}
	if m.Spec.PromptVersion != PromptVersion {
		report.Reason = "prompt_version_mismatch"
		return report
	}
	first := m.Summary.FirstFailure
	if first != nil && first.Stage != gt.PassageDecode.String() && first.Stage != gt.CandidateDecode.String() && first.Stage != gt.ContentValidate.String() {
		report.Reason = "failure_outside_model_pipeline"
		return report
	}
	if first == nil && m.Summary.Stages[gt.ContentValidate].State != gt.OK {
		report.Reason = "validation_not_observed"
		return report
	}
	recorder := &replayTrace{}
	trace := gt.New("req_offline_replay", recorder)
	ctx = gt.With(ctx, trace)
	spec := GenerationSpec{RunID: m.Spec.RunID, ModelID: m.Spec.ModelID, ProviderModelID: m.Spec.ProviderModelID, MeaningLanguage: m.Spec.MeaningLanguage, Scenario: m.Spec.Scenario, LengthCode: m.Spec.LengthCode, MinimumWords: m.Spec.MinimumWords, Entries: m.Spec.Entries, PromptVersion: m.Spec.PromptVersion}
	var candidate Candidate
	var err error
	if mode == ReplayStream {
		// Synthetic SSE envelopes retain the captured delta.content boundaries.
		// Original HTTP/SSE envelope failures cannot be reconstructed this way.
		var wire strings.Builder
		for _, chunk := range m.Chunks {
			// Encoding a content string cannot reinterpret whitespace or escapes.
			text, _ := json.Marshal(chunk)
			wire.WriteString("data: {\"choices\":[{\"delta\":{\"content\":")
			wire.Write(text)
			wire.WriteString("}}]}\n\n")
		}
		wire.WriteString("data: [DONE]\n\n")
		stream := openRouterStream{body: io.NopCloser(strings.NewReader(wire.String()))}
		deltas := sha256.New()
		candidate, err = stream.Receive(ctx, func(delta string) error { hashCleanDelta(deltas, delta); return nil })
		report.PassageDeltaSHA256 = hex.EncodeToString(deltas.Sum(nil))
		_ = stream.Close()
	} else {
		trace.Begin(gt.CandidateDecode)
		err = decodeCandidateStrict(ctx, []byte(strings.Join(m.Chunks, "")), &candidate)
		traceResult(ctx, gt.CandidateDecode, err)
	}
	if err == nil {
		raw, _ := json.Marshal(candidate)
		report.CandidateSHA256 = evidence.Digest(raw)
		var batch ValidatedBatch
		batch, err = validator.Validate(ctx, spec, candidate)
		if err == nil {
			raw, _ = json.Marshal(batch)
			report.ValidatedSHA256 = evidence.Digest(raw)
		}
	}
	trace.Finish()
	report.Failure = recorder.summary.FirstFailure
	if ctx.Err() != nil {
		report.Reason = "replay_cancelled"
		return report
	}
	if mode == ReplayModel && first != nil && first.Stage == gt.PassageDecode.String() {
		report.Reason = "stream_boundary_requires_stream_mode"
		return report
	}
	if !sameReplayFailure(first, report.Failure) {
		report.Status = "differs"
		report.Reason = "failure_boundary_differs"
		return report
	}
	digests := map[string]string{"candidate": report.CandidateSHA256, "validated": report.ValidatedSHA256}
	if mode == ReplayStream {
		digests["passage_deltas"] = report.PassageDeltaSHA256
	}
	for kind, digest := range digests {
		expected := m.Processing[kind]
		if digest != "" && expected == "" {
			report.Reason = "processing_digest_missing"
			return report
		}
		if digest != expected {
			report.Status = "differs"
			report.Reason = "processing_digest_differs"
			return report
		}
	}
	report.Status = "reproduced"
	report.Reason = "model_pipeline_reproduced"
	return report
}
func sameReplayFailure(a, b *gt.StageFact) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Stage == b.Stage && a.State == b.State && a.Detail == b.Detail
}
