package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

type continuationProviderFixture struct {
	calls    int
	spec     GenerationSpec
	next     Stream
	err      error
	makeNext func(GenerationSpec) Stream
}

func (p *continuationProviderFixture) Open(_ context.Context, spec GenerationSpec) (Stream, error) {
	p.calls++
	p.spec = spec
	if p.makeNext != nil {
		return p.makeNext(spec), p.err
	}
	return p.next, p.err
}
func (*continuationProviderFixture) CheckCompatibility(context.Context, string) error { return nil }

func continuationStream(c Candidate) Stream {
	var wire strings.Builder
	// A label, escape or multibyte character may cross every chunk boundary.
	for _, r := range p0JSON(c) {
		wire.WriteString(p0SSE(string(r)))
	}
	wire.WriteString("data: [DONE]\n\n")
	return &openRouterStream{body: io.NopCloser(strings.NewReader(wire.String()))}
}

func continuationFixture() (GenerationSpec, Candidate) {
	return GenerationSpec{RunID: "run_fixture", ProviderModelID: "minimax/minimax-m3", Entries: []string{"young", "grape"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 50}, Candidate{
		Passage: "Young(young) people visited a vineyard.", Tags: []string{"visit"},
		Targets: []CandidateTarget{{"young", "not old", "young(young) children"}, {"grape", "a small fruit", "fresh grapes(grape) beside a grape"}},
	}
}

func TestContinuationAppendOnlyAndPreservesLearningResources(t *testing.T) {
	for _, minimum := range []int{1, 50, 400} {
		spec, original := continuationFixture()
		spec.MinimumWords = minimum
		extra := Candidate{Passage: "They picked grapes(grape) with a young helper. " + strings.TrimSpace(strings.Repeat("Everyone shared food and stories together. ", minimum/6+1)), Tags: []string{"harvest"}, Targets: []CandidateTarget{}}
		provider := &continuationProviderFixture{next: continuationStream(extra)}
		var preview strings.Builder
		result, err := ReceiveWithCorrections(context.Background(), provider, testValidator(t), spec, continuationStream(original), func(delta string) error { preview.WriteString(delta); return nil })
		if err != nil {
			t.Fatal(err)
		}
		if provider.calls != 1 || provider.spec.RunID != spec.RunID || provider.spec.ProviderModelID != spec.ProviderModelID {
			t.Fatal("not exactly one same-run/same-model continuation")
		}
		plan := provider.spec.continuation
		if !reflect.DeepEqual(plan.Missing, []string{"grape"}) || plan.WordCount != 5 || plan.AdditionalWords != max(0, minimum-5) {
			t.Fatalf("incorrect measured deficits: %+v", plan)
		}
		if result.Passage != original.Passage+"\n\n"+extra.Passage || !reflect.DeepEqual(result.Targets, original.Targets) || !reflect.DeepEqual(result.Tags, extra.Tags) {
			t.Fatal("rewrote original text/resources or lost updated tags")
		}
		batch, err := testValidator(t).Validate(context.Background(), spec, result)
		if err != nil {
			t.Fatal(err)
		}
		if batch.Passage != preview.String() || strings.Contains(preview.String(), "(grape)") || len(batch.Targets[0].PassageOccurrences) != 2 || len(batch.Targets[1].HintOccurrences) != 2 {
			t.Fatal("stream/offset/repeated occurrence invariant broken")
		}
	}
}

func TestContinuationDoesNotHideOtherFailures(t *testing.T) {
	for _, mode := range []string{"complete", "collision", "probe", "already_continuing", "already_correcting", "lexicon"} {
		t.Run(mode, func(t *testing.T) {
			spec, candidate := continuationFixture()
			switch mode {
			case "complete":
				spec.MinimumWords = 1
				candidate.Passage += " Grapes(grape) grew nearby."
			case "collision":
				spec.Entries = []string{"teach", "teacher"}
				candidate.Passage = "Teachers(teach) met a teacher(teacher)."
				candidate.Targets = []CandidateTarget{{"teach", "give instruction", "teach(teach) children"}, {"teacher", "a person giving instruction", "a teacher(teacher)"}}
			case "probe":
				spec.CompatibilityProbe = true
			case "already_continuing":
				spec.continuation = &passageContinuation{}
			case "already_correcting":
				spec.correction = &contentCorrection{}
			}
			validator := testValidator(t)
			if mode == "lexicon" {
				validator = Validator{}
			}
			provider := &continuationProviderFixture{err: errors.New("must not call")}
			result, err := ReceiveWithCorrections(context.Background(), provider, validator, spec, continuationStream(candidate), func(string) error { return nil })
			if err != nil || provider.calls != 0 || !reflect.DeepEqual(result, candidate) {
				t.Fatalf("unexpected repair/rewriting: %d %v", provider.calls, err)
			}
		})
	}
}

func TestContinuationStopsAfterTwoInsufficientAppends(t *testing.T) {
	for _, text := range []string{"They went home.", "Young(young) people rested."} {
		spec, candidate := continuationFixture()
		provider := &continuationProviderFixture{makeNext: func(GenerationSpec) Stream {
			return continuationStream(Candidate{Passage: text, Tags: []string{"visit"}, Targets: []CandidateTarget{}})
		}}
		result, err := ReceiveWithCorrections(context.Background(), provider, testValidator(t), spec, continuationStream(candidate), func(string) error { return nil })
		if err != nil || provider.calls != 2 {
			t.Fatalf("receive: calls=%d err=%v", provider.calls, err)
		}
		if _, err := testValidator(t).Validate(context.Background(), spec, result); err == nil {
			t.Fatal("incomplete/invalid repair bypassed final validation")
		}
	}
}

func TestContinuationCancellationAndProviderErrors(t *testing.T) {
	for _, mode := range []string{"cancel_first", "callback_first", "open_error", "receive_error", "cancel_second", "callback_second", "unexpected_targets"} {
		t.Run(mode, func(t *testing.T) {
			spec, candidate := continuationFixture()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			stop := errors.New("browser write failed")
			provider := &continuationProviderFixture{next: continuationStream(Candidate{Passage: "They picked grapes(grape).", Tags: []string{"harvest"}, Targets: []CandidateTarget{}})}
			if mode == "open_error" {
				provider.err = &ProviderError{Category: FailureRateLimited}
			}
			if mode == "receive_error" {
				provider.next = &openRouterStream{body: io.NopCloser(strings.NewReader("data: broken\n\n"))}
			}
			if mode == "unexpected_targets" {
				provider.next = continuationStream(candidate)
			}
			_, err := ReceiveWithCorrections(ctx, provider, testValidator(t), spec, continuationStream(candidate), func(string) error {
				if mode == "cancel_first" || mode == "cancel_second" && provider.calls == 1 {
					cancel()
					return ctx.Err()
				}
				if mode == "callback_first" || mode == "callback_second" && provider.calls == 1 {
					return stop
				}
				return nil
			})
			if err == nil {
				t.Fatal("failure swallowed")
			}
			want := 1
			if mode == "cancel_first" || mode == "callback_first" {
				want = 0
			}
			if provider.calls != want {
				t.Fatalf("calls %d, want %d", provider.calls, want)
			}
			if strings.HasPrefix(mode, "cancel_") && !errors.Is(err, context.Canceled) {
				t.Fatal("cancellation identity lost")
			}
			if strings.HasPrefix(mode, "callback_") && !errors.Is(err, stop) {
				t.Fatal("callback error lost")
			}
		})
	}
}

func TestContinuationPromptAndSchemaHaveOneNarrowTask(t *testing.T) {
	spec, candidate := continuationFixture()
	spec.continuation = &passageContinuation{Passage: candidate.Passage, Missing: []string{"grape"}, Entries: spec.Entries, WordCount: 6, MinimumWords: 50, AdditionalWords: 44, MeaningLanguage: "English", Scenario: "story"}
	request := openRouterRequest(spec)
	var input passageContinuation
	if err := json.Unmarshal([]byte(userPrompt(spec)), &input); err != nil || !reflect.DeepEqual(input, *spec.continuation) {
		t.Fatal("deficit input differs")
	}
	if request["model"] != spec.ProviderModelID || request["stream"] != true || request["provider"].(map[string]any)["allow_fallbacks"] != false {
		t.Fatal("route/stream policy changed")
	}
	schema := outputSchema(spec)["properties"].(map[string]any)["targets"].(map[string]any)
	if len(schema["properties"].(map[string]any)) != 0 || schema["additionalProperties"] != false || len(schema["required"].([]string)) != 0 {
		t.Fatal("continuation can regenerate learning resources")
	}
	if strings.Contains(systemPrompt(spec), "<example>") || !strings.Contains(systemPrompt(spec), "minimum_additional_words") || !strings.Contains(systemPrompt(spec), "WHOLE passage") {
		t.Fatal("not a focused continuation prompt")
	}
}

func TestContinuationTraceRecordsDeficitAndSeparateAttempt(t *testing.T) {
	spec, candidate := continuationFixture()
	recorder := &tracetest.Recorder{}
	trace := gt.New("req_fixture", recorder)
	ctx := gt.With(context.Background(), trace)
	provider := &continuationProviderFixture{err: &ProviderError{Category: FailureRateLimited}}
	_, err := ReceiveWithCorrections(ctx, provider, testValidator(t), spec, continuationStream(candidate), func(string) error { return nil })
	trace.Finish()
	if err == nil {
		t.Fatal("expected failure")
	}
	events, summaries := recorder.Read()
	if len(summaries) != 1 || summaries[0].Stages[gt.Continuation].State != gt.Failed || summaries[0].Stages[gt.ContentValidate].State != gt.NotRun {
		t.Fatal("preflight invented final validation or lost continuation failure")
	}
	counts := map[string]int{}
	for _, event := range events {
		counts[event.Fact.Check]++
		if event.Fact.Check == "continuation_needed" && (event.Fact.Detail.Actual != 5 || event.Fact.Detail.Limit != 50) {
			t.Fatal("deficit measurements missing")
		}
		if event.Fact.Check == "continuation_missing" && event.Fact.Detail.Target != 1 {
			t.Fatal("missing entry ordinal lost")
		}
	}
	if counts["correction_started"] != 1 || counts["correction_finished"] != 1 || counts["continuation_missing"] != 1 {
		t.Fatalf("attempt boundary lost: %v", counts)
	}
	raw, _ := json.Marshal(events)
	if strings.Contains(string(raw), candidate.Passage) || strings.Contains(string(raw), "grape") {
		t.Fatal("content leaked to ordinary trace")
	}
}

func TestReviewedMelancholicAndUnmarkedYoungOccurrences(t *testing.T) {
	v := testValidator(t)
	spec := GenerationSpec{Entries: []string{"melancholy", "young"}, MeaningLanguage: "en", MinimumWords: 1}
	candidate := Candidate{Passage: "A melancholic(melancholy) young(young) man met a younger friend. The youngest child greeted the young man and another young person.", Tags: []string{"meeting"}, Targets: []CandidateTarget{{"melancholy", "a feeling of sadness", "a melancholic(melancholy) mood"}, {"young", "not old", "young(young) children and younger friends"}}}
	batch, err := v.Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Targets[1].PassageOccurrences) != 5 || len(batch.Targets[1].HintOccurrences) != 2 {
		t.Fatal("unmarked known repetitions were not recovered")
	}
	for _, unrelated := range []string{"sad", "depressed", "banana", "melancholical"} {
		if _, status := v.lexicon.Analyze("melancholy", unrelated); status == RelationKnown {
			t.Fatalf("unproved relation accepted: %s", unrelated)
		}
	}
}
