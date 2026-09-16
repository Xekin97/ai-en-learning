package ai

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// The expected matrix is independent of promptExampleEntries and the generated
// JSON. A shortened or accidentally homogenized example must fail this check.
func assertTenEntryExampleCoverage(t *testing.T, batch ValidatedBatch) {
	t.Helper()
	expected := []struct {
		entry, passageForm, hint, hintForms string
	}{
		{"child", "children", "children helping children", "children,children"},
		{"box", "boxes", "boxes beside a box", "boxes,box"},
		{"carry", "carried", "supplies carried by hand", "carried"},
		{"plan", "planning", "planning a school event", "planning"},
		{"write", "written", "a clearly written guide", "written"},
		{"teach", "taught", "teachers sharing ideas", "teachers"},
		{"learn", "learned", "a child who learns quickly", "learns"},
		{"good", "best", "a better choice", "better"},
		{"young", "Younger", "the youngest volunteer", "youngest"},
		{"safe", "safe", "a safe place to read", "safe"},
	}
	if len(batch.Targets) != len(expected) {
		t.Fatalf("want ten distinct entries, got %d", len(batch.Targets))
	}
	for i, want := range expected {
		target := batch.Targets[i]
		if target.Entry != want.entry || target.HintPhrase != want.hint || target.PassageOccurrences[0].Surface != want.passageForm {
			t.Fatalf("coverage lost for %s: %+v", want.entry, target)
		}
		var hintForms []string
		for _, occurrence := range target.HintOccurrences {
			hintForms = append(hintForms, occurrence.Surface)
			if string([]rune(target.HintPhrase)[occurrence.Start:occurrence.End]) != occurrence.Surface {
				t.Fatal("hint position mismatch")
			}
		}
		if strings.Join(hintForms, ",") != want.hintForms {
			t.Fatalf("hint forms lost for %s: %v", want.entry, hintForms)
		}
		for _, occurrence := range target.PassageOccurrences {
			if string([]rune(batch.Passage)[occurrence.Start:occurrence.End]) != occurrence.Surface {
				t.Fatal("passage position mismatch")
			}
		}
	}
	if len(batch.Targets[0].PassageOccurrences) != 2 || batch.Targets[0].PassageOccurrences[1].Surface != "child" {
		t.Fatal("passage lost repeated target with different forms")
	}
	// The child in the learn hint is ordinary context, not that hint's answer.
	if len(batch.Targets[6].HintOccurrences) != 1 || batch.Targets[6].HintOccurrences[0].Start <= strings.Index(batch.Targets[6].HintPhrase, "child") {
		t.Fatal("hint incorrectly marks another input word")
	}
	if batch.Targets[8].PassageOccurrences[0].Start >= batch.Targets[0].PassageOccurrences[0].Start {
		t.Fatal("example no longer demonstrates non-input passage order")
	}
}

func TestTenEntryExampleShowsInflectionsAndDerivation(t *testing.T) {
	expectedEntries := []string{"child", "box", "carry", "plan", "write", "teach", "learn", "good", "young", "safe"}
	if !reflect.DeepEqual(promptExampleEntries(), expectedEntries) {
		t.Fatal("example input changed without updating coverage")
	}
	validator := testValidator(t)
	for _, minimum := range []int{50, 100, 200, 400} {
		var candidate Candidate
		if err := decodeCandidateStrict(context.Background(), []byte(promptExampleOutput("en", minimum)), &candidate); err != nil {
			t.Fatal(err)
		}
		batch, err := validator.Validate(context.Background(), GenerationSpec{Entries: expectedEntries, MeaningLanguage: "en", Scenario: "story", MinimumWords: minimum}, candidate)
		if err != nil {
			t.Fatal(err)
		}
		assertTenEntryExampleCoverage(t, batch)
		if minimum == 400 && (len(batch.Targets[4].PassageOccurrences) != 2 || batch.Targets[4].PassageOccurrences[1].Surface != "wrote") {
			t.Fatal("long example lost distinct irregular past and participle")
		}
	}
	for _, pair := range [][2]string{{"child", "children"}, {"box", "boxes"}, {"carry", "carried"}, {"plan", "planning"}, {"write", "written"}, {"teach", "taught"}, {"learn", "learns"}, {"good", "better"}, {"young", "youngest"}} {
		proof, status := validator.lexicon.Analyze(pair[0], pair[1])
		if status != RelationKnown || proof.Kind != "inflection" {
			t.Fatalf("%v does not demonstrate a proven inflection: %s %s", pair, status, proof.Kind)
		}
	}
	proof, status := validator.lexicon.Analyze("teach", "teachers")
	if status != RelationKnown || proof.Kind != "derivation" {
		t.Fatal("hint must demonstrate direct derivation, not just tense", status, proof.Kind)
	}
	// Actual requests retain their own entries and count; ten is example data only.
	request := openRouterRequest(GenerationSpec{Entries: []string{"grape"}, MeaningLanguage: "zh", Scenario: "news", MinimumWords: 50})
	messages := request["messages"].([]map[string]string)
	var user struct {
		Entries  []string `json:"entries"`
		Scenario string   `json:"scenario"`
	}
	if err := json.Unmarshal([]byte(messages[1]["content"]), &user); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(user.Entries, []string{"grape"}) || user.Scenario != "news" {
		t.Fatal("example parameters leaked into user request")
	}
}

func TestTenEntryHintScopeRejectsOtherTargetLabel(t *testing.T) {
	var candidate Candidate
	if err := decodeCandidateStrict(context.Background(), []byte(promptExampleOutput("en", 50)), &candidate); err != nil {
		t.Fatal(err)
	}
	for i := range candidate.Targets {
		if candidate.Targets[i].SourceEntry == "learn" {
			candidate.Targets[i].HintPhrase = "a child(child) who learns(learn) quickly"
		}
	}
	_, err := testValidator(t).Validate(context.Background(), GenerationSpec{Entries: promptExampleEntries(), MeaningLanguage: "en", Scenario: "story", MinimumWords: 50}, candidate)
	if DescribeFailure(err).Reason != "annotation_target_mismatch" {
		t.Fatal("cross-target hint annotation silently accepted", err)
	}
}
