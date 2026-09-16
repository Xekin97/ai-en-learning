package ai

import (
	"context"
	"slices"
	"strings"
	"unicode"
)

// The index retains original rune coordinates; lowercase text is never used as
// a source of byte offsets. Each distinct surface lookup is cached per section.
type textIndex struct {
	runes  []rune
	tokens map[string][]Occurrence
	multi  map[string][]Occurrence
	starts []int
}

func wordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsMark(r) }

func newTextIndex(ctx context.Context, text string) (*textIndex, error) {
	index := &textIndex{runes: []rune(text), tokens: map[string][]Occurrence{}, multi: map[string][]Occurrence{}}
	for start := 0; start < len(index.runes); {
		if start%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		if !wordRune(index.runes[start]) {
			start++
			continue
		}
		end := start + 1
		for end < len(index.runes) && wordRune(index.runes[end]) {
			if end%1024 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
			}
			end++
		}
		surface := string(index.runes[start:end])
		key := strings.ToLower(surface)
		index.tokens[key] = append(index.tokens[key], Occurrence{surface, start, end})
		index.starts = append(index.starts, start)
		start = end
	}
	return index, ctx.Err()
}

func (index *textIndex) find(ctx context.Context, form string) ([]Occurrence, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	needle := []rune(form)
	if len(needle) == 0 {
		return nil, nil
	}
	single := true
	for _, r := range needle {
		if !wordRune(r) {
			single = false
			break
		}
	}
	if single {
		return index.tokens[form], nil
	}
	if cached, ok := index.multi[form]; ok {
		return cached, nil
	}
	var result []Occurrence
	for n, start := range index.starts {
		if n%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		end := start + len(needle)
		if end > len(index.runes) || (end < len(index.runes) && wordRune(index.runes[end])) {
			continue
		}
		matched := true
		for i, r := range needle {
			if unicode.ToLower(index.runes[start+i]) != r {
				matched = false
				break
			}
		}
		if matched {
			result = append(result, Occurrence{string(index.runes[start:end]), start, end})
		}
	}
	index.multi[form] = result
	return result, nil
}

func (index *textIndex) scan(ctx context.Context, forms map[string]RelationProof) ([]Occurrence, error) {
	var result []Occurrence
	for form := range forms {
		matches, err := index.find(ctx, form)
		if err != nil {
			return nil, err
		}
		result = append(result, matches...)
	}
	slices.SortFunc(result, func(a, b Occurrence) int {
		if a.Start != b.Start {
			return a.Start - b.Start
		}
		return b.End - a.End
	})
	compacted := result[:0]
	for i, current := range result {
		if i%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		if len(compacted) > 0 && current.Start < compacted[len(compacted)-1].End {
			continue
		}
		compacted = append(compacted, current)
	}
	return compacted, nil
}
