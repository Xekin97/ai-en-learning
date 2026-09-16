package ai

import (
	"context"
	"strings"
	"unicode/utf8"
)

const maxAnnotatedHintRunes = 500 * (128 + 3)

// sourceAnnotation is untrusted provenance at a clean-text word end. It is
// never a stored occurrence: the validator must independently prove the
// adjacent surface and recompute all occurrences, including unmarked repeats.
type sourceAnnotation struct {
	Source string
	End    int
}

// annotationParser is shared by streaming and final validation. Ordinary
// parenthetical groups are held until balanced; metadata is never appended to
// text. Thus a chunk ending halfway through (source_entry) cannot leak it.
type annotationParser struct {
	text        []rune
	annotations []sourceAnnotation
	groups      []int
	label       []rune
	inMarker    bool
	justMarked  bool
	emitted     int
	rawBytes    int
	finished    bool
	err         error
}

func (parser *annotationParser) Push(ctx context.Context, delta string, final bool) (string, error) {
	if parser.err != nil {
		return "", parser.err
	}
	fail := func() (string, error) {
		parser.err = mappingInvalid("annotation_syntax_invalid", -1)
		return "", parser.err
	}
	if !utf8.ValidString(delta) || (parser.finished && delta != "") || len(delta) > maxCandidateBytes-parser.rawBytes {
		return fail()
	}
	parser.rawBytes += len(delta)
	for n, r := range delta {
		if n%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return "", err
			}
		}
		if parser.inMarker {
			switch r {
			case '(':
				return fail()
			case ')':
				source := string(parser.label)
				if source == "" || strings.TrimSpace(source) != source {
					return fail()
				}
				parser.annotations = append(parser.annotations, sourceAnnotation{Source: source, End: len(parser.text)})
				parser.label = nil
				parser.inMarker = false
				parser.justMarked = true
			default:
				if len(parser.label) == 128 {
					return fail()
				}
				parser.label = append(parser.label, r)
			}
			continue
		}
		switch r {
		case '(':
			if parser.justMarked {
				return fail()
			}
			if len(parser.text) > 0 && wordRune(parser.text[len(parser.text)-1]) {
				parser.inMarker = true
				continue
			}
			parser.groups = append(parser.groups, len(parser.text))
		case ')':
			if len(parser.groups) == 0 {
				return fail()
			}
			parser.groups = parser.groups[:len(parser.groups)-1]
		}
		parser.justMarked = false
		parser.text = append(parser.text, r)
		if len(parser.text) > 2_000_000 {
			return fail()
		}
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if final {
		if parser.inMarker || len(parser.groups) > 0 {
			return fail()
		}
		parser.finished = true
	}
	end := len(parser.text)
	if len(parser.groups) > 0 {
		end = parser.groups[0]
	}
	clean := string(parser.text[parser.emitted:end])
	parser.emitted = end
	return clean, nil
}

func parseAnnotatedText(ctx context.Context, raw string) (string, []sourceAnnotation, error) {
	parser := annotationParser{}
	clean, err := parser.Push(ctx, raw, true)
	return clean, parser.annotations, err
}

func groupAnnotations(annotations []sourceAnnotation, entries []string) ([][]sourceAnnotation, error) {
	indices := make(map[string]int, len(entries))
	for i, entry := range entries {
		indices[entry] = i
	}
	groups := make([][]sourceAnnotation, len(entries))
	for _, annotation := range annotations {
		i, ok := indices[annotation.Source]
		if !ok {
			return nil, mappingInvalid("annotation_source_unknown", -1)
		}
		groups[i] = append(groups[i], annotation)
	}
	return groups, nil
}

// Check the exact annotated word end against independently scanned forms.
// Finding the same word elsewhere in the section cannot validate a marker.
func (validator Validator) validateAnnotations(ctx context.Context, text *textIndex, annotations []sourceAnnotation, matches []Occurrence, target int) error {
	ends := make(map[int]bool, len(matches))
	for _, occurrence := range matches {
		ends[occurrence.End] = true
	}
	for i, annotation := range annotations {
		if i%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return err
			}
		}
		if ends[annotation.End] {
			continue
		}
		end := annotation.End
		if end <= 0 || end > len(text.runes) || (end < len(text.runes) && wordRune(text.runes[end])) {
			return mappingInvalid("mapping_surface_absent", target)
		}
		start := end
		for start > 0 && wordRune(text.runes[start-1]) {
			start--
		}
		form := strings.ToLower(string(text.runes[start:end]))
		reason := "mapping_relation_unknown"
		if len(validator.lexicon.analyses(form)) > 0 {
			reason = "mapping_relation_rejected"
		}
		return mappingInvalid(reason, target)
	}
	return nil
}
