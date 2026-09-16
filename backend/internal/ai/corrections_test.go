package ai

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

func TestCorrectionsRepairObservedAnnotationsWithoutRewriting(t *testing.T) {
	for _, mode := range []string{"wrong_relation", "unknown_source", "missing_marker", "hint_source", "hint_syntax", "hint_relation", "hint_missing", "meaning_language", "meaning_repeated", "tags_language", "tags_duplicate", "second_fix", "exhausted"} {
		t.Run(mode, func(t *testing.T) {
			spec := GenerationSpec{RunID: "same_run", ModelID: "same_model", ProviderModelID: "test/no-online-provider", Entries: []string{"danger"}, MeaningLanguage: "en", MinimumWords: 1}
			good := Candidate{Passage: "The work carries inherent danger(danger).", Tags: []string{"safety"}, Targets: []CandidateTarget{{"danger", "the possibility of harm", "serious dangers(danger)"}}}
			original := good
			original.Targets = append([]CandidateTarget(nil), good.Targets...)
			wantField := "passage"
			switch mode {
			case "wrong_relation", "second_fix", "exhausted":
				original.Passage = "The work carries(danger) inherent danger(danger)."
			case "unknown_source":
				spec.Entries = []string{"vulnerable"}
				good = Candidate{Passage: "Their vulnerability(vulnerable) was clear.", Tags: []string{"safety"}, Targets: []CandidateTarget{{"vulnerable", "easily harmed", "a vulnerable(vulnerable) child"}}}
				original = good
				original.Passage = "Their vulnerability(vulnerability) was clear."
			case "missing_marker":
				original.Passage = "The work carries inherent danger."
			case "hint_source":
				wantField = "hint_phrase"
				original.Targets[0].HintPhrase = "serious dangers(dangers)"
			case "hint_syntax":
				wantField = "hint_phrase"
				original.Targets[0].HintPhrase = "serious dangers(danger"
			case "hint_relation":
				wantField = "hint_phrase"
				original.Targets[0].HintPhrase = "serious bananas(danger)"
			case "hint_missing":
				wantField = "hint_phrase"
				original.Targets[0].HintPhrase = "serious dangers"
			case "meaning_language":
				wantField = "entry_meaning"
				original.Targets[0].EntryMeaning = "危险"
			case "meaning_repeated":
				wantField = "entry_meaning"
				original.Targets[0].EntryMeaning = "danger"
			case "tags_language":
				wantField = "tags"
				original.Tags = []string{"危险"}
			case "tags_duplicate":
				wantField = "tags"
				original.Tags = []string{"Safety", "safety"}
			}
			recorder := &tracetest.Recorder{}
			trace := gt.New("req_correction", recorder)
			ctx := gt.With(context.Background(), trace)
			var provider *continuationProviderFixture
			provider = &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
				if next.RunID != spec.RunID || next.ModelID != spec.ModelID || next.ProviderModelID != spec.ProviderModelID || next.correction == nil || next.continuation != nil || next.correction.Field != wantField {
					t.Fatal("incorrect correction task/route/run")
				}
				if (wantField == "hint_phrase" || wantField == "entry_meaning") && next.correction.Entry != spec.Entries[0] {
					t.Fatal("wrong affected original entry")
				}
				if mode == "exhausted" || mode == "second_fix" && provider.calls == 1 {
					return continuationStream(original)
				}
				return continuationStream(good)
			}}
			var preview strings.Builder
			result, err := ReceiveWithCorrections(ctx, provider, testValidator(t), spec, continuationStream(original), func(d string) error { preview.WriteString(d); return nil })
			trace.Finish()
			if err != nil {
				t.Fatal(err)
			}
			wantCalls := 1
			if mode == "second_fix" || mode == "exhausted" {
				wantCalls = 2
			}
			if provider.calls != wantCalls {
				t.Fatalf("corrections=%d want=%d", provider.calls, wantCalls)
			}
			batch, err := testValidator(t).Validate(context.Background(), spec, result)
			if mode == "exhausted" {
				if err == nil {
					t.Fatal("invalid result escaped final gate")
				}
			} else if err != nil || batch.Passage != preview.String() {
				t.Fatalf("final validation or unchanged preview failed: %v", err)
			}
			events, summaries := recorder.Read()
			started, finished := 0, 0
			for _, event := range events {
				switch event.Fact.Check {
				case "correction_started":
					started++
					if event.Fact.Detail.Actual != started || event.Fact.Detail.Limit != 2 {
						t.Fatal("attempt ordinal/limit missing")
					}
				case "correction_finished":
					finished++
				}
			}
			if started != wantCalls || finished != wantCalls || len(summaries) != 1 {
				t.Fatal("missing model attempt boundaries")
			}
			wantState := gt.OK
			if mode == "exhausted" {
				wantState = gt.Failed
			}
			if summaries[0].Stages[gt.Continuation].State != wantState || summaries[0].Stages[gt.ContentValidate].State != gt.NotRun {
				t.Fatal("preflight corrupted final validation trace")
			}
			raw, _ := json.Marshal(events)
			if strings.Contains(string(raw), original.Passage) || strings.Contains(string(raw), original.Targets[0].EntryMeaning) {
				t.Fatal("private text leaked into ordinary logs")
			}
		})
	}
}

func TestCorrectionsShareLimitAcrossModes(t *testing.T) {
	for _, mode := range []string{"append_then_fix", "fix_then_append", "append_twice"} {
		t.Run(mode, func(t *testing.T) {
			spec, original := continuationFixture()
			spec.MinimumWords = 1
			extra := Candidate{Passage: "They picked grapes(grape).", Tags: []string{"harvest"}, Targets: []CandidateTarget{}}
			if mode == "fix_then_append" {
				original.Passage += " Bananas(grape) grew nearby."
			}
			var provider *continuationProviderFixture
			provider = &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
				switch mode {
				case "append_then_fix":
					if provider.calls == 1 {
						if next.continuation == nil {
							t.Fatal("expected append")
						}
						bad := extra
						bad.Passage = "They picked grapes(grapes)."
						return continuationStream(bad)
					}
					if next.correction == nil || next.correction.Reason != "annotation_source_unknown" {
						t.Fatal("expected annotation correction")
					}
					fixed := original
					fixed.Passage += "\n\n" + extra.Passage
					fixed.Tags = extra.Tags
					return continuationStream(fixed)
				case "fix_then_append":
					if provider.calls == 1 {
						if next.correction == nil {
							t.Fatal("expected correction")
						}
						fixed := original
						fixed.Passage = strings.ReplaceAll(fixed.Passage, "Bananas(grape)", "Bananas")
						return continuationStream(fixed)
					}
					if next.continuation == nil || !reflect.DeepEqual(next.continuation.Missing, []string{"grape"}) {
						t.Fatal("missing word not recomputed")
					}
					return continuationStream(extra)
				default:
					if next.continuation == nil {
						t.Fatal("expected append")
					}
					if provider.calls == 1 {
						return continuationStream(Candidate{Passage: "They walked home.", Tags: []string{"visit"}, Targets: []CandidateTarget{}})
					}
					if next.continuation.WordCount != 8 {
						t.Fatal("word count not recomputed")
					}
					return continuationStream(extra)
				}
			}}
			var preview strings.Builder
			result, err := ReceiveWithCorrections(context.Background(), provider, testValidator(t), spec, continuationStream(original), func(d string) error { preview.WriteString(d); return nil })
			if err != nil || provider.calls != 2 {
				t.Fatalf("calls=%d err=%v", provider.calls, err)
			}
			batch, err := testValidator(t).Validate(context.Background(), spec, result)
			if err != nil || batch.Passage != preview.String() || !reflect.DeepEqual(result.Targets, original.Targets) {
				t.Fatalf("combined correction broke invariants: %v", err)
			}
		})
	}
}

func TestCorrectionRejectsVisibleRewritesAndRetainsOtherFields(t *testing.T) {
	for _, mode := range []string{"recover_rewrite", "repeat_rewrite", "retain_other_fields"} {
		t.Run(mode, func(t *testing.T) {
			spec, original := continuationFixture()
			spec.MinimumWords = 1
			original.Passage += " Grapes(grapes) grew nearby."
			fixed := original
			fixed.Passage = strings.ReplaceAll(original.Passage, "grapes)", "grape)")
			var provider *continuationProviderFixture
			provider = &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
				response := fixed
				if mode == "repeat_rewrite" || mode == "recover_rewrite" && provider.calls == 1 {
					response.Passage += " This was rewritten."
				} else if mode == "retain_other_fields" {
					response.Tags = []string{"unrequested"}
					response.Targets = []CandidateTarget{{"grape", "unrequested", "unrequested"}, {"young", "unrequested", "unrequested"}}
				}
				if mode == "recover_rewrite" && provider.calls == 2 && next.correction.PreviousError == "" {
					t.Fatal("rejected rewrite feedback missing")
				}
				return continuationStream(response)
			}}
			var preview strings.Builder
			result, err := ReceiveWithCorrections(context.Background(), provider, testValidator(t), spec, continuationStream(original), func(d string) error { preview.WriteString(d); return nil })
			if strings.Contains(preview.String(), "rewritten") {
				t.Fatal("rewrite leaked")
			}
			if mode == "repeat_rewrite" {
				if provider.calls != 2 || DescribeFailure(err).Reason != "clean_stream_mismatch" {
					t.Fatal("rewrite not rejected/bounded")
				}
				return
			}
			wantCalls := 1
			if mode == "recover_rewrite" {
				wantCalls = 2
			}
			if provider.calls != wantCalls || err != nil {
				t.Fatalf("calls=%d err=%v", provider.calls, err)
			}
			batch, err := testValidator(t).Validate(context.Background(), spec, result)
			if err != nil || batch.Passage != preview.String() || !reflect.DeepEqual(result.Targets, original.Targets) || !reflect.DeepEqual(result.Tags, original.Tags) {
				t.Fatalf("uncorrected fields changed: %v", err)
			}
		})
	}
}

func TestCorrectionsStopOnTransportProtocolAndCancellation(t *testing.T) {
	for _, mode := range []string{"third_open_429", "third_broken_json", "third_cancel", "hidden_cancel", "cancel_before_second"} {
		t.Run(mode, func(t *testing.T) {
			spec, original := continuationFixture()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var provider *continuationProviderFixture
			provider = &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
				if mode == "hidden_cancel" {
					cancel()
					return continuationStream(original)
				}
				if provider.calls == 2 {
					switch mode {
					case "third_open_429":
						provider.err = &ProviderError{Category: FailureRateLimited}
					case "third_broken_json":
						return continuationStream(Candidate{}) // Empty passage is rejected by the real decoder.
					case "third_cancel":
						cancel()
					}
				}
				return continuationStream(Candidate{Passage: "They went home.", Tags: []string{"visit"}, Targets: []CandidateTarget{}})
			}}
			if mode == "hidden_cancel" {
				original.Passage += " Grapes(grapes) grew nearby."
			}
			_, err := ReceiveWithCorrections(ctx, provider, testValidator(t), spec, continuationStream(original), func(string) error {
				if mode == "cancel_before_second" && provider.calls == 1 {
					cancel()
					return ctx.Err()
				}
				return nil
			})
			wantCalls := 2
			if mode == "hidden_cancel" || mode == "cancel_before_second" {
				wantCalls = 1
			}
			if err == nil || provider.calls != wantCalls {
				t.Fatalf("calls=%d err=%v", provider.calls, err)
			}
			if strings.Contains(mode, "cancel") && !errors.Is(err, context.Canceled) {
				t.Fatal("cancellation lost")
			}
		})
	}
}

type closeCancellingStream struct {
	Stream
	cancel context.CancelFunc
}

func (s closeCancellingStream) Close() error {
	s.cancel()
	return s.Stream.Close()
}

func TestCorrectionsCancelBetweenPreflightAndNextOpen(t *testing.T) {
	spec, original := continuationFixture()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	recorder := &tracetest.Recorder{}
	trace := gt.New("req_close_cancel", recorder)
	ctx = gt.With(ctx, trace)
	provider := &continuationProviderFixture{err: errors.New("must not open")}
	_, err := ReceiveWithCorrections(ctx, provider, testValidator(t), spec, closeCancellingStream{continuationStream(original), cancel}, func(string) error { return nil })
	trace.Finish()
	_, summaries := recorder.Read()
	if !errors.Is(err, context.Canceled) || provider.calls != 0 || len(summaries) != 1 || summaries[0].Stages[gt.Continuation].State != gt.NotRun {
		t.Fatal("cancelled preflight started another model or invented a correction stage")
	}
}

func TestCorrectionPromptUsesCurrentSchemaAndOriginalEntries(t *testing.T) {
	spec, original := continuationFixture()
	spec.correction = newContentCorrection(spec, original, FailureDetail{Field: "hint_phrase", Reason: "annotation_target_mismatch", Target: 1}, "")
	var input contentCorrection
	if err := json.Unmarshal([]byte(userPrompt(spec)), &input); err != nil || input.Entry != "grape" || input.Targets["grape"].Hint != original.Targets[1].HintPhrase {
		t.Fatal("correction input identity/schema incorrect")
	}
	schema := outputSchema(spec)["properties"].(map[string]any)
	targets := schema["targets"].(map[string]any)
	if len(targets["properties"].(map[string]any)) != 2 || targets["additionalProperties"] != false || !reflect.DeepEqual(targets["required"], spec.Entries) {
		t.Fatal("correction loosened the current schema")
	}
	if strings.Contains(systemPrompt(spec), "<example>") || !strings.Contains(systemPrompt(spec), "vulnerability(vulnerable)") || !strings.Contains(systemPrompt(spec), entryMeaningInstruction) || strings.Contains(schema["passage"].(map[string]any)["description"].(string), "minimum") {
		t.Fatal("correction prompt/schema conflicts with immutable prose")
	}
}
