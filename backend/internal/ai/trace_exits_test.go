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

func TestOBS042DSchemaExitChecksAndCounts(t *testing.T) {
	_, baseCandidate := p0Candidate()
	base := p0JSON(baseCandidate)
	type testCase struct {
		name, raw, check, reason string
		actual, limit            int
	}
	cases := []testCase{
		{"valid", base, "", "", -1, -1},
		{"byte_limit", strings.Repeat(" ", maxCandidateBytes+1), "candidate_bytes", "candidate_byte_limit", maxCandidateBytes + 1, maxCandidateBytes},
		{"encoding", string([]byte{0xff}), "candidate_encoding", "candidate_encoding_invalid", -1, -1},
		{"empty", " ", "candidate_nonempty", "candidate_empty", -1, -1},
		{"order", "{}", "passage_first", "passage_not_first", -1, -1},
		{"truncated", base[:len(base)-2], "json_tokens", "json_invalid", -1, -1},
		{"tail", base + "{}", "json_tokens", "json_trailing_content", -1, -1},
		{"null", strings.Replace(base, `"tags":["fruit"]`, `"tags":null`, 1), "json_tokens", "json_null", -1, -1},
		{"duplicate", strings.Replace(base, `"tags":`, `"tags":[],"tags":`, 1), "json_tokens", "json_duplicate_key", -1, -1},
		{"root_keys", strings.Replace(base, `"tags":`, `"synthetic-private-key":1,"tags":`, 1), "candidate_keys", "candidate_keys_invalid", -1, -1},
		{"targets_type", strings.Replace(base, p0JSON(baseCandidate.Targets), "false", 1), "targets_type", "targets_type_invalid", -1, -1},
		{"target_keys", strings.Replace(base, `"entry_meaning":`, `"synthetic-private-key":1,"entry_meaning":`, 1), "target_keys", "target_keys_invalid", 3, 2},
		{"field_type", strings.Replace(base, `"entry_meaning":"a small fruit"`, `"entry_meaning":3`, 1), "json_decode", "json_invalid", -1, -1},
	}
	for _, tc := range []struct {
		name, check, reason string
		mutate              func(*Candidate)
		actual, limit       int
	}{
		{"passage_empty", "passage_nonempty", "passage_empty", func(c *Candidate) { c.Passage = "" }, -1, -1},
		{"tags_empty", "tag_count", "tag_count_invalid", func(c *Candidate) { c.Tags = []string{} }, 0, 3},
		{"tags_many", "tag_count", "tag_count_invalid", func(c *Candidate) { c.Tags = []string{"a", "b", "c", "d"} }, 4, 3},
		{"tag_empty", "tag_size", "tag_size_invalid", func(c *Candidate) { c.Tags[0] = "" }, 0, 100},
		{"tag_long", "tag_size", "tag_size_invalid", func(c *Candidate) { c.Tags[0] = strings.Repeat("文", 101) }, 101, 100},
		{"source_empty", "source_entry_size", "source_entry_size_invalid", func(c *Candidate) { c.Targets[1].SourceEntry = "" }, 0, 128},
		{"source_long", "source_entry_size", "source_entry_size_invalid", func(c *Candidate) { c.Targets[1].SourceEntry = strings.Repeat("文", 129) }, 129, 128},
		{"meaning_empty", "meaning_size", "meaning_size_invalid", func(c *Candidate) { c.Targets[1].EntryMeaning = "" }, 0, 500},
		{"meaning_long", "meaning_size", "meaning_size_invalid", func(c *Candidate) { c.Targets[1].EntryMeaning = strings.Repeat("文", 501) }, 501, 500},
		{"hint_empty", "hint_size", "hint_size_invalid", func(c *Candidate) { c.Targets[1].HintPhrase = "" }, 0, maxAnnotatedHintRunes},
		{"hint_long", "hint_size", "hint_size_invalid", func(c *Candidate) { c.Targets[1].HintPhrase = strings.Repeat("文", maxAnnotatedHintRunes+1) }, maxAnnotatedHintRunes + 1, maxAnnotatedHintRunes},
	} {
		_, c := p0Candidate()
		tc.mutate(&c)
		cases = append(cases, testCase{tc.name, p0JSON(c), tc.check, tc.reason, tc.actual, tc.limit})
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var expected, actual Candidate
			expectedErr := decodeCandidateStrict(context.Background(), []byte(tc.raw), &expected)
			recorder := &tracetest.Recorder{}
			trace := gt.New("req_schema_exit", recorder)
			actualErr := decodeCandidateStrict(gt.With(context.Background(), trace), []byte(tc.raw), &actual)
			trace.Finish()
			if !reflect.DeepEqual(expected, actual) || DescribeFailure(expectedErr) != DescribeFailure(actualErr) {
				t.Fatal("observation changed decoder result")
			}
			events, summaries := recorder.Read()
			if len(summaries) != 1 {
				t.Fatal("summary count")
			}
			summary := summaries[0]
			if tc.reason == "" {
				if actualErr != nil || summary.FirstFailure != nil || summary.Stages[gt.CandidateDecode].State != gt.OK {
					t.Fatal("positive trace")
				}
			} else {
				f := summary.FirstFailure
				if actualErr == nil || f == nil || f.Stage != "candidate_decode" || f.Check != tc.check || f.Detail.Reason != tc.reason {
					t.Fatalf("missing exit: %+v", f)
				}
				if tc.actual >= 0 {
					found := false
					for _, e := range events {
						if e.Kind == "fact" && e.Fact.Check == tc.check && e.Fact.Detail.Actual == tc.actual && e.Fact.Detail.Limit == tc.limit {
							found = true
						}
					}
					if !found {
						t.Fatal("actual/limit count missing")
					}
				}
			}
			ended := false
			for _, e := range events {
				if e.Kind == "check_begin" && ended {
					t.Fatal("extra check after short-circuit")
				}
				if e.Kind == "stage_end" && e.Fact.Stage == "candidate_decode" {
					ended = true
				}
			}
			if summary.Stages[gt.ContentValidate].State != gt.NotRun || summary.Stages[gt.DraftCommit].State != gt.NotRun {
				t.Fatal("invented downstream execution")
			}
			evidence, _ := json.Marshal(struct {
				E []gt.Event
				S []gt.Summary
			}{events, summaries})
			for _, private := range []string{"synthetic-private-key", baseCandidate.Passage, baseCandidate.Targets[0].EntryMeaning} {
				if strings.Contains(string(evidence), private) {
					t.Fatal("private content in normal trace")
				}
			}
		})
	}
}

// Cancel through the observer at an actually reached check. This uses a normal
// context cancellation, not production hooks or changes to validation branches.
type obsCancelAtCheck struct {
	*tracetest.Recorder
	check   string
	target  int
	ordinal int
	seen    int
	cancel  context.CancelFunc
}

func (s *obsCancelAtCheck) Event(e gt.Event) {
	s.Recorder.Event(e)
	if e.Kind == "check_begin" && e.Fact.Stage == "content_validate" && e.Fact.Check == s.check && e.Fact.Detail.Target == s.target {
		s.seen++
		if s.seen == s.ordinal {
			s.cancel()
		}
	}
}
func TestOBS042DValidatorCancellationExits(t *testing.T) {
	lexicon, err := LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, check     string
		target, ordinal int
		many            bool
	}{
		{"initial", "context", -1, 1, false},
		{"passage_index", "passage_index", -1, 1, false},
		{"target_context", "context", 0, 1, false},
		{"hint_annotations", "hint_annotations", 0, 1, false},
		{"hint_index", "hint_index", 0, 1, false},
		{"hint_scan", "hint_scan", 0, 1, false},
		{"passage_scan", "passage_scan", 0, 1, false},
		{"passage_relations", "passage_relations", 0, 1, false},
		{"hint_relations", "hint_relations", 0, 1, false},
		{"collision_loop", "collision", -1, 1, true},
		{"final", "context", -1, 2, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			recorder := &tracetest.Recorder{}
			sink := &obsCancelAtCheck{Recorder: recorder, check: tc.check, target: tc.target, ordinal: tc.ordinal, cancel: cancel}
			trace := gt.New("req_cancel_check", sink)
			spec, candidate := p0Candidate()
			if tc.many {
				candidate.Passage = strings.Repeat("grapes(grape) ", 1025) + "Young(young) people."
			}
			_, err := NewValidator(lexicon).Validate(gt.With(ctx, trace), spec, candidate)
			trace.Finish()
			if !errors.Is(err, context.Canceled) || sink.seen < tc.ordinal {
				t.Fatalf("cancellation did not reach %s: %v", tc.check, err)
			}
			_, summaries := recorder.Read()
			f := summaries[0].FirstFailure
			if f == nil || f.Stage != "content_validate" || f.Check != tc.check || f.State != gt.Cancelled || f.Detail.Reason != "context_cancelled" {
				t.Fatalf("wrong cancellation evidence: %+v", f)
			}
			if summaries[0].Stages[gt.DraftCommit].State != gt.NotRun {
				t.Fatal("cancelled validation continued")
			}
		})
	}
	t.Run("lexicon", func(t *testing.T) {
		r := &tracetest.Recorder{}
		trace := gt.New("req_no_lexicon", r)
		spec, c := p0Candidate()
		_, err := NewValidator(nil).Validate(gt.With(context.Background(), trace), spec, c)
		trace.Finish()
		_, summaries := r.Read()
		if !errors.Is(err, ErrLexiconUnavailable) || summaries[0].FirstFailure == nil || summaries[0].FirstFailure.Check != "lexicon" {
			t.Fatal("lexicon guard not recorded")
		}
	})
}
