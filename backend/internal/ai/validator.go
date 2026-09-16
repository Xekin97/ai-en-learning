package ai

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"wordweave/internal/generationtrace"
)

var ErrInvalidCandidate = errors.New("AI candidate failed deterministic validation")

type Validator struct{ lexicon *Lexicon }

func NewValidator(lexicon *Lexicon) Validator { return Validator{lexicon: lexicon} }

func (validator Validator) Validate(ctx context.Context, spec GenerationSpec, candidate Candidate) (ValidatedBatch, error) {
	return validator.validate(ctx, spec, candidate, false)
}

// allowPassageDeficit is used only for the continuation eligibility check.
// It still checks every existing annotation, hint, meaning, tag and collision.
// The result is never published: Validate remains the final, strict gate.
func (validator Validator) validate(ctx context.Context, spec GenerationSpec, candidate Candidate, allowPassageDeficit bool) (_ ValidatedBatch, resultErr error) {
	trace := generationtrace.From(ctx)
	trace.Begin(generationtrace.ContentValidate)
	defer func() { traceResult(ctx, generationtrace.ContentValidate, resultErr) }()
	check := func(name string, target int) { trace.Check(generationtrace.ContentValidate, name, target) }
	check("lexicon", -1)
	if validator.lexicon == nil {
		return ValidatedBatch{}, ErrLexiconUnavailable
	}
	check("context", -1)
	if err := ctx.Err(); err != nil {
		return ValidatedBatch{}, err
	}
	check("passage_annotations", -1)
	cleanPassage, annotations, err := parseAnnotatedText(ctx, candidate.Passage)
	if err != nil {
		return ValidatedBatch{}, mappingField(err, "passage")
	}
	check("passage_ownership", -1)
	passageAnnotations, err := groupAnnotations(annotations, spec.Entries)
	if err != nil {
		return ValidatedBatch{}, mappingField(err, "passage")
	}
	candidate.Passage = cleanPassage
	check("passage_content", -1)
	if strings.TrimSpace(candidate.Passage) == "" || strings.TrimSpace(candidate.Passage) != candidate.Passage || !utf8.ValidString(candidate.Passage) || utf8.RuneCountInString(candidate.Passage) > 2_000_000 {
		return ValidatedBatch{}, invalidField("passage_content_invalid", "passage", -1, utf8.RuneCountInString(candidate.Passage), 2_000_000)
	}
	check("word_count", -1)
	wordCount := CountWords(candidate.Passage)
	if wordCount < spec.MinimumWords && !allowPassageDeficit {
		return ValidatedBatch{}, invalidField("passage_too_short", "passage", -1, wordCount, spec.MinimumWords)
	}
	check("passage_language", -1)
	if !looksEnglish(candidate.Passage) {
		return ValidatedBatch{}, invalidField("passage_language_invalid", "passage", -1, -1, -1)
	}
	check("tag_count", -1)
	if len(candidate.Tags) < 1 || len(candidate.Tags) > 3 {
		return ValidatedBatch{}, invalidField("tag_count_invalid", "tags", -1, len(candidate.Tags), 3)
	}
	seenTags := make(map[string]struct{}, len(candidate.Tags))
	for _, tag := range candidate.Tags {
		check("tag_content", -1)
		normalized := strings.TrimSpace(tag)
		if normalized == "" || normalized != tag || utf8.RuneCountInString(tag) > 100 || !matchesMeaningLanguage(tag, spec.MeaningLanguage) {
			return ValidatedBatch{}, invalidField("tag_content_or_language_invalid", "tags", -1, utf8.RuneCountInString(tag), 100)
		}
		check("tag_duplicate", -1)
		if _, duplicate := seenTags[strings.ToLower(tag)]; duplicate {
			return ValidatedBatch{}, invalidField("tag_duplicate", "tags", -1, -1, -1)
		}
		seenTags[strings.ToLower(tag)] = struct{}{}
	}
	check("target_count", -1)
	if len(candidate.Targets) != len(spec.Entries) {
		return ValidatedBatch{}, invalidField("target_count_mismatch", "targets", -1, len(candidate.Targets), len(spec.Entries))
	}

	// Provider target keys identify the original entries. Normalize by identity,
	// never by object position, before producing the unchanged ordered DTO.
	byEntry := make(map[string]CandidateTarget, len(candidate.Targets))
	for index, target := range candidate.Targets {
		if _, duplicate := byEntry[target.SourceEntry]; duplicate {
			return ValidatedBatch{}, invalidField("target_source_mismatch", "source_entry", index, -1, -1)
		}
		byEntry[target.SourceEntry] = target
	}
	ordered := make([]CandidateTarget, len(spec.Entries))
	for index, entry := range spec.Entries {
		target, exists := byEntry[entry]
		if !exists {
			check("source_entry", index)
			return ValidatedBatch{}, invalidField("target_source_mismatch", "source_entry", index, -1, -1)
		}
		ordered[index] = target
	}
	candidate.Targets = ordered

	validated := ValidatedBatch{
		Passage: candidate.Passage, Tags: append([]string(nil), candidate.Tags...),
		Targets: make([]ValidatedTarget, 0, len(candidate.Targets)), WordCount: wordCount,
		ValidatorVersion: ValidatorVersion,
	}
	check("passage_index", -1)
	passageIndex, err := newTextIndex(ctx, candidate.Passage)
	if err != nil {
		return ValidatedBatch{}, err
	}
	for index, target := range candidate.Targets {
		check("context", index)
		if err := ctx.Err(); err != nil {
			return ValidatedBatch{}, err
		}
		entry := spec.Entries[index]
		check("source_entry", index)
		if target.SourceEntry != entry {
			return ValidatedBatch{}, invalidField("target_source_mismatch", "source_entry", index, -1, -1)
		}
		check("meaning_content", index)
		if strings.TrimSpace(target.EntryMeaning) == "" || strings.TrimSpace(target.EntryMeaning) != target.EntryMeaning ||
			utf8.RuneCountInString(target.EntryMeaning) > 500 || !matchesMeaningLanguage(target.EntryMeaning, spec.MeaningLanguage) {
			return ValidatedBatch{}, invalidField("meaning_content_or_language_invalid", "entry_meaning", index, utf8.RuneCountInString(target.EntryMeaning), 500)
		}
		check("meaning_repeated", index)
		if spec.MeaningLanguage == "en" && strings.EqualFold(strings.TrimSpace(target.EntryMeaning), entry) {
			return ValidatedBatch{}, invalidField("meaning_repeats_entry", "entry_meaning", index, -1, -1)
		}
		check("hint_annotations", index)
		cleanHint, hintAnnotations, err := parseAnnotatedText(ctx, target.HintPhrase)
		if err != nil {
			if ctx.Err() != nil {
				return ValidatedBatch{}, ctx.Err()
			}
			return ValidatedBatch{}, mappingField(mappingInvalid("annotation_syntax_invalid", index), "hint_phrase")
		}
		target.HintPhrase = cleanHint
		check("hint_ownership", index)
		for _, annotation := range hintAnnotations {
			if annotation.Source != entry {
				return ValidatedBatch{}, mappingField(mappingInvalid("annotation_target_mismatch", index), "hint_phrase")
			}
		}
		check("hint_content", index)
		if strings.TrimSpace(target.HintPhrase) == "" || strings.TrimSpace(target.HintPhrase) != target.HintPhrase ||
			utf8.RuneCountInString(target.HintPhrase) > 500 || !looksEnglish(target.HintPhrase) {
			return ValidatedBatch{}, invalidField("hint_content_or_language_invalid", "hint_phrase", index, utf8.RuneCountInString(target.HintPhrase), 500)
		}
		check("passage_annotation_presence", index)
		if len(passageAnnotations[index]) == 0 && !allowPassageDeficit {
			return ValidatedBatch{}, mappingField(mappingInvalid("passage_annotation_missing", index), "passage")
		}
		check("hint_annotation_presence", index)
		if len(hintAnnotations) == 0 {
			return ValidatedBatch{}, mappingField(mappingInvalid("hint_annotation_missing", index), "hint_phrase")
		}
		forms := validator.lexicon.knownForms(entry)
		check("hint_index", index)
		hintIndex, err := newTextIndex(ctx, target.HintPhrase)
		if err != nil {
			return ValidatedBatch{}, err
		}
		check("hint_scan", index)
		hintMatches, err := hintIndex.scan(ctx, forms)
		if err != nil {
			return ValidatedBatch{}, err
		}
		check("passage_scan", index)
		matches, err := passageIndex.scan(ctx, forms)
		if err != nil {
			return ValidatedBatch{}, err
		}
		check("passage_relations", index)
		if err := validator.validateAnnotations(ctx, passageIndex, passageAnnotations[index], matches, index); err != nil {
			return ValidatedBatch{}, mappingField(err, "passage")
		}
		check("hint_relations", index)
		if err := validator.validateAnnotations(ctx, hintIndex, hintAnnotations, hintMatches, index); err != nil {
			return ValidatedBatch{}, mappingField(err, "hint_phrase")
		}
		check("passage_presence", index)
		if len(matches) == 0 && !allowPassageDeficit {
			return ValidatedBatch{}, mappingField(mappingInvalid("passage_target_missing", index), "passage")
		}
		if allowPassageDeficit && len(matches) > 0 && len(passageAnnotations[index]) == 0 {
			// A missing marker is not a missing word. Do not spend a second
			// model call appending text to hide an existing annotation defect.
			return ValidatedBatch{}, mappingField(mappingInvalid("passage_annotation_missing", index), "passage")
		}
		check("hint_presence", index)
		if len(hintMatches) == 0 {
			return ValidatedBatch{}, mappingField(mappingInvalid("hint_occurrence_missing", index), "hint_phrase")
		}
		validatedTarget := ValidatedTarget{
			Entry: entry, EntryMeaning: target.EntryMeaning,
			HintPhrase:         target.HintPhrase,
			HintOccurrences:    append([]Occurrence(nil), hintMatches...),
			PassageOccurrences: append([]Occurrence(nil), matches...),
		}
		validated.Targets = append(validated.Targets, validatedTarget)
	}
	check("collision", -1)
	// Resolve the complete sets before deciding cross-target ownership. A
	// model cannot hide a collision by omitting one of its recognized forms.
	type ownedSpan struct {
		Occurrence
		target int
	}
	var occupied []ownedSpan
	for index, target := range validated.Targets {
		for _, match := range target.PassageOccurrences {
			occupied = append(occupied, ownedSpan{match, index})
		}
	}
	slices.SortFunc(occupied, func(a, b ownedSpan) int {
		if a.Start != b.Start {
			return a.Start - b.Start
		}
		return b.End - a.End
	})
	for i := 1; i < len(occupied); i++ {
		if i%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return ValidatedBatch{}, err
			}
		}
		if occupied[i].Start < occupied[i-1].End {
			return ValidatedBatch{}, mappingField(mappingInvalid("passage_occurrence_collision", occupied[i].target), "passage")
		}
	}
	check("context", -1)
	if err := ctx.Err(); err != nil {
		return ValidatedBatch{}, err
	}
	captureProcessing(ctx, "validated", validated)
	return validated, nil
}

// MappingValidationError has only bounded codes and a target ordinal. Its Error
// string is safe for existing controlled logs and never interpolates AI text.
type MappingValidationError struct {
	Reason string
	Target int
}

func (err *MappingValidationError) Error() string {
	return fmt.Sprintf("%s: target %d", err.Reason, err.Target)
}
func (err *MappingValidationError) Unwrap() error   { return ErrInvalidCandidate }
func mappingInvalid(reason string, index int) error { return &MappingValidationError{reason, index} }

func CountWords(text string) int {
	runes := []rune(text)
	count := 0
	inWord := false
	for index, current := range runes {
		alphaNumeric := unicode.IsLetter(current) || unicode.IsNumber(current)
		internalJoiner := (current == '\'' || current == '’' || current == '-') && index > 0 && index+1 < len(runes) &&
			(unicode.IsLetter(runes[index-1]) || unicode.IsNumber(runes[index-1])) &&
			(unicode.IsLetter(runes[index+1]) || unicode.IsNumber(runes[index+1]))
		if alphaNumeric || internalJoiner {
			if !inWord && alphaNumeric {
				count++
			}
			inWord = true
		} else {
			inWord = false
		}
	}
	return count
}

func looksEnglish(text string) bool {
	latin := 0
	letters := 0
	for _, value := range text {
		if unicode.IsLetter(value) {
			letters++
			if unicode.In(value, unicode.Latin) {
				latin++
			}
		}
	}
	return letters > 0 && latin*100/letters >= 70
}

func matchesMeaningLanguage(text, language string) bool {
	letters := 0
	latin := 0
	han := 0
	kana := 0
	for _, value := range text {
		if unicode.IsLetter(value) {
			letters++
			if unicode.In(value, unicode.Latin) {
				latin++
			}
			if unicode.In(value, unicode.Han) {
				han++
			}
			if unicode.In(value, unicode.Hiragana, unicode.Katakana) {
				kana++
			}
		}
	}
	if letters == 0 {
		return false
	}
	switch language {
	case "zh":
		return han > 0
	case "ja":
		return kana > 0 || han > 0
	case "en":
		return latin*100/letters >= 70
	default:
		return false
	}
}

func containsFold(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
}

func spansOverlap(left, right Span) bool {
	return left.Start < right.End && right.Start < left.End
}

func invalid(format string, arguments ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidCandidate, fmt.Sprintf(format, arguments...))
}
