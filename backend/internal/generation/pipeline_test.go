package generation

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"wordweave/internal/ai"
	"wordweave/internal/entitlement"
)

type pipelineStream struct {
	candidate ai.Candidate
	err       error
	deltas    []string
	skipClose bool
}

func (s *pipelineStream) Receive(ctx context.Context, emit func(string) error) (ai.Candidate, error) {
	if err := ctx.Err(); err != nil {
		return ai.Candidate{}, err
	}
	if s.err != nil {
		return ai.Candidate{}, s.err
	}
	if emit != nil {
		deltas := s.deltas
		if deltas == nil {
			deltas = []string{s.candidate.Passage}
		}
		for _, delta := range deltas {
			if err := emit(delta); err != nil {
				return ai.Candidate{}, err
			}
		}
	}
	if !s.skipClose {
		if err := ai.NotifyPassageClosed(ctx); err != nil {
			return ai.Candidate{}, err
		}
	}
	return s.candidate, nil
}
func (*pipelineStream) Close() error { return nil }

type pipelineProvider struct {
	initial       ai.Candidate
	initialErr    error
	initialDeltas []string
	fixed         *pipelineStream
	rewrites      []pipelineStream
	reviews       []ai.Review
	reviewErrs    []error
	rewriteAt     int
	reviewAt      int
	native        []pipelineStream
	nativeAt      int
	fixedDraft    ai.EditorDraft
}

func (p *pipelineProvider) Plan(_ context.Context, spec ai.GenerationSpec, emit func(ai.PlanItem) error) (ai.ScenePlan, error) {
	plan := ai.ScenePlan{Scene: "A study group meets.", Participants: []ai.PlanParticipant{{ID: "learner", Role: "student"}}, FixedFacts: []string{}, Beats: []string{"The group meets.", "They study."}, WordUses: make([]ai.PlanWordUse, 0, len(spec.Entries))}
	if emit != nil {
		if err := emit(ai.PlanItem{Kind: "scene", MeaningLanguage: spec.MeaningLanguage, Text: plan.Scene}); err != nil {
			return ai.ScenePlan{}, err
		}
	}
	for _, entry := range spec.Entries {
		use := ai.PlanWordUse{Entry: entry, Form: entry, Meaning: "a selected sense", Phrase: entry + " together", Role: "used in the study scene"}
		plan.WordUses = append(plan.WordUses, use)
		if emit != nil {
			if err := emit(ai.PlanItem{Kind: "word_use", MeaningLanguage: spec.MeaningLanguage, Entry: entry, Form: use.Form, Sense: use.Meaning, Phrase: use.Phrase}); err != nil {
				return ai.ScenePlan{}, err
			}
		}
	}
	return plan, nil
}

func (p *pipelineProvider) OpenPlanned(context.Context, ai.GenerationSpec, ai.ScenePlan) (ai.Stream, error) {
	return &pipelineStream{candidate: p.initial, err: p.initialErr, deltas: p.initialDeltas}, nil
}

func (p *pipelineProvider) OpenFixedEdit(_ context.Context, _ ai.GenerationSpec, draft ai.EditorDraft) (ai.Stream, error) {
	p.fixedDraft = draft
	if p.fixed != nil {
		return p.fixed, nil
	}
	return &pipelineStream{candidate: p.initial}, nil
}

func (p *pipelineProvider) Open(context.Context, ai.GenerationSpec) (ai.Stream, error) {
	if p.nativeAt < len(p.native) {
		stream := &p.native[p.nativeAt]
		p.nativeAt++
		return stream, nil
	}
	return &pipelineStream{candidate: p.initial, err: p.initialErr}, nil
}
func (*pipelineProvider) CheckCompatibility(context.Context, string) error { return nil }
func (p *pipelineProvider) Review(context.Context, ai.GenerationSpec, ai.ValidatedBatch) (ai.Review, error) {
	i := p.reviewAt
	p.reviewAt++
	if i < len(p.reviewErrs) && p.reviewErrs[i] != nil {
		return ai.Review{}, p.reviewErrs[i]
	}
	return p.reviews[i], nil
}
func (p *pipelineProvider) OpenRewrite(context.Context, ai.GenerationSpec, ai.Candidate, []ai.ReviewIssue) (ai.Stream, error) {
	i := p.rewriteAt
	p.rewriteAt++
	if i >= len(p.rewrites) {
		return nil, errors.New("unexpected rewrite")
	}
	return &p.rewrites[i], nil
}

func pipelineCandidate(extra string) ai.Candidate {
	return ai.Candidate{
		Passage: "We learn(learn) together" + extra + ".",
		Tags:    []string{"study"},
		Targets: []ai.CandidateTarget{{SourceEntry: "learn", EntryMeaning: "To gain knowledge or skill.", HintPhrase: "learn(learn) together"}},
	}
}

func pipelineReview(verdict string) ai.Review {
	result := ai.Review{SchemaVersion: 1, Verdict: verdict, Issues: []ai.ReviewIssue{}}
	if verdict == "issues" {
		result.Issues = []ai.ReviewIssue{{Code: ai.ReviewForcedWording, Evidence: []string{"We learn together."}, Problem: "The wording is forced.", RepairGoal: "Use a natural situation."}}
	}
	return result
}

func pipelineValidator(t *testing.T) ai.Validator {
	t.Helper()
	lexicon, err := ai.LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	return ai.NewValidator(lexicon)
}

func TestExecutePipelineContentRepairBoundaries(t *testing.T) {
	spec := ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 1}
	t.Run("zero_disables_content_service", func(t *testing.T) {
		provider := &pipelineProvider{initial: pipelineCandidate("")}
		result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true}, PipelineHooks{})
		if err != nil || result.Outcome != OutcomeBasic || result.Version != 1 || provider.reviewAt != 0 || provider.rewriteAt != 0 {
			t.Fatalf("result=%+v reviews=%d rewrites=%d err=%v", result, provider.reviewAt, provider.rewriteAt, err)
		}
	})
	t.Run("one_repair_then_pass", func(t *testing.T) {
		provider := &pipelineProvider{initial: pipelineCandidate(""), reviews: []ai.Review{pipelineReview("issues"), pipelineReview("pass")}, rewrites: []pipelineStream{{candidate: pipelineCandidate(" naturally")}}}
		result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 1}, PipelineHooks{})
		if err != nil || result.Outcome != OutcomeRepairedPassed || result.Version != 3 || provider.reviewAt != 2 || provider.rewriteAt != 1 {
			t.Fatalf("result=%+v reviews=%d rewrites=%d err=%v", result, provider.reviewAt, provider.rewriteAt, err)
		}
	})
	t.Run("second_repair_failure_keeps_version_two", func(t *testing.T) {
		provider := &pipelineProvider{initial: pipelineCandidate(""), reviews: []ai.Review{pipelineReview("issues"), pipelineReview("issues")}, rewrites: []pipelineStream{{candidate: pipelineCandidate(" naturally")}, {err: &ai.ProviderError{Category: ai.FailureSchema, Retryable: true, Err: errors.New("bad candidate")}}}}
		result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 2}, PipelineHooks{})
		if err != nil || result.Outcome != OutcomeServiceIncomplete || result.Version != 3 || result.StopReason == nil || *result.StopReason != "repair_native_invalid" {
			t.Fatalf("result=%+v err=%v", result, err)
		}
	})
	t.Run("two_repairs_then_limit_finalizes_version_three", func(t *testing.T) {
		provider := &pipelineProvider{
			initial:  pipelineCandidate(""),
			reviews:  []ai.Review{pipelineReview("issues"), pipelineReview("issues"), pipelineReview("issues")},
			rewrites: []pipelineStream{{candidate: pipelineCandidate(" naturally")}, {candidate: pipelineCandidate(" consistently")}},
		}
		result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 2}, PipelineHooks{})
		if err != nil || result.Outcome != OutcomeLimitFinalized || result.Version != 4 || provider.reviewAt != 3 || provider.rewriteAt != 2 {
			t.Fatalf("result=%+v reviews=%d rewrites=%d err=%v", result, provider.reviewAt, provider.rewriteAt, err)
		}
	})
}

func TestExecutePipelineContentFailuresKeepLastValidPackage(t *testing.T) {
	spec := ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 1}
	for _, tc := range []struct {
		name, stop string
		reviewErr  error
		rewriteErr error
	}{
		{"timeout", "content_timeout", context.DeadlineExceeded, nil},
		{"rate limited", "content_rate_limited", &ai.ProviderError{Category: ai.FailureRateLimited, Retryable: true}, nil},
		{"transport", "content_transport_error", &ai.ProviderError{Category: ai.FailureUnavailable, Retryable: true}, nil},
		{"protocol", "content_protocol_error", &ai.ProviderError{Category: ai.FailureProtocol, Retryable: true}, nil},
		{"review invalid", "content_review_invalid", &ai.ProviderError{Category: ai.FailureSchema, Retryable: true}, nil},
		{"repair invalid", "repair_native_invalid", nil, &ai.ProviderError{Category: ai.FailureSchema, Retryable: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := &pipelineProvider{initial: pipelineCandidate("")}
			if tc.reviewErr != nil {
				provider.reviewErrs = []error{tc.reviewErr}
				provider.reviews = []ai.Review{{}}
			} else {
				provider.reviews = []ai.Review{pipelineReview("issues")}
				provider.rewrites = []pipelineStream{{err: tc.rewriteErr}}
			}
			result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 1}, PipelineHooks{})
			if err != nil || result.Outcome != OutcomeServiceIncomplete || result.Version != 2 || result.StopReason == nil || *result.StopReason != tc.stop || result.Batch.Passage == "" {
				t.Fatalf("result=%+v err=%v", result, err)
			}
		})
	}
}

func TestExecutePipelineNeverTurnsMissingInitialPackageIntoIncompleteSuccess(t *testing.T) {
	spec := ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 1}
	provider := &pipelineProvider{initialErr: &ai.ProviderError{Category: ai.FailureUnavailable, Retryable: true}}
	result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 2}, PipelineHooks{})
	if err == nil || result.Outcome != "" || result.Version != 0 || PipelineFailurePhase(err) != "provider_receive" {
		t.Fatalf("result=%+v phase=%s err=%v", result, PipelineFailurePhase(err), err)
	}
}

func TestExecutePipelineNeverTurnsCriticalUsageFactsIntoIncompleteSuccess(t *testing.T) {
	spec := ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 1}
	for _, provider := range []*pipelineProvider{
		{initial: pipelineCandidate(""), reviewErrs: []error{ai.ErrCriticalUsageFact}, reviews: []ai.Review{{}}},
		{initial: pipelineCandidate(""), reviews: []ai.Review{pipelineReview("issues")}, rewrites: []pipelineStream{{err: ai.ErrCriticalUsageFact}}},
	} {
		result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), spec, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 1}, PipelineHooks{})
		if !errors.Is(err, ai.ErrCriticalUsageFact) || PipelineFailurePhase(err) != "usage_record" || result.Outcome != "" {
			t.Fatalf("result=%+v phase=%s err=%v", result, PipelineFailurePhase(err), err)
		}
	}
}

func TestContentRepairLimitNinetyNineIsConfigurationOnly(t *testing.T) {
	policy := entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 99}
	if policy.ContentRepairLimit+2 != 101 || 2*policy.ContentRepairLimit+6 != 204 {
		t.Fatalf("unexpected version/call boundaries: %+v", policy)
	}
}

func TestPublicAttemptFlushesSafePrefixWithoutAnotherDelta(t *testing.T) {
	edits := make(chan PipelineEdit, 4)
	editor := newPublicEditor(func(edit PipelineEdit) error {
		edits <- edit
		return nil
	})
	attempt := editor.Begin(1, "provider")
	if err := attempt.Add("Hello wor"); err != nil {
		t.Fatal(err)
	}
	select {
	case edit := <-edits:
		if edit.Insert != "Hello " || edit.At != 0 || edit.DeleteCount != 0 {
			t.Fatalf("first safe prefix edit=%+v", edit)
		}
	case <-time.After(25 * time.Millisecond):
		t.Fatal("first complete word was held behind a partial trailing word")
	}
	started := time.Now()
	if err := attempt.Add("ld done par"); err != nil {
		t.Fatal(err)
	}
	select {
	case edit := <-edits:
		if edit.Insert != "world done " || edit.At != len([]rune("Hello ")) {
			t.Fatalf("timed safe prefix edit=%+v", edit)
		}
		if elapsed := time.Since(started); elapsed > 120*time.Millisecond {
			t.Fatalf("safe prefix flush took %s", elapsed)
		}
	case <-time.After(150 * time.Millisecond):
		t.Fatal("safe prefix was not flushed while upstream was paused")
	}
	if err := attempt.Complete(); err != nil {
		t.Fatal(err)
	}
	final := <-edits
	if final.Insert != "par" || final.At != len([]rune("Hello world done ")) {
		t.Fatalf("final rune edit=%+v", final)
	}
}

func TestPublicAttemptTimerFailureCancelsUpstreamAndSealsError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	want := errors.New("delivery failed")
	calls := 0
	editor := newPublicEditor(func(PipelineEdit) error {
		calls++
		if calls == 2 {
			return want
		}
		return nil
	})
	attempt := editor.Begin(1, "provider", cancel)
	if err := attempt.Add("Ready par"); err != nil {
		t.Fatal(err)
	}
	if err := attempt.Add("t done tai"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-ctx.Done():
	case <-time.After(150 * time.Millisecond):
		t.Fatal("timer delivery failure did not cancel the blocked upstream")
	}
	if err := attempt.Close(); !errors.Is(err, want) {
		t.Fatalf("timer error was not retained: %v", err)
	}
}

func TestNativeContinuationUsesNewDraftIDAtSameVersion(t *testing.T) {
	initial := pipelineCandidate("")
	initial.Passage = "We learn(learn)."
	extra := ai.Candidate{Passage: "We practice together.", Tags: []string{"study"}, Targets: []ai.CandidateTarget{}}
	provider := &pipelineProvider{
		initial:       initial,
		initialDeltas: []string{"We learn."},
		native:        []pipelineStream{{candidate: extra, deltas: []string{"We practice together."}}},
	}
	var edits []PipelineEdit
	result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 5}, entitlement.ContentService{NativeValidation: true}, PipelineHooks{Edit: func(edit PipelineEdit) error {
		edits = append(edits, edit)
		return nil
	}})
	if err != nil || result.Outcome != OutcomeBasic || result.Version != 1 || result.Batch.Passage != "We learn.\n\nWe practice together." {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	if len(edits) < 2 || edits[0].DraftID == edits[1].DraftID || edits[0].ContentVersion != 1 || edits[1].ContentVersion != 1 {
		t.Fatalf("continuation draft identity/version edits=%+v", edits)
	}
	if edits[1].At != len([]rune("We learn.")) || edits[1].DeleteCount != 0 || !strings.HasPrefix(edits[1].Insert, "\n\nWe practice") {
		t.Fatalf("continuation did not inherit and append to the visible prefix: %+v", edits[1])
	}
}

func TestPublicEditorReplacementPublishesOnlyCompleteParagraphs(t *testing.T) {
	type observed struct {
		kind  string
		draft PipelineDraft
		edit  PipelineEdit
	}
	var events []observed
	editor := newPublicEditor(func(edit PipelineEdit) error {
		events = append(events, observed{kind: "edit", edit: edit})
		return nil
	}, func(draft PipelineDraft) error {
		events = append(events, observed{kind: "draft", draft: draft})
		return nil
	})
	initial := editor.Begin(1, "provider")
	if err := initial.Add("Old one.\n\nOld two.\n\nOld three."); err != nil {
		t.Fatal(err)
	}
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	old := "Old one.\n\nOld two.\n\nOld three."
	if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != old {
		t.Fatalf("initial published=%q", got)
	}

	replacement := editor.Begin(2, "provider")
	if err := replacement.Add("New one.\n\nHalf"); err != nil {
		t.Fatal(err)
	}
	if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != "New one.\n\nOld two.\n\nOld three." {
		t.Fatalf("closed first paragraph did not preserve old tail: %q", got)
	}
	if got := string(joinParts(editor.workingParts, editor.workingLen)); got != string(joinParts(editor.publishedParts, editor.publishedLen)) {
		t.Fatalf("half paragraph leaked into working edits: %q", got)
	}
	if err := replacement.Complete(); err != nil {
		t.Fatal(err)
	}
	if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != "New one.\n\nHalf" {
		t.Fatalf("body completion did not remove old tail: %q", got)
	}

	paragraphs, bodies := 0, 0
	var firstReplacement *PipelineEdit
	for _, event := range events {
		if event.kind == "edit" && event.edit.ContentVersion == 2 && firstReplacement == nil {
			copy := event.edit
			firstReplacement = &copy
		}
		if event.kind != "draft" {
			continue
		}
		switch event.draft.Action {
		case "paragraph_complete":
			paragraphs++
		case "body_complete":
			bodies++
		}
	}
	if paragraphs != 1 || bodies != 2 {
		t.Fatalf("paragraph_complete=%d body_complete=%d events=%+v", paragraphs, bodies, events)
	}
	if firstReplacement == nil || firstReplacement.At != 0 || firstReplacement.DeleteCount != len([]rune("Old one.\n\n")) || firstReplacement.Insert != "New one.\n\n" {
		t.Fatalf("replacement did not replace the full corresponding paragraph: %+v", firstReplacement)
	}
}

func TestPublicEditorLongUnicodeParagraphUsesBoundedCodepointEdits(t *testing.T) {
	var edits []PipelineEdit
	var drafts []PipelineDraft
	editor := newPublicEditor(func(edit PipelineEdit) error {
		edits = append(edits, edit)
		return nil
	}, func(draft PipelineDraft) error {
		drafts = append(drafts, draft)
		return nil
	})
	initial := editor.Begin(1, "provider")
	if err := initial.Add("Old.\r\n \t\r\nTail."); err != nil {
		t.Fatal(err)
	}
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	long := strings.Repeat("🎨", 5000) + "\r\n \t\r\nNext"
	replacement := editor.Begin(2, "provider")
	if err := replacement.Add(long); err != nil {
		t.Fatal(err)
	}
	if err := replacement.Complete(); err != nil {
		t.Fatal(err)
	}
	if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != long {
		t.Fatalf("unicode/CRLF body mismatch: got runes=%d want=%d", len([]rune(got)), len([]rune(long)))
	}
	for _, edit := range edits {
		if n := len([]rune(edit.Insert)); n > 2048 {
			t.Fatalf("edit insert has %d code points", n)
		}
	}
	last := drafts[len(drafts)-1]
	if last.Action != "body_complete" || last.BodyLength == nil || *last.BodyLength != len([]rune(long)) || last.ParagraphCount == nil || *last.ParagraphCount != 2 {
		t.Fatalf("wrong body boundary: %+v", last)
	}
}

func TestPublicEditorDiscardAndRetainedRestoreKeepRevisionMonotonic(t *testing.T) {
	var drafts []PipelineDraft
	var edits []PipelineEdit
	editor := newPublicEditor(func(edit PipelineEdit) error {
		edits = append(edits, edit)
		return nil
	}, func(draft PipelineDraft) error {
		drafts = append(drafts, draft)
		return nil
	})
	initial := editor.Begin(1, "provider")
	if err := initial.Add("Last valid."); err != nil {
		t.Fatal(err)
	}
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	replacement := editor.Begin(2, "provider")
	if err := replacement.Add("Broken complete.\n\nHalf"); err != nil {
		t.Fatal(err)
	}
	beforeRestoreRev := editor.rev
	if err := editor.DiscardActive(); err != nil {
		t.Fatal(err)
	}
	if err := editor.Restore(1, "Last valid."); err != nil {
		t.Fatal(err)
	}
	if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != "Last valid." {
		t.Fatalf("restored=%q", got)
	}
	if editor.rev < beforeRestoreRev {
		t.Fatalf("revision regressed: %d -> %d", beforeRestoreRev, editor.rev)
	}
	if len(drafts) < 3 || drafts[len(drafts)-2].Action != "begin" || drafts[len(drafts)-2].Mode != "restore" || drafts[len(drafts)-1].Action != "body_complete" {
		t.Fatalf("restore lifecycle=%+v", drafts)
	}
	for i := 1; i < len(edits); i++ {
		if edits[i].Rev != edits[i].BaseRev+1 || edits[i].BaseRev != edits[i-1].Rev {
			t.Fatalf("non-monotonic edits: %+v", edits)
		}
	}
}

func TestPublicEditorEmptyInitialStillMakesNextDraftReplacement(t *testing.T) {
	var drafts []PipelineDraft
	editor := newPublicEditor(nil, func(draft PipelineDraft) error {
		drafts = append(drafts, draft)
		return nil
	})
	initial := editor.Begin(1, "provider")
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	fixed := editor.Begin(2, "provider")
	if err := fixed.Add("Rescued."); err != nil {
		t.Fatal(err)
	}
	if err := fixed.Complete(); err != nil {
		t.Fatal(err)
	}
	if len(drafts) < 4 || drafts[0].Mode != "initial" || drafts[2].Mode != "replace" {
		t.Fatalf("empty initial draft identity was lost: %+v", drafts)
	}
}

func TestPublicEditorWhitespaceInitialContinuationStartsAtParagraphZero(t *testing.T) {
	var drafts []PipelineDraft
	editor := newPublicEditor(func(PipelineEdit) error { return nil }, func(draft PipelineDraft) error {
		drafts = append(drafts, draft)
		return nil
	})
	initial := editor.Begin(1, "provider")
	if err := initial.Add(" \t"); err != nil {
		t.Fatal(err)
	}
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	continuation := editor.BeginContinuation(1)
	if err := continuation.Add("\n\nNew.\n\nNext."); err != nil {
		t.Fatal(err)
	}
	if err := continuation.Complete(); err != nil {
		t.Fatal(err)
	}
	for _, draft := range drafts {
		if draft.Action == "paragraph_complete" {
			if draft.ParagraphIndex == nil || *draft.ParagraphIndex != 0 {
				t.Fatalf("first continuation paragraph index=%v", draft.ParagraphIndex)
			}
			return
		}
	}
	t.Fatal("continuation did not publish its first complete paragraph")
}

func TestExecutePipelineRejectsStreamWithoutPassageClosedBoundary(t *testing.T) {
	provider := &pipelineProvider{initial: pipelineCandidate("")}
	provider.initialErr = nil
	provider.initialDeltas = []string{"We learn together."}
	// Override the normal planned stream with a provider whose stream returns a
	// candidate but never reports the extractor's passage-close boundary.
	missing := &missingCloseProvider{pipelineProvider: provider}
	_, err := ExecutePipeline(context.Background(), missing, pipelineValidator(t), ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 1}, entitlement.ContentService{NativeValidation: true}, PipelineHooks{})
	if err == nil || PipelineFailurePhase(err) != "provider_receive" {
		t.Fatalf("missing passage-close hook was accepted: %v", err)
	}
}

func TestPublicEditorPreservesLongerAndShorterParagraphSeparators(t *testing.T) {
	editor := newPublicEditor(func(PipelineEdit) error { return nil })
	initial := editor.Begin(1, "provider")
	if err := initial.Add("One\n\nTwo"); err != nil {
		t.Fatal(err)
	}
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		version int
		body    string
	}{{2, "One\r\n \t\r\nTwo"}, {3, "One\n\nTwo"}} {
		version, body := tc.version, tc.body
		replacement := editor.Begin(version, "provider")
		if err := replacement.Add(body); err != nil {
			t.Fatal(err)
		}
		if err := replacement.Complete(); err != nil {
			t.Fatal(err)
		}
		if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != body {
			t.Fatalf("version %d separator mismatch: got=%q want=%q", version, got, body)
		}
	}
}

func TestPublicEditorContinuationReindexesParagraphsBeforeLaterReplacement(t *testing.T) {
	var edits []PipelineEdit
	var drafts []PipelineDraft
	editor := newPublicEditor(func(edit PipelineEdit) error {
		edits = append(edits, edit)
		return nil
	}, func(draft PipelineDraft) error {
		drafts = append(drafts, draft)
		return nil
	})

	initial := editor.Begin(1, "provider")
	if err := initial.Add("Original."); err != nil {
		t.Fatal(err)
	}
	if err := initial.Complete(); err != nil {
		t.Fatal(err)
	}
	fixed := editor.Begin(2, "provider")
	if err := fixed.Add("First revised.\n\nSecond revised."); err != nil {
		t.Fatal(err)
	}
	if err := fixed.Complete(); err != nil {
		t.Fatal(err)
	}
	continuation := editor.BeginContinuation(2)
	if err := continuation.Add("\n\nThird added."); err != nil {
		t.Fatal(err)
	}
	if err := continuation.Complete(); err != nil {
		t.Fatal(err)
	}

	parts := editor.publishedParts
	wantParts := []string{"First revised.\n\n", "Second revised.\n\n", "Third added."}
	if len(parts) != len(wantParts) {
		t.Fatalf("continuation paragraph index has %d parts: %q", len(parts), string(joinParts(parts, editor.publishedLen)))
	}
	for i, want := range wantParts {
		if got := string(parts[i]); got != want {
			t.Fatalf("continuation paragraph %d=%q want=%q", i, got, want)
		}
	}

	editsBeforeRewrite := len(edits)
	rewrite := editor.Begin(3, "provider")
	if err := rewrite.Add("New first.\n\nNew second.\n\nNew third."); err != nil {
		t.Fatal(err)
	}
	if err := rewrite.Complete(); err != nil {
		t.Fatal(err)
	}
	rewriteEdits := edits[editsBeforeRewrite:]
	if len(rewriteEdits) < 3 {
		t.Fatalf("rewrite edits=%+v", rewriteEdits)
	}
	if got := rewriteEdits[0]; got.At != 0 || got.DeleteCount != len([]rune(wantParts[0])) || got.Insert != "New first.\n\n" {
		t.Fatalf("first rewrite paragraph range=%+v", got)
	}
	if got := rewriteEdits[1]; got.At != len([]rune("New first.\n\n")) || got.DeleteCount != len([]rune(wantParts[1])) || got.Insert != "New second.\n\n" {
		t.Fatalf("second rewrite paragraph range=%+v", got)
	}
	if got := string(joinParts(editor.publishedParts, editor.publishedLen)); got != "New first.\n\nNew second.\n\nNew third." {
		t.Fatalf("rewrite body=%q", got)
	}

	var begins []PipelineDraft
	for _, draft := range drafts {
		if draft.Action == "begin" {
			begins = append(begins, draft)
		}
	}
	if len(begins) != 4 || begins[1].Mode != "replace" || begins[1].ContentVersion != 2 || begins[2].Mode != "append" || begins[2].ContentVersion != 2 || begins[3].Mode != "replace" || begins[3].ContentVersion != 3 {
		t.Fatalf("fixed/continuation/rewrite lifecycle=%+v", begins)
	}
}

type missingCloseProvider struct{ pipelineProvider *pipelineProvider }

func (p *missingCloseProvider) Plan(ctx context.Context, spec ai.GenerationSpec, emit func(ai.PlanItem) error) (ai.ScenePlan, error) {
	return p.pipelineProvider.Plan(ctx, spec, emit)
}
func (p *missingCloseProvider) OpenPlanned(context.Context, ai.GenerationSpec, ai.ScenePlan) (ai.Stream, error) {
	return &pipelineStream{candidate: p.pipelineProvider.initial, deltas: p.pipelineProvider.initialDeltas, skipClose: true}, nil
}
func (p *missingCloseProvider) Open(ctx context.Context, spec ai.GenerationSpec) (ai.Stream, error) {
	return p.pipelineProvider.Open(ctx, spec)
}
func (p *missingCloseProvider) CheckCompatibility(ctx context.Context, model string) error {
	return p.pipelineProvider.CheckCompatibility(ctx, model)
}
func (p *missingCloseProvider) OpenFixedEdit(ctx context.Context, spec ai.GenerationSpec, draft ai.EditorDraft) (ai.Stream, error) {
	return p.pipelineProvider.OpenFixedEdit(ctx, spec, draft)
}
func (p *missingCloseProvider) Review(ctx context.Context, spec ai.GenerationSpec, batch ai.ValidatedBatch) (ai.Review, error) {
	return p.pipelineProvider.Review(ctx, spec, batch)
}
func (p *missingCloseProvider) OpenRewrite(ctx context.Context, spec ai.GenerationSpec, candidate ai.Candidate, issues []ai.ReviewIssue) (ai.Stream, error) {
	return p.pipelineProvider.OpenRewrite(ctx, spec, candidate, issues)
}

func TestEnhancedPipelineFixedEditsSafeSchemaInvalidInitialObject(t *testing.T) {
	raw := json.RawMessage(`{"passage":"We learn(learn).","tags":null,"targets":{}}`)
	draft := ai.EditorDraft{RawCandidate: raw, MachineErrors: []ai.EditorMachineError{{Code: "json_null", Path: "tags"}}}
	provider := &pipelineProvider{
		initialErr: &ai.EditableCandidateError{Draft: draft, Err: &ai.ProviderError{Category: ai.FailureSchema, Retryable: true}},
		fixed:      &pipelineStream{candidate: pipelineCandidate("")},
		reviews:    []ai.Review{pipelineReview("pass")},
	}
	result, err := ExecutePipeline(context.Background(), provider, pipelineValidator(t), ai.GenerationSpec{Entries: []string{"learn"}, MeaningLanguage: "en", Scenario: "story", MinimumWords: 1}, entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: true, ContentRepairLimit: 1}, PipelineHooks{})
	if err != nil || result.Outcome != OutcomeReviewPassed || result.Version != 2 || provider.reviewAt != 1 {
		t.Fatalf("result=%+v reviews=%d err=%v", result, provider.reviewAt, err)
	}
	if string(provider.fixedDraft.RawCandidate) != string(raw) || len(provider.fixedDraft.MachineErrors) != 1 || provider.fixedDraft.MachineErrors[0].Path != "tags" {
		t.Fatalf("fixed editor did not receive safe raw draft and diagnostics: %+v", provider.fixedDraft)
	}
}
