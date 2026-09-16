package ai

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	evidence "wordweave/internal/generationevidence"
	gt "wordweave/internal/generationtrace"
)

// Deterministic paced fixture isolates replay correctness from the separate
// deliberate queue-overflow tests. There is no HTTP or model call.
type pacedReplayReader struct {
	frames []string
	offset int
}

func (r *pacedReplayReader) Read(p []byte) (int, error) {
	if len(r.frames) == 0 {
		return 0, io.EOF
	}
	if r.offset == 0 {
		time.Sleep(time.Millisecond)
	}
	n := copy(p, r.frames[0][r.offset:])
	r.offset += n
	if r.offset == len(r.frames[0]) {
		r.frames = r.frames[1:]
		r.offset = 0
	}
	return n, nil
}
func captureFixture(t *testing.T, spec GenerationSpec, text string, key string) (evidence.View, evidence.Fingerprint) {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	h := evidence.Digest([]byte("synthetic replay test fingerprints"))
	fp := evidence.Fingerprint{Source: h, Binary: h, Template: h, Schema: h, Validator: h, Lexicon: h}
	m, err := evidence.Open(evidence.Options{Directory: dir, Fingerprint: fp})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := m.Close(ctx); err != nil {
			t.Error(err)
		}
	})
	bundle := m.Admit("account", evidence.DedicatedAccountID, "req_replay_fixture", time.Now())
	if bundle == nil {
		t.Fatal("no bundle")
	}
	trace := gt.New("req_replay_fixture", nil)
	trace.AttachCapture(bundle)
	ctx := gt.With(context.Background(), trace)
	spec.PromptVersion = PromptVersion
	bundle.EffectiveSpec(gt.EffectiveSpec{RunID: spec.RunID, ModelID: spec.ModelID, ProviderModelID: spec.ProviderModelID, MeaningLanguage: spec.MeaningLanguage, Scenario: spec.Scenario, LengthCode: spec.LengthCode, MinimumWords: spec.MinimumWords, Entries: spec.Entries, PromptVersion: spec.PromptVersion})
	var wire strings.Builder
	for start := 0; start < len(text); {
		end := min(start+17, len(text))
		for end < len(text) && !utf8.RuneStart(text[end]) {
			end--
		}
		wire.WriteString(p0SSE(text[start:end]))
		start = end
	}
	wire.WriteString("data: [DONE]\n\n")
	frames := strings.SplitAfter(wire.String(), "\n\n")
	frames = frames[:len(frames)-1]
	stream := openRouterStream{&privateProviderBody{io.NopCloser(&pacedReplayReader{frames: frames}), key}}
	candidate, err := stream.Receive(ctx, func(string) error { return nil })
	stream.Close()
	if err == nil {
		_, _ = testValidator(t).Validate(ctx, spec, candidate)
	}
	trace.Finish()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		view, e := evidence.Read(dir, bundle.ID(), time.Now())
		if e == nil && !view.Incomplete {
			if err := evidence.Recheck(dir, view.Manifest, time.Now()); err != nil {
				t.Fatal(err)
			}
			return view, fp
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("capture not complete")
	return evidence.View{}, fp
}
func cloneView(t *testing.T, v evidence.View) evidence.View {
	t.Helper()
	raw, _ := json.Marshal(v)
	var copy evidence.View
	if err := json.Unmarshal(raw, &copy); err != nil {
		t.Fatal(err)
	}
	return copy
}
func TestOBS042BReplayProductionRuleMatrix(t *testing.T) {
	validator := testValidator(t)
	cases := append([]p0ValidationCase{{name: "valid", mutate: func(*GenerationSpec, *Candidate) {}}}, p0ValidationCases()...)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec, candidate := p0Candidate()
			tc.mutate(&spec, &candidate)
			view, fp := captureFixture(t, spec, p0JSON(candidate), "synthetic-key")
			var original *gt.StageFact
			for _, r := range view.Records {
				if r.Summary != nil {
					original = r.Summary.FirstFailure
				}
			}
			for _, mode := range []ReplayMode{ReplayStream, ReplayModel} {
				report := ReplayEvidence(context.Background(), view, fp, mode, validator)
				if mode == ReplayModel && original != nil && original.Stage == gt.PassageDecode.String() {
					if report.Status != "unavailable" || report.Reason != "stream_boundary_requires_stream_mode" {
						t.Fatalf("wrong scope: %+v", report)
					}
					continue
				}
				if report.Status != "reproduced" {
					for _, record := range view.Records {
						if record.State != nil {
							t.Logf("capture state: %+v; file bytes: %d", *record.State, view.Bytes)
						}
					}
					t.Fatalf("%s replay failed: %+v; original %+v", mode, report, original)
				}
				if report.Scope != "model_pipeline" {
					t.Fatal("claims full request replay")
				}
			}
		})
	}
}
func TestOBS042BReplayRejectsMissingRedactedOrChangedEvidence(t *testing.T) {
	spec, candidate := p0Candidate()
	base, fp := captureFixture(t, spec, p0JSON(candidate), "synthetic-key")
	validator := testValidator(t)
	cases := []struct {
		name           string
		mutate         func(*evidence.View, *evidence.Fingerprint)
		status, reason string
	}{
		{"fingerprint", func(v *evidence.View, f *evidence.Fingerprint) { f.Source = evidence.Digest([]byte("changed source")) }, "unavailable", "fingerprint_mismatch"},
		{"expired", func(v *evidence.View, f *evidence.Fingerprint) { v.Manifest.ExpiresAt = time.Now().Add(-time.Second) }, "unavailable", "expired"},
		{"partial_tail", func(v *evidence.View, f *evidence.Fingerprint) { v.Incomplete = true }, "unavailable", "incomplete_journal"},
		{"redacted", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.State != nil {
					r.State.Redacted = true
				}
			}
		}, "unavailable", "capture_not_exact"},
		{"dropped", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.State != nil {
					r.State.DroppedRecords++
				}
			}
		}, "unavailable", "capture_not_exact"},
		{"truncated", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.State != nil {
					r.State.Truncated = true
				}
			}
		}, "unavailable", "capture_not_exact"},
		{"io_failed", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.State != nil {
					r.State.IOFailed = true
				}
			}
		}, "unavailable", "capture_not_exact"},
		{"offset", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.Chunk != nil {
					r.Chunk.Offset++
					break
				}
			}
		}, "unavailable", "invalid_offset"},
		{"missing_end", func(v *evidence.View, f *evidence.Fingerprint) {
			for i := range v.Records {
				v.Records[i].ModelEnd = nil
			}
		}, "unavailable", "missing_model_end_or_content"},
		{"missing_spec", func(v *evidence.View, f *evidence.Fingerprint) {
			for i := range v.Records {
				v.Records[i].Spec = nil
			}
		}, "unavailable", "missing_spec_or_summary"},
		{"missing_digest", func(v *evidence.View, f *evidence.Fingerprint) {
			for i := range v.Records {
				v.Records[i].Processing = nil
			}
		}, "unavailable", "processing_digest_missing"},
		{"changed_digest", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.Processing != nil {
					r.Processing.SHA256 = evidence.Digest([]byte("changed"))
				}
			}
		}, "differs", "processing_digest_differs"},
		{"new_prompt", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.Spec != nil {
					r.Spec.PromptVersion = "different"
				}
			}
		}, "unavailable", "prompt_version_mismatch"},
		{"changed_failure", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.Summary != nil {
					r.Summary.FirstFailure = &gt.StageFact{Stage: gt.ContentValidate.String(), State: gt.Failed, Detail: gt.Why("passage_too_short")}
				}
			}
		}, "differs", "failure_boundary_differs"},
		{"transport", func(v *evidence.View, f *evidence.Fingerprint) {
			for _, r := range v.Records {
				if r.Summary != nil {
					r.Summary.FirstFailure = &gt.StageFact{Stage: gt.ProviderStream.String(), State: gt.Failed, Detail: gt.Why("sse_read_failed")}
				}
			}
		}, "unavailable", "failure_outside_model_pipeline"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			v, f := cloneView(t, base), fp
			tc.mutate(&v, &f)
			report := ReplayEvidence(context.Background(), v, f, ReplayStream, validator)
			if report.Status != tc.status || report.Reason != tc.reason {
				t.Fatalf("false replay claim: %+v", report)
			}
		})
	}
}
func TestOBS042BReplayRejectsActualRedactionAndCancellation(t *testing.T) {
	spec, candidate := p0Candidate()
	candidate.Targets[0].EntryMeaning = "Bearer TEST_PRIVATE_TOKEN"
	view, fp := captureFixture(t, spec, p0JSON(candidate), "synthetic-key")
	report := ReplayEvidence(context.Background(), view, fp, ReplayStream, testValidator(t))
	if report.Status != "unavailable" || report.Reason != "capture_not_exact" {
		t.Fatalf("redacted replay: %+v", report)
	}
	spec, candidate = p0Candidate()
	view, fp = captureFixture(t, spec, p0JSON(candidate), "synthetic-key")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	report = ReplayEvidence(ctx, view, fp, ReplayStream, testValidator(t))
	if report.Status != "unavailable" || report.Reason != "replay_cancelled" {
		t.Fatalf("cancelled: %+v", report)
	}
	report = ReplayEvidence(context.Background(), view, fp, ReplayMode("unknown"), testValidator(t))
	if report.Reason != "invalid_mode" {
		t.Fatal(report)
	}
}
