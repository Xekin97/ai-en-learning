// Package generationtrace carries content-free generation facts across layers.
// It deliberately cannot accept errors, arbitrary maps, prompts or model text.
package generationtrace

import (
	"context"
	"strings"
	"sync"
	"time"
)

type Stage uint8

const (
	Request Stage = iota
	Preflight
	ProviderOpen
	ProviderStream
	PassageDecode
	CandidateDecode
	ContentValidate
	DraftCommit
	Settlement
	Delivery
	Continuation
	stageCount
)

var stageNames = [...]string{"request", "preflight", "provider_open", "provider_stream", "passage_decode", "candidate_decode", "content_validate", "draft_commit", "settlement", "delivery", "continuation"}

func (s Stage) String() string {
	if s >= stageCount {
		return "unknown"
	}
	return stageNames[s]
}

type State string

const (
	NotRun     State = "not_run"
	Running    State = "running"
	OK         State = "ok"
	Failed     State = "failed"
	Cancelled  State = "cancelled"
	Incomplete State = "incomplete"
)

// Detail is sanitized again at the boundary, even for internal callers.
// -1 means unknown; offsets are model-content bytes, never guessed positions.
type Detail struct {
	Reason       string `json:"reason"`
	Field        string `json:"field"`
	Target       int    `json:"target_index"`
	Actual       int    `json:"actual"`
	Limit        int    `json:"limit"`
	Start        int64  `json:"byte_start"`
	End          int64  `json:"byte_end"`
	ExpectedType string `json:"expected_type"`
	ActualType   string `json:"actual_type"`
}

func Why(reason string) Detail {
	return Detail{Reason: reason, Target: -1, Actual: -1, Limit: -1, Start: -1, End: -1}
}

type StageFact struct {
	Stage      string `json:"stage"`
	State      State  `json:"state"`
	BeginMS    int64  `json:"begin_ms"`
	EndMS      int64  `json:"end_ms"`
	DurationMS int64  `json:"duration_ms"`
	Check      string `json:"check"`
	Detail     Detail `json:"detail"`
}
type Event struct {
	RelatedRunID string        `json:"related_run_id,omitempty"`
	ActorKind    string        `json:"actor_kind,omitempty"`
	RequestID    string        `json:"request_id"`
	RunID        string        `json:"run_id"`
	ModelID      string        `json:"model_id"`
	Sequence     uint64        `json:"sequence"`
	ElapsedMS    int64         `json:"elapsed_ms"`
	Kind         string        `json:"kind"`
	Late         bool          `json:"after_http_finish"`
	Fact         StageFact     `json:"fact"`
	Provider     *ProviderFact `json:"provider,omitempty"`
	Outcome      string        `json:"outcome,omitempty"`
	Refunded     bool          `json:"quota_refunded"`
}
type Summary struct {
	RequestID    string                `json:"request_id"`
	RunID        string                `json:"run_id"`
	ModelID      string                `json:"model_id"`
	ElapsedMS    int64                 `json:"elapsed_ms"`
	Stages       [stageCount]StageFact `json:"stages"`
	FirstFailure *StageFact            `json:"first_failure,omitempty"`
	Outcome      string                `json:"confirmed_outcome"`
	Refunded     bool                  `json:"quota_refunded"`
	Pending      bool                  `json:"settlement_pending"`
}

// Sink must be bounded and must not call back into its Trace. Events are values
// with no references to caller data. Private capture must enqueue bounded work,
// never perform file IO on this path. Normal telemetry follows the server logger.
type Sink interface {
	Event(Event)
	Summary(Summary)
}

type Trace struct {
	mu                          sync.Mutex
	sink                        Sink
	capture                     Capture
	started                     time.Time
	sequence                    uint64
	finished                    bool
	requestID, runID, modelID   string
	stages                      [stageCount]StageFact
	first                       *StageFact
	outcome                     string
	refunded                    bool
	pending                     bool
	firstProvider, firstBrowser bool
	actorKind                   string
}

func (t *Trace) StartedAt() time.Time {
	if t == nil {
		return time.Time{}
	}
	return t.started
}
func (t *Trace) BindActor(kind string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.actorKind != "" || t.finished {
		return
	}
	if kind != "account" && kind != "visitor" {
		kind = "unknown"
	}
	t.actorKind = kind
	t.emitLocked(Event{Kind: "actor_resolved", ActorKind: kind})
}

type contextKey struct{}

func With(ctx context.Context, trace *Trace) context.Context {
	return context.WithValue(ctx, contextKey{}, trace)
}
func From(ctx context.Context) *Trace { trace, _ := ctx.Value(contextKey{}).(*Trace); return trace }
func New(requestID string, sink Sink) *Trace {
	t := &Trace{sink: sink, started: time.Now(), requestID: SafeID(requestID), outcome: "unknown"}
	for i := Stage(0); i < stageCount; i++ {
		t.stages[i] = StageFact{Stage: i.String(), State: NotRun, BeginMS: -1, EndMS: -1, DurationMS: -1, Detail: Why("")}
	}
	return t
}
func (t *Trace) BindRun(runID, modelID string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.runID != "" || t.finished {
		return
	}
	t.runID, t.modelID = SafeID(runID), SafeID(modelID)
	t.emitLocked(Event{Kind: "run_bound"})
}

// Correlates a server-assigned run whose T2 COMMIT receipt was not confirmed.
// It does not bind a successful run, grant a capability, or assert persistence.
func (t *Trace) PreflightCommitUnknown(runID string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.emitLocked(Event{Kind: "preflight_commit_unknown", RelatedRunID: SafeID(runID)})
}
func (t *Trace) emitLocked(e Event) {
	t.sequence++
	e.Sequence = t.sequence
	e.RequestID, e.RunID, e.ModelID = t.requestID, t.runID, t.modelID
	e.ElapsedMS, e.Late = time.Since(t.started).Milliseconds(), t.finished
	if t.sink != nil {
		t.sink.Event(e)
	}
	if t.capture != nil {
		t.capture.Event(e)
	}
}
func (t *Trace) beginLocked(s Stage) {
	f := &t.stages[s]
	if f.State != NotRun {
		return
	}
	f.State, f.BeginMS = Running, time.Since(t.started).Milliseconds()
	t.emitLocked(Event{Kind: "stage_begin", Fact: *f})
}
func (t *Trace) Begin(s Stage) {
	if t == nil || s >= stageCount {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.beginLocked(s)
}

// Check starts the next actually executed check and completes the previous one.
// The final check is closed by End; unexecuted checks are never manufactured.
func (t *Trace) Check(s Stage, check string, target int) {
	if t == nil || s >= stageCount {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.beginLocked(s)
	f := &t.stages[s]
	if f.State != Running {
		return
	}
	if f.Check != "" {
		previous := *f
		previous.State = OK
		t.emitLocked(Event{Kind: "check_end", Fact: previous})
	}
	f.Check, f.Detail = safeCheck(check), Why("")
	f.Detail.Target = target
	t.emitLocked(Event{Kind: "check_begin", Fact: *f})
}
func (t *Trace) Note(s Stage, check string, detail Detail) {
	if t == nil || s >= stageCount {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	f := t.stages[s]
	f.Check, f.Detail = safeCheck(check), sanitize(detail)
	if s == ProviderStream && f.Check == "content" && !t.firstProvider {
		t.firstProvider = true
		t.emitLocked(Event{Kind: "first_provider_content", Fact: f})
	}
	if s == Delivery && f.Check == "delta" && f.Detail.Reason == "" && !t.firstBrowser {
		t.firstBrowser = true
		t.emitLocked(Event{Kind: "first_browser_content", Fact: f})
	}
	t.emitLocked(Event{Kind: "fact", Fact: f})
}
func (t *Trace) End(s Stage, state State, detail Detail) {
	if t == nil || s >= stageCount {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.beginLocked(s)
	f := &t.stages[s]
	if f.State != Running {
		return
	}
	if state != OK && state != Failed && state != Cancelled && state != Incomplete {
		state = Incomplete
	}
	f.State, f.Detail = state, sanitize(detail)
	f.EndMS = time.Since(t.started).Milliseconds()
	f.DurationMS = f.EndMS - f.BeginMS
	if f.Check != "" {
		t.emitLocked(Event{Kind: "check_end", Fact: *f})
	}
	if t.first == nil && (state == Failed || state == Cancelled) {
		copy := *f
		t.first = &copy
	}
	t.emitLocked(Event{Kind: "stage_end", Fact: *f})
}

// Settlement records every attempt, but emits a confirmed outcome only once.
// The caller MUST have confirmed the persisted row before passing a terminal.
func (t *Trace) Settled(outcome string, refunded bool) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	switch outcome {
	case "valid", "failed", "cancelled", "gone", "pending":
	default:
		outcome = "unknown"
	}
	e := Event{Kind: "settlement", Outcome: outcome, Refunded: refunded && outcome == "failed"}
	if outcome == "pending" && t.outcome == "unknown" {
		t.pending = true
	}
	t.emitLocked(e)
	t.confirmLocked(outcome, e.Refunded)
}
func (t *Trace) Confirm(outcome string, refunded bool) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.confirmLocked(outcome, refunded)
}
func (t *Trace) confirmLocked(outcome string, refunded bool) {
	if t.outcome != "unknown" {
		return
	}
	switch outcome {
	case "valid", "failed", "cancelled", "gone":
	default:
		return
	}
	t.outcome, t.refunded = outcome, refunded && outcome == "failed"
	t.emitLocked(Event{Kind: "outcome_confirmed", Outcome: t.outcome, Refunded: t.refunded})
	if t.pending {
		t.pending = false
		t.emitLocked(Event{Kind: "settlement_recovered", Outcome: t.outcome, Refunded: t.refunded})
	}
}
func (t *Trace) Finish() {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.finished {
		return
	}
	t.finished = true
	s := Summary{RequestID: t.requestID, RunID: t.runID, ModelID: t.modelID, ElapsedMS: time.Since(t.started).Milliseconds(), Stages: t.stages, Outcome: t.outcome, Refunded: t.refunded}
	s.Pending = t.pending
	if t.first != nil {
		copy := *t.first
		s.FirstFailure = &copy
	}
	// Snapshot only: a still-running provider may later report its actual exit.
	for i := range s.Stages {
		if s.Stages[i].State == Running {
			s.Stages[i].State = Incomplete
		}
	}
	if t.sink != nil {
		t.sink.Summary(s)
	}
	if t.capture != nil {
		t.capture.Summary(s)
	}
}

// SafeID accepts only bounded opaque correlation IDs, not free-form headers.
func SafeID(value string) string {
	if value == "" {
		return ""
	}
	if len(value) > 128 {
		return "invalid"
	}
	if strings.HasPrefix(strings.ToLower(value), "sk-") {
		return "invalid"
	}
	for _, c := range value {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return "invalid"
		}
	}
	return value
}
func member(value, vocabulary string, fallback string) string {
	if value == "" {
		return ""
	}
	if strings.Contains("|"+vocabulary+"|", "|"+value+"|") && !strings.Contains(value, "|") {
		return value
	}
	return fallback
}
func sanitize(d Detail) Detail {
	d.Reason = member(d.Reason, reasons+"|authentication|authorization|rate_limited|protocol_error|schema_error|content_invalid", "unknown_internal")
	d.Field = member(d.Field, "passage|tags|targets|source_entry|entry_meaning|hint_phrase", "unknown")
	d.ExpectedType = member(d.ExpectedType, "string|number|boolean|array|object|null", "unknown")
	d.ActualType = member(d.ActualType, "string|number|boolean|array|object|null", "unknown")
	return d
}
func safeCheck(value string) string {
	return member(value, checks+"|continuation_needed|continuation_missing|correction_needed|correction_started|correction_finished|receiver_exit|session_resolve|visitor_resolve|candidate_bytes|candidate_encoding|candidate_nonempty|passage_first|json_tokens|candidate_keys|targets_type|target_keys|json_decode|json_tail|passage_nonempty|targets_nonnull|tag_size|source_entry_size|meaning_size|hint_size", "unknown")
}

const checks = "identity|origin|csrf|content_type|body|input|credentials|transaction_begin|actor_lock|group_policy|model_assignment|length_assignment|vocabulary|quota|reserve|entries|token|transaction_commit|transaction_rollback|request_encode|request_create|request_send|response_headers|frame|content|termination|extract|clean_consistency|json_schema|lexicon|context|passage_annotations|passage_ownership|passage_content|word_count|passage_language|tag_count|tag_content|tag_duplicate|target_count|passage_index|source_entry|meaning_content|meaning_repeated|hint_annotations|hint_ownership|hint_content|passage_annotation_presence|hint_annotation_presence|hint_index|hint_scan|passage_scan|passage_relations|hint_relations|passage_presence|hint_presence|collision|snapshot|draft_encode|cas|draft_insert|confirm|started|delta|heartbeat|validated|failed|cancelled|request_exit"

const reasons = "stream_incomplete|invalid_stream|output_truncated|unknown_internal|context_cancelled|deadline_exceeded|request_body_invalid|input_invalid|actor_forbidden|identity_unavailable|origin_rejected|csrf_rejected|content_type_rejected|panic|quota_exhausted|generation_in_progress|generation_unavailable|credential_missing|database_failed|transaction_unknown|rolled_back|rollback_unknown|terminal_race|transport_failed|response_not_sse|provider_authentication_failed|provider_authorization_failed|provider_rate_limited|provider_unavailable|provider_protocol_failed|provider_schema_invalid|content_validation_failed|cancelled_by_user|sse_event_encoding_invalid|sse_event_json_invalid|candidate_byte_limit|sse_event_limit|sse_line_limit|sse_read_failed|clean_stream_mismatch|candidate_encoding_invalid|candidate_empty|passage_not_first|candidate_keys_invalid|targets_type_invalid|target_keys_invalid|json_invalid|json_trailing_content|json_null|json_duplicate_key|passage_empty|tag_count_invalid|tag_size_invalid|source_entry_size_invalid|meaning_size_invalid|hint_size_invalid|annotation_syntax_invalid|annotation_source_unknown|annotation_target_mismatch|passage_annotation_missing|hint_annotation_missing|mapping_surface_absent|mapping_relation_unknown|mapping_relation_rejected|passage_target_missing|hint_occurrence_missing|passage_occurrence_collision|lexicon_unavailable|passage_content_invalid|passage_too_short|passage_language_invalid|tag_content_or_language_invalid|tag_duplicate|target_count_mismatch|target_source_mismatch|meaning_content_or_language_invalid|meaning_repeats_entry|hint_content_or_language_invalid|write_failed|flush_failed|browser_disconnected|done|eof|read_error|upstream_error|consumer_error|not_provided|invalid"
