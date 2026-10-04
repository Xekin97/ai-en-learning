package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestInlineAnnotationEveryDecodedBoundary(t *testing.T) {
	for _, tc := range []struct{ raw, clean string }{
		{"She bought grapes(grape).", "She bought grapes."},
		{"grape(grape), grapes(grape); grape(grape)!", "grape, grapes; grape!"},
		{"🙂 Café grapes(grape) (fresh fruit).", "🙂 Café grapes (fresh fruit)."},
		{"The note (fresh grapes(grape) (from home)) remained.", "The note (fresh grapes (from home)) remained."},
		{"The coups d'etat(coup d'etat) ended.", "The coups d'etat ended."},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			runes := []rune(tc.raw)
			for split := 0; split <= len(runes); split++ {
				parser := annotationParser{}
				first, err := parser.Push(context.Background(), string(runes[:split]), false)
				if err != nil || !strings.HasPrefix(tc.clean, first) {
					t.Fatalf("split %d exposed or changed text: %q %v", split, first, err)
				}
				last, err := parser.Push(context.Background(), string(runes[split:]), true)
				if err != nil || first+last != tc.clean {
					t.Fatalf("split %d: %q + %q %v", split, first, last, err)
				}
			}
		})
	}
}

func TestInlineAnnotationJSONEveryByteBoundary(t *testing.T) {
	const raw = "🙂 Café grapes(grape), a \"grape(grape)\".\n(Fresh grapes(grape).)"
	const clean = "🙂 Café grapes, a \"grape\".\n(Fresh grapes.)"
	encoded, _ := json.Marshal(raw)
	document := `{"passage":` + strings.ReplaceAll(string(encoded), "🙂", `\ud83d\ude42`) + `,"tags":["fruit"],"targets":[]}`
	for split := 0; split <= len(document); split++ {
		extractor := passageExtractor{}
		first, err := extractor.Extract(context.Background(), document[:split])
		if err != nil || !strings.HasPrefix(clean, first) {
			t.Fatalf("byte %d leaked or changed preview: %q %v", split, first, err)
		}
		last, err := extractor.Extract(context.Background(), document)
		if err != nil || first+last != clean {
			t.Fatalf("byte %d completion mismatch: %q %v", split, first+last, err)
		}
	}
	// Also exercise one byte arriving at a time, rather than only two chunks.
	extractor := passageExtractor{}
	var output strings.Builder
	for end := 1; end <= len(document); end++ {
		delta, err := extractor.Extract(context.Background(), document[:end])
		if err != nil {
			t.Fatal(err)
		}
		output.WriteString(delta)
		if !strings.HasPrefix(clean, output.String()) {
			t.Fatal("metadata flashed in the incremental preview")
		}
	}
	if output.String() != clean {
		t.Fatal("final streamed text incomplete")
	}
}

func TestInlineAnnotationMalformedAndIncompleteNeverFlush(t *testing.T) {
	for _, raw := range []string{"grapes(grape", "grapes(", "grapes()", "grapes( grape)", "grapes(grape )", "grapes(gr(ape))", "grapes(grape)(grape)", "grapes(grape))", "grapes(" + strings.Repeat("x", 129) + ")"} {
		t.Run(raw, func(t *testing.T) {
			parser := annotationParser{}
			var output strings.Builder
			var err error
			for _, r := range raw {
				var delta string
				delta, err = parser.Push(context.Background(), string(r), false)
				output.WriteString(delta)
				if err != nil {
					break
				}
			}
			if err == nil {
				var delta string
				delta, err = parser.Push(context.Background(), "", true)
				output.WriteString(delta)
			}
			if err == nil || output.String() != "grapes" || strings.Contains(err.Error(), "grape") {
				t.Fatalf("bad metadata escaped failure boundary: %q %v", output.String(), err)
			}
		})
	}
	parser := annotationParser{}
	got, err := parser.Push(context.Background(), "A note (grapes(grape)", false)
	if err != nil || got != "A note " {
		t.Fatal("incomplete ordinary group was published")
	}
	if rest, err := parser.Push(context.Background(), "", true); err == nil || rest != "" {
		t.Fatal("unfinished parenthesis flushed")
	}
}

func TestInlineAnnotationValidationBoundaries(t *testing.T) {
	v := testValidator(t)
	spec := GenerationSpec{Entries: []string{"grape"}, MeaningLanguage: "en", MinimumWords: 1}
	for _, tc := range []struct{ name, passage, hint, reason string }{
		{"no_passage_marker", "Grapes are ripe.", "ripe grapes(grape)", "passage_annotation_missing"},
		{"no_hint_marker", "Grapes(grape) are ripe.", "ripe grapes", "hint_annotation_missing"},
		{"unknown_source", "Grapes(banana) are ripe.", "ripe grapes(grape)", "annotation_source_unknown"},
		{"noncanonical_source", "Grapes(Grape) are ripe.", "ripe grapes(grape)", "annotation_source_unknown"},
		{"wrong_hint_source", "Grapes(grape) are ripe.", "ripe grapes(banana)", "annotation_target_mismatch"},
		{"unrelated", "Bananas(grape) are ripe. Grapes grow.", "ripe grapes(grape)", "mapping_relation_rejected"},
		{"unknown_surface", "Grapequux(grape) is ripe. Grapes grow.", "ripe grapes(grape)", "mapping_relation_unknown"},
		{"joined_word", "Grapes(grape)vine is green. Grapes grow.", "ripe grapes(grape)", "mapping_surface_absent"},
		{"hint_joined_word", "Grapes(grape) are ripe.", "ripe grapes(grape)vine", "mapping_surface_absent"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			candidate := Candidate{tc.passage, []string{"fruit"}, []CandidateTarget{{"grape", "a small fruit", tc.hint}}}
			_, err := v.Validate(context.Background(), spec, candidate)
			var invalid *MappingValidationError
			if !errors.As(err, &invalid) || invalid.Reason != tc.reason {
				t.Fatalf("want %s, got %v", tc.reason, err)
			}
		})
	}
}

func TestInlineAnnotationCleanOffsetsAndOmittedRepetitions(t *testing.T) {
	spec := GenerationSpec{Entries: []string{"seed", "read"}, MeaningLanguage: "en", MinimumWords: 1}
	candidate := Candidate{
		Passage: "🙂 They read(read) about seeds(seed), planted a seed, and kept reading.",
		Tags:    []string{"gardening"},
		Targets: []CandidateTarget{
			{"seed", "a plant reproductive unit", "plant a seed(seed) beside another seed"},
			{"read", "understand written words", "read(read) and enjoy reading"},
		},
	}
	batch, err := testValidator(t).Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "🙂 They read about seeds, planted a seed, and kept reading."
	if batch.Passage != expected || batch.WordCount != CountWords(expected) {
		t.Fatal("annotations changed text or word count")
	}
	for _, target := range batch.Targets {
		if len(target.PassageOccurrences) != 2 || len(target.HintOccurrences) != 2 {
			t.Fatal("known unmarked repetitions were not recovered")
		}
		for _, occurrence := range target.PassageOccurrences {
			if string([]rune(expected)[occurrence.Start:occurrence.End]) != occurrence.Surface {
				t.Fatal("offset was computed on the annotated source")
			}
		}
	}
	if batch.Targets[1].PassageOccurrences[0].Start != 7 {
		t.Fatal("emoji must occupy one rune, not UTF-8 bytes or UTF-16 units")
	}
	raw, _ := json.Marshal(batch)
	decoded, err := DecodeSnapshot(raw)
	if err != nil || !reflect.DeepEqual(batch, decoded) {
		t.Fatal("clean current snapshot did not round-trip")
	}
	if strings.Contains(string(raw), "(seed)") || strings.Contains(string(raw), "(read)") || strings.Contains(string(raw), "_forms") {
		t.Fatal("private metadata entered the saved shape")
	}
}

func TestInlineAnnotationLimitsUseCleanContentAndCancellation(t *testing.T) {
	spec := GenerationSpec{Entries: []string{"grape"}, MeaningLanguage: "en", MinimumWords: 1}
	cleanHint := strings.Repeat("a ", 247) + "grapes"
	candidate := Candidate{"Grapes(grape).", []string{"fruit"}, []CandidateTarget{{"grape", "a small fruit", cleanHint + "(grape)"}}}
	raw, _ := []byte(p0JSON(candidate)), error(nil)
	var decoded Candidate
	if err := decodeCandidateStrict(context.Background(), raw, &decoded); err != nil {
		t.Fatal(err)
	}
	v := testValidator(t)
	batch, err := v.Validate(context.Background(), spec, decoded)
	if err != nil || batch.Targets[0].HintPhrase != cleanHint || batch.WordCount != 1 {
		t.Fatalf("clean limit: %v", err)
	}
	spec.MinimumWords = 2
	if _, err := v.Validate(context.Background(), spec, candidate); err == nil {
		t.Fatal("annotation inflated word count")
	}
	spec.MinimumWords = 1
	candidate.Targets[0].HintPhrase += "."
	if _, err := v.Validate(context.Background(), spec, candidate); err == nil {
		t.Fatal("overlong clean hint accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	parser := annotationParser{}
	if _, err := parser.Push(ctx, "grapes(grape)", true); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	if PromptVersion != "m002-v1-r1" || ValidatorVersion != "m001-v5-wn31-r2" {
		t.Fatal(fmt.Sprintf("unexpected protocol versions: %s %s", PromptVersion, ValidatorVersion))
	}
}
