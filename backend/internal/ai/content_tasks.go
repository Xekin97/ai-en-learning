package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxReviewBytes = 64 << 10

func (g *Gateway) Plan(ctx context.Context, spec GenerationSpec, onItem func(PlanItem) error) (ScenePlan, error) {
	clearContentTask(&spec)
	spec.plan = &planTask{}
	spec.PromptVersion = PlanPromptVersion
	if err := g.credentials.BindSpec(ctx, &spec); err != nil {
		return ScenePlan{}, err
	}
	usage, err := beginUsage(ctx, spec)
	if err != nil {
		return ScenePlan{}, err
	}
	resp, decoder, err := g.request(ctx, spec, *spec.connection, false, usage)
	if err != nil {
		if finishErr := usage.done(); finishErr != nil {
			return ScenePlan{}, finishErr
		}
		return ScenePlan{}, err
	}
	stream := &openRouterStream{body: &privateProviderBody{ReadCloser: resp.Body, apiKey: spec.connection.apiKey}, usage: usage, decoder: decoder}
	defer stream.Close()
	projector := newPlanItemProjector(spec.MeaningLanguage, spec.Entries, onItem)
	raw, err := stream.receiveRawJSON(ctx, maxScenePlanBytes(len(spec.Entries)), projector.Push)
	if err != nil {
		return ScenePlan{}, err
	}
	plan, err := decodeScenePlanStrict(raw, spec.Entries)
	if err != nil {
		return ScenePlan{}, err
	}
	if err := projector.Finish(plan); err != nil {
		return ScenePlan{}, err
	}
	return plan, nil
}

func (g *Gateway) OpenPlanned(ctx context.Context, spec GenerationSpec, plan ScenePlan) (Stream, error) {
	raw, err := json.Marshal(plan)
	if err != nil {
		return nil, &ProviderError{Category: FailureSchema, Retryable: false, Err: errors.New("scene plan input is invalid")}
	}
	validated, err := decodeScenePlanStrict(raw, spec.Entries)
	if err != nil {
		return nil, err
	}
	clearContentTask(&spec)
	spec.planned = &plannedDraftTask{Plan: validated}
	spec.PromptVersion = PromptVersion
	return g.Open(ctx, spec)
}

func (g *Gateway) OpenFixedEdit(ctx context.Context, spec GenerationSpec, draft EditorDraft) (Stream, error) {
	if !validEditorDraft(draft) {
		return nil, &ProviderError{Category: FailureSchema, Retryable: false, Err: errors.New("fixed editor input is invalid")}
	}
	clearContentTask(&spec)
	spec.fixedEdit = &fixedEditTask{Draft: cloneEditorDraft(draft)}
	spec.PromptVersion = FixedEditPromptVersion
	return g.Open(ctx, spec)
}

func EditorDraftFromCandidate(candidate Candidate, validationErr error) (EditorDraft, error) {
	raw, err := json.Marshal(encodeCandidateForPrompt(candidate))
	if err != nil {
		return EditorDraft{}, err
	}
	draft := EditorDraft{RawCandidate: raw, MachineErrors: editorMachineErrors(validationErr)}
	if !validEditorDraft(draft) {
		return EditorDraft{}, &ProviderError{Category: FailureSchema, Retryable: false, Err: errors.New("fixed editor input is invalid")}
	}
	return draft, nil
}

func editorMachineErrors(err error) []EditorMachineError {
	if err == nil {
		return []EditorMachineError{}
	}
	detail := DescribeFailure(err)
	code := detail.Reason
	if code == "" || code == "unknown_internal" {
		code = "candidate_invalid"
	}
	path := detail.Field
	if detail.Target >= 0 {
		if path == "" {
			path = "targets"
		}
		path += "[" + strconv.Itoa(detail.Target) + "]"
	}
	if utf8.RuneCountInString(code) > 512 || utf8.RuneCountInString(path) > 512 {
		return []EditorMachineError{{Code: "candidate_invalid"}}
	}
	return []EditorMachineError{{Code: code, Path: path}}
}

func validEditorDraft(draft EditorDraft) bool {
	if len(draft.RawCandidate) == 0 || len(draft.RawCandidate) > maxCandidateBytes || len(draft.MachineErrors) > 32 || !utf8.Valid(draft.RawCandidate) || rejectDuplicateJSONKeysAllowNull(draft.RawCandidate) != nil {
		return false
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(draft.RawCandidate, &object) != nil || object == nil || len(object) == 0 || len(object) > 3 {
		return false
	}
	for key := range object {
		if key != "passage" && key != "tags" && key != "targets" {
			return false
		}
	}
	if _, ok := passageStringStart(string(draft.RawCandidate)); !ok {
		return false
	}
	var passage string
	if json.Unmarshal(object["passage"], &passage) != nil || strings.TrimSpace(passage) == "" {
		return false
	}
	clean, _, err := parseAnnotatedText(context.Background(), passage)
	if err != nil || unsafeMarkupPrefix(clean) {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(draft.RawCandidate))
	var raw json.RawMessage
	if decoder.Decode(&raw) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return false
	}
	total := 0
	for _, item := range draft.MachineErrors {
		if strings.TrimSpace(item.Code) == "" || utf8.RuneCountInString(item.Code) > 512 || utf8.RuneCountInString(item.Path) > 512 {
			return false
		}
		total += len(item.Code) + len(item.Path)
	}
	return total <= 32<<10
}

func cloneEditorDraft(draft EditorDraft) EditorDraft {
	return EditorDraft{RawCandidate: append(json.RawMessage(nil), draft.RawCandidate...), MachineErrors: append([]EditorMachineError(nil), draft.MachineErrors...)}
}

// Review uses the run's already-bound connection snapshot and target model.
// Review prose and evidence remain request-local; only the caller's compact
// review facts are eligible for persistence.
func (g *Gateway) Review(ctx context.Context, spec GenerationSpec, batch ValidatedBatch) (Review, error) {
	clearContentTask(&spec)
	spec.review = &reviewTask{Passage: batch.Passage}
	spec.PromptVersion = ReviewPromptVersion
	if err := g.credentials.BindSpec(ctx, &spec); err != nil {
		return Review{}, err
	}
	usage, err := beginUsage(ctx, spec)
	if err != nil {
		return Review{}, err
	}
	resp, decoder, err := g.request(ctx, spec, *spec.connection, false, usage)
	if err != nil {
		if finishErr := usage.done(); finishErr != nil {
			return Review{}, finishErr
		}
		return Review{}, err
	}
	stream := &openRouterStream{body: &privateProviderBody{ReadCloser: resp.Body, apiKey: spec.connection.apiKey}, usage: usage, decoder: decoder}
	defer stream.Close()
	raw, err := stream.receiveRawJSON(ctx, maxReviewBytes, nil)
	if err != nil {
		return Review{}, err
	}
	return decodeReviewStrict(raw, batch.Passage)
}

func (g *Gateway) OpenRewrite(ctx context.Context, spec GenerationSpec, candidate Candidate, issues []ReviewIssue) (Stream, error) {
	clearContentTask(&spec)
	spec.rewrite = &rewriteTask{Candidate: candidate, Issues: append([]ReviewIssue(nil), issues...)}
	spec.PromptVersion = RewritePromptVersion
	return g.Open(ctx, spec)
}

func clearContentTask(spec *GenerationSpec) {
	spec.plan = nil
	spec.planned = nil
	spec.fixedEdit = nil
	spec.review = nil
	spec.rewrite = nil
	spec.continuation = nil
	spec.correction = nil
}

func (stream *openRouterStream) receiveRawJSON(ctx context.Context, limit int, onContentDelta func(string) error) (result []byte, resultErr error) {
	defer func() {
		if err := stream.usage.done(); err != nil {
			resultErr = err
		}
	}()
	stopClose := context.AfterFunc(ctx, func() { _ = stream.body.Close() })
	defer stopClose()
	scanner := bufio.NewScanner(stream.body)
	eventLimit := limit + (1 << 20)
	scanner.Buffer(make([]byte, 4096), eventLimit)
	var eventData, content strings.Builder
	done := false
	process := func() error {
		data := strings.TrimSpace(eventData.String())
		eventData.Reset()
		if data == "" {
			return nil
		}
		if stream.decoder != nil {
			var err error
			data, err = stream.decoder.event(data)
			if err != nil {
				return err
			}
		}
		if data == "[DONE]" {
			done = true
			return nil
		}
		if !utf8.ValidString(data) {
			return protocolFailure()
		}
		stream.usage.observe(data, providerKey(stream.body))
		var envelope struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Error *struct {
				Code int `json:"code"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &envelope); err != nil {
			return protocolFailure()
		}
		if envelope.Error != nil {
			return mapOpenRouterStatus(envelope.Error.Code)
		}
		for _, choice := range envelope.Choices {
			if content.Len()+len(choice.Delta.Content) > limit {
				return &ProviderError{Category: FailureProtocol, Retryable: false, Err: errors.New("task response exceeds byte limit")}
			}
			content.WriteString(choice.Delta.Content)
			if onContentDelta != nil && choice.Delta.Content != "" {
				if err := onContentDelta(choice.Delta.Content); err != nil {
					return err
				}
			}
		}
		if stream.decoder != nil && stream.decoder.normalTermination() {
			done = true
		}
		return nil
	}
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		line := scanner.Text()
		if line == "" {
			if err := process(); err != nil {
				return nil, err
			}
			if done {
				break
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			dataLine := strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " ")
			additional := len(dataLine)
			if eventData.Len() > 0 {
				additional++
			}
			if eventData.Len() > eventLimit-additional {
				return nil, &ProviderError{Category: FailureProtocol, Retryable: false, Err: diagnosed("provider_receive", "sse_event_limit", "", -1, nil)}
			}
			if eventData.Len() > 0 {
				eventData.WriteByte('\n')
			}
			eventData.WriteString(dataLine)
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if !done && eventData.Len() > 0 {
		if err := process(); err != nil {
			return nil, err
		}
	}
	if stream.decoder == nil || !stream.decoder.normalTermination() {
		return nil, streamFailure("stream_incomplete")
	}
	if content.Len() == 0 {
		return nil, protocolFailure()
	}
	return []byte(content.String()), nil
}

type planItemProjector struct {
	meaningLanguage   string
	wanted            map[string]bool
	emittedEntries    map[string]bool
	emittedScene      bool
	onItem            func(PlanItem) error
	buf               []byte
	stack             []byte
	inString          bool
	escaped           bool
	stringStart       int
	expectingRootKey  bool
	rootKey           string
	awaitingRootValue bool
	wordUsesActive    bool
	wordUseStart      int
}

func newPlanItemProjector(meaningLanguage string, entries []string, onItem func(PlanItem) error) *planItemProjector {
	wanted := make(map[string]bool, len(entries))
	for _, entry := range entries {
		wanted[entry] = true
	}
	return &planItemProjector{meaningLanguage: meaningLanguage, wanted: wanted, emittedEntries: map[string]bool{}, onItem: onItem, wordUseStart: -1}
}

func (p *planItemProjector) Push(delta string) error {
	if p == nil || p.onItem == nil || delta == "" {
		return nil
	}
	start := len(p.buf)
	p.buf = append(p.buf, delta...)
	for i := start; i < len(p.buf); i++ {
		char := p.buf[i]
		if p.inString {
			if p.escaped {
				p.escaped = false
				continue
			}
			if char == '\\' {
				p.escaped = true
				continue
			}
			if char != '"' {
				continue
			}
			p.inString = false
			if err := p.completeString(i); err != nil {
				return err
			}
			continue
		}
		switch char {
		case '"':
			p.inString = true
			p.stringStart = i
		case '{':
			if p.wordUsesActive && len(p.stack) == 2 && p.stack[1] == '[' {
				p.wordUseStart = i
			}
			p.stack = append(p.stack, char)
			if len(p.stack) == 1 {
				p.expectingRootKey = true
			}
		case '[':
			if len(p.stack) == 1 && p.awaitingRootValue && p.rootKey == "word_uses" {
				p.wordUsesActive = true
				p.awaitingRootValue = false
			}
			p.stack = append(p.stack, char)
		case '}':
			if p.wordUseStart >= 0 && len(p.stack) == 3 && p.stack[2] == '{' {
				if err := p.completeWordUse(p.buf[p.wordUseStart : i+1]); err != nil {
					return err
				}
				p.wordUseStart = -1
			}
			if len(p.stack) > 0 && p.stack[len(p.stack)-1] == '{' {
				p.stack = p.stack[:len(p.stack)-1]
			}
		case ']':
			if p.wordUsesActive && len(p.stack) == 2 && p.stack[1] == '[' {
				p.wordUsesActive = false
			}
			if len(p.stack) > 0 && p.stack[len(p.stack)-1] == '[' {
				p.stack = p.stack[:len(p.stack)-1]
			}
		case ':':
			if len(p.stack) == 1 && p.rootKey != "" {
				p.awaitingRootValue = true
			}
		case ',':
			if len(p.stack) == 1 {
				p.rootKey = ""
				p.awaitingRootValue = false
				p.expectingRootKey = true
			}
		}
	}
	return nil
}

func (p *planItemProjector) completeString(end int) error {
	var value string
	if json.Unmarshal(p.buf[p.stringStart:end+1], &value) != nil {
		return nil
	}
	if len(p.stack) == 1 && p.expectingRootKey {
		p.rootKey = value
		p.expectingRootKey = false
		return nil
	}
	if len(p.stack) == 1 && p.awaitingRootValue && p.rootKey == "scene" && !p.emittedScene && validPlanText(value, 600) {
		if err := p.onItem(PlanItem{Kind: "scene", MeaningLanguage: p.meaningLanguage, Text: value}); err != nil {
			return err
		}
		p.emittedScene = true
		p.awaitingRootValue = false
	}
	return nil
}

func (p *planItemProjector) completeWordUse(raw []byte) error {
	if rejectDuplicateJSONKeys(raw) != nil {
		return nil
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil || !exactObjectKeys(object, []string{"entry", "form", "meaning", "phrase", "role"}) {
		return nil
	}
	var use PlanWordUse
	if json.Unmarshal(raw, &use) != nil || !p.wanted[use.Entry] || p.emittedEntries[use.Entry] || !validPlanWordUse(use) {
		return nil
	}
	if err := p.onItem(PlanItem{Kind: "word_use", MeaningLanguage: p.meaningLanguage, Entry: use.Entry, Form: use.Form, Sense: use.Meaning, Phrase: use.Phrase}); err != nil {
		return err
	}
	p.emittedEntries[use.Entry] = true
	return nil
}

func (p *planItemProjector) Finish(plan ScenePlan) error {
	if p == nil || p.onItem == nil {
		return nil
	}
	if !p.emittedScene {
		if err := p.onItem(PlanItem{Kind: "scene", MeaningLanguage: p.meaningLanguage, Text: plan.Scene}); err != nil {
			return err
		}
		p.emittedScene = true
	}
	for _, use := range plan.WordUses {
		if p.emittedEntries[use.Entry] {
			continue
		}
		if err := p.onItem(PlanItem{Kind: "word_use", MeaningLanguage: p.meaningLanguage, Entry: use.Entry, Form: use.Form, Sense: use.Meaning, Phrase: use.Phrase}); err != nil {
			return err
		}
		p.emittedEntries[use.Entry] = true
	}
	return nil
}

func validPlanText(value string, maximum int) bool {
	return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= maximum
}

func validPlanWordUse(use PlanWordUse) bool {
	return validPlanText(use.Form, 128) && validPlanText(use.Meaning, 256) && validPlanText(use.Phrase, 256) && validPlanText(use.Role, 400)
}

func decodeReviewStrict(raw []byte, passage string) (Review, error) {
	invalid := func() (Review, error) {
		return Review{}, &ProviderError{Category: FailureSchema, Retryable: true, Err: errors.New("content review response is invalid")}
	}
	if len(raw) == 0 || len(raw) > maxReviewBytes || !utf8.Valid(raw) || rejectDuplicateJSONKeys(raw) != nil {
		return invalid()
	}
	var root map[string]json.RawMessage
	if json.Unmarshal(raw, &root) != nil || !exactObjectKeys(root, []string{"schema_version", "verdict", "issues"}) {
		return invalid()
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var review Review
	if decoder.Decode(&review) != nil || decoder.Decode(&struct{}{}) != io.EOF || review.SchemaVersion != 1 || (review.Verdict != "pass" && review.Verdict != "issues") || review.Issues == nil {
		return invalid()
	}
	if (review.Verdict == "pass" && len(review.Issues) != 0) || (review.Verdict == "issues" && (len(review.Issues) < 1 || len(review.Issues) > 12)) {
		return invalid()
	}
	validCode := map[ReviewCode]bool{ReviewForcedWording: true, ReviewWordSense: true, ReviewMissingPremise: true, ReviewContradiction: true, ReviewCausalLogic: true, ReviewOffTopic: true, ReviewGenreDialogue: true}
	for _, issue := range review.Issues {
		if !validCode[issue.Code] || len(issue.Evidence) < 1 || len(issue.Evidence) > 2 || strings.TrimSpace(issue.Problem) == "" || strings.TrimSpace(issue.RepairGoal) == "" || utf8.RuneCountInString(issue.Problem) > 500 || utf8.RuneCountInString(issue.RepairGoal) > 500 {
			return invalid()
		}
		for _, evidence := range issue.Evidence {
			if strings.TrimSpace(evidence) == "" || utf8.RuneCountInString(evidence) > 500 || !strings.Contains(passage, evidence) {
				return invalid()
			}
		}
	}
	return review, nil
}

func maxScenePlanBytes(entries int) int {
	limit := (16 << 10) + (4<<10)*entries
	if limit > 256<<10 {
		return 256 << 10
	}
	return limit
}

func decodeScenePlanStrict(raw []byte, entries []string) (ScenePlan, error) {
	invalid := func() (ScenePlan, error) {
		return ScenePlan{}, &ProviderError{Category: FailureSchema, Retryable: true, Err: errors.New("scene plan response is invalid")}
	}
	if len(raw) == 0 || len(raw) > maxScenePlanBytes(len(entries)) || !utf8.Valid(raw) || rejectDuplicateJSONKeys(raw) != nil {
		return invalid()
	}
	var root map[string]json.RawMessage
	if json.Unmarshal(raw, &root) != nil || !exactObjectKeys(root, []string{"scene", "participants", "fixed_facts", "beats", "word_uses"}) {
		return invalid()
	}
	for _, arrayKey := range []string{"participants", "fixed_facts", "beats", "word_uses"} {
		if bytes.Equal(bytes.TrimSpace(root[arrayKey]), []byte("null")) {
			return invalid()
		}
	}
	var participants []map[string]json.RawMessage
	if json.Unmarshal(root["participants"], &participants) != nil {
		return invalid()
	}
	for _, item := range participants {
		if !exactObjectKeys(item, []string{"id", "role"}) {
			return invalid()
		}
	}
	var wordUses []map[string]json.RawMessage
	if json.Unmarshal(root["word_uses"], &wordUses) != nil {
		return invalid()
	}
	for _, item := range wordUses {
		if !exactObjectKeys(item, []string{"entry", "form", "meaning", "phrase", "role"}) {
			return invalid()
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var plan ScenePlan
	if decoder.Decode(&plan) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return invalid()
	}
	if !validPlanText(plan.Scene, 600) || len(plan.Participants) < 1 || len(plan.Participants) > 12 || len(plan.FixedFacts) > 5 || len(plan.Beats) < 2 || len(plan.Beats) > 4 || len(plan.WordUses) != len(entries) {
		return invalid()
	}
	participantIDs := make(map[string]bool, len(plan.Participants))
	for _, participant := range plan.Participants {
		if !validPlanText(participant.ID, 80) || !validPlanText(participant.Role, 256) || participantIDs[participant.ID] {
			return invalid()
		}
		participantIDs[participant.ID] = true
	}
	for _, fact := range plan.FixedFacts {
		if !validPlanText(fact, 400) {
			return invalid()
		}
	}
	for _, beat := range plan.Beats {
		if !validPlanText(beat, 400) {
			return invalid()
		}
	}
	wanted := make(map[string]bool, len(entries))
	for _, entry := range entries {
		if wanted[entry] {
			return invalid()
		}
		wanted[entry] = true
	}
	seen := make(map[string]bool, len(entries))
	for _, use := range plan.WordUses {
		if !wanted[use.Entry] || seen[use.Entry] || !validPlanWordUse(use) {
			return invalid()
		}
		seen[use.Entry] = true
	}
	return plan, nil
}
