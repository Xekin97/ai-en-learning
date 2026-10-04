package ai

import (
	"context"
	"errors"
)

const (
	PromptVersion    = "m002-v1-r1"
	ValidatorVersion = "m001-v5-wn31-r2"
)

type GenerationSpec struct {
	RunID              string
	ModelID            string
	ProviderModelID    string
	MeaningLanguage    string
	Scenario           string
	LengthCode         string
	MinimumWords       int
	Entries            []string
	PromptVersion      string
	CompatibilityProbe bool
	continuation       *passageContinuation // Server-owned; never accepted from the public request.
	correction         *contentCorrection   // Shares the same bounded correction budget.
	connection         *connectionSnapshot  // Pinned before charging; never serialized.
}

type Candidate struct {
	Passage string            `json:"passage"`
	Tags    []string          `json:"tags"`
	Targets []CandidateTarget `json:"targets"`
}

type CandidateTarget struct {
	SourceEntry  string `json:"source_entry"`
	EntryMeaning string `json:"entry_meaning"`
	HintPhrase   string `json:"hint_phrase"`
}

type ValidatedBatch struct {
	Passage          string            `json:"passage"`
	Tags             []string          `json:"tags"`
	Targets          []ValidatedTarget `json:"targets"`
	WordCount        int               `json:"word_count"`
	ValidatorVersion string            `json:"validator_version"`
}

type ValidatedTarget struct {
	Entry              string       `json:"entry"`
	EntryMeaning       string       `json:"entry_meaning"`
	HintPhrase         string       `json:"hint_phrase"`
	HintOccurrences    []Occurrence `json:"hint_occurrences"`
	PassageOccurrences []Occurrence `json:"passage_occurrences"`
}

type Span struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type Occurrence struct {
	Surface string `json:"surface"`
	Start   int    `json:"start"`
	End     int    `json:"end"`
}

type FailureCategory string

const (
	FailureAuthentication  FailureCategory = "authentication"
	FailureAuthorization   FailureCategory = "authorization"
	FailureRateLimited     FailureCategory = "rate_limited"
	FailureUnavailable     FailureCategory = "provider_unavailable"
	FailureProtocol        FailureCategory = "protocol_error"
	FailureSchema          FailureCategory = "schema_error"
	FailureContent         FailureCategory = "content_invalid"
	FailureCancelledByUser FailureCategory = "cancelled_by_user"
)

type ProviderError struct {
	Category  FailureCategory
	Retryable bool
	Err       error
}

func (err *ProviderError) Error() string {
	if err.Err == nil {
		return string(err.Category)
	}
	return string(err.Category) + ": " + err.Err.Error()
}

func (err *ProviderError) Unwrap() error { return err.Err }

var ErrCredentialMissing = errors.New("model connection credential is not configured")

type Stream interface {
	Receive(ctx context.Context, onPassageDelta func(string) error) (Candidate, error)
	Close() error
}

type Provider interface {
	Open(ctx context.Context, spec GenerationSpec) (Stream, error)
	CheckCompatibility(ctx context.Context, providerModelID string) error
}
