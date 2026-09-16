package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"
)

func TestCompletionExamplesMatchRequestedLength(t *testing.T) {
	validator := testValidator(t)
	for _, language := range []string{"zh", "en", "ja"} {
		for _, tc := range []struct{ minimum, words, paragraphs int }{
			{50, 60, 2}, {100, 120, 3}, {200, 240, 4}, {400, 480, 6},
		} {
			t.Run(fmt.Sprintf("%s/%d", language, tc.minimum), func(t *testing.T) {
				var input struct {
					Entries []string `json:"entries"`
					Minimum int      `json:"minimum_words"`
					Target  int      `json:"target_words"`
				}
				if err := json.Unmarshal([]byte(promptExampleInput(language, tc.minimum)), &input); err != nil ||
					input.Minimum != tc.minimum || input.Target != tc.minimum*6/5 {
					t.Fatal("example input does not match requested length", input, err)
				}
				spec := GenerationSpec{Entries: input.Entries, MeaningLanguage: language, Scenario: "story", MinimumWords: tc.minimum}
				raw := promptExampleOutput(language, tc.minimum)
				var candidate Candidate
				if err := decodeCandidateStrict(context.Background(), []byte(raw), &candidate); err != nil {
					t.Fatal(err)
				}
				batch, err := validator.Validate(context.Background(), spec, candidate)
				if err != nil || batch.WordCount != tc.words {
					t.Fatal("example is not complete at its advertised length", batch.WordCount, err)
				}
				if strings.Count(batch.Passage, "\n\n")+1 != tc.paragraphs || batch.Passage != strings.TrimSpace(batch.Passage) {
					t.Fatal("example spacing is invalid")
				}
				assertTenEntryExampleCoverage(t, batch)
				prompt := systemPrompt(spec)
				if strings.Count(prompt, "<example>") != 1 || strings.Count(prompt, raw) != 1 ||
					!strings.Contains(prompt, promptExampleInput(language, tc.minimum)) {
					t.Fatal("system contains the wrong example or stacks multiple examples")
				}
				var preview strings.Builder
				extractor := passageExtractor{}
				for end := 1; end <= len(raw); end++ {
					delta, err := extractor.Extract(context.Background(), raw[:end])
					if err != nil {
						t.Fatal(err)
					}
					preview.WriteString(delta)
					if !strings.HasPrefix(batch.Passage, preview.String()) {
						t.Fatal("stream leaked annotations or damaged spacing")
					}
				}
				if preview.String() != batch.Passage {
					t.Fatal("stream and final passage disagree")
				}
				t.Logf("%d clean words; %d paragraphs; full-word inflection; one complete example", batch.WordCount, tc.paragraphs)
			})
		}
	}
}

func TestCompletionPromptKeepsWholeWordAndCoverageRules(t *testing.T) {
	for _, minimum := range []int{50, 100, 200, 400} {
		for _, language := range []string{"zh", "en", "ja"} {
			prompt := systemPrompt(GenerationSpec{MinimumWords: minimum, MeaningLanguage: language})
			for _, rule := range []string{
				"Before closing the passage string, cover every entry",
				"an opening paragraph alone is not a complete passage",
				"Words in tags, meanings or hints do not count",
				"All inflection letters go before the opening parenthesis",
				"enforced(enforce), deteriorated(deteriorate)",
				"Never insert a label between a word's stem and suffix",
				"Apply this to both passage and hint_phrase",
			} {
				if !strings.Contains(prompt, rule) {
					t.Fatal("missing completion guidance", rule)
				}
			}
			if strings.Contains(prompt, "enforce(enforce)d") {
				t.Fatal("prompt demonstrates the malformed spelling")
			}
		}
	}
}

// Synthetic reductions of actual r6 failures. Prompt changes must not add a
// repair path, ignore missing coverage, or lower production word minimums.
func TestCompletionPromptKnownFailuresRemainRejected(t *testing.T) {
	t.Run("label_inside_inflection", func(t *testing.T) {
		for _, field := range []string{"passage", "hint"} {
			t.Run(field, func(t *testing.T) {
				spec, candidate := mappingCandidate("enforce", "Rules are enforced.", "enforced rules", []string{"enforced"}, []string{"enforced"})
				validator := testValidator(t)
				control, err := validator.Validate(context.Background(), spec, candidate)
				if err != nil {
					t.Fatal("whole-word positive control", err)
				}
				if field == "passage" {
					candidate.Passage = strings.ReplaceAll(candidate.Passage, "enforced(enforce)", "enforce(enforce)d")
				} else {
					candidate.Targets[0].HintPhrase = strings.ReplaceAll(candidate.Targets[0].HintPhrase, "enforced(enforce)", "enforce(enforce)d")
				}
				stream := openRouterStream{io.NopCloser(strings.NewReader(p0SSE(p0JSON(candidate))))}
				defer stream.Close()
				var preview strings.Builder
				decoded, err := stream.Receive(context.Background(), func(delta string) error { preview.WriteString(delta); return nil })
				if err != nil || preview.String() != control.Passage {
					t.Fatal("stream should preserve clean prose, not rewrite it", err)
				}
				if _, err := validator.Validate(context.Background(), spec, decoded); DescribeFailure(err).Reason != "mapping_surface_absent" {
					t.Fatal("malformed inline target silently repaired or accepted", err)
				}
			})
		}
	})
	for _, tc := range []struct{ words, minimum int }{{67, 100}, {78, 400}, {74, 200}} {
		t.Run(fmt.Sprintf("short_%d_of_%d", tc.words, tc.minimum), func(t *testing.T) {
			spec, candidate := p0Candidate()
			validator := testValidator(t)
			control, err := validator.Validate(context.Background(), spec, candidate)
			if err != nil || control.WordCount >= tc.words {
				t.Fatal("invalid synthetic control", err)
			}
			spec.MinimumWords = tc.minimum
			candidate.Passage = strings.Repeat("Neighbors ", tc.words-control.WordCount) + candidate.Passage
			if tc.words == 78 {
				candidate.Passage += " "
				if _, err := validator.Validate(context.Background(), spec, candidate); DescribeFailure(err).Reason != "passage_content_invalid" {
					t.Fatal("trailing whitespace unexpectedly accepted", err)
				}
				candidate.Passage = strings.TrimSpace(candidate.Passage)
			}
			_, err = validator.Validate(context.Background(), spec, candidate)
			failure := DescribeFailure(err)
			if failure.Reason != "passage_too_short" || failure.Actual != tc.words || failure.Limit != tc.minimum {
				t.Fatal("production minimum was weakened", failure)
			}
		})
	}
}
