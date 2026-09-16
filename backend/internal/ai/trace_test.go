package ai

import (
	"context"
	"encoding/json"
	"io"
	"reflect"
	"strings"
	"testing"

	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

func TestOBS042ValidatorEquivalenceAndShortCircuit(t *testing.T) {
	lexicon, err := LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	validator := NewValidator(lexicon)
	cases := append([]p0ValidationCase{{name: "valid", mutate: func(*GenerationSpec, *Candidate) {}}}, p0ValidationCases()...)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec, candidate := p0Candidate()
			tc.mutate(&spec, &candidate)
			expected, expectedErr := validator.Validate(context.Background(), spec, candidate)
			r := &tracetest.Recorder{}
			trace := gt.New("req_validator", r)
			ctx := gt.With(context.Background(), trace)
			actual, actualErr := validator.Validate(ctx, spec, candidate)
			trace.Finish()
			if !reflect.DeepEqual(expected, actual) || DescribeFailure(expectedErr) != DescribeFailure(actualErr) {
				t.Fatal("observer changed result")
			}
			events, summaries := r.Read()
			s := summaries[0]
			fact := s.Stages[gt.ContentValidate]
			if expectedErr == nil {
				if fact.State != gt.OK || s.FirstFailure != nil {
					t.Fatal("positive trace")
				}
				return
			}
			if fact.State != gt.Failed || fact.Detail.Reason != tc.reason || fact.Detail.Field != tc.field || fact.Detail.Target != tc.target {
				t.Fatalf("wrong evidence: %+v; expected %s/%s/%d", fact, tc.reason, tc.field, tc.target)
			}
			ended := false
			for _, e := range events {
				if e.Kind == "stage_end" {
					ended = true
				}
				if ended && e.Kind == "check_begin" {
					t.Fatal("extra validation after rejection")
				}
			}
			if s.Stages[gt.DraftCommit].State != gt.NotRun {
				t.Fatal("unexecuted draft")
			}
		})
	}
}

func TestOBS042StreamStagesAndEquivalence(t *testing.T) {
	_, candidate := p0Candidate()
	base := p0JSON(candidate)
	for _, tc := range []struct{ name, wire, stage, reason string }{
		{"valid_done", p0SSE(base) + "data: [DONE]\n\n", "", ""},
		{"valid_eof", p0SSE(base), "", ""},
		{"empty", "", "candidate_decode", "candidate_empty"},
		{"invalid_envelope", "data: private secret\n\n", "provider_stream", "sse_event_json_invalid"},
		{"invalid_utf8", "data: " + string([]byte{0xff}) + "\n\n", "provider_stream", "sse_event_encoding_invalid"},
		{"upstream_error", "data: {\"error\":{\"code\":429,\"message\":\"private secret\"}}\n\n", "provider_stream", "rate_limited"},
		{"upstream_string_code", "data: {\"error\":{\"code\":\"private secret\",\"message\":\"private secret\"}}\n\n", "provider_stream", "sse_event_json_invalid"},
		{"annotation", p0SSE(`{"passage":"grape(grape"}`), "passage_decode", "annotation_syntax_invalid"},
		{"json", p0SSE(base[:len(base)-2]), "candidate_decode", "json_invalid"},
		{"unknown_key", p0SSE(strings.Replace(base, `"tags":`, `"private secret":1,"tags":`, 1)), "candidate_decode", "candidate_keys_invalid"},
		{"wrong_type", p0SSE(strings.Replace(base, `"entry_meaning":"a small fruit"`, `"entry_meaning":3`, 1)), "candidate_decode", "json_invalid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := &tracetest.Recorder{}
			trace := gt.New("req_stream", r)
			receive := func(ctx context.Context) (Candidate, error, string) {
				s := openRouterStream{io.NopCloser(strings.NewReader(tc.wire))}
				var b strings.Builder
				c, err := s.Receive(ctx, func(d string) error { b.WriteString(d); return nil })
				return c, err, b.String()
			}
			a, ae, ad := receive(context.Background())
			b, be, bd := receive(gt.With(context.Background(), trace))
			trace.Finish()
			if !reflect.DeepEqual(a, b) || DescribeFailure(ae) != DescribeFailure(be) || ad != bd {
				t.Fatal("receiver changed")
			}
			events, summaries := r.Read()
			s := summaries[0]
			if tc.stage == "" {
				if s.FirstFailure != nil || s.Stages[gt.ProviderStream].State != gt.OK || s.Stages[gt.CandidateDecode].State != gt.OK {
					t.Fatalf("positive trace: %+v", s)
				}
			} else if s.FirstFailure == nil || s.FirstFailure.Stage != tc.stage || s.FirstFailure.Detail.Reason != tc.reason {
				t.Fatalf("wrong stage: %+v", s.FirstFailure)
			}
			raw, _ := json.Marshal(events)
			if strings.Contains(string(raw), "private secret") || strings.Contains(string(raw), "grapes(grape)") || strings.Contains(string(raw), "a small fruit") {
				t.Fatal("content in normal projection")
			}
			if tc.name == "upstream_string_code" {
				found := false
				for _, e := range events {
					if e.Provider != nil && e.Provider.ErrorPresent && e.Provider.ErrorCodeType == "string" {
						found = true
					}
				}
				if !found {
					t.Fatal("actual error type lost")
				}
			}
			if tc.name == "wrong_type" {
				d := s.FirstFailure.Detail
				if d.Field != "entry_meaning" || d.ExpectedType != "string" || d.ActualType != "number" || d.Start < 0 || d.End <= d.Start {
					t.Fatalf("type/offset evidence lost: %+v", d)
				}
			}
		})
	}
}
func TestOBS042ProviderMetadataDoesNotChangeTermination(t *testing.T) {
	_, candidate := p0Candidate()
	base := p0JSON(candidate)
	meta := `data: {"id":"gen-synthetic","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}` + "\n\n"
	r := &tracetest.Recorder{}
	trace := gt.New("req_meta", r)
	s := openRouterStream{io.NopCloser(strings.NewReader(meta + p0SSE(base) + meta + "data: [DONE]\n\n"))}
	got, err := s.Receive(gt.With(context.Background(), trace), func(string) error { return nil })
	trace.Finish()
	if err != nil || got.Passage != candidate.Passage {
		t.Fatal("finish_reason ended the stream early", err)
	}
	events, _ := r.Read()
	seen, total, ends := 0, int64(0), 0
	for _, e := range events {
		if e.Provider != nil && e.Provider.UsageProvided {
			seen++
			total = e.Provider.TotalTokens
		}
		if e.Fact.Check == "termination" {
			ends++
			if e.Fact.Detail.Reason != "done" {
				t.Fatal("terminal not observed")
			}
		}
	}
	if seen != 2 || total != 30 || ends != 1 {
		t.Fatalf("usage/finish facts incorrect %d/%d/%d", seen, total, ends)
	}
}
