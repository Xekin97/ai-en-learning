package ai

import (
	"context"
	"encoding/json"
	"errors"
)

const (
	PromptVersion           = "m003-draft-v3"
	PlanPromptVersion       = "m003-plan-v1"
	FixedEditPromptVersion  = "m003-fixed-edit-v1"
	NativePromptVersion     = "m003-native-v1"
	CorrectionPromptVersion = "q001-correction-v1"
	ReviewPromptVersion     = "m003-review-v2"
	RewritePromptVersion    = "m003-rewrite-v3"
	ValidatorVersion        = "m001-v5-wn31-r2"
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
	plan               *planTask
	planned            *plannedDraftTask
	fixedEdit          *fixedEditTask
	review             *reviewTask
	rewrite            *rewriteTask
}

// ConnectionCapacityKey exposes only the immutable provider identity from the
// already-bound snapshot. It never performs a lookup or exposes credentials.
func (spec GenerationSpec) ConnectionCapacityKey() string {
	if spec.connection == nil {
		return ""
	}
	return spec.connection.connection.ID.String()
}

func (spec GenerationSpec) UsageMetadata() (stage, promptVersion string) {
	switch {
	case spec.plan != nil:
		return "planning", PlanPromptVersion
	case spec.fixedEdit != nil:
		return "fixed_edit", FixedEditPromptVersion
	case spec.review != nil:
		return "content_review", ReviewPromptVersion
	case spec.rewrite != nil:
		return "content_repair", RewritePromptVersion
	case spec.correction != nil:
		return "technical_repair", CorrectionPromptVersion
	case spec.continuation != nil:
		return "technical_repair", NativePromptVersion
	default:
		return "generation", PromptVersion
	}
}

func (spec GenerationSpec) UsageReasonCodes() []string {
	if spec.rewrite == nil {
		return nil
	}
	seen := map[string]bool{}
	for _, issue := range spec.rewrite.Issues {
		code := "other_content"
		if issue.Code == ReviewForcedWording {
			code = "forced_wording"
		}
		if issue.Code == ReviewContradiction {
			code = "contradiction"
		}
		seen[code] = true
	}
	result := make([]string, 0, 3)
	for _, code := range []string{"forced_wording", "contradiction", "other_content"} {
		if seen[code] {
			result = append(result, code)
		}
	}
	return result
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

type ReviewCode string

const (
	ReviewForcedWording  ReviewCode = "forced_wording"
	ReviewWordSense      ReviewCode = "word_sense"
	ReviewMissingPremise ReviewCode = "missing_premise"
	ReviewContradiction  ReviewCode = "contradiction"
	ReviewCausalLogic    ReviewCode = "causal_logic"
	ReviewOffTopic       ReviewCode = "off_topic"
	ReviewGenreDialogue  ReviewCode = "genre_dialogue"
)

type ReviewIssue struct {
	Code       ReviewCode `json:"code"`
	Evidence   []string   `json:"evidence"`
	Problem    string     `json:"problem"`
	RepairGoal string     `json:"repair_goal"`
}

type Review struct {
	SchemaVersion int           `json:"schema_version"`
	Verdict       string        `json:"verdict"`
	Issues        []ReviewIssue `json:"issues"`
}

type ScenePlan struct {
	Scene        string            `json:"scene"`
	Participants []PlanParticipant `json:"participants"`
	FixedFacts   []string          `json:"fixed_facts"`
	Beats        []string          `json:"beats"`
	WordUses     []PlanWordUse     `json:"word_uses"`
}

type PlanParticipant struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}

type PlanWordUse struct {
	Entry   string `json:"entry"`
	Form    string `json:"form"`
	Meaning string `json:"meaning"`
	Phrase  string `json:"phrase"`
	Role    string `json:"role"`
}

// EditorDraft is request-local task data for the unconditional fixed edit.
// RawCandidate is one complete, safely decoded JSON object; diagnostics contain
// only bounded machine-owned codes and paths, never provider prose.
type EditorDraft struct {
	RawCandidate  json.RawMessage      `json:"raw_candidate"`
	MachineErrors []EditorMachineError `json:"machine_errors"`
}

type EditorMachineError struct {
	Code string `json:"code"`
	Path string `json:"path,omitempty"`
}

// EditableCandidateError means transport completed and a single safe Candidate
// object was received, but its non-passage schema was invalid. Enhanced mode
// may pass Draft to the one fixed-edit call; other modes treat it as schema
// failure. Error text and unwrapping never expose RawCandidate.
type EditableCandidateError struct {
	Draft EditorDraft
	Err   error
}

func (err *EditableCandidateError) Error() string { return "candidate is eligible for fixed editing" }
func (err *EditableCandidateError) Unwrap() error { return err.Err }

// PlanItem is the safe public projection of a completed scene or word-use
// item. MeaningLanguage accompanies the item so callers do not have to recover
// it from mutable request state. Role and other private planning facts are not
// exposed.
type PlanItem struct {
	Kind            string `json:"kind"`
	MeaningLanguage string `json:"-"`
	Text            string `json:"text,omitempty"`
	Entry           string `json:"entry,omitempty"`
	Form            string `json:"form,omitempty"`
	Sense           string `json:"sense,omitempty"`
	Phrase          string `json:"phrase,omitempty"`
}

type ContentV5Provider interface {
	ContentProvider
	Plan(context.Context, GenerationSpec, func(PlanItem) error) (ScenePlan, error)
	OpenPlanned(context.Context, GenerationSpec, ScenePlan) (Stream, error)
	OpenFixedEdit(context.Context, GenerationSpec, EditorDraft) (Stream, error)
}

type ContentProvider interface {
	Provider
	Review(context.Context, GenerationSpec, ValidatedBatch) (Review, error)
	OpenRewrite(context.Context, GenerationSpec, Candidate, []ReviewIssue) (Stream, error)
}

type planTask struct{}
type plannedDraftTask struct{ Plan ScenePlan }
type fixedEditTask struct{ Draft EditorDraft }
type reviewTask struct{ Passage string }
type rewriteTask struct {
	Candidate Candidate
	Issues    []ReviewIssue
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
