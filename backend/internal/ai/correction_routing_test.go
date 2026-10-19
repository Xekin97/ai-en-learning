package ai

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func fieldRepairFixture() (GenerationSpec, Candidate) {
	return GenerationSpec{Entries: []string{"open"}, MeaningLanguage: "en", MinimumWords: 1}, Candidate{
		Passage: "They open(open) the heavy door.", Tags: []string{"home"},
		Targets: []CandidateTarget{{"open", "to make accessible", "open(open) the heavy door"}},
	}
}

func TestCorrectionRoutingDistinguishesCausesAndConflictingModes(t *testing.T) {
	v := testValidator(t)
	tests := []struct {
		name, hint, mode         string
		codes, modules, excluded []string
	}{
		{"missing target", "a heavy door", "rebuild", []string{"supported_target_absent"}, []string{"HINT_REBUILD"}, []string{"ANNOTATION_EDIT", "REPAIR_ANCHORS"}},
		{"foreign and absent", "heavy door(door)", "rebuild", []string{"foreign_label", "supported_target_absent"}, []string{"HINT_REBUILD"}, []string{"REMOVE_FOREIGN_LABELS", "ANNOTATION_EDIT"}},
		{"missing annotation", "open the door", "annotation_edit", []string{"annotation_missing"}, []string{"ANNOTATION_EDIT", "RESTORE_SOURCE_LABEL"}, []string{"HINT_REBUILD"}},
		{"wrong anchor", "open the door(open)", "annotation_edit", []string{"mapping_relation_rejected"}, []string{"REPAIR_ANCHORS"}, []string{"HINT_REBUILD"}},
		{"unknown relation", "open dxzyqx(open)", "annotation_edit", []string{"mapping_relation_unknown"}, []string{"REPAIR_ANCHORS"}, []string{"HINT_REBUILD"}},
		{"word interrupted", "open(open)ing the door", "annotation_edit", []string{"mapping_surface_absent"}, []string{"REPAIR_ANCHORS"}, []string{"HINT_REBUILD"}},
		{"syntax", "open(open", "rebuild", []string{"annotation_syntax_invalid"}, []string{"HINT_REBUILD"}, []string{"ANNOTATION_EDIT"}},
		{"trim and foreign", "  open(door) the door  ", "trim_and_edit", []string{"outer_whitespace", "foreign_label", "annotation_missing"}, []string{"HINT_TRIM", "REMOVE_FOREIGN_LABELS"}, []string{"ANNOTATION_EDIT", "HINT_REBUILD"}},
		{"empty", "", "rebuild", []string{"field_empty", "supported_target_absent"}, []string{"HINT_REBUILD", "FIELD_BOUNDS"}, []string{"ANNOTATION_EDIT"}},
		{"language heuristic", "请打开这扇大门open(open)", "rebuild", []string{"language_heuristic_mismatch"}, []string{"LANGUAGE_CONSTRAINT", "HINT_REBUILD"}, []string{"ANNOTATION_EDIT"}},
		{"too long", "open(open) " + strings.Repeat("door ", 110), "rebuild", []string{"field_too_long"}, []string{"FIELD_BOUNDS", "HINT_REBUILD"}, []string{"ANNOTATION_EDIT"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spec, candidate := fieldRepairFixture()
			candidate.Targets[0].HintPhrase = tt.hint
			plan, err := v.correctionPlan(context.Background(), spec, candidate, nil, "")
			if err != nil || len(plan.Tasks) != 1 {
				t.Fatalf("plan=%+v err=%v", plan, err)
			}
			task := plan.Tasks[0]
			if task.Mode != tt.mode || task.Language != "English" {
				t.Fatalf("mode/language: %+v", task)
			}
			for _, code := range tt.codes {
				if !task.has(code) {
					t.Errorf("missing %s: %+v", code, task.Issues)
				}
			}
			for _, module := range tt.modules {
				if !slices.Contains(task.Modules, module) {
					t.Errorf("missing module %s", module)
				}
			}
			for _, module := range tt.excluded {
				if slices.Contains(task.Modules, module) {
					t.Errorf("conflicting module %s", module)
				}
			}
			if tt.name == "syntax" && (task.has("supported_target_absent") || len(task.Evidence) != 0) {
				t.Fatal("unparseable is not an absent target")
			}
			if _, err := v.validate(context.Background(), spec, candidate, true); err == nil {
				t.Fatal("fixture must fail original validator")
			}
		})
	}
}

func TestCorrectionCollectsMeaningAndTagErrorsWithMinimalContext(t *testing.T) {
	spec, candidate := fieldRepairFixture()
	candidate.Targets[0].EntryMeaning = " open "
	candidate.Tags = []string{"HOME", "home", "中文", strings.Repeat("x", 101)}
	plan, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil || len(plan.Tasks) != 2 {
		t.Fatalf("plan=%+v err=%v", plan, err)
	}
	tags, meaning := plan.Tasks[0], plan.Tasks[1]
	for _, code := range []string{"tag_count_invalid", "tag_duplicate", "language_heuristic_mismatch", "field_too_long"} {
		if !tags.has(code) {
			t.Errorf("missing tag error %s", code)
		}
	}
	if !meaning.has("outer_whitespace") || !meaning.has("meaning_repeats_entry") || meaning.Passage != "" || tags.Passage == "" {
		t.Fatal("incomplete diagnostics or wrong context scope")
	}
	if !slices.Contains(meaning.Modules, "MEANING_DEFINE") {
		t.Fatal("missing definition repair")
	}
}

func TestCorrectionEvidenceUsesUnicodeAndCompleteMultiwordSpans(t *testing.T) {
	v := testValidator(t)
	spec := GenerationSpec{Entries: []string{"take off"}, MeaningLanguage: "en", MinimumWords: 1}
	candidate := Candidate{Passage: "They take off(take off) soon.", Tags: []string{"travel"}, Targets: []CandidateTarget{{"take off", "to leave the ground", "🙂 take off soon"}}}
	plan, err := v.correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil || len(plan.Tasks) != 1 {
		t.Fatalf("plan=%+v err=%v", plan, err)
	}
	match := plan.Tasks[0].Evidence[0].Matches[0]
	if match.Surface != "take off" || match.Start != 2 || match.End != 10 {
		t.Fatalf("not a codepoint multiword span: %+v", match)
	}
	candidate.Targets[0].HintPhrase = "🙂 take off(take off) soon, then take off"
	plan, err = v.correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil || len(plan.Tasks) != 0 {
		t.Fatal("unmarked repetition became a new failure")
	}
	batch, err := v.Validate(context.Background(), spec, candidate)
	if err != nil || len(batch.Targets[0].HintOccurrences) != 2 {
		t.Fatalf("existing occurrence policy changed: %v", err)
	}
}

func TestCorrectionCannotClassifyWithoutReliablePrerequisites(t *testing.T) {
	spec, candidate := fieldRepairFixture()
	candidate.Targets[0].HintPhrase = "a heavy door"
	if _, err := (Validator{}).correctionPlan(context.Background(), spec, candidate, nil, ""); !errors.Is(err, ErrLexiconUnavailable) {
		t.Fatal("missing lexicon treated as absence")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := testValidator(t).correctionPlan(ctx, spec, candidate, nil, ""); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled scan treated as absence")
	}
	candidate.Passage = "They open(open the door."
	if _, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, ""); err == nil {
		t.Fatal("unsafe passage correction allowed")
	}
	_, candidate = fieldRepairFixture()
	candidate.Targets = append(candidate.Targets, candidate.Targets[0])
	if _, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, ""); err == nil {
		t.Fatal("ambiguous target identity allowed")
	}
}

func TestCorrectionBatchesFieldsAndRetriesOnlyRejectedValues(t *testing.T) {
	spec, original := fieldRepairFixture()
	good := cloneCorrectionCandidate(original)
	original.Tags = []string{"home", "HOME"}
	original.Targets[0].EntryMeaning = "开门"
	original.Targets[0].HintPhrase = "the heavy door"
	var provider *continuationProviderFixture
	provider = &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
		if next.correction == nil {
			t.Fatal("expected correction")
		}
		response := cloneCorrectionCandidate(good)
		if provider.calls == 1 {
			if len(next.correction.Tasks) != 3 {
				t.Fatalf("not batched: %+v", next.correction.Tasks)
			}
			response.Targets[0].HintPhrase = "open the heavy door(open)"
		} else {
			if len(next.correction.Tasks) != 1 {
				t.Fatal("accepted fields retried")
			}
			task := next.correction.Tasks[0]
			if task.Key != "r4" || task.Field != "hint_phrase" || task.Previous == nil || task.Previous.Value != "open the heavy door(open)" || task.Previous.Issues[0].Code != "mapping_relation_rejected" {
				t.Fatalf("feedback lost: %+v", task)
			}
			if strings.Contains(userPrompt(next), good.Targets[0].EntryMeaning) || strings.Contains(userPrompt(next), good.Passage) {
				t.Fatal("unrelated context resent")
			}
			// A provider cannot overwrite accepted fields, even internally.
			response.Targets[0].EntryMeaning = "unrequested change"
			response.Tags = []string{"unrequested"}
		}
		return correctionFixtureStream(next.correction, response)
	}}
	var preview strings.Builder
	budget := NewRepairBudget(2)
	result, err := ReceiveWithRepairBudget(context.Background(), provider, testValidator(t), spec, continuationStream(original), func(s string) error { preview.WriteString(s); return nil }, budget)
	if err != nil || provider.calls != 2 || budget.Remaining != 0 || !reflect.DeepEqual(result, good) {
		t.Fatalf("result=%+v calls=%d err=%v", result, provider.calls, err)
	}
	batch, err := testValidator(t).Validate(context.Background(), spec, result)
	if err != nil || batch.Passage != preview.String() {
		t.Fatalf("final gate/preview: %v", err)
	}
}

func TestCorrectionModesEnforceTheirVisibleTextBoundaries(t *testing.T) {
	v := testValidator(t)
	for _, tt := range []struct {
		before, after string
		accepted      bool
	}{
		{"open the door", "open(open) the door", true},
		{"open the door", "open(open) the heavy door", false},
		{"  open the door  ", "open(open) the door", true},
		{"  open the door  ", "open(open) a different door", false},
		{"the heavy door", "open(open) the heavy door", true},
	} {
		t.Run(tt.before+"/"+tt.after, func(t *testing.T) {
			spec, original := fieldRepairFixture()
			original.Targets[0].HintPhrase = tt.before
			plan, err := v.correctionPlan(context.Background(), spec, original, nil, "")
			if err != nil {
				t.Fatal(err)
			}
			response := cloneCorrectionCandidate(original)
			response.Targets[0].HintPhrase = tt.after
			result, feedback, err := v.applyCorrection(context.Background(), spec, original, response, plan)
			if err != nil || (len(feedback) == 0) != tt.accepted {
				t.Fatalf("feedback=%+v err=%v", feedback, err)
			}
			want := tt.before
			if tt.accepted {
				want = tt.after
			}
			if result.Targets[0].HintPhrase != want || original.Targets[0].HintPhrase != tt.before {
				t.Fatal("wrong merge or base mutated")
			}
		})
	}
}

func TestCorrectionRepeatedErrorsCannotHideRebuildCause(t *testing.T) {
	spec, candidate := fieldRepairFixture()
	var hint strings.Builder
	for i := 0; i < 70; i++ {
		fmt.Fprintf(&hint, "x(label%d) ", i)
	}
	candidate.Targets[0].HintPhrase = strings.TrimSpace(hint.String())
	plan, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil || len(plan.Tasks) != 1 {
		t.Fatalf("plan=%+v err=%v", plan, err)
	}
	task := plan.Tasks[0]
	if task.Mode != "rebuild" || !task.has("supported_target_absent") || !task.has("foreign_label") || len(task.Issues) > 4 {
		t.Fatalf("repeated errors crowded out root cause: %+v", task)
	}
	feedback := boundedRepairFeedback(strings.Repeat("界", 3000), task.Issues)
	if !feedback.Truncated || len([]rune(feedback.Value.(string))) != 2048 || !reflect.DeepEqual(feedback.Issues, task.Issues) {
		t.Fatal("unbounded or corrupt retry context")
	}
}

func TestCorrectionEnglishFieldsDoNotInheritMeaningLanguage(t *testing.T) {
	spec, candidate := fieldRepairFixture()
	spec.MeaningLanguage = "zh"
	candidate.Tags = []string{"家庭"}
	candidate.Targets[0].EntryMeaning = "打开"
	candidate.Targets[0].HintPhrase = "open(door) the heavy door"
	candidate.Passage = "They open(door) the heavy door."
	plan, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil || len(plan.Tasks) != 2 {
		t.Fatalf("plan=%+v err=%v", plan, err)
	}
	for _, task := range plan.Tasks {
		if task.Language != "English" || (task.Field != "passage" && task.Field != "hint_phrase") {
			t.Fatalf("wrong language scope: %+v", task)
		}
	}
}
