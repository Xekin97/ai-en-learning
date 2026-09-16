package ai

import (
	"context"
	"encoding/json"
	"io"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	gt "wordweave/internal/generationtrace"
	"wordweave/internal/generationtrace/tracetest"
)

type revocableRecorder struct {
	privateRecorder
	revoked chan struct{}
}

func (r *revocableRecorder) Revocation() <-chan struct{} { return r.revoked }

func TestOBS042CRevocationDropsPendingPrivateBuffersAndLateCallbacks(t *testing.T) {
	r := &revocableRecorder{revoked: make(chan struct{})}
	trace := gt.New("req_revoke_fixture", nil)
	trace.AttachCapture(r)
	g := newCaptureGuard(gt.With(context.Background(), trace), "synthetic-secret")
	g.Push("private unfinished content")
	g.CleanDelta("private delta")
	close(r.revoked)
	until := time.Now().Add(time.Second)
	for {
		g.mu.Lock()
		wiped := g.unavailable && g.key == "" && g.buffer == "" && len(g.fragments) == 0
		g.mu.Unlock()
		if wiped {
			break
		}
		if time.Now().After(until) {
			t.Fatal("revocation retained private buffers")
		}
		time.Sleep(time.Millisecond)
	}
	g.Push(strings.Repeat("late private content", 100))
	g.CleanDelta("late private delta")
	g.Finish()
	if len(r.chunks) != 0 || len(r.processing) != 0 || !r.end.Unavailable {
		t.Fatal("revoked capture emitted content or claimed exact replay")
	}
}

type privateRecorder struct {
	chunks     []gt.ModelChunk
	end        gt.ModelEnd
	processing []gt.Processing
}

func (*privateRecorder) Event(gt.Event)                 {}
func (*privateRecorder) Summary(gt.Summary)             {}
func (*privateRecorder) EffectiveSpec(gt.EffectiveSpec) {}
func (r *privateRecorder) ModelChunk(c gt.ModelChunk)   { r.chunks = append(r.chunks, c) }
func (r *privateRecorder) ModelEnd(e gt.ModelEnd)       { r.end = e }
func (r *privateRecorder) Processing(p gt.Processing)   { r.processing = append(r.processing, p) }
func (r *privateRecorder) ByteExact() bool              { return !r.end.Redacted && !r.end.Unavailable }
func privateContext(r *privateRecorder) (context.Context, *gt.Trace) {
	trace := gt.New("req_private_synthetic", nil)
	trace.AttachCapture(r)
	return gt.With(context.Background(), trace), trace
}
func reassemble(t *testing.T, r *privateRecorder, original []string) string {
	t.Helper()
	parts := make([]string, len(original))
	for _, c := range r.chunks {
		if c.Index == 0 || c.Index > uint64(len(parts)) {
			t.Fatal("chunk index")
		}
		index := int(c.Index) - 1
		if c.OriginalBytes != len(original[index]) || c.Offset != len(parts[index]) || !utf8.ValidString(c.Text) {
			t.Fatal("chunk byte boundary or unicode lost")
		}
		wire, _ := json.Marshal(c)
		var decoded gt.ModelChunk
		if json.Unmarshal(wire, &decoded) != nil || decoded.Text != c.Text {
			t.Fatal("journal cannot preserve content")
		}
		parts[index] += c.Text
	}
	if r.end.Chunks != uint64(len(original)) {
		t.Fatal("end chunk count")
	}
	total := 0
	for i, part := range parts {
		if len(part) != len(original[i]) {
			t.Fatal("chunk length changed")
		}
		total += len(part)
	}
	if r.end.Bytes != int64(total) {
		t.Fatal("end byte count")
	}
	return strings.Join(parts, "")
}
func TestOBS042BGuardPreservesUnicodeWhitespaceAndChunkBoundaries(t *testing.T) {
	for _, size := range []int{1, 127, 255, 256, 257, 683, 2047, 2048, 2049} {
		t.Run(strconv.Itoa(size), func(t *testing.T) {
			parts := []string{"  {\n", strings.Repeat("英語界🙂 ", size), "grapes(grape)\t\r\n", "e\u0301 <>& \"quoted\"}"}
			r := &privateRecorder{}
			ctx, _ := privateContext(r)
			g := newCaptureGuard(ctx, "synthetic-key")
			for _, p := range parts {
				g.Push(p)
			}
			g.Finish()
			if got := reassemble(t, r, parts); got != strings.Join(parts, "") || r.end.Redacted || r.end.Unavailable {
				t.Fatal("not byte exact")
			}
		})
	}
}
func TestOBS042BKnownKeyRedactedAcrossEveryBoundary(t *testing.T) {
	key := "synthetic-live-key-ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	original := "before " + key + " after"
	for split := 0; split <= len(original); split++ {
		r := &privateRecorder{}
		ctx, _ := privateContext(r)
		g := newCaptureGuard(ctx, key)
		parts := []string{strings.Repeat("z", 400) + original[:split], original[split:] + strings.Repeat("界", 200)}
		for _, p := range parts {
			g.Push(p)
		}
		g.Finish()
		got := reassemble(t, r, parts)
		if strings.Contains(got, key) || !strings.Contains(got, strings.Repeat("*", len(key))) || !r.end.Redacted || r.end.Unavailable {
			t.Fatalf("secret at split %d", split)
		}
		if g.key != "" || g.buffer != "" || len(g.fragments) != 0 {
			t.Fatal("guard retained key")
		}
	}
}
func TestOBS042BGenericCredentialsAndLongTokenDoNotLeak(t *testing.T) {
	for _, credential := range []string{"sk-test-secret-0123456789", "Bearer TEST_PRIVATE_TOKEN", "api_key=TEST_PRIVATE_TOKEN", "password=TEST_PRIVATE_TOKEN", "generation_token:TEST_PRIVATE_TOKEN"} {
		for split := 1; split < len(credential); split++ {
			r := &privateRecorder{}
			ctx, _ := privateContext(r)
			g := newCaptureGuard(ctx, "")
			parts := []string{strings.Repeat("p", 400) + " " + credential[:split], credential[split:] + " tail"}
			for _, p := range parts {
				g.Push(p)
			}
			g.Finish()
			got := reassemble(t, r, parts)
			if strings.Contains(got, "TEST_PRIVATE_TOKEN") || strings.Contains(got, "0123456789") || !r.end.Redacted {
				t.Fatalf("generic leak at split %d", split)
			}
		}
	}
	r := &privateRecorder{}
	ctx, _ := privateContext(r)
	g := newCaptureGuard(ctx, "")
	g.Push("Bearer " + strings.Repeat("A", 10000))
	g.Finish()
	if !r.end.Unavailable || len(r.chunks) != 0 || g.buffer != "" {
		t.Fatal("oversized credential leaked or not bounded")
	}
}
func TestOBS042BGuardFragmentOverflowIsDiagnosticOnly(t *testing.T) {
	r := &privateRecorder{}
	ctx, _ := privateContext(r)
	g := newCaptureGuard(ctx, strings.Repeat("k", 1000))
	for i := 0; i < 1001; i++ {
		g.Push("k")
	}
	g.Finish()
	if !r.end.Unavailable || len(r.chunks) != 0 {
		t.Fatal("unbounded fragment queue")
	}
}
func TestOBS042BStreamCaptureIsBeforeDecodeAndDoesNotChangeResults(t *testing.T) {
	spec, candidate := p0Candidate()
	valid := p0JSON(candidate)
	lex, err := LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	validator := NewValidator(lex)
	for _, tc := range []struct{ name, wire string }{
		{"valid", p0SSE(valid) + "data: [DONE]\n\n"},
		{"truncated_candidate", p0SSE(valid[:len(valid)-2])},
		{"bad_annotations", p0SSE(`{"passage":"grape(grape"}`)},
		{"wrong_keys", p0SSE(strings.Replace(valid, `"tags":`, `"unexpected":1,"tags":`, 1))},
		{"invalid_envelope", "data: {\"private\":\"sk-secret-fixture\",broken\n\n"},
		{"invalid_encoding", "data: " + string([]byte{0xff}) + "\n\n"},
		{"envelope_after_content", p0SSE(valid) + "data: invalid_private_message\n\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			receive := func(ctx context.Context) (Candidate, error, string) {
				s := openRouterStream{&privateProviderBody{io.NopCloser(strings.NewReader(tc.wire)), "synthetic-provider-key"}}
				var text strings.Builder
				c, e := s.Receive(ctx, func(d string) error { text.WriteString(d); return nil })
				return c, e, text.String()
			}
			want, we, wd := receive(context.Background())
			normal := &tracetest.Recorder{}
			r := &privateRecorder{}
			trace := gt.New("req_equivalence", normal)
			trace.AttachCapture(r)
			ctx := gt.With(context.Background(), trace)
			got, ge, gd := receive(ctx)
			if ge == nil {
				if _, err := validator.Validate(ctx, spec, got); err != nil {
					t.Fatal(err)
				}
			}
			trace.Finish()
			if !reflect.DeepEqual(want, got) || DescribeFailure(we) != DescribeFailure(ge) || wd != gd {
				t.Fatal("capture changed production result")
			}
			raw, _ := json.Marshal([]any{r.chunks, r.end, r.processing})
			if strings.Contains(string(raw), "sk-secret-fixture") || strings.Contains(string(raw), "invalid_private_message") {
				t.Fatal("envelope stored")
			}
			if strings.Contains(tc.name, "envelope") || tc.name == "invalid_encoding" {
				if !r.end.Unavailable {
					t.Fatal("malformed envelope marked exact")
				}
			}
			if tc.name == "valid" {
				if reassemble(t, r, []string{valid}) != valid || len(r.processing) != 3 {
					t.Fatal("candidate or validation materialization missing")
				}
				events, summaries := normal.Read()
				wire, _ := json.Marshal([]any{events, summaries})
				if strings.Contains(string(wire), "grapes(grape)") || strings.Contains(string(wire), "entry_meaning") && strings.Contains(string(wire), "small fruit") {
					t.Fatal("private content in normal log")
				}
			}
		})
	}
}
func TestOBS042BRedactedCaptureCannotEmitProcessingHash(t *testing.T) {
	r := &privateRecorder{}
	ctx, _ := privateContext(r)
	g := newCaptureGuard(ctx, "secret")
	g.Push("secret")
	g.Finish()
	_, candidate := p0Candidate()
	captureProcessing(ctx, "candidate", candidate)
	if len(r.processing) != 0 {
		t.Fatal("redacted content digest falsely called exact")
	}
	if privateSafeID("gen-secret", "secret") != "invalid" {
		t.Fatal("provider key in identifier")
	}
}
