package review

import (
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestBlankSegmentsHideEveryHintOccurrenceWithFixedLength(t *testing.T) {
	t.Parallel()
	segments, err := blankSegments("learning through shared learning", []hintSpan{
		{start: 0, end: 8},
		{start: 24, end: 32},
	}, 8, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(segments) != 3 {
		t.Fatalf("segments = %#v, want blank/text/blank", segments)
	}
	if segments[0].Kind != "blank" || segments[1].Text != " through shared " || segments[2].Kind != "blank" {
		t.Fatalf("unexpected segments: %#v", segments)
	}
	if segments[0].LengthHint != 8 || segments[2].LengthHint != 8 {
		t.Fatalf("blank length hints are not fixed: %#v", segments)
	}
}

func TestBlankSegmentsRejectOverlapAndOutOfBounds(t *testing.T) {
	t.Parallel()
	for _, spans := range [][]hintSpan{
		{{start: 1, end: 4}, {start: 3, end: 5}},
		{{start: 0, end: 99}},
		{},
	} {
		if _, err := blankSegments("learning", spans, 8, ""); err == nil {
			t.Fatalf("blankSegments unexpectedly accepted %#v", spans)
		}
	}
}

func TestRandomReviewGroupKeyMatchesV13Contract(t *testing.T) {
	t.Parallel()
	groupKey, err := randomReviewGroupKey()
	if err != nil {
		t.Fatal(err)
	}
	if !validReviewGroupKey(groupKey) {
		t.Fatalf("group key %q does not match the API v1.3 contract", groupKey)
	}
}

func TestAssignPassageGroupKeysUsesTargetIdentityAcrossSurfaceForms(t *testing.T) {
	t.Parallel()
	targetA := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	targetB := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	occurrences := []passageOccurrence{
		{targetID: targetA, surface: "Learning"},
		{targetID: targetB, surface: "build"},
		{targetID: targetA, surface: "learned"},
	}
	keyA := "grp_" + strings.Repeat("A", reviewGroupKeyEncodedLength)
	keyB := "grp_" + strings.Repeat("B", reviewGroupKeyEncodedLength)
	generated := []string{keyA, keyA, keyB}
	index := 0
	err := assignPassageGroupKeys(occurrences, func() (string, error) {
		value := generated[index]
		index++
		return value, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if occurrences[0].groupKey != keyA || occurrences[2].groupKey != keyA {
		t.Fatalf("same target did not reuse its first group key: %#v", occurrences)
	}
	if occurrences[1].groupKey != keyB || occurrences[1].groupKey == occurrences[0].groupKey {
		t.Fatalf("different target did not receive a distinct group key: %#v", occurrences)
	}
	if index != 3 {
		t.Fatalf("generator calls = %d, want 3 including one collision retry", index)
	}
}

func TestAssignPassageGroupKeysFailsClosed(t *testing.T) {
	t.Parallel()
	targetID := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	for name, test := range map[string]struct {
		occurrences []passageOccurrence
		generate    func() (string, error)
	}{
		"missing target": {
			occurrences: []passageOccurrence{{}},
			generate:    func() (string, error) { return "grp_" + strings.Repeat("A", reviewGroupKeyEncodedLength), nil },
		},
		"invalid key": {
			occurrences: []passageOccurrence{{targetID: targetID}},
			generate:    func() (string, error) { return "grp_target-id", nil },
		},
		"random source failure": {
			occurrences: []passageOccurrence{{targetID: targetID}},
			generate:    func() (string, error) { return "", errors.New("entropy unavailable") },
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := assignPassageGroupKeys(test.occurrences, test.generate); err == nil {
				t.Fatal("assignPassageGroupKeys unexpectedly succeeded")
			}
		})
	}
}

func TestBuildPassageSegmentsPreservesPerOccurrenceAnswersAndAnonymousGroups(t *testing.T) {
	t.Parallel()
	targetA := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	targetB := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	keyA := "grp_" + strings.Repeat("A", reviewGroupKeyEncodedLength)
	keyB := "grp_" + strings.Repeat("B", reviewGroupKeyEncodedLength)
	segments, answers, err := buildPassageSegments("Learning teams build what they learned.", []passageOccurrence{
		{targetID: targetA, surface: "Learning", start: 0, end: 8, blankID: "blank_1", groupKey: keyA},
		{targetID: targetB, surface: "build", start: 15, end: 20, blankID: "blank_2", groupKey: keyB},
		{targetID: targetA, surface: "learned", start: 31, end: 38, blankID: "blank_3", groupKey: keyA},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(segments) != 6 {
		t.Fatalf("segments = %#v, want three blanks with surrounding text", segments)
	}
	if segments[0].GroupKey != keyA || segments[2].GroupKey != keyB || segments[4].GroupKey != keyA {
		t.Fatalf("passage grouping changed across segments: %#v", segments)
	}
	if answers["blank_1"] != "Learning" || answers["blank_2"] != "build" || answers["blank_3"] != "learned" {
		t.Fatalf("per-occurrence answers were not preserved: %#v", answers)
	}
	for _, segment := range segments {
		if segment.Kind == "text" && segment.GroupKey != "" {
			t.Fatalf("text segment received a group key: %#v", segment)
		}
	}
}

func TestBuildPassageSegmentsRejectsInvalidRelationshipsAndSpans(t *testing.T) {
	t.Parallel()
	targetA := uuid.MustParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
	targetB := uuid.MustParse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
	keyA := "grp_" + strings.Repeat("A", reviewGroupKeyEncodedLength)
	keyB := "grp_" + strings.Repeat("B", reviewGroupKeyEncodedLength)
	for name, occurrences := range map[string][]passageOccurrence{
		"same target different groups": {
			{targetID: targetA, surface: "Learn", start: 0, end: 5, blankID: "blank_1", groupKey: keyA},
			{targetID: targetA, surface: "learn", start: 10, end: 15, blankID: "blank_2", groupKey: keyB},
		},
		"different targets same group": {
			{targetID: targetA, surface: "Learn", start: 0, end: 5, blankID: "blank_1", groupKey: keyA},
			{targetID: targetB, surface: "learn", start: 10, end: 15, blankID: "blank_2", groupKey: keyA},
		},
		"surface mismatch": {
			{targetID: targetA, surface: "wrong", start: 0, end: 5, blankID: "blank_1", groupKey: keyA},
		},
		"overlap": {
			{targetID: targetA, surface: "Learn", start: 0, end: 5, blankID: "blank_1", groupKey: keyA},
			{targetID: targetB, surface: "arn", start: 2, end: 5, blankID: "blank_2", groupKey: keyB},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, _, err := buildPassageSegments("Learn and learn.", occurrences); err == nil {
				t.Fatal("buildPassageSegments unexpectedly succeeded")
			}
		})
	}
}
