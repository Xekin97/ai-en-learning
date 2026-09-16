package ai

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"hash"
	"io"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	gt "wordweave/internal/generationtrace"
)

type privateProviderBody struct {
	io.ReadCloser
	apiKey string
}

func providerKey(body io.ReadCloser) string {
	if b, ok := body.(*privateProviderBody); ok {
		return b.apiKey
	}
	return ""
}
func privateSafeID(id, key string) string {
	if key != "" && strings.Contains(id, key) {
		return "invalid"
	}
	return gt.SafeID(id)
}

var credentialPattern = regexp.MustCompile(`(?i)(sk-[a-z0-9_-]{4,}|bearer[ \t]+[a-z0-9._~+/=-]+|(?:api[_ -]?key|authorization|generation[_ -]?token|password|cookie|csrf[_ -]?token)[\s"\\:=]+[^\s",}]+)`)

type pendingFragment struct {
	index                 uint64
	offset, total, length int
}
type captureGuard struct {
	mu                    sync.Mutex
	sink                  gt.Capture
	key                   string // never passed to the generic observer or stored in a manifest
	buffer                string
	fragments             []pendingFragment
	chunks                uint64
	bytes                 int64
	redacted, unavailable bool
	window                int
	deltas                hash.Hash
	finished              chan struct{}
	finishOnce            sync.Once
}

func newCaptureGuard(ctx context.Context, key string) *captureGuard {
	sink := gt.From(ctx).Capture()
	if sink == nil {
		return nil
	}
	g := &captureGuard{sink: sink, key: key, window: max(256, len(key)+1), deltas: sha256.New(), finished: make(chan struct{})}
	if len(key) > 4096 {
		g.unavailable = true
	}
	if revocable, ok := sink.(interface{ Revocation() <-chan struct{} }); ok {
		if done := revocable.Revocation(); done != nil {
			go func() {
				select {
				case <-done:
					g.mu.Lock()
					g.unavailable = true
					g.buffer = ""
					g.fragments = nil
					g.key = ""
					g.deltas.Reset()
					g.mu.Unlock()
				case <-g.finished:
				}
			}()
		}
	}
	return g
}
func (g *captureGuard) Push(text string) {
	if g == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.chunks++
	g.bytes += int64(len(text))
	if !utf8.ValidString(text) {
		g.envelopeUnavailableLocked()
		return
	}
	if g.unavailable {
		return
	}
	for offset := 0; offset < len(text); {
		end := min(offset+2048, len(text))
		for end < len(text) && !utf8.RuneStart(text[end]) {
			end--
		}
		piece := text[offset:end]
		g.buffer += piece
		g.fragments = append(g.fragments, pendingFragment{g.chunks, offset, len(text), len(piece)})
		offset = end
		if len(g.fragments) > 512 {
			g.unavailable = true
			g.buffer = ""
			g.fragments = nil
			return
		}
		g.drain(false)
		if g.unavailable {
			return
		}
	}
}
func (g *captureGuard) drain(final bool) {
	if g == nil || g.unavailable {
		return
	}
	cut := max(0, len(g.buffer)-g.window)
	if final {
		cut = len(g.buffer)
	}
	// Hold an unfinished generic credential until its delimiter. If it cannot
	// fit the guard, stop evidence collection instead of leaking a suffix.
	spans := credentialPattern.FindAllStringIndex(g.buffer, -1)
	for _, span := range spans {
		if span[1] == len(g.buffer) && !final {
			cut = min(cut, span[0])
			if len(g.buffer)-span[0] > 8192 {
				g.unavailable = true
				g.buffer = ""
				g.fragments = nil
				return
			}
		}
	}
	if g.key != "" {
		for start := 0; start < len(g.buffer); {
			index := strings.Index(g.buffer[start:], g.key)
			if index < 0 {
				break
			}
			index += start
			spans = append(spans, []int{index, index + len(g.key)})
			start = index + len(g.key)
		}
	}
	// Never release a recognized credential partially: retain it or redact its
	// entire available span so a later chunk cannot expose the unmasked tail.
	for _, span := range spans {
		if span[0] < cut && span[1] > cut {
			cut = span[0]
		}
	}
	for cut > 0 && cut < len(g.buffer) && !utf8.RuneStart(g.buffer[cut]) {
		cut--
	}
	if cut == 0 && !final {
		return
	}
	masked := []byte(g.buffer)
	for _, span := range spans {
		if span[1] <= cut {
			for i := span[0]; i < span[1]; i++ {
				masked[i] = '*'
			}
			g.redacted = true
		}
	}
	remaining := cut
	position := 0
	for remaining > 0 && len(g.fragments) > 0 {
		fragment := &g.fragments[0]
		n := min(remaining, fragment.length)
		text := string(masked[position : position+n])
		original := g.buffer[position : position+n]
		g.sink.ModelChunk(gt.ModelChunk{Index: fragment.index, Offset: fragment.offset, OriginalBytes: fragment.total, Text: text, Redacted: text != original})
		position += n
		remaining -= n
		fragment.offset += n
		fragment.length -= n
		if fragment.length == 0 {
			g.fragments = g.fragments[1:]
		}
	}
	g.buffer = string(masked[cut:])
	clear(masked)
}
func (g *captureGuard) Finish() {
	if g == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	defer g.finishOnce.Do(func() { close(g.finished) })
	g.drain(true)
	g.sink.ModelEnd(gt.ModelEnd{Chunks: g.chunks, Bytes: g.bytes, Redacted: g.redacted, Unavailable: g.unavailable})
	if !g.redacted && !g.unavailable && g.sink.ByteExact() {
		g.sink.Processing(gt.Processing{Kind: "passage_deltas", SHA256: hex.EncodeToString(g.deltas.Sum(nil))})
	}
	g.buffer = ""
	g.fragments = nil
	g.key = ""
}

func (g *captureGuard) CleanDelta(delta string) {
	if g == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.unavailable {
		return
	}
	hashCleanDelta(g.deltas, delta)
}
func hashCleanDelta(h hash.Hash, delta string) {
	var length [8]byte
	binary.BigEndian.PutUint64(length[:], uint64(len(delta)))
	_, _ = h.Write(length[:])
	_, _ = h.Write([]byte(delta))
}

// Do not preserve a malformed envelope; preceding decoded content stays useful.
func (g *captureGuard) EnvelopeUnavailable() {
	if g == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.envelopeUnavailableLocked()
}
func (g *captureGuard) envelopeUnavailableLocked() {
	g.drain(true)
	g.unavailable = true
}

func captureProcessing(ctx context.Context, kind string, value any) {
	capture := gt.From(ctx).Capture()
	if capture == nil || !capture.ByteExact() {
		return
	}
	// Only two concrete internal domain types are accepted. Never errors/keys.
	switch value.(type) {
	case Candidate, ValidatedBatch:
	default:
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return
	}
	sum := sha256.Sum256(raw)
	capture.Processing(gt.Processing{Kind: kind, SHA256: hex.EncodeToString(sum[:])})
}
