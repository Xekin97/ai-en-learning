package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math/rand/v2"
	"strconv"
	"strings"
	"testing"
)

// Provider fixtures use only the current keyed wire protocol. Domain/public
// Candidate and ValidatedBatch serialization remains unchanged.
func p0JSON(value any) string {
	switch v := value.(type) {
	case Candidate:
		return p0JSON(struct {
			Passage string          `json:"passage"`
			Tags    []string        `json:"tags"`
			Targets json.RawMessage `json:"targets"`
		}{v.Passage, v.Tags, json.RawMessage(p0JSON(v.Targets))})
	case []CandidateTarget:
		parts := make([]string, len(v))
		for i, target := range v {
			parts[i] = p0JSON(target.SourceEntry) + ":" + p0JSON(target)
		}
		return "{" + strings.Join(parts, ",") + "}"
	case CandidateTarget:
		return p0JSON(struct {
			EntryMeaning string `json:"entry_meaning"`
			HintPhrase   string `json:"hint_phrase"`
		}{v.EntryMeaning, v.HintPhrase})
	}
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return string(raw)
}
func p0SSE(content string) string {
	return "data: " + p0JSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": content}}}}) + "\n\n"
}

func TestP0SchemaMatrix(t *testing.T) {
	_, candidate := p0Candidate()
	base := p0JSON(candidate)
	for _, tc := range []struct{ name, body, reason string }{
		{"empty", "", "candidate_empty"},
		{"encoding", string([]byte{0xff}), "candidate_encoding_invalid"},
		{"markdown", strings.Repeat(string(rune(96)), 3) + base, "passage_not_first"},
		{"order", strings.Replace(base, "{", "{\"extra\":1,", 1), "passage_not_first"},
		{"truncated", base[:len(base)-2], "json_invalid"},
		{"trailing", base + "{}", "json_trailing_content"},
		{"unknown_root", strings.Replace(base, "\"tags\":", "\"secret-key\":1,\"tags\":", 1), "candidate_keys_invalid"},
		{"duplicate", strings.Replace(base, "\"tags\":", "\"tags\":[],\"tags\":", 1), "json_duplicate_key"},
		{"null", strings.Replace(base, "\"tags\":[\"fruit\"]", "\"tags\":null", 1), "json_null"},
		{"unknown_target", strings.Replace(base, "\"entry_meaning\":", "\"secret-key\":1,\"entry_meaning\":", 1), "target_keys_invalid"},
		{"alias", strings.Replace(base, "\"entry_meaning\":", "\"Entry_Meaning\":", 1), "target_keys_invalid"},
		{"wrong_type", strings.Replace(base, "\"entry_meaning\":\"a small fruit\"", "\"entry_meaning\":3", 1), "json_invalid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var good, got Candidate
			if err := decodeCandidateStrict(context.Background(), []byte(base), &good); err != nil {
				t.Fatal("positive control", err)
			}
			err := decodeCandidateStrict(context.Background(), []byte(tc.body), &got)
			d := DescribeFailure(err)
			if err == nil || d.Stage != "candidate_schema" || d.Reason != tc.reason {
				t.Fatalf("want %s got %+v", tc.reason, d)
			}
			if strings.Contains(err.Error(), "secret-key") {
				t.Fatal("private key in error")
			}
			if tc.name == "wrong_type" && d.Field != "entry_meaning" {
				t.Fatalf("type error field lost: %+v", d)
			}
		})
	}
	for _, tc := range []struct {
		name, reason, field string
		mutate              func(*Candidate)
	}{
		{"passage_empty", "passage_empty", "passage", func(c *Candidate) { c.Passage = "" }},
		{"tags_empty", "tag_count_invalid", "tags", func(c *Candidate) { c.Tags = []string{} }},
		{"tags_many", "tag_count_invalid", "tags", func(c *Candidate) { c.Tags = []string{"a", "b", "c", "d"} }},
		{"tag_empty", "tag_size_invalid", "tags", func(c *Candidate) { c.Tags[0] = "" }},
		{"tag_long", "tag_size_invalid", "tags", func(c *Candidate) { c.Tags[0] = strings.Repeat("a", 101) }},
		{"source_empty", "source_entry_size_invalid", "source_entry", func(c *Candidate) { c.Targets[1].SourceEntry = "" }},
		{"source_long", "source_entry_size_invalid", "source_entry", func(c *Candidate) { c.Targets[1].SourceEntry = strings.Repeat("a", 129) }},
		{"meaning_empty", "meaning_size_invalid", "entry_meaning", func(c *Candidate) { c.Targets[1].EntryMeaning = "" }},
		{"meaning_long", "meaning_size_invalid", "entry_meaning", func(c *Candidate) { c.Targets[1].EntryMeaning = strings.Repeat("a", 501) }},
		{"hint_empty", "hint_size_invalid", "hint_phrase", func(c *Candidate) { c.Targets[1].HintPhrase = "" }},
		{"hint_long", "hint_size_invalid", "hint_phrase", func(c *Candidate) { c.Targets[1].HintPhrase = strings.Repeat("a", maxAnnotatedHintRunes+1) }},
		{"body_limit", "candidate_byte_limit", "", func(c *Candidate) { c.Passage = strings.Repeat("a", maxCandidateBytes) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, c := p0Candidate()
			tc.mutate(&c)
			var got Candidate
			err := decodeCandidateStrict(context.Background(), []byte(p0JSON(c)), &got)
			d := DescribeFailure(err)
			if err == nil || d.Reason != tc.reason || d.Field != tc.field {
				t.Fatalf("want %s/%s got %+v", tc.reason, tc.field, d)
			}
			if (tc.field == "source_entry" || tc.field == "entry_meaning" || tc.field == "hint_phrase") && d.Target != 1 {
				t.Fatal("target index lost")
			}
		})
	}
	_, boundary := p0Candidate()
	boundary.Tags = []string{strings.Repeat("a", 100)}
	boundary.Targets[0] = CandidateTarget{strings.Repeat("a", 128), strings.Repeat("文", 500), strings.Repeat("a", maxAnnotatedHintRunes)}
	var got Candidate
	if err := decodeCandidateStrict(context.Background(), []byte(p0JSON(boundary)), &got); err != nil {
		t.Fatal("legal boundary", err)
	}
}

func TestP0ProviderStreamMatrix(t *testing.T) {
	_, candidate := p0Candidate()
	base := p0JSON(candidate)
	for _, tc := range []struct{ name, body, reason string }{
		{"no_done", p0SSE(base), ""},
		{"done", p0SSE(base) + "data: [DONE]\n\n", ""},
		{"no_newline", strings.TrimSpace(p0SSE(base)), ""},
		{"comments", ": heartbeat\nevent: ignored\n\n" + p0SSE(base), ""},
		{"empty_choices", "data: {\"choices\":[]}\n\n" + p0SSE(base), ""},
		{"empty", "", "candidate_empty"},
		{"early_done", "data: [DONE]\n\n", "candidate_empty"},
		{"reasoning_only_stop", "data: " + p0JSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]any{"content": nil, "reasoning": base}, "finish_reason": "stop"}}}) + "\n\ndata: [DONE]\n\n", "candidate_empty"},
		{"invalid_event", "data: not JSON\n\n", "sse_event_json_invalid"},
		{"truncated", p0SSE(base[:len(base)-2]), "json_invalid"},
		{"unclosed_annotation", p0SSE("{\"passage\":\"grape(grape\"}"), "annotation_syntax_invalid"},
		{"two_candidates", p0SSE(base) + p0SSE(base), "json_trailing_content"},
		{"repeat_done", p0SSE(base) + "data: [DONE]\n\ndata: [DONE]\n\n", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			stream := openRouterStream{body: io.NopCloser(strings.NewReader(tc.body))}
			var preview strings.Builder
			got, err := stream.Receive(context.Background(), func(s string) error { preview.WriteString(s); return nil })
			if tc.reason == "" {
				if err != nil || got.Passage != candidate.Passage || preview.String() != "Young people share grapes and another grape." {
					t.Fatalf("legal stream failed: %v", err)
				}
			} else if err == nil || DescribeFailure(err).Reason != tc.reason {
				t.Fatalf("want %s got %+v", tc.reason, DescribeFailure(err))
			}
			if strings.Contains(preview.String(), "(grape)") || strings.Contains(preview.String(), "(young)") {
				t.Fatal("annotation leaked")
			}
			if tc.name == "reasoning_only_stop" && preview.Len() != 0 {
				t.Fatal("reasoning must not be reinterpreted as a learning passage")
			}
		})
	}
	for _, tc := range []struct {
		status   int
		category FailureCategory
		retry    bool
	}{
		{401, FailureAuthentication, false}, {403, FailureAuthorization, false}, {404, FailureAuthorization, false},
		{429, FailureRateLimited, true}, {400, FailureUnavailable, false}, {500, FailureUnavailable, true}, {502, FailureUnavailable, true},
	} {
		t.Run("status_"+strconv.Itoa(tc.status), func(t *testing.T) {
			wire := "data: " + p0JSON(map[string]any{"error": map[string]any{"code": tc.status, "message": "private provider content"}}) + "\n\n"
			stream := openRouterStream{body: io.NopCloser(strings.NewReader(wire))}
			_, err := stream.Receive(context.Background(), func(string) error { t.Fatal("error streamed"); return nil })
			var p *ProviderError
			if !errors.As(err, &p) || p.Category != tc.category || p.Retryable != tc.retry || strings.Contains(p.Error(), "private") {
				t.Fatal("provider mapping/privacy")
			}
		})
	}
	stream := openRouterStream{body: io.NopCloser(strings.NewReader(p0SSE(base)))}
	callbackErr := errors.New("synthetic failure")
	if _, err := stream.Receive(context.Background(), func(string) error { return callbackErr }); !errors.Is(err, callbackErr) {
		t.Fatal("callback swallowed")
	}
	stream = openRouterStream{body: io.NopCloser(p0BrokenReader{})}
	if _, err := stream.Receive(context.Background(), func(string) error { return nil }); DescribeFailure(err).Reason != "sse_read_failed" {
		t.Fatal("reader failure")
	}
}

type p0BrokenReader struct{}

func (p0BrokenReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestP0RandomUnicodeStreamInvariant(t *testing.T) {
	const passage = "🙂 Café grapes(grape), a \"grape(grape)\".\n(Fresh grapes(grape).)"
	const clean = "🙂 Café grapes, a \"grape\".\n(Fresh grapes.)"
	candidate := Candidate{passage, []string{"fruit"}, []CandidateTarget{{"grape", "a fruit", "fresh grapes(grape)"}}}
	for seed := uint64(0); seed < 64; seed++ {
		rng := rand.New(rand.NewPCG(seed, 123))
		raw := strings.ReplaceAll(p0JSON(candidate), "🙂", "\\ud83d\\ude42")
		var wire strings.Builder
		for len(raw) > 0 {
			n := min(len(raw), rng.IntN(13)+1)
			for n < len(raw) && raw[n]&0xc0 == 0x80 {
				n++
			}
			wire.WriteString(p0SSE(raw[:n]))
			raw = raw[n:]
		}
		stream := openRouterStream{body: io.NopCloser(strings.NewReader(wire.String()))}
		var preview strings.Builder
		_, err := stream.Receive(context.Background(), func(delta string) error {
			preview.WriteString(delta)
			if !strings.HasPrefix(clean, preview.String()) {
				return errors.New("prefix mismatch")
			}
			return nil
		})
		if err != nil || preview.String() != clean {
			t.Fatalf("seed %d: %v", seed, err)
		}
	}
}

func FuzzP0CandidateDecoder(f *testing.F) {
	_, c := p0Candidate()
	f.Add(p0JSON(c))
	f.Add("{")
	f.Add("{\"passage\":null}")
	f.Fuzz(func(t *testing.T, raw string) {
		if len(raw) > 8192 {
			return
		}
		var c Candidate
		err := decodeCandidateStrict(context.Background(), []byte(raw), &c)
		if err != nil && DescribeFailure(err).Reason == "unknown_internal" {
			t.Fatal("unclassified decoder error")
		}
	})
}
