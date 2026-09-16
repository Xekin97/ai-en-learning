package ai

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"
)

var errSnapshot = errors.New("invalid current validated snapshot")

// DecodeSnapshot accepts only the current persisted shape. It verifies stored
// structure and spans, never reselects a meaning or reruns lexical validation.
func DecodeSnapshot(raw []byte) (ValidatedBatch, error) {
	var batch ValidatedBatch
	if !utf8.Valid(raw) || rejectDuplicateJSONKeys(raw) != nil {
		return batch, errSnapshot
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil || !exactObjectKeys(object, []string{"passage", "tags", "targets", "word_count", "validator_version"}) {
		return batch, errSnapshot
	}
	var targets []map[string]json.RawMessage
	if json.Unmarshal(object["targets"], &targets) != nil {
		return batch, errSnapshot
	}
	for _, target := range targets {
		if !exactObjectKeys(target, []string{"entry", "entry_meaning", "hint_phrase", "hint_occurrences", "passage_occurrences"}) {
			return batch, errSnapshot
		}
		for _, field := range []string{"hint_occurrences", "passage_occurrences"} {
			var spans []map[string]json.RawMessage
			if json.Unmarshal(target[field], &spans) != nil || len(spans) == 0 {
				return batch, errSnapshot
			}
			for _, span := range spans {
				if !exactObjectKeys(span, []string{"surface", "start", "end"}) ||
					string(span["start"]) == "null" || string(span["end"]) == "null" {
					return batch, errSnapshot
				}
			}
		}
	}
	if json.Unmarshal(raw, &batch) != nil || ValidateSnapshot(batch) != nil {
		return ValidatedBatch{}, errSnapshot
	}
	return batch, nil
}

func validEntryMeaning(value string) bool {
	return utf8.ValidString(value) && value != "" && strings.TrimSpace(value) == value && utf8.RuneCountInString(value) <= 500
}

// ValidateSnapshot is shared by the writer and reader. Semantic/language and
// lexical decisions belong exclusively to the initial candidate validator.
func ValidateSnapshot(batch ValidatedBatch) error {
	if batch.Passage == "" || !utf8.ValidString(batch.Passage) || batch.WordCount < 1 ||
		batch.ValidatorVersion == "" || len(batch.Targets) == 0 || len(batch.Tags) < 1 || len(batch.Tags) > 3 {
		return errSnapshot
	}
	for _, tag := range batch.Tags {
		if tag == "" || strings.TrimSpace(tag) != tag || utf8.RuneCountInString(tag) > 100 {
			return errSnapshot
		}
	}
	entries := make(map[string]bool, len(batch.Targets))
	var all []Occurrence
	for _, target := range batch.Targets {
		if target.Entry == "" || strings.TrimSpace(target.Entry) != target.Entry || entries[target.Entry] ||
			!validEntryMeaning(target.EntryMeaning) || target.HintPhrase == "" ||
			!validStoredSpans(target.HintPhrase, target.HintOccurrences) ||
			!validStoredSpans(batch.Passage, target.PassageOccurrences) {
			return errSnapshot
		}
		entries[target.Entry] = true
		all = append(all, target.PassageOccurrences...)
	}
	slices.SortFunc(all, func(a, b Occurrence) int { return a.Start - b.Start })
	if !validStoredSpans(batch.Passage, all) {
		return errSnapshot
	}
	return nil
}

func validStoredSpans(text string, spans []Occurrence) bool {
	if len(spans) == 0 || !utf8.ValidString(text) {
		return false
	}
	runes, previous := []rune(text), 0
	for _, span := range spans {
		if span.Start < previous || span.End <= span.Start || span.End > len(runes) ||
			string(runes[span.Start:span.End]) != span.Surface {
			return false
		}
		previous = span.End
	}
	return true
}
