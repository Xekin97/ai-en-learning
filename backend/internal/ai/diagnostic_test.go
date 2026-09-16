package ai

import (
	"context"
	"encoding/json"
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"
)

func p0Candidate() (GenerationSpec, Candidate) {
	return GenerationSpec{Entries: []string{"grape", "young"}, MeaningLanguage: "en", MinimumWords: 1},
		Candidate{Passage: "Young(young) people share grapes(grape) and another grape.",
			Tags: []string{"fruit"}, Targets: []CandidateTarget{
				{"grape", "a small fruit", "fresh grapes(grape) beside a grape"},
				{"young", "not old", "young(young) children"},
			}}
}

type p0ValidationCase struct {
	name, reason, field string
	target              int
	mutate              func(*GenerationSpec, *Candidate)
}

func p0ValidationCases() []p0ValidationCase {
	cases := []p0ValidationCase{
		{"empty_passage", "passage_content_invalid", "passage", -1, func(s *GenerationSpec, c *Candidate) { c.Passage = "" }},
		{"leading_passage", "passage_content_invalid", "passage", -1, func(s *GenerationSpec, c *Candidate) { c.Passage = " " + c.Passage }},
		{"trailing_passage", "passage_content_invalid", "passage", -1, func(s *GenerationSpec, c *Candidate) { c.Passage += " " }},
		{"word_count", "passage_too_short", "passage", -1, func(s *GenerationSpec, c *Candidate) { s.MinimumWords = 1000 }},
		{"passage_language", "passage_language_invalid", "passage", -1, func(s *GenerationSpec, c *Candidate) { c.Passage = "葡萄和年轻人分享水果。" }},
		{"tags_empty", "tag_count_invalid", "tags", -1, func(s *GenerationSpec, c *Candidate) { c.Tags = nil }},
		{"tags_four", "tag_count_invalid", "tags", -1, func(s *GenerationSpec, c *Candidate) { c.Tags = []string{"a", "b", "c", "d"} }},
		{"tags_duplicate", "tag_duplicate", "tags", -1, func(s *GenerationSpec, c *Candidate) { c.Tags = []string{"Fruit", "fruit"} }},
		{"targets_missing", "target_count_mismatch", "targets", -1, func(s *GenerationSpec, c *Candidate) { c.Targets = c.Targets[:1] }},
		{"targets_extra", "target_count_mismatch", "targets", -1, func(s *GenerationSpec, c *Candidate) { c.Targets = append(c.Targets, c.Targets[0]) }},
		{"source_wrong", "target_source_mismatch", "source_entry", 1, func(s *GenerationSpec, c *Candidate) { c.Targets[1].SourceEntry = "Young" }},
		{"meaning_repeats", "meaning_repeats_entry", "entry_meaning", 1, func(s *GenerationSpec, c *Candidate) { c.Targets[1].EntryMeaning = "YOUNG" }},
		{"passage_source_unknown", "annotation_source_unknown", "passage", -1, func(s *GenerationSpec, c *Candidate) { c.Passage = strings.Replace(c.Passage, "(grape)", "(Grape)", 1) }},
		{"hint_source_wrong", "annotation_target_mismatch", "hint_phrase", 1, func(s *GenerationSpec, c *Candidate) { c.Targets[1].HintPhrase = "young(grape) children" }},
		{"passage_marker_missing", "passage_annotation_missing", "passage", 1, func(s *GenerationSpec, c *Candidate) { c.Passage = strings.ReplaceAll(c.Passage, "(young)", "") }},
		{"hint_marker_missing", "hint_annotation_missing", "hint_phrase", 1, func(s *GenerationSpec, c *Candidate) { c.Targets[1].HintPhrase = "young children" }},
		{"hint_marker_space", "hint_annotation_missing", "hint_phrase", 1, func(s *GenerationSpec, c *Candidate) { c.Targets[1].HintPhrase = "young (young) children" }},
		{"hint_marker_fullwidth", "hint_annotation_missing", "hint_phrase", 1, func(s *GenerationSpec, c *Candidate) { c.Targets[1].HintPhrase = "young（young）children" }},
	}
	for _, bad := range []string{"", " fruit", "fruit ", strings.Repeat("a", 101), "水果"} {
		cases = append(cases, p0ValidationCase{"tag_value_" + strconv.Itoa(len(cases)), "tag_content_or_language_invalid", "tags", -1,
			func(s *GenerationSpec, c *Candidate) { c.Tags[0] = bad }})
	}
	for _, bad := range []string{"", " young", "young ", strings.Repeat("a", 501), "年轻"} {
		cases = append(cases, p0ValidationCase{"meaning_value_" + strconv.Itoa(len(cases)), "meaning_content_or_language_invalid", "entry_meaning", 1,
			func(s *GenerationSpec, c *Candidate) { c.Targets[1].EntryMeaning = bad }})
	}
	for _, bad := range []string{"", " young(young)", "young(young) ", strings.Repeat("a", 501), "年轻人"} {
		cases = append(cases, p0ValidationCase{"hint_value_" + strconv.Itoa(len(cases)), "hint_content_or_language_invalid", "hint_phrase", 1,
			func(s *GenerationSpec, c *Candidate) { c.Targets[1].HintPhrase = bad }})
	}
	for _, part := range []string{"passage", "hint_phrase"} {
		for _, marker := range []struct{ text, reason string }{
			{"young(", "annotation_syntax_invalid"}, {"young()", "annotation_syntax_invalid"},
			{"young( young)", "annotation_syntax_invalid"}, {"young(young )", "annotation_syntax_invalid"},
			{"young(you(ng))", "annotation_syntax_invalid"}, {"young(young)(young)", "annotation_syntax_invalid"},
			{"young(young))", "annotation_syntax_invalid"},
			{"young(" + strings.Repeat("x", 129) + ")", "annotation_syntax_invalid"},
			{"young(young)ness", "mapping_surface_absent"},
			{"zzsyntheticwordzz(young)", "mapping_relation_unknown"},
			{"bananas(young)", "mapping_relation_rejected"},
		} {
			target := 1
			if part == "passage" && marker.reason == "annotation_syntax_invalid" {
				target = -1
			}
			cases = append(cases, p0ValidationCase{part + "_" + strconv.Itoa(len(cases)), marker.reason, part, target,
				func(s *GenerationSpec, c *Candidate) {
					if part == "passage" {
						c.Passage = strings.Replace(c.Passage, "Young(young)", marker.text, 1)
					} else {
						c.Targets[1].HintPhrase = marker.text + " children"
					}
				}})
		}
	}
	return cases
}

func TestP0ValidationRuleMatrix(t *testing.T) {
	v := testValidator(t)
	for _, tc := range p0ValidationCases() {
		t.Run(tc.name, func(t *testing.T) {
			spec, candidate := p0Candidate()
			if _, err := v.Validate(context.Background(), spec, candidate); err != nil {
				t.Fatal("positive control failed", err)
			}
			tc.mutate(&spec, &candidate)
			_, err := v.Validate(context.Background(), spec, candidate)
			got := DescribeFailure(err)
			if !errors.Is(err, ErrInvalidCandidate) || got.Stage != "validation" || got.Reason != tc.reason || got.Field != tc.field || got.Target != tc.target {
				t.Fatalf("expected %s/%s/%d; got %+v err=%v", tc.reason, tc.field, tc.target, got, err)
			}
			if tc.reason == "passage_too_short" && (got.Actual != 7 || got.Limit != 1000) {
				t.Fatalf("wrong safe word-count diagnostic: %+v", got)
			}
		})
	}
}

// Adding a new ordinary validation rejection requires adding an independently
// exercised case. AST inventory complements coverage; it is not branch coverage.
func TestP0ValidationReasonInventory(t *testing.T) {
	covered := map[string]bool{}
	for _, tc := range p0ValidationCases() {
		covered[tc.reason] = true
	}
	tree, err := parser.ParseFile(token.NewFileSet(), "validator.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	ast.Inspect(tree, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		name, ok := call.Fun.(*ast.Ident)
		if !ok || name.Name != "invalidField" {
			return true
		}
		literal, ok := call.Args[0].(*ast.BasicLit)
		if !ok {
			t.Error("nonliteral rejection needs explicit inventory")
			return true
		}
		reason, _ := strconv.Unquote(literal.Value)
		if !covered[reason] {
			t.Errorf("uncovered rejection: %s", reason)
		}
		return true
	})
}

func TestP0PositiveBoundariesAndFailurePriority(t *testing.T) {
	v := testValidator(t)
	for _, language := range []string{"en", "zh", "ja"} {
		for _, tags := range []int{1, 3} {
			spec, candidate := p0Candidate()
			spec.MeaningLanguage = language
			if language != "en" {
				candidate.Tags = []string{"水果", "生活", "分享"}
				candidate.Targets[0].EntryMeaning, candidate.Targets[1].EntryMeaning = "葡萄", "年轻"
			} else {
				candidate.Tags = []string{"fruit", "life", "sharing"}
			}
			candidate.Tags = candidate.Tags[:tags]
			spec.MinimumWords = 7
			got, err := v.Validate(context.Background(), spec, candidate)
			if err != nil || got.WordCount != 7 || len(got.Targets[0].PassageOccurrences) != 2 || len(got.Targets[0].HintOccurrences) != 2 {
				t.Fatalf("legal language/count/repetition rejected: %s %+v %v", language, got, err)
			}
		}
	}
	spec, candidate := p0Candidate()
	candidate.Passage = "young(Young)"
	candidate.Tags = nil
	_, err := v.Validate(context.Background(), spec, candidate)
	if DescribeFailure(err).Reason != "annotation_source_unknown" {
		t.Fatal("failure order changed")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := v.Validate(ctx, spec, candidate); !errors.Is(err, context.Canceled) {
		t.Fatal("cancel swallowed")
	}
	if _, err := NewValidator(nil).Validate(context.Background(), spec, candidate); DescribeFailure(err).Reason != "lexicon_unavailable" {
		t.Fatal("missing lexical asset misclassified")
	}
}

func TestP0DiagnosticNeverReflectsUntrustedErrors(t *testing.T) {
	for _, err := range []error{errors.New("private body and credentials"), &ProviderError{Category: "private category", Err: errors.New("secret")}, &MappingValidationError{Reason: "private source", Target: 0}} {
		got := DescribeFailure(err)
		raw, _ := json.Marshal(got)
		if got.Reason != "unknown_internal" || strings.Contains(string(raw), "private") || strings.Contains(string(raw), "secret") {
			t.Fatal("untrusted error reflected")
		}
	}
}
