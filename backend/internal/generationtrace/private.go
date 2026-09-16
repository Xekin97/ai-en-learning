package generationtrace

// Capture is a distinct, private-only channel. Implementations must be bounded,
// revokeable, and return immediately from callbacks without performing file IO.
// Nothing supplied here may be forwarded to the normal telemetry Sink.
type Capture interface {
	Sink
	EffectiveSpec(EffectiveSpec)
	ModelChunk(ModelChunk)
	ModelEnd(ModelEnd)
	Processing(Processing)
	ByteExact() bool
}

type EffectiveSpec struct {
	RunID           string   `json:"run_id"`
	ModelID         string   `json:"model_id"`
	ProviderModelID string   `json:"provider_model_id"`
	MeaningLanguage string   `json:"meaning_language"`
	Scenario        string   `json:"scenario"`
	LengthCode      string   `json:"length"`
	MinimumWords    int      `json:"minimum_words"`
	Entries         []string `json:"entries"`
	PromptVersion   string   `json:"prompt_version"`
}

// Fragments retain the original delta.content boundary even when redaction
// buffering splits a chunk. Offsets and OriginalBytes refer to that delta only.
type ModelChunk struct {
	Index         uint64 `json:"index"`
	Offset        int    `json:"offset"`
	OriginalBytes int    `json:"original_bytes"`
	Text          string `json:"text"`
	Redacted      bool   `json:"redacted"`
}
type ModelEnd struct {
	Chunks      uint64 `json:"chunks"`
	Bytes       int64  `json:"bytes"`
	Redacted    bool   `json:"redacted"`
	Unavailable bool   `json:"unavailable"`
}

// Digests refer to deterministic materializations of captured model_text, not
// to credentials. They are emitted only after byte-exact model capture ends.
type Processing struct {
	Kind   string `json:"kind"` // candidate, validated or passage_deltas
	SHA256 string `json:"sha256"`
}

func (t *Trace) AttachCapture(capture Capture) {
	if t == nil || capture == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.capture != nil || t.finished {
		return
	}
	t.capture = capture
	// The early request start preceded identity verification. Supply its actual
	// state now without persisting any unverified identity or request payload.
	capture.Event(Event{RequestID: t.requestID, Kind: "capture_attached", Fact: t.stages[Request]})
}
func (t *Trace) Capture() Capture {
	if t == nil {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.capture
}
