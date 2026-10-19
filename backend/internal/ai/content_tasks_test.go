package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func validScenePlan() ScenePlan {
	return ScenePlan{
		Scene:        "居民在社区花园一起播种。",
		Participants: []PlanParticipant{{ID: "Mara", Role: "volunteer coordinator"}},
		FixedFacts:   []string{"The garden belongs to the neighbourhood."},
		Beats:        []string{"Mara prepares the soil.", "The group shares the remaining work."},
		WordUses: []PlanWordUse{
			{Entry: "garden", Form: "garden", Meaning: "居民共同照料的花圃", Phrase: "a community garden", Role: "Names the place where the group works."},
			{Entry: "share", Form: "share", Meaning: "一起分担", Phrase: "share the work", Role: "Describes how the volunteers divide the task."},
		},
	}
}

func TestScenePlanStrictSchemaAndEntryCoverage(t *testing.T) {
	plan := validScenePlan()
	raw, err := json.Marshal(plan)
	if err != nil {
		t.Fatal(err)
	}
	got, err := decodeScenePlanStrict(raw, []string{"garden", "share"})
	if err != nil || !reflect.DeepEqual(got, plan) {
		t.Fatalf("valid plan rejected: got=%+v err=%v", got, err)
	}

	mutate := func(change func(*ScenePlan)) []byte {
		copy := plan
		copy.Participants = append([]PlanParticipant(nil), plan.Participants...)
		copy.FixedFacts = append([]string(nil), plan.FixedFacts...)
		copy.Beats = append([]string(nil), plan.Beats...)
		copy.WordUses = append([]PlanWordUse(nil), plan.WordUses...)
		change(&copy)
		encoded, marshalErr := json.Marshal(copy)
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		return encoded
	}
	invalid := map[string][]byte{
		"duplicate key":      []byte(strings.Replace(string(raw), `"scene":`, `"scene":"old","scene":`, 1)),
		"trailing":           append(append([]byte(nil), raw...), []byte(`{}`)...),
		"unknown key":        []byte(strings.TrimSuffix(string(raw), "}") + `,"extra":true}`),
		"blank scene":        mutate(func(p *ScenePlan) { p.Scene = " \t" }),
		"no participants":    mutate(func(p *ScenePlan) { p.Participants = []PlanParticipant{} }),
		"duplicate identity": mutate(func(p *ScenePlan) { p.Participants = append(p.Participants, p.Participants[0]) }),
		"one beat":           mutate(func(p *ScenePlan) { p.Beats = p.Beats[:1] }),
		"missing word":       mutate(func(p *ScenePlan) { p.WordUses = p.WordUses[:1] }),
		"duplicate word":     mutate(func(p *ScenePlan) { p.WordUses[1].Entry = "garden" }),
		"unselected word":    mutate(func(p *ScenePlan) { p.WordUses[1].Entry = "invented" }),
		"blank form":         mutate(func(p *ScenePlan) { p.WordUses[0].Form = " " }),
		"long role":          mutate(func(p *ScenePlan) { p.WordUses[0].Role = strings.Repeat("界", 401) }),
	}
	for name, document := range invalid {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeScenePlanStrict(document, []string{"garden", "share"}); err == nil {
				t.Fatal("invalid plan accepted")
			}
		})
	}
	if _, err := decodeScenePlanStrict([]byte(`{"scene":"x","participants":null,"fixed_facts":[],"beats":["a","b"],"word_uses":[]}`), nil); err == nil {
		t.Fatal("null participants accepted")
	}
}

func TestPlanProjectionContainsOnlyCompletePublicItems(t *testing.T) {
	plan := validScenePlan()
	var items []PlanItem
	projector := newPlanItemProjector("zh", []string{"garden", "share"}, func(item PlanItem) error {
		items = append(items, item)
		return nil
	})
	if err := projector.Finish(plan); err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 || items[0] != (PlanItem{Kind: "scene", MeaningLanguage: "zh", Text: plan.Scene}) {
		t.Fatalf("unexpected scene projection: %+v", items)
	}
	if items[1].Entry != "garden" || items[1].Sense != plan.WordUses[0].Meaning || items[1].Phrase != plan.WordUses[0].Phrase || items[1].Text != "" || items[1].MeaningLanguage != "zh" {
		t.Fatalf("unexpected word-use projection: %+v", items[1])
	}
	stop := errors.New("stop projection")
	count := 0
	stoppingProjector := newPlanItemProjector("en", []string{"garden", "share"}, func(PlanItem) error { count++; return stop })
	if err := stoppingProjector.Finish(plan); !errors.Is(err, stop) || count != 1 {
		t.Fatalf("callback error not propagated exactly: count=%d err=%v", count, err)
	}
}

func TestPlanProjectionStreamsOnlyClosedLocallyValidItems(t *testing.T) {
	plan := validScenePlan()
	raw, err := json.Marshal(plan)
	if err != nil {
		t.Fatal(err)
	}
	var items []PlanItem
	projector := newPlanItemProjector("zh", []string{"garden", "share"}, func(item PlanItem) error {
		items = append(items, item)
		return nil
	})
	for _, char := range string(raw) {
		before := len(items)
		if err := projector.Push(string(char)); err != nil {
			t.Fatal(err)
		}
		if len(items) > before {
			item := items[len(items)-1]
			if item.Kind == "scene" && item.Text != plan.Scene {
				t.Fatalf("partial scene emitted: %+v", item)
			}
			if item.Kind == "word_use" && (item.Entry == "" || item.Form == "" || item.Sense == "" || item.Phrase == "") {
				t.Fatalf("partial word use emitted: %+v", item)
			}
		}
	}
	if len(items) != 3 {
		t.Fatalf("stream emitted %d items: %+v", len(items), items)
	}
	if err := projector.Finish(plan); err != nil || len(items) != 3 {
		t.Fatalf("finish duplicated streamed items: count=%d err=%v", len(items), err)
	}

	bad := newPlanItemProjector("en", []string{"garden"}, func(item PlanItem) error {
		items = append(items, item)
		return nil
	})
	items = nil
	if err := bad.Push(`{"word_uses":[{"entry":"garden","form":"garden","meaning":"place","phrase":"a garden"}]}`); err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("locally invalid item was emitted: %+v", items)
	}
}

func TestV5TaskDispatchUsesFullPlanAndDistinctPrompts(t *testing.T) {
	plan := validScenePlan()
	candidate := Candidate{Passage: "We work in a garden.", Tags: []string{"community"}, Targets: []CandidateTarget{{SourceEntry: "garden", EntryMeaning: "a place", HintPhrase: "a garden"}}}
	base := GenerationSpec{Entries: []string{"garden", "share"}, MeaningLanguage: "zh", Scenario: "story", MinimumWords: 50}
	planned := base
	planned.planned = &plannedDraftTask{Plan: plan}
	fixed := base
	draft, err := EditorDraftFromCandidate(candidate, nil)
	if err != nil {
		t.Fatal(err)
	}
	fixed.fixedEdit = &fixedEditTask{Draft: draft}

	var writer map[string]json.RawMessage
	if err := json.Unmarshal([]byte(userPrompt(planned)), &writer); err != nil {
		t.Fatal(err)
	}
	var sentPlan ScenePlan
	if err := json.Unmarshal(writer["scene_plan"], &sentPlan); err != nil || !reflect.DeepEqual(sentPlan, plan) {
		t.Fatalf("writer did not receive the complete plan: plan=%+v err=%v", sentPlan, err)
	}
	for _, fragment := range []string{"attached scene_plan", "fixed facts and participants", "Do not output the plan"} {
		if !strings.Contains(systemPrompt(planned), fragment) {
			t.Fatalf("writer prompt missing %q", fragment)
		}
	}
	if strings.Contains(userPrompt(fixed), "scene_plan") || !strings.Contains(userPrompt(fixed), `"machine_errors":[]`) || !strings.Contains(userPrompt(fixed), `"raw_candidate"`) {
		t.Fatalf("fixed editor input is not isolated from the plan: %s", userPrompt(fixed))
	}
	for _, fragment := range []string{"Act as an editor who actually revises", "You need not preserve an earlier scene plan", "complete Candidate"} {
		if !strings.Contains(systemPrompt(fixed), fragment) {
			t.Fatalf("fixed editor prompt missing %q", fragment)
		}
	}
}

func TestOpenPlannedRejectsUnvalidatedPlanBeforeAnyProviderWork(t *testing.T) {
	plan := validScenePlan()
	plan.WordUses[1].Entry = "garden"
	_, err := (&Gateway{}).OpenPlanned(context.Background(), GenerationSpec{Entries: []string{"garden", "share"}}, plan)
	var providerErr *ProviderError
	if !errors.As(err, &providerErr) || providerErr.Category != FailureSchema {
		t.Fatalf("invalid plan was not rejected at the writer boundary: %v", err)
	}
}

func TestV5TaskSchemasAndUsageStages(t *testing.T) {
	base := GenerationSpec{Entries: []string{"garden", "share"}, MeaningLanguage: "en"}
	planSpec := base
	planSpec.plan = &planTask{}
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		_, body := protocolRequest(planSpec, connectionSnapshot{connection: Connection{Protocol: protocol}, outputMode: "json_schema"}, false)
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		if !strings.Contains(text, "SCENE_PLAN_SCHEMA") || !strings.Contains(text, "word_uses") || !strings.Contains(text, "minItems") {
			t.Fatalf("plan schema missing for %s: %s", protocol, text)
		}
		if protocol != ProtocolAnthropic && !strings.Contains(text, "wordweave_scene_plan") {
			t.Fatalf("structured plan schema name missing for %s", protocol)
		}
	}

	tasks := []struct {
		name, stage, version string
		spec                 GenerationSpec
	}{
		{"planning", "planning", PlanPromptVersion, func() GenerationSpec { s := base; s.plan = &planTask{}; return s }()},
		{"generation", "generation", PromptVersion, func() GenerationSpec { s := base; s.planned = &plannedDraftTask{}; return s }()},
		{"fixed edit", "fixed_edit", FixedEditPromptVersion, func() GenerationSpec { s := base; s.fixedEdit = &fixedEditTask{}; return s }()},
		{"technical repair", "technical_repair", CorrectionPromptVersion, func() GenerationSpec { s := base; s.correction = &contentCorrection{}; return s }()},
		{"review", "content_review", ReviewPromptVersion, func() GenerationSpec { s := base; s.review = &reviewTask{}; return s }()},
		{"content repair", "content_repair", RewritePromptVersion, func() GenerationSpec { s := base; s.rewrite = &rewriteTask{}; return s }()},
	}
	for _, task := range tasks {
		t.Run(task.name, func(t *testing.T) {
			stage, version := task.spec.UsageMetadata()
			if stage != task.stage || version != task.version {
				t.Fatalf("metadata=(%q,%q), want (%q,%q)", stage, version, task.stage, task.version)
			}
		})
	}
}

func TestGenerationSpecConnectionCapacityKeyUsesBoundSnapshot(t *testing.T) {
	if key := (GenerationSpec{}).ConnectionCapacityKey(); key != "" {
		t.Fatalf("unbound key=%q", key)
	}
	id := uuid.New()
	spec := GenerationSpec{connection: &connectionSnapshot{connection: Connection{ID: id}}}
	if key := spec.ConnectionCapacityKey(); key != id.String() {
		t.Fatalf("bound key=%q want=%q", key, id)
	}
}

func TestCompletedSafeSchemaInvalidCandidateProducesEditorDraft(t *testing.T) {
	raw := `{"passage":"We learn(learn) together.","tags":null,"targets":{}}`
	stream := &openRouterStream{body: io.NopCloser(strings.NewReader(p0SSE(raw)))}
	var preview strings.Builder
	_, err := stream.Receive(context.Background(), func(delta string) error {
		preview.WriteString(delta)
		return nil
	})
	var editable *EditableCandidateError
	if !errors.As(err, &editable) {
		t.Fatalf("safe schema-invalid response was not editable: %v", err)
	}
	if string(editable.Draft.RawCandidate) != raw || preview.String() != "We learn together." || len(editable.Draft.MachineErrors) != 1 || editable.Draft.MachineErrors[0].Code == "" {
		t.Fatalf("draft=%+v preview=%q", editable.Draft, preview.String())
	}
	var providerErr *ProviderError
	if !errors.As(err, &providerErr) || providerErr.Category != FailureSchema {
		t.Fatalf("editable error lost schema category: %v", err)
	}

	for name, document := range map[string]string{
		"truncated":    `{"passage":"We learn(learn)."`,
		"duplicate":    `{"passage":"We learn(learn).","tags":[],"tags":null,"targets":{}}`,
		"unknown root": `{"passage":"We learn(learn).","tags":null,"targets":{},"private":true}`,
		"markup":       `{"passage":"<script>learn(learn)</script>","tags":null,"targets":{}}`,
		"bad passage":  `{"passage":7,"tags":null,"targets":{}}`,
	} {
		t.Run(name, func(t *testing.T) {
			candidateStream := &openRouterStream{body: io.NopCloser(strings.NewReader(p0SSE(document)))}
			_, receiveErr := candidateStream.Receive(context.Background(), func(string) error { return nil })
			var unsafe *EditableCandidateError
			if receiveErr == nil || errors.As(receiveErr, &unsafe) {
				t.Fatalf("unsafe response became editable: %v", receiveErr)
			}
		})
	}
}

func TestEditorDraftFromCandidateUsesBoundedMachineFacts(t *testing.T) {
	candidate := Candidate{Passage: "We learn(learn).", Tags: []string{"study"}, Targets: []CandidateTarget{{SourceEntry: "learn", EntryMeaning: "to gain knowledge", HintPhrase: "learn(learn) together"}}}
	draft, err := EditorDraftFromCandidate(candidate, invalidField("tag_duplicate", "tags", -1, 2, 1))
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.MachineErrors) != 1 || draft.MachineErrors[0] != (EditorMachineError{Code: "tag_duplicate", Path: "tags"}) || !json.Valid(draft.RawCandidate) {
		t.Fatalf("unexpected editor draft: %+v", draft)
	}
	if strings.Contains(string(draft.RawCandidate), `"SourceEntry"`) || !strings.Contains(string(draft.RawCandidate), `"targets":{"learn"`) {
		t.Fatalf("candidate was not encoded with the model wire schema: %s", draft.RawCandidate)
	}
}

func TestReviewStrictSchemaAndEvidence(t *testing.T) {
	passage := "Mara put the only key in her bag. The key stayed on the desk."
	valid := `{"schema_version":1,"verdict":"issues","issues":[{"code":"contradiction","evidence":["Mara put the only key in her bag.","The key stayed on the desk."],"problem":"The key has incompatible locations.","repair_goal":"Keep one location."}]}`
	review, err := decodeReviewStrict([]byte(valid), passage)
	if err != nil || review.Verdict != "issues" || len(review.Issues) != 1 {
		t.Fatalf("valid review rejected: %+v %v", review, err)
	}
	for name, raw := range map[string]string{
		"duplicate":         `{"schema_version":1,"verdict":"pass","verdict":"issues","issues":[]}`,
		"pass_with_issue":   valid[:strings.Index(valid, `"verdict":"issues"`)] + `"verdict":"pass"` + valid[strings.Index(valid, `,"issues"`):],
		"invented_evidence": strings.Replace(valid, "The key stayed on the desk.", "The key vanished.", 1),
		"trailing":          valid + `{}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeReviewStrict([]byte(raw), passage); err == nil {
				t.Fatal("invalid review accepted")
			}
		})
	}
	passReview, err := decodeReviewStrict([]byte(`{"schema_version":1,"verdict":"pass","issues":[]}`), passage)
	if err != nil || passReview.Verdict != "pass" {
		t.Fatal(err)
	}
}

func TestReviewSchemaIsSentAcrossAllProtocols(t *testing.T) {
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		spec := GenerationSpec{ProviderModelID: "fixture/model", Entries: []string{"learn"}, review: &reviewTask{Passage: "We learn."}}
		_, body := protocolRequest(spec, connectionSnapshot{connection: Connection{Protocol: protocol}, outputMode: "json_schema"}, false)
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		if !strings.Contains(text, "REVIEW_SCHEMA") || !strings.Contains(text, "schema_version") || strings.Contains(text, "wordweave_learning_batch") {
			t.Fatalf("review schema missing or candidate schema leaked for %s: %s", protocol, text)
		}
		if protocol != ProtocolAnthropic && !strings.Contains(text, "wordweave_content_review") {
			t.Fatalf("structured review schema name missing for %s", protocol)
		}
	}
}

func TestReceiveRawJSONRequiresProtocolTerminalEvent(t *testing.T) {
	const raw = `{"schema_version":1,"verdict":"pass","issues":[]}`
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		t.Run(protocol, func(t *testing.T) {
			complete := protocolFrames(protocol, raw)
			trimmed := strings.TrimSuffix(complete, "\n\n")
			terminal := strings.LastIndex(trimmed, "data:")
			if terminal < 0 {
				t.Fatal("fixture has no terminal event")
			}
			incomplete := trimmed[:terminal]
			stream := &openRouterStream{
				body:    io.NopCloser(strings.NewReader(incomplete)),
				decoder: &protocolDecoder{protocol: protocol},
			}
			if _, err := stream.receiveRawJSON(context.Background(), maxReviewBytes, nil); err == nil || DescribeFailure(err).Reason != "stream_incomplete" {
				t.Fatalf("EOF without %s terminal accepted: %v", protocol, err)
			}

			stream = &openRouterStream{
				body:    io.NopCloser(strings.NewReader(complete)),
				decoder: &protocolDecoder{protocol: protocol},
			}
			got, err := stream.receiveRawJSON(context.Background(), maxReviewBytes, nil)
			if err != nil || string(got) != raw {
				t.Fatalf("complete %s stream rejected: got=%q err=%v", protocol, got, err)
			}
		})
	}
}

func TestReceiveRawJSONBoundsAggregateDataEvent(t *testing.T) {
	const limit = 32
	line := strings.Repeat("x", 32<<10)
	var frames strings.Builder
	dataBytes := 0
	for dataBytes <= limit+(1<<20) {
		frames.WriteString("data: ")
		frames.WriteString(line)
		frames.WriteByte('\n')
		dataBytes += len(line) + 1
	}
	frames.WriteByte('\n')
	stream := &openRouterStream{body: io.NopCloser(strings.NewReader(frames.String())), decoder: &protocolDecoder{protocol: ProtocolChat}}
	_, err := stream.receiveRawJSON(context.Background(), limit, nil)
	if err == nil || DescribeFailure(err).Reason != "sse_event_limit" {
		t.Fatalf("oversized multiline SSE event was not rejected at aggregate bound: %v", err)
	}
	var providerErr *ProviderError
	if !errors.As(err, &providerErr) || providerErr.Retryable {
		t.Fatalf("aggregate event limit must be a non-retryable protocol failure: %v", err)
	}
}
