package ai

import (
	"context"
	"strings"
	"testing"
)

func testValidator(t testing.TB) Validator {
	t.Helper()
	lexicon, err := LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	return NewValidator(lexicon)
}

func TestValidatorBuildsRuneOffsetsAndAllowsInflection(t *testing.T) {
	t.Parallel()
	passage := strings.TrimSpace("Café learners are learning together. " + strings.Repeat("They discuss useful examples in a friendly study group. ", 7))
	spec := GenerationSpec{MeaningLanguage: "zh", MinimumWords: 50, Entries: []string{"learn"}}
	candidate := Candidate{
		Passage: annotateFixture(passage, "learn", []string{"learning"}), Tags: []string{"学习"},
		Targets: []CandidateTarget{{
			SourceEntry: "learn", EntryMeaning: "学习", HintPhrase: "learning(learn) together while we learn through learning",
		}},
	}
	batch, err := testValidator(t).Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	// v3 also recognizes the omitted direct derivation learners.
	if len(batch.Targets) != 1 || len(batch.Targets[0].PassageOccurrences) != 2 {
		t.Fatalf("unexpected targets: %#v", batch.Targets)
	}
	if len(batch.Targets[0].HintOccurrences) != 3 {
		t.Fatalf("hint occurrences = %#v, want three blanks", batch.Targets[0].HintOccurrences)
	}
	if batch.Targets[0].HintOccurrences[0].Surface != "learning" || batch.Targets[0].HintOccurrences[1].Surface != "learn" || batch.Targets[0].HintOccurrences[2].Surface != "learning" {
		t.Fatalf("unexpected hint occurrences: %#v", batch.Targets[0].HintOccurrences)
	}
	occurrence := batch.Targets[0].PassageOccurrences[1]
	if occurrence.Surface != "learning" {
		t.Fatalf("unexpected occurrence: %#v", occurrence)
	}
}

func TestValidatorRejectsMissingTargetAndWrongMeaningLanguage(t *testing.T) {
	t.Parallel()
	spec := GenerationSpec{MeaningLanguage: "ja", MinimumWords: 1, Entries: []string{"learn"}}
	candidate := Candidate{
		Passage: "People study together.", Tags: []string{"study"},
		Targets: []CandidateTarget{{SourceEntry: "learn", EntryMeaning: "study", HintPhrase: "learn together"}},
	}
	if _, err := testValidator(t).Validate(context.Background(), spec, candidate); err == nil {
		t.Fatal("candidate with wrong language and missing passage target unexpectedly passed")
	}
}

func TestCountWordsHandlesJoiners(t *testing.T) {
	t.Parallel()
	if got := CountWords("well-known learners don't stop"); got != 4 {
		t.Fatalf("CountWords = %d, want 4", got)
	}
}

func TestAllowedFormsIncludesCommonIrregularsWithoutInventedPastForms(t *testing.T) {
	t.Parallel()
	var forms []string
	for form := range testValidator(t).lexicon.knownForms("run") {
		forms = append(forms, form)
	}
	if !containsFold(forms, "ran") || !containsFold(forms, "running") {
		t.Fatalf("run forms missing common inflection: %v", forms)
	}
	if containsFold(forms, "runed") || containsFold(forms, "runing") {
		t.Fatalf("run forms contain invented inflection: %v", forms)
	}
}

func TestJapaneseMeaningMayUseKanjiOnly(t *testing.T) {
	t.Parallel()
	if !matchesMeaningLanguage("学習", "ja") {
		t.Fatal("valid kanji-only Japanese label was rejected")
	}
}
