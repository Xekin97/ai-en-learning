// Package generationevidence owns private, short-lived local diagnostic files.
// It has no database, HTTP, model client or authentication dependency.
package generationevidence

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	gt "wordweave/internal/generationtrace"
)

const (
	SchemaVersion      = 1
	DedicatedAccountID = "01a08e5a-2250-7854-81df-5aeb26e7f461"
	MaxBundles         = 50
	MaxBytes           = 1 << 20
	Retention          = 24 * time.Hour
	metadataBudget     = 128 << 10
	finalBudget        = 16 << 10
	guardBudget        = 64 << 10
	queueSlots         = 256
)

var (
	ErrUnavailable = errors.New("diagnostic evidence unavailable")
	ErrUnsafe      = errors.New("invalid private diagnostic storage")
	ErrCleanup     = errors.New("diagnostic cleanup failed; access disabled")
	ErrBusy        = errors.New("diagnostic storage busy")
)

type Fingerprint struct {
	Source    string `json:"source_sha256"`
	Binary    string `json:"binary_sha256"`
	Template  string `json:"template_sha256"`
	Schema    string `json:"schema_sha256"`
	Validator string `json:"validator_sha256"`
	Lexicon   string `json:"lexicon_sha256"`
}

func (f Fingerprint) Valid() bool {
	for _, v := range []string{f.Source, f.Binary, f.Template, f.Schema, f.Validator, f.Lexicon} {
		if !digestValid(v) {
			return false
		}
	}
	return true
}
func digestValid(s string) bool {
	b, err := hex.DecodeString(s)
	return err == nil && len(b) == sha256.Size && hex.EncodeToString(b) == s
}
func Digest(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }

type Manifest struct {
	Schema      int         `json:"schema"`
	ID          string      `json:"evidence_id"`
	AccountID   string      `json:"account_id"`
	RequestID   string      `json:"request_id"`
	Admission   uint64      `json:"admission"`
	CreatedAt   time.Time   `json:"created_at"`
	ExpiresAt   time.Time   `json:"expires_at"`
	Fingerprint Fingerprint `json:"fingerprint"`
}
type State struct {
	CoalescedProgress uint64 `json:"coalesced_progress"`
	DroppedRecords    uint64 `json:"dropped_records"`
	DroppedBytes      uint64 `json:"dropped_bytes"`
	Truncated         bool   `json:"truncated"`
	IOFailed          bool   `json:"io_failed"`
	Redacted          bool   `json:"redacted"`
	ModelEnded        bool   `json:"model_ended"`
	Unavailable       bool   `json:"unavailable"`
}

// Record is an allowlist; it is not a general JSON logging or object dump API.
type Record struct {
	Manifest   *Manifest         `json:"manifest,omitempty"`
	Spec       *gt.EffectiveSpec `json:"spec,omitempty"`
	Chunk      *gt.ModelChunk    `json:"chunk,omitempty"`
	ModelEnd   *gt.ModelEnd      `json:"model_end,omitempty"`
	Event      *gt.Event         `json:"event,omitempty"`
	Summary    *gt.Summary       `json:"summary,omitempty"`
	Processing *gt.Processing    `json:"processing,omitempty"`
	State      *State            `json:"capture_state,omitempty"`
	Progress   []gt.Event        `json:"latest_progress,omitempty"`
}

// Hash chained journal detects corruption, reordering and partial tails. It is
// not a signature against an operator who already controls the private UID.
type line struct {
	Sequence uint64          `json:"sequence"`
	Previous string          `json:"previous"`
	Digest   string          `json:"sha256"`
	Record   json.RawMessage `json:"record"`
}

func encodeLine(sequence uint64, previous string, body []byte) []byte {
	digest := Digest(append([]byte(previous), body...))
	raw, _ := json.Marshal(line{sequence, previous, digest, body})
	return append(raw, '\n')
}
