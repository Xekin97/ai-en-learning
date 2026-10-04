package review

import (
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"strings"
	"wordweave/internal/platform/security"
)

const (
	reviewGroupKeyAttempts        = 8
	reviewGroupKeyEncodedLength   = 22
	reviewGroupKeyRandomByteCount = 16
)

type Segment struct {
	Kind       string
	Text       string
	LengthHint int
	BlankID    string
	GroupKey   string
}

type passageOccurrence struct {
	targetID uuid.UUID
	surface  string
	start    int
	end      int
	blankID  string
	groupKey string
}

func randomReviewGroupKey() (string, error) {
	return security.RandomID("grp_")
}

func validReviewGroupKey(value string) bool {
	if len(value) != len("grp_")+reviewGroupKeyEncodedLength || !strings.HasPrefix(value, "grp_") {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, "grp_"))
	return err == nil && len(raw) == reviewGroupKeyRandomByteCount
}

func assignPassageGroupKeys(occurrences []passageOccurrence, generate func() (string, error)) error {
	if generate == nil {
		return errors.New("review group key generator is nil")
	}
	byTarget := make(map[uuid.UUID]string)
	used := make(map[string]struct{})
	for index := range occurrences {
		if occurrences[index].targetID == uuid.Nil {
			return errors.New("passage occurrence has no target")
		}
		if groupKey, ok := byTarget[occurrences[index].targetID]; ok {
			occurrences[index].groupKey = groupKey
			continue
		}
		assigned := false
		for attempt := 0; attempt < reviewGroupKeyAttempts; attempt++ {
			groupKey, err := generate()
			if err != nil {
				return fmt.Errorf("generate review group key: %w", err)
			}
			if !validReviewGroupKey(groupKey) {
				return errors.New("generated review group key has invalid format")
			}
			if _, collision := used[groupKey]; collision {
				continue
			}
			byTarget[occurrences[index].targetID] = groupKey
			used[groupKey] = struct{}{}
			occurrences[index].groupKey = groupKey
			assigned = true
			break
		}
		if !assigned {
			return errors.New("could not generate a unique review group key")
		}
	}
	return nil
}

func buildPassageSegments(passage string, occurrences []passageOccurrence) ([]Segment, map[string]string, error) {
	if len(occurrences) == 0 {
		return nil, nil, errors.New("passage has no blank occurrence")
	}
	runes := []rune(passage)
	segments := make([]Segment, 0, len(occurrences)*2+1)
	answers := make(map[string]string, len(occurrences))
	targetGroups := make(map[uuid.UUID]string)
	groupTargets := make(map[string]uuid.UUID)
	position := 0
	for _, occurrence := range occurrences {
		if occurrence.targetID == uuid.Nil || occurrence.blankID == "" || !validReviewGroupKey(occurrence.groupKey) {
			return nil, nil, errors.New("passage occurrence has invalid identity")
		}
		if occurrence.start < position || occurrence.start < 0 || occurrence.start >= occurrence.end || occurrence.end > len(runes) {
			return nil, nil, errors.New("invalid or overlapping passage span")
		}
		if string(runes[occurrence.start:occurrence.end]) != occurrence.surface {
			return nil, nil, errors.New("passage occurrence surface does not match span")
		}
		if _, duplicate := answers[occurrence.blankID]; duplicate {
			return nil, nil, errors.New("duplicate passage blank identity")
		}
		if groupKey, ok := targetGroups[occurrence.targetID]; ok && groupKey != occurrence.groupKey {
			return nil, nil, errors.New("same passage target has inconsistent group keys")
		}
		if targetID, ok := groupTargets[occurrence.groupKey]; ok && targetID != occurrence.targetID {
			return nil, nil, errors.New("different passage targets share a group key")
		}
		targetGroups[occurrence.targetID] = occurrence.groupKey
		groupTargets[occurrence.groupKey] = occurrence.targetID
		if occurrence.start > position {
			segments = append(segments, Segment{Kind: "text", Text: string(runes[position:occurrence.start])})
		}
		segments = append(segments, Segment{Kind: "blank", BlankID: occurrence.blankID, GroupKey: occurrence.groupKey})
		answers[occurrence.blankID] = occurrence.surface
		position = occurrence.end
	}
	if position < len(runes) {
		segments = append(segments, Segment{Kind: "text", Text: string(runes[position:])})
	}
	return segments, answers, nil
}

type hintSpan struct {
	start int
	end   int
}

func blankSegments(text string, spans []hintSpan, lengthHint int, blankID string) ([]Segment, error) {
	runes := []rune(text)
	segments := make([]Segment, 0, len(spans)*2+1)
	position := 0
	for _, span := range spans {
		if span.start < position || span.start < 0 || span.start >= span.end || span.end > len(runes) {
			return nil, errors.New("invalid or overlapping hint span")
		}
		if span.start > position {
			segments = append(segments, Segment{Kind: "text", Text: string(runes[position:span.start])})
		}
		segments = append(segments, Segment{Kind: "blank", LengthHint: lengthHint, BlankID: blankID})
		position = span.end
	}
	if position < len(runes) {
		segments = append(segments, Segment{Kind: "text", Text: string(runes[position:])})
	}
	if len(spans) == 0 {
		return nil, errors.New("hint has no blank span")
	}
	return segments, nil
}

func answerEqual(submitted, expected string) bool {
	return strings.EqualFold(strings.TrimSpace(submitted), strings.TrimSpace(expected))
}
