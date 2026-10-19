package ai

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// These diagnostics are private prompt data, never log/trace payloads. The
// original Validator remains the authority for publishing a complete batch.
type repairIssue struct {
	Code   string `json:"code"`
	Entry  string `json:"entry,omitempty"`
	End    *int   `json:"clean_end,omitempty"`
	Actual int    `json:"actual,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

type repairEvidence struct {
	Entry      string       `json:"entry"`
	Matches    []Occurrence `json:"supported_occurrences"`
	MatchCount int          `json:"total_occurrences"`
}

type repairFeedback struct {
	Value     any           `json:"rejected_value,omitempty"`
	Truncated bool          `json:"rejected_value_truncated,omitempty"`
	Issues    []repairIssue `json:"errors"`
}

type repairTask struct {
	Key      string           `json:"key"`
	Field    string           `json:"field"`
	Entry    string           `json:"entry,omitempty"`
	Value    any              `json:"current_value"`
	Mode     string           `json:"mode"`
	Language string           `json:"language"`
	Issues   []repairIssue    `json:"errors"`
	Evidence []repairEvidence `json:"scan_evidence,omitempty"`
	Passage  string           `json:"passage_context,omitempty"`
	Modules  []string         `json:"modules"`
	Previous *repairFeedback  `json:"previous_attempt,omitempty"`
	clean    string
}

type contentCorrection struct {
	Tasks         []repairTask `json:"tasks"`
	PreviousError string       `json:"response_error,omitempty"`
	base          Candidate
	// Summary metadata for the existing bounded trace. Never sent as context.
	Field, Reason, Entry string
}

func (task *repairTask) add(code, entry string, end *int, actual, limit int) {
	// Keep one representative location per code. Repeated foreign labels must
	// not crowd out a different cause (e.g. target absence) and change the mode.
	for _, issue := range task.Issues {
		if issue.Code == code {
			return
		}
	}
	task.Issues = append(task.Issues, repairIssue{code, entry, end, actual, limit})
}

func (task repairTask) has(code string) bool {
	return slices.ContainsFunc(task.Issues, func(i repairIssue) bool { return i.Code == code })
}

func (task *repairTask) bounds(text string, limit int) {
	if strings.TrimSpace(text) == "" {
		task.add("field_empty", "", nil, 0, 0)
	}
	if strings.TrimSpace(text) != text {
		task.add("outer_whitespace", "", nil, 0, 0)
	}
	if length := utf8.RuneCountInString(text); length > limit {
		task.add("field_too_long", "", nil, length, limit)
	}
}

func (task *repairTask) recordScan(entry string, matches []Occurrence) {
	task.Evidence = append(task.Evidence, repairEvidence{entry, append([]Occurrence{}, matches[:min(32, len(matches))]...), len(matches)})
}

func (v Validator) annotationIssues(ctx context.Context, task *repairTask, index *textIndex, annotations []sourceAnnotation, matches []Occurrence, entry string) error {
	ends := make(map[int]bool, len(matches))
	for _, match := range matches {
		ends[match.End] = true
	}
	for _, a := range annotations {
		if err := ctx.Err(); err != nil {
			return err
		}
		if ends[a.End] {
			continue
		}
		if err := v.validateAnnotations(ctx, index, []sourceAnnotation{a}, nil, -1); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			task.add(DescribeFailure(err).Reason, entry, &a.End, 0, 0)
		}
	}
	return nil
}

// diagnoseField uses the same parser, supported forms and relation checks as
// Validate, but collects independent errors rather than returning the first.
func (v Validator) diagnoseField(ctx context.Context, spec GenerationSpec, task *repairTask) error {
	task.Language = meaningLanguage(spec)
	switch task.Field {
	case "entry_meaning":
		value := task.Value.(string)
		task.bounds(value, 500)
		if !matchesMeaningLanguage(value, spec.MeaningLanguage) {
			task.add("language_heuristic_mismatch", "", nil, 0, 0)
		}
		if spec.MeaningLanguage == "en" && strings.EqualFold(strings.TrimSpace(value), task.Entry) {
			task.add("meaning_repeats_entry", "", nil, 0, 0)
		}
		task.Mode = "define"
	case "tags":
		tags := task.Value.([]string)
		if len(tags) < 1 || len(tags) > 3 {
			task.add("tag_count_invalid", "", nil, len(tags), 3)
		}
		seen := map[string]bool{}
		for _, tag := range tags {
			task.bounds(tag, 100)
			if !matchesMeaningLanguage(tag, spec.MeaningLanguage) {
				task.add("language_heuristic_mismatch", "", nil, 0, 0)
			}
			if seen[strings.ToLower(tag)] {
				task.add("tag_duplicate", "", nil, 0, 0)
			}
			seen[strings.ToLower(tag)] = true
		}
		task.Mode = "tags"
	case "hint_phrase", "passage":
		task.Language = "English"
		clean, annotations, err := parseAnnotatedText(ctx, task.Value.(string))
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if task.Field == "passage" {
				return err // Cannot establish immutable visible text.
			}
			task.add("annotation_syntax_invalid", "", nil, 0, 0)
			task.Mode = "rebuild"
			break // No reliable scan: never assert target absence here.
		}
		task.clean = clean
		index, err := newTextIndex(ctx, clean)
		if err != nil {
			return err
		}
		entries := spec.Entries
		if task.Field == "hint_phrase" {
			entries = []string{task.Entry}
			task.bounds(clean, 500)
			if !looksEnglish(clean) {
				task.add("language_heuristic_mismatch", "", nil, 0, 0)
			}
		}
		groups := map[string][]sourceAnnotation{}
		for _, annotation := range annotations {
			if !slices.Contains(entries, annotation.Source) {
				task.add("foreign_label", annotation.Source, &annotation.End, 0, 0)
				continue
			}
			groups[annotation.Source] = append(groups[annotation.Source], annotation)
		}
		var occupied []Occurrence
		for _, entry := range entries {
			matches, err := index.scan(ctx, v.lexicon.knownForms(entry))
			if err != nil {
				return err
			}
			task.recordScan(entry, matches)
			occupied = append(occupied, matches...)
			if err := v.annotationIssues(ctx, task, index, groups[entry], matches, entry); err != nil {
				return err
			}
			if len(matches) == 0 && task.Field == "hint_phrase" {
				task.add("supported_target_absent", entry, nil, 0, 0)
			}
			// Unmarked repetitions remain valid, exactly as in Validator.
			if len(matches) > 0 && len(groups[entry]) == 0 {
				task.add("annotation_missing", entry, nil, 0, 0)
			}
		}
		if task.Field == "passage" {
			slices.SortFunc(occupied, func(a, b Occurrence) int {
				if a.Start != b.Start {
					return a.Start - b.Start
				}
				return b.End - a.End
			})
			for i := 1; i < len(occupied); i++ {
				if occupied[i].Start < occupied[i-1].End {
					return mappingInvalid("passage_occurrence_collision", -1)
				}
			}
		}
		task.Mode = "annotation_edit"
		if task.Field == "hint_phrase" {
			if task.has("supported_target_absent") || task.has("field_empty") || task.has("field_too_long") || task.has("language_heuristic_mismatch") {
				task.Mode = "rebuild"
			} else if task.has("outer_whitespace") {
				task.Mode = "trim_and_edit"
			}
		}
	}
	return ctx.Err()
}

func (v Validator) correctionPlan(ctx context.Context, spec GenerationSpec, candidate Candidate, previous map[string]repairFeedback, responseError string) (*contentCorrection, error) {
	if v.lexicon == nil {
		return nil, ErrLexiconUnavailable
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	clean, _, err := parseAnnotatedText(ctx, candidate.Passage)
	if err != nil {
		return nil, err
	}
	if clean == "" || strings.TrimSpace(clean) != clean || utf8.RuneCountInString(clean) > 2_000_000 || !looksEnglish(clean) {
		return nil, invalidField("passage_content_invalid", "passage", -1, -1, -1)
	}
	byEntry := make(map[string]CandidateTarget, len(candidate.Targets))
	for _, target := range candidate.Targets {
		if _, duplicate := byEntry[target.SourceEntry]; duplicate {
			return nil, schemaFailure("target_source_mismatch", "targets", -1)
		}
		byEntry[target.SourceEntry] = target
	}
	if len(byEntry) != len(spec.Entries) {
		return nil, schemaFailure("target_count_mismatch", "targets", -1)
	}
	fields := []repairTask{{Field: "passage", Value: candidate.Passage}, {Field: "tags", Value: candidate.Tags, Passage: clean}}
	for _, entry := range spec.Entries {
		target, ok := byEntry[entry]
		if !ok {
			return nil, schemaFailure("target_source_mismatch", "targets", -1)
		}
		fields = append(fields, repairTask{Field: "entry_meaning", Entry: entry, Value: target.EntryMeaning}, repairTask{Field: "hint_phrase", Entry: entry, Value: target.HintPhrase})
	}
	plan := &contentCorrection{base: cloneCorrectionCandidate(candidate), PreviousError: responseError}
	for ordinal, task := range fields {
		if err := v.diagnoseField(ctx, spec, &task); err != nil {
			return nil, err
		}
		if len(task.Issues) == 0 {
			continue
		}
		// Stable field ordinals, independent of which other fields succeeded.
		task.Key = fmt.Sprintf("r%d", ordinal+1)
		if feedback, ok := previous[task.Key]; ok {
			task.Previous = &feedback
		}
		task.Modules = correctionModules(task)
		plan.Tasks = append(plan.Tasks, task)
	}
	return plan, ctx.Err()
}

func cloneCorrectionCandidate(candidate Candidate) Candidate {
	candidate.Targets = append([]CandidateTarget(nil), candidate.Targets...)
	candidate.Tags = append([]string(nil), candidate.Tags...)
	return candidate
}

func repairValue(candidate Candidate, task repairTask) any {
	if task.Field == "passage" {
		return candidate.Passage
	}
	if task.Field == "tags" {
		return candidate.Tags
	}
	for _, target := range candidate.Targets {
		if target.SourceEntry == task.Entry {
			if task.Field == "hint_phrase" {
				return target.HintPhrase
			}
			return target.EntryMeaning
		}
	}
	return "" // Missing fake-provider fields fail the normal content checks.
}

func setRepairValue(candidate *Candidate, task repairTask, value any) {
	switch task.Field {
	case "passage":
		candidate.Passage = value.(string)
	case "tags":
		candidate.Tags = append([]string(nil), value.([]string)...)
	default:
		for i := range candidate.Targets {
			if candidate.Targets[i].SourceEntry == task.Entry {
				if task.Field == "hint_phrase" {
					candidate.Targets[i].HintPhrase = value.(string)
				} else {
					candidate.Targets[i].EntryMeaning = value.(string)
				}
			}
		}
	}
}

func (v Validator) applyCorrection(ctx context.Context, spec GenerationSpec, candidate, response Candidate, plan *contentCorrection) (Candidate, map[string]repairFeedback, error) {
	result := cloneCorrectionCandidate(candidate)
	feedback := map[string]repairFeedback{}
	var mismatch error
	for _, task := range plan.Tasks {
		value := repairValue(response, task)
		checked := repairTask{Field: task.Field, Entry: task.Entry, Value: value}
		if err := v.diagnoseField(ctx, spec, &checked); err != nil {
			if ctx.Err() != nil {
				return Candidate{}, nil, ctx.Err()
			}
			checked.add(DescribeFailure(err).Reason, "", nil, 0, 0)
		}
		if task.Mode == "annotation_edit" || task.Mode == "trim_and_edit" {
			want := task.clean
			if task.Mode == "trim_and_edit" {
				want = strings.TrimSpace(want)
			}
			if checked.clean != want {
				checked.add("clean_stream_mismatch", "", nil, 0, 0)
				if task.Field == "passage" {
					mismatch = &ProviderError{Category: FailureContent, Err: invalidField("clean_stream_mismatch", "passage", -1, -1, -1)}
				}
			}
		}
		if len(checked.Issues) > 0 {
			feedback[task.Key] = boundedRepairFeedback(value, checked.Issues)
			continue
		}
		setRepairValue(&result, task, value)
	}
	return result, feedback, mismatch
}

// A pathological rejected value must not be echoed into another huge prompt.
// Keep the real value for validation, and label the feedback sample explicitly.
func boundedRepairFeedback(value any, issues []repairIssue) repairFeedback {
	feedback := repairFeedback{Issues: issues}
	clip := func(text string) string {
		runes := []rune(text)
		if len(runes) > 2048 {
			feedback.Truncated = true
			return string(runes[:2048])
		}
		return text
	}
	switch value := value.(type) {
	case string:
		feedback.Value = clip(value)
	case []string:
		tags := make([]string, min(4, len(value)))
		feedback.Truncated = len(value) > len(tags)
		for i := range tags {
			tags[i] = clip(value[i])
		}
		feedback.Value = tags
	}
	return feedback
}
