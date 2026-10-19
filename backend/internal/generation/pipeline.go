package generation

import (
	"context"
	"errors"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"

	"wordweave/internal/ai"
	"wordweave/internal/entitlement"
)

const (
	OutcomeBasic             = "basic"
	OutcomeReviewPassed      = "review_passed"
	OutcomeRepairedPassed    = "repaired_passed"
	OutcomeLimitFinalized    = "limit_finalized"
	OutcomeServiceIncomplete = "service_incomplete"
)

type PipelineResult struct {
	Version    int
	Candidate  ai.Candidate
	Batch      ai.ValidatedBatch
	Outcome    string
	StopReason *string
}

type PipelineEdit struct {
	DraftID        string `json:"draft_id"`
	ContentVersion int    `json:"content_version"`
	BaseRev        int    `json:"base_rev"`
	Rev            int    `json:"rev"`
	At             int    `json:"at"`
	DeleteCount    int    `json:"delete_count"`
	Insert         string `json:"insert"`
	Source         string `json:"source"`
}

type PipelineDraft struct {
	Action         string `json:"action"`
	DraftID        string `json:"draft_id"`
	ContentVersion int    `json:"content_version"`
	Mode           string `json:"mode,omitempty"`
	BaseRev        int    `json:"base_rev"`
	ParagraphIndex *int   `json:"paragraph_index,omitempty"`
	BodyLength     *int   `json:"body_length,omitempty"`
	ParagraphCount *int   `json:"paragraph_count,omitempty"`
}

type pipelineExecutionError struct {
	phase string
	err   error
}

func (err *pipelineExecutionError) Error() string { return err.err.Error() }
func (err *pipelineExecutionError) Unwrap() error { return err.err }

func pipelineFailure(phase string, err error) error {
	if err == nil {
		return nil
	}
	return &pipelineExecutionError{phase: phase, err: err}
}

func PipelineFailurePhase(err error) string {
	var execution *pipelineExecutionError
	if errors.As(err, &execution) {
		return execution.phase
	}
	return "pipeline"
}

type PipelineHooks struct {
	Progress      func(phase string) error
	Activity      func(activity string) error
	PlanItem      func(planID string, item ai.PlanItem) error
	Draft         func(PipelineDraft) error
	Edit          func(PipelineEdit) error
	Review        func(version int, review ai.Review, repairRequested bool) error
	ReviewFailure func(version int) error
}

type validPackage struct {
	version   int
	candidate ai.Candidate
	batch     ai.ValidatedBatch
}

func ExecutePipeline(ctx context.Context, provider ai.Provider, validator ai.Validator, spec ai.GenerationSpec, policy entitlement.ContentService, hooks PipelineHooks) (result PipelineResult, resultErr error) {
	execution, cancel := context.WithTimeout(ctx, 600*time.Second)
	defer cancel()
	v5, ok := provider.(ai.ContentV5Provider)
	if !ok {
		return PipelineResult{}, pipelineFailure("pipeline", errors.New("provider does not implement m003 content v5 tasks"))
	}
	contentProvider, ok := provider.(ai.ContentProvider)
	if policy.ContentReviewEnabled && !ok {
		return PipelineResult{}, pipelineFailure("pipeline", errors.New("provider does not implement content review"))
	}
	budget := ai.NewRepairBudget(entitlement.NativeCorrectionLimit)
	editor := newPublicEditor(hooks.Edit, hooks.Draft)
	defer func() {
		if resultErr != nil {
			_ = editor.DiscardActive()
		}
	}()
	lastActivity := ""
	activity := func(value string) error {
		if value == lastActivity {
			return nil
		}
		if hooks.Activity != nil {
			if err := hooks.Activity(value); err != nil {
				return err
			}
		}
		lastActivity = value
		return nil
	}
	planID := uuid.NewString()

	callCtx, callCancel := boundedCall(execution)
	callCtx = ai.WithInvocationObserver(callCtx, func() error {
		if hooks.Progress != nil {
			return hooks.Progress("planning")
		}
		return nil
	})
	plan, err := v5.Plan(callCtx, spec, func(item ai.PlanItem) error {
		if hooks.PlanItem == nil {
			return nil
		}
		return hooks.PlanItem(planID, item)
	})
	callCancel()
	if err != nil {
		return PipelineResult{}, pipelineFailure("planning", err)
	}

	callCtx, callCancel = boundedCall(execution)
	callCtx = ai.WithInvocationObserver(callCtx, func() error {
		if hooks.Progress != nil {
			if err := hooks.Progress("composing"); err != nil {
				return err
			}
		}
		return activity("writing")
	})
	stream, err := v5.OpenPlanned(callCtx, spec, plan)
	if err != nil {
		callCancel()
		return PipelineResult{}, pipelineFailure("provider_open", err)
	}
	initialAttempt := editor.Begin(1, "provider", callCancel)
	callCtx = ai.WithPassageClosedObserver(callCtx, initialAttempt.Complete)
	callCtx = ai.WithRepairObserver(callCtx, func() error { return activity("improving") })
	var candidate1 ai.Candidate
	if policy.ContentReviewEnabled && policy.ContentRepairLimit > 0 {
		candidate1, err = stream.Receive(callCtx, initialAttempt.Add)
		if err == nil {
			err = initialAttempt.RequireComplete()
		}
	} else {
		candidate1, err = receiveWithNativeProjection(callCtx, callCancel, provider, validator, spec, stream, editor, initialAttempt, budget, func() error { return activity("writing") })
	}
	_ = stream.Close()
	if closeErr := initialAttempt.Close(); err == nil && closeErr != nil {
		err = closeErr
	}
	callCancel()
	var editable *ai.EditableCandidateError
	if policy.ContentReviewEnabled && policy.ContentRepairLimit > 0 && errors.As(err, &editable) {
		err = nil
	}
	if err != nil {
		return PipelineResult{}, pipelineFailure("provider_receive", err)
	}
	if !policy.ContentReviewEnabled || policy.ContentRepairLimit == 0 {
		batch, validateErr := validator.Validate(execution, spec, candidate1)
		if validateErr != nil {
			return PipelineResult{}, pipelineFailure("validation", validateErr)
		}
		if hooks.Progress != nil {
			if err := hooks.Progress("finalizing"); err != nil {
				return PipelineResult{}, pipelineFailure("delivery", err)
			}
		}
		return pipelineFinal(validPackage{version: 1, candidate: candidate1, batch: batch}, OutcomeBasic, ""), nil
	}

	var last *validPackage
	var draft ai.EditorDraft
	if editable != nil {
		draft = editable.Draft
	} else if batch, validateErr := validator.Validate(execution, spec, candidate1); validateErr == nil {
		value := validPackage{version: 1, candidate: candidate1, batch: batch}
		last = &value
		draft, err = ai.EditorDraftFromCandidate(candidate1, nil)
	} else {
		draft, err = ai.EditorDraftFromCandidate(candidate1, validateErr)
	}
	if err != nil {
		return PipelineResult{}, pipelineFailure("validation", err)
	}

	if err := execution.Err(); err != nil {
		return finishContentFault(execution, editor, last, err, false, false, hooks)
	}
	callCtx, callCancel = boundedCall(execution)
	callCtx = ai.WithInvocationObserver(callCtx, func() error { return activity("improving") })
	callCtx = ai.WithRepairObserver(callCtx, func() error { return activity("improving") })
	fixed, err := v5.OpenFixedEdit(callCtx, spec, draft)
	if err != nil {
		callCancel()
		return finishContentFault(execution, editor, last, err, true, false, hooks)
	}
	fixedAttempt := editor.Begin(2, "provider", callCancel)
	callCtx = ai.WithPassageClosedObserver(callCtx, fixedAttempt.Complete)
	candidate2, fixedErr := receiveWithNativeProjection(callCtx, callCancel, provider, validator, spec, fixed, editor, fixedAttempt, budget, func() error { return activity("writing") })
	_ = fixed.Close()
	callCancel()
	if fixedErr != nil {
		return finishContentFault(execution, editor, last, fixedErr, true, false, hooks)
	}
	batch2, validateErr := validator.Validate(execution, spec, candidate2)
	if validateErr != nil {
		return finishContentFault(execution, editor, last, validateErr, true, false, hooks)
	}
	value := validPackage{version: 2, candidate: candidate2, batch: batch2}
	last = &value

	repairs := 0
	for {
		if err := execution.Err(); err != nil {
			return finishContentFault(execution, editor, last, err, false, false, hooks)
		}
		callCtx, callCancel = boundedCall(execution)
		callCtx = ai.WithInvocationObserver(callCtx, func() error { return activity("improving") })
		review, reviewErr := contentProvider.Review(callCtx, spec, last.batch)
		callCancel()
		if reviewErr != nil {
			if errors.Is(reviewErr, ai.ErrCriticalUsageFact) {
				return PipelineResult{}, pipelineFailure("usage_record", reviewErr)
			}
			if hooks.ReviewFailure != nil {
				if err := hooks.ReviewFailure(last.version); err != nil {
					return PipelineResult{}, pipelineFailure("review_record", err)
				}
			}
			return finishContentFault(execution, editor, last, reviewErr, false, true, hooks)
		}
		willRepair := review.Verdict == "issues" && repairs < policy.ContentRepairLimit
		if hooks.Review != nil {
			if err := hooks.Review(last.version, review, willRepair); err != nil {
				return PipelineResult{}, pipelineFailure("review_record", err)
			}
		}
		if review.Verdict == "pass" {
			if hooks.Progress != nil {
				if err := hooks.Progress("finalizing"); err != nil {
					return PipelineResult{}, pipelineFailure("delivery", err)
				}
			}
			if repairs == 0 {
				return pipelineFinal(*last, OutcomeReviewPassed, ""), nil
			}
			return pipelineFinal(*last, OutcomeRepairedPassed, ""), nil
		}
		if repairs >= policy.ContentRepairLimit {
			if hooks.Progress != nil {
				if err := hooks.Progress("finalizing"); err != nil {
					return PipelineResult{}, pipelineFailure("delivery", err)
				}
			}
			return pipelineFinal(*last, OutcomeLimitFinalized, ""), nil
		}
		repairs++
		attemptVersion := 2 + repairs
		callCtx, callCancel = boundedCall(execution)
		callCtx = ai.WithInvocationObserver(callCtx, func() error { return activity("improving") })
		callCtx = ai.WithRepairObserver(callCtx, func() error { return activity("improving") })
		rewrite, rewriteErr := contentProvider.OpenRewrite(callCtx, spec, last.candidate, review.Issues)
		if rewriteErr != nil {
			callCancel()
			if errors.Is(rewriteErr, ai.ErrCriticalUsageFact) {
				return PipelineResult{}, pipelineFailure("usage_record", rewriteErr)
			}
			return finishContentFault(execution, editor, last, rewriteErr, false, false, hooks)
		}
		rewriteAttempt := editor.Begin(attemptVersion, "provider", callCancel)
		callCtx = ai.WithPassageClosedObserver(callCtx, rewriteAttempt.Complete)
		nextCandidate, rewriteErr := receiveWithNativeProjection(callCtx, callCancel, provider, validator, spec, rewrite, editor, rewriteAttempt, budget, func() error { return activity("writing") })
		_ = rewrite.Close()
		callCancel()
		if rewriteErr != nil {
			if errors.Is(rewriteErr, ai.ErrCriticalUsageFact) {
				return PipelineResult{}, pipelineFailure("usage_record", rewriteErr)
			}
			return finishContentFault(execution, editor, last, rewriteErr, false, false, hooks)
		}
		nextBatch, validateErr := validator.Validate(execution, spec, nextCandidate)
		if validateErr != nil {
			return finishContentFault(execution, editor, last, validateErr, false, false, hooks)
		}
		value = validPackage{version: attemptVersion, candidate: nextCandidate, batch: nextBatch}
		last = &value
	}
}

func receiveWithNativeProjection(ctx context.Context, cancel context.CancelFunc, provider ai.Provider, validator ai.Validator, spec ai.GenerationSpec, stream ai.Stream, editor *publicEditor, initial *publicAttempt, budget *ai.RepairBudget, continuationActivity func() error) (ai.Candidate, error) {
	active := initial
	ctx = ai.WithPassageClosedObserver(ctx, func() error { return active.Complete() })
	ctx = ai.WithContinuationObserver(ctx, continuationActivity)
	ctx = ai.WithContinuationAttempt(ctx, func() (func(string) error, error) {
		if err := active.Close(); err != nil {
			return nil, err
		}
		active = editor.BeginContinuation(initial.version, cancel)
		return active.Add, nil
	})
	candidate, err := ai.ReceiveWithRepairBudget(ctx, provider, validator, spec, stream, active.Add, budget)
	if err == nil {
		err = active.RequireComplete()
	}
	if closeErr := active.Close(); closeErr != nil {
		if err == nil {
			err = closeErr
		}
	}
	return candidate, err
}

func finishContentFault(execution context.Context, editor *publicEditor, last *validPackage, err error, fixed, review bool, hooks PipelineHooks) (PipelineResult, error) {
	if errors.Is(err, context.Canceled) && !errors.Is(execution.Err(), context.DeadlineExceeded) {
		return PipelineResult{}, pipelineFailure("cancelled", err)
	}
	if errors.Is(err, ai.ErrCriticalUsageFact) {
		return PipelineResult{}, pipelineFailure("usage_record", err)
	}
	if last == nil {
		phase := "validation"
		if !fixed {
			phase = "provider_receive"
		}
		return PipelineResult{}, pipelineFailure(phase, err)
	}
	reason := contentStopReason(err, review)
	if fixed {
		var providerErr *ai.ProviderError
		if errors.As(err, &providerErr) && (providerErr.Category == ai.FailureSchema || providerErr.Category == ai.FailureContent) {
			reason = "fixed_edit_native_invalid"
		} else if errors.Is(err, ai.ErrInvalidCandidate) {
			reason = "fixed_edit_native_invalid"
		}
	}
	if discardErr := editor.DiscardActive(); discardErr != nil {
		return PipelineResult{}, pipelineFailure("delivery", discardErr)
	}
	if restoreErr := editor.Restore(last.version, last.batch.Passage); restoreErr != nil {
		return PipelineResult{}, pipelineFailure("delivery", restoreErr)
	}
	if hooks.Progress != nil {
		if progressErr := hooks.Progress("finalizing"); progressErr != nil {
			return PipelineResult{}, pipelineFailure("delivery", progressErr)
		}
	}
	return pipelineIncomplete(*last, reason), nil
}

func boundedCall(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, 180*time.Second)
}

func pipelineFinal(p validPackage, outcome, reason string) PipelineResult {
	var stop *string
	if reason != "" {
		stop = &reason
	}
	return PipelineResult{Version: p.version, Candidate: p.candidate, Batch: p.batch, Outcome: outcome, StopReason: stop}
}

func pipelineIncomplete(p validPackage, reason string) PipelineResult {
	return pipelineFinal(p, OutcomeServiceIncomplete, reason)
}

func contentStopReason(err error, review bool) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "content_timeout"
	}
	var providerErr *ai.ProviderError
	if errors.As(err, &providerErr) {
		switch providerErr.Category {
		case ai.FailureRateLimited:
			return "content_rate_limited"
		case ai.FailureUnavailable:
			return "content_transport_error"
		case ai.FailureProtocol, ai.FailureAuthentication, ai.FailureAuthorization:
			return "content_protocol_error"
		case ai.FailureSchema, ai.FailureContent:
			if review {
				return "content_review_invalid"
			}
			return "repair_native_invalid"
		}
	}
	if review {
		return "content_review_invalid"
	}
	if errors.Is(err, ai.ErrInvalidCandidate) {
		return "repair_native_invalid"
	}
	return "content_transport_error"
}

type publicEditor struct {
	draft          func(PipelineDraft) error
	emit           func(PipelineEdit) error
	workingParts   [][]rune
	publishedParts [][]rune
	workingLen     int
	publishedLen   int
	rev            int
	active         *publicAttempt
	draftStarted   bool
}

type publicAttempt struct {
	mu         sync.Mutex
	editor     *publicEditor
	draftID    string
	version    int
	source     string
	pending    []rune
	received   []rune
	newParts   [][]rune
	initial    []rune
	committed  int
	scanPos    int
	paraStart  int
	paraIndex  int
	newlines   int
	previousCR bool
	hasContent bool
	started    bool
	mode       string
	lastEmit   time.Time
	timer      *time.Timer
	closed     bool
	complete   bool
	discarded  bool
	err        error
	cancel     context.CancelFunc
}

func newPublicEditor(emit func(PipelineEdit) error, draft ...func(PipelineDraft) error) *publicEditor {
	editor := &publicEditor{emit: emit}
	if len(draft) > 0 {
		editor.draft = draft[0]
	}
	return editor
}

func (e *publicEditor) Begin(version int, source string, cancel ...context.CancelFunc) *publicAttempt {
	mode := "replace"
	if !e.draftStarted {
		mode = "initial"
	}
	return e.begin(version, source, mode, cancel...)
}

func (e *publicEditor) BeginContinuation(version int, cancel ...context.CancelFunc) *publicAttempt {
	// A continuation has its own draft identity but inherits the current clean
	// visible prefix. Its first edit therefore appends instead of replacing.
	return e.begin(version, "provider", "append", cancel...)
}

func (e *publicEditor) begin(version int, source, mode string, cancel ...context.CancelFunc) *publicAttempt {
	attempt := &publicAttempt{
		editor: e, draftID: uuid.NewString(), version: version, source: source, mode: mode,
	}
	if mode == "append" {
		attempt.paraIndex = paragraphCount(joinParts(e.publishedParts, e.publishedLen))
	}
	if len(cancel) > 0 {
		attempt.cancel = cancel[0]
	}
	e.active = attempt
	e.draftStarted = true
	if e.draft != nil {
		attempt.err = e.draft(PipelineDraft{Action: "begin", DraftID: attempt.draftID, ContentVersion: version, Mode: mode, BaseRev: e.rev})
		if attempt.err != nil && attempt.cancel != nil {
			attempt.cancel()
		}
	}
	return attempt
}

func (a *publicAttempt) Add(delta string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.err != nil {
		return a.err
	}
	if a.closed {
		return errors.New("public edit attempt is closed")
	}
	if delta == "" {
		return nil
	}
	if !utf8.ValidString(delta) {
		return errors.New("public edit is not valid UTF-8")
	}
	if a.complete || a.discarded {
		return errors.New("public edit attempt is complete")
	}
	if a.mode != "initial" {
		a.received = append(a.received, []rune(delta)...)
		return a.scanParagraphsLocked()
	}
	a.pending = append(a.pending, []rune(delta)...)
	if len([]byte(string(a.pending))) > 16<<10 {
		cut := lastSafeBoundary(a.pending)
		if cut == 0 {
			return a.failLocked(&ai.ProviderError{Category: ai.FailureProtocol, Retryable: false, Err: errors.New("public edit safe buffer exceeded")})
		}
		if err := a.flushPrefixLocked(cut); err != nil {
			return err
		}
		if len([]byte(string(a.pending))) > 16<<10 {
			return a.failLocked(&ai.ProviderError{Category: ai.FailureProtocol, Retryable: false, Err: errors.New("public edit safe buffer exceeded")})
		}
	}
	safe := lastSafeBoundary(a.pending)
	if safe == 0 {
		return nil
	}
	if !a.started || safe >= 128 {
		return a.flushPrefixLocked(safe)
	}
	return a.scheduleLocked()
}

func (a *publicAttempt) Flush() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.mode != "initial" {
		return a.err
	}
	return a.flushInitialLocked(false)
}

func (a *publicAttempt) Close() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.timer != nil {
		a.timer.Stop()
		a.timer = nil
	}
	a.closed = true
	return a.err
}

func (a *publicAttempt) Complete() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.err != nil || a.complete {
		return a.err
	}
	if a.closed || a.discarded {
		return errors.New("public edit attempt is closed")
	}
	if a.timer != nil {
		a.timer.Stop()
		a.timer = nil
	}
	if a.mode == "initial" {
		if err := a.flushInitialLocked(false); err != nil {
			return err
		}
		a.editor.workingParts = bodyParts(a.initial)
		a.editor.workingLen = len(a.initial)
	} else if a.mode == "replace" {
		final := append([]rune(nil), a.received[a.paraStart:]...)
		if err := a.editor.replaceTail(a, len(a.newParts), a.committed, final); err != nil {
			return a.failLocked(err)
		}
		a.editor.workingParts = bodyParts(a.received)
		a.editor.workingLen = len(a.received)
	} else if a.mode == "append" {
		final := append([]rune(nil), a.received[a.paraStart:]...)
		if len(final) > 0 {
			if err := a.editor.emitOperation(a, a.editor.workingLen, 0, final); err != nil {
				return a.failLocked(err)
			}
			a.editor.workingParts = append(a.editor.workingParts, final)
			a.editor.workingLen += len(final)
		}
		// Continuation deltas begin at the visible body boundary, so their
		// leading paragraph separator initially lives in the appended part.
		// Rebuild the completed body's part index once so the separator again
		// belongs to the preceding paragraph before any later replacement.
		body := joinParts(a.editor.workingParts, a.editor.workingLen)
		a.editor.workingParts = bodyParts(body)
	}
	length := a.editor.workingLen
	count := paragraphCount(joinParts(a.editor.workingParts, a.editor.workingLen))
	if a.editor.draft != nil {
		if err := a.editor.draft(PipelineDraft{Action: "body_complete", DraftID: a.draftID, ContentVersion: a.version, BaseRev: a.editor.rev, BodyLength: &length, ParagraphCount: &count}); err != nil {
			return a.failLocked(err)
		}
	}
	a.editor.publishedParts = cloneParts(a.editor.workingParts)
	a.editor.publishedLen = a.editor.workingLen
	a.complete = true
	return nil
}

func (a *publicAttempt) RequireComplete() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.err != nil {
		return a.err
	}
	if !a.complete {
		return &ai.ProviderError{Category: ai.FailureProtocol, Retryable: true, Err: errors.New("passage closed boundary was not observed")}
	}
	return nil
}

func (a *publicAttempt) flushInitialLocked(close bool) error {
	if a.timer != nil {
		a.timer.Stop()
		a.timer = nil
	}
	if a.err == nil && len(a.pending) > 0 {
		a.err = a.flushPrefixLocked(len(a.pending))
	}
	if close {
		a.closed = true
	}
	return a.err
}

func (a *publicAttempt) scheduleLocked() error {
	if a.timer != nil || a.err != nil || a.closed {
		return a.err
	}
	delay := 50 * time.Millisecond
	if !a.lastEmit.IsZero() {
		delay -= time.Since(a.lastEmit)
	}
	if delay <= 0 {
		return a.flushPrefixLocked(lastSafeBoundary(a.pending))
	}
	a.timer = time.AfterFunc(delay, func() {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.timer = nil
		if a.closed || a.err != nil {
			return
		}
		if safe := lastSafeBoundary(a.pending); safe > 0 {
			_ = a.flushPrefixLocked(safe)
		}
	})
	return nil
}

func (a *publicAttempt) flushPrefixLocked(count int) error {
	if count <= 0 || a.err != nil {
		return a.err
	}
	count = min(count, len(a.pending))
	chunk := append([]rune(nil), a.pending[:count]...)
	a.pending = a.pending[count:]
	if err := a.applyLocked(chunk); err != nil {
		return a.failLocked(err)
	}
	a.started = true
	a.lastEmit = time.Now()
	return nil
}

func (a *publicAttempt) failLocked(err error) error {
	if a.err == nil {
		a.err = err
		if a.cancel != nil {
			a.cancel()
		}
	}
	return a.err
}

func (a *publicAttempt) applyLocked(chunk []rune) error {
	e := a.editor
	if err := e.emitOperation(a, e.workingLen, 0, chunk); err != nil {
		return err
	}
	a.initial = append(a.initial, chunk...)
	e.workingParts = [][]rune{a.initial}
	e.publishedParts = e.workingParts
	e.workingLen += len(chunk)
	e.publishedLen = e.workingLen
	return nil
}

func (e *publicEditor) Restore(version int, text string) error {
	target := []rune(text)
	attempt := e.begin(version, "retained", "restore")
	if attempt.err != nil {
		return attempt.err
	}
	current := joinParts(e.workingParts, e.workingLen)
	if !runesEqual(current, target) {
		if err := e.emitOperation(attempt, 0, e.workingLen, target); err != nil {
			return err
		}
	}
	e.workingParts = bodyParts(target)
	e.workingLen = len(target)
	length, count := e.workingLen, paragraphCount(target)
	if e.draft != nil {
		if err := e.draft(PipelineDraft{Action: "body_complete", DraftID: attempt.draftID, ContentVersion: version, BaseRev: e.rev, BodyLength: &length, ParagraphCount: &count}); err != nil {
			return err
		}
	}
	e.publishedParts = cloneParts(e.workingParts)
	e.publishedLen = e.workingLen
	attempt.complete = true
	return nil
}

func (e *publicEditor) DiscardActive() error {
	a := e.active
	if a == nil {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.discarded {
		return a.err
	}
	if a.timer != nil {
		a.timer.Stop()
		a.timer = nil
	}
	if e.draft != nil {
		if err := e.draft(PipelineDraft{Action: "discard", DraftID: a.draftID, ContentVersion: a.version, BaseRev: e.rev}); err != nil {
			return err
		}
	}
	e.workingParts = cloneParts(e.publishedParts)
	e.workingLen = e.publishedLen
	a.discarded = true
	a.closed = true
	return nil
}

func (a *publicAttempt) scanParagraphsLocked() error {
	for a.scanPos < len(a.received) {
		i := a.scanPos
		r := a.received[i]
		a.scanPos++
		if r == '\n' && a.previousCR {
			a.previousCR = false
			continue
		}
		a.previousCR = false
		switch r {
		case '\r':
			a.newlines++
			a.previousCR = true
		case '\n':
			a.newlines++
		case ' ', '\t':
			if a.newlines == 0 && !unicode.IsSpace(r) {
				a.hasContent = true
			}
		default:
			if a.newlines >= 2 && a.hasContent {
				if err := a.commitParagraphLocked(i); err != nil {
					return err
				}
				a.paraStart = i
				a.hasContent = false
			}
			a.newlines = 0
			if !unicode.IsSpace(r) {
				a.hasContent = true
			}
		}
	}
	return nil
}

func (a *publicAttempt) commitParagraphLocked(end int) error {
	part := append([]rune(nil), a.received[a.paraStart:end]...)
	if a.mode == "append" {
		if err := a.editor.emitOperation(a, a.editor.workingLen, 0, part); err != nil {
			return a.failLocked(err)
		}
		a.editor.workingParts = append(a.editor.workingParts, part)
		a.editor.workingLen += len(part)
	} else {
		index := len(a.newParts)
		if index < len(a.editor.workingParts) {
			old := a.editor.workingParts[index]
			if !runesEqual(old, part) {
				if err := a.editor.emitOperation(a, a.committed, len(old), part); err != nil {
					return a.failLocked(err)
				}
				a.editor.workingParts[index] = part
				a.editor.workingLen += len(part) - len(old)
			}
		} else {
			if err := a.editor.emitOperation(a, a.committed, 0, part); err != nil {
				return a.failLocked(err)
			}
			a.editor.workingParts = append(a.editor.workingParts, part)
			a.editor.workingLen += len(part)
		}
	}
	index := a.paraIndex
	if a.editor.draft != nil {
		if err := a.editor.draft(PipelineDraft{Action: "paragraph_complete", DraftID: a.draftID, ContentVersion: a.version, BaseRev: a.editor.rev, ParagraphIndex: &index}); err != nil {
			return a.failLocked(err)
		}
	}
	a.newParts = append(a.newParts, part)
	a.committed += len(part)
	a.editor.publishedParts = cloneParts(a.editor.workingParts)
	a.editor.publishedLen = a.editor.workingLen
	a.paraIndex++
	return nil
}

func (e *publicEditor) emitOperation(a *publicAttempt, at, deleteCount int, insert []rune) error {
	if deleteCount == 0 && len(insert) == 0 {
		return nil
	}
	remaining := insert
	first := true
	for first || len(remaining) > 0 {
		count := min(2048, len(remaining))
		chunk := remaining[:count]
		remaining = remaining[count:]
		remove := 0
		if first {
			remove = deleteCount
		}
		if e.emit != nil {
			base := e.rev
			e.rev++
			if err := e.emit(PipelineEdit{DraftID: a.draftID, ContentVersion: a.version, BaseRev: base, Rev: e.rev, At: at, DeleteCount: remove, Insert: string(chunk), Source: a.source}); err != nil {
				return err
			}
		}
		at += len(chunk)
		first = false
	}
	return nil
}

func (e *publicEditor) replaceTail(a *publicAttempt, partIndex, at int, insert []rune) error {
	deleteCount := e.workingLen - at
	if partIndex == len(e.workingParts)-1 && deleteCount == len(insert) && runesEqual(e.workingParts[partIndex], insert) {
		return nil
	}
	if partIndex == len(e.workingParts) && len(insert) == 0 {
		return nil
	}
	return e.emitOperation(a, at, deleteCount, insert)
}

func cloneParts(parts [][]rune) [][]rune { return append([][]rune(nil), parts...) }

func joinParts(parts [][]rune, length int) []rune {
	joined := make([]rune, 0, length)
	for _, part := range parts {
		joined = append(joined, part...)
	}
	return joined
}

func bodyParts(text []rune) [][]rune {
	if len(text) == 0 {
		return nil
	}
	if paragraphCount(text) == 0 {
		return [][]rune{append([]rune(nil), text...)}
	}
	return paragraphParts(text)
}

func runesEqual(a, b []rune) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func paragraphParts(text []rune) [][]rune {
	if paragraphCount(text) == 0 {
		return nil
	}
	parts := make([][]rune, 0, 4)
	start, newlines := 0, 0
	previousCR, hasContent := false, false
	for i, r := range text {
		if r == '\n' && previousCR {
			previousCR = false
			continue
		}
		previousCR = false
		switch r {
		case '\r':
			newlines++
			previousCR = true
		case '\n':
			newlines++
		case ' ', '\t':
		default:
			if newlines >= 2 && hasContent {
				parts = append(parts, append([]rune(nil), text[start:i]...))
				start = i
				hasContent = false
			}
			newlines = 0
			if !unicode.IsSpace(r) {
				hasContent = true
			}
		}
	}
	parts = append(parts, append([]rune(nil), text[start:]...))
	return parts
}

func paragraphCount(text []rune) int {
	for _, r := range text {
		if !unicode.IsSpace(r) {
			return len(paragraphPartsNonEmpty(text))
		}
	}
	return 0
}

func paragraphPartsNonEmpty(text []rune) [][]rune {
	parts := make([][]rune, 0, 4)
	start, newlines := 0, 0
	previousCR, hasContent := false, false
	for i, r := range text {
		if r == '\n' && previousCR {
			previousCR = false
			continue
		}
		previousCR = false
		switch r {
		case '\r':
			newlines++
			previousCR = true
		case '\n':
			newlines++
		case ' ', '\t':
		default:
			if newlines >= 2 && hasContent {
				parts = append(parts, text[start:i])
				start, hasContent = i, false
			}
			newlines = 0
			if !unicode.IsSpace(r) {
				hasContent = true
			}
		}
	}
	return append(parts, text[start:])
}

func lastSafeBoundary(text []rune) int {
	for i := len(text); i > 0; i-- {
		if unicode.IsSpace(text[i-1]) || unicode.IsPunct(text[i-1]) {
			return i
		}
	}
	return 0
}
