package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"os"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	asset "wordweave/assets/lexicon"
	"wordweave/internal/wordnet"
)

func TestCR039ValidatedGoldenIsStorageShapeOnly(t *testing.T) {
	spec, candidate := mappingCandidate("vulnerable", "Vulnerability and vulnerabilities.", "vulnerable facing vulnerability", []string{"vulnerability"}, []string{"vulnerable"})
	got, err := testValidator(t).Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile("../../testdata/cr040/v4-validated.json")
	if err != nil {
		t.Fatal(err)
	}
	var want ValidatedBatch
	if err := json.Unmarshal(body, &want); err != nil {
		t.Fatal(err)
	}
	// The current persisted shape is unchanged; provenance names the new
	// validator, without adding a reader for the previous candidate protocol.
	want.ValidatorVersion = ValidatorVersion
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("golden mismatch: %+v", got)
	}
}

func mappingCandidate(entry, passage, hint string, passageForms, hintForms []string) (GenerationSpec, Candidate) {
	return GenerationSpec{MeaningLanguage: "en", MinimumWords: 1, Entries: []string{entry}}, Candidate{
		Passage: annotateFixture(passage, entry, passageForms), Tags: []string{"community"}, Targets: []CandidateTarget{{entry, "open to harm; easily injured", annotateFixture(hint, entry, hintForms)}},
	}
}

// Test authoring helper only: insert annotations at selected known locations
// in plain fixture text. This is not a production legacy-protocol converter.
func annotateFixture(text, entry string, selected []string) string {
	index, _ := newTextIndex(context.Background(), text)
	ends := map[int]bool{}
	for _, form := range selected {
		matches, _ := index.find(context.Background(), strings.ToLower(form))
		for _, match := range matches {
			ends[match.End] = true
		}
	}
	positions := make([]int, 0, len(ends))
	for end := range ends {
		positions = append(positions, end)
	}
	slices.Sort(positions)
	runes := []rune(text)
	for i := len(positions) - 1; i >= 0; i-- {
		end := positions[i]
		runes = []rune(string(runes[:end]) + "(" + entry + ")" + string(runes[end:]))
	}
	return string(runes)
}

func TestCR039Relations(t *testing.T) {
	l := testValidator(t).lexicon
	for _, pair := range [][2]string{
		{"vulnerable", "vulnerability"}, {"vulnerable", "vulnerabilities"}, {"vulnerabilities", "vulnerable"},
		{"alleviate", "alleviation"}, {"undermine", "undermined"}, {"facilitate", "facilitation"},
		{"deteriorate", "deterioration"}, {"perceive", "perception"}, {"sustainable", "sustainability"},
		{"prevalent", "prevalence"}, {"ambiguous", "ambiguity"}, {"coherent", "coherence"},
		{"agree", "agreed"}, {"agree", "agreeing"}, {"die", "dying"}, {"prefer", "preferred"},
		{"learn", "learned"}, {"learn", "learnt"}, {"learn", "learning"}, {"child", "children"},
		{"coup d'etat", "coups d'etat"}, {"zorbquux", "zorbquux"},
	} {
		t.Run(pair[0]+"/"+pair[1], func(t *testing.T) {
			proof, status := l.Analyze(pair[0], pair[1])
			if status != RelationKnown {
				t.Fatalf("status=%s", status)
			}
			t.Logf("%s via %s", proof.Kind, proof.EvidenceID)
		})
	}
	for _, pair := range [][2]string{{"vulnerable", "banana"}, {"learn", "study"}, {"vulnerable", "vulnerabled"}, {"vulnerable", "vulnerabling"}, {"read", "readed"}, {"child", "childs"}, {"agree", "agreeed"}, {"prefer", "prefered"}, {"zorbquux", "zorbquuxness"}, {"happy", "unhappy"}, {"plant", "plantes"}} {
		t.Run("reject/"+pair[0]+"/"+pair[1], func(t *testing.T) {
			_, status := l.Analyze(pair[0], pair[1])
			if status == RelationKnown {
				t.Fatal("unproved relation accepted")
			}
		})
	}
}

func TestCR039OneDerivationEdgeOnly(t *testing.T) {
	a, b, c := wordnet.Lexeme{Word: "alpha", POS: "a"}, wordnet.Lexeme{Word: "beta", POS: "n"}, wordnet.Lexeme{Word: "gamma", POS: "a"}
	l, err := newLexicon(wordnet.Data{Lemmas: []wordnet.Lexeme{a, b, c}, Edges: []wordnet.Edge{{From: a, To: b, ID: "a:00000001:01+n:00000002:01"}, {From: b, To: c, ID: "n:00000002:01+a:00000003:01"}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, status := l.Analyze("alpha", "betas"); status != RelationKnown {
		t.Fatal("direct derivative inflection missing")
	}
	if _, status := l.Analyze("alpha", "gamma"); status == RelationKnown {
		t.Fatal("multi-hop relation accepted")
	}
}

func TestCR039TenTargetsInterleavingAndOrderIndependence(t *testing.T) {
	entries := []string{"alleviate", "undermine", "facilitate", "deteriorate", "perceive", "sustainable", "prevalent", "vulnerable", "ambiguous", "coherent"}
	forms := []string{"alleviation", "undermined", "facilitation", "deterioration", "perception", "sustainability", "prevalence", "vulnerability", "ambiguity", "coherence"}
	spec := GenerationSpec{MeaningLanguage: "en", MinimumWords: 1, Entries: entries}
	candidate := Candidate{Passage: strings.Join(forms, "; ") + ". " + strings.Join(forms, "; ") + ".", Tags: []string{"discussion"}}
	for i, entry := range entries {
		candidate.Passage = annotateFixture(candidate.Passage, entry, []string{forms[i]})
		candidate.Targets = append(candidate.Targets, CandidateTarget{entry, "a selected general concept", entry + "(" + entry + ") in practice"})
	}
	for range 2 {
		batch, err := testValidator(t).Validate(context.Background(), spec, candidate)
		if err != nil {
			t.Fatal(err)
		}
		for i, target := range batch.Targets {
			if target.Entry != spec.Entries[i] || len(target.PassageOccurrences) != 2 {
				t.Fatal("interleaved target ownership changed")
			}
		}
		spec.Entries[0], spec.Entries[9] = spec.Entries[9], spec.Entries[0]
		candidate.Targets[0], candidate.Targets[9] = candidate.Targets[9], candidate.Targets[0]
	}
}

func TestCR039DeclaredMappingAndIndependentScan(t *testing.T) {
	v := testValidator(t)
	spec, candidate := mappingCandidate("vulnerable", "Vulnerability and vulnerabilities affect vulnerable people. Quuxblorf is ordinary fictional vocabulary. Vulnerability matters.", "vulnerable communities facing vulnerability and vulnerability", []string{"vulnerability", "VULNERABILITY"}, []string{"vulnerable"})
	batch, err := v.Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Targets[0].PassageOccurrences) != 4 || len(batch.Targets[0].HintOccurrences) != 3 {
		t.Fatalf("missing positions: %+v", batch.Targets)
	}
	for _, tc := range []struct {
		name string
		text string
		hint bool
		code string
	}{
		{"absent", "Vulnerability(vulnerable)extra. Vulnerable communities are safe.", false, "mapping_surface_absent"},
		{"unrelated", "Vulnerability(vulnerable) and banana(vulnerable).", false, "mapping_relation_rejected"},
		{"unknown", "Vulnerability(vulnerable) and vulnerabling(vulnerable).", false, "mapping_relation_unknown"},
		{"wrong_section", "vulnerable(vulnerability) communities", true, "annotation_target_mismatch"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			copy := candidate
			copy.Targets = append([]CandidateTarget(nil), candidate.Targets...)
			if tc.hint {
				copy.Targets[0].HintPhrase = tc.text
			} else {
				copy.Passage = tc.text
			}
			_, err := v.Validate(context.Background(), spec, copy)
			var invalid *MappingValidationError
			if !errors.As(err, &invalid) || invalid.Reason != tc.code {
				t.Fatalf("err=%v", err)
			}
			for _, surface := range []string{"vulnerable", "banana", "vulnerabling"} {
				if strings.Contains(err.Error(), surface) {
					t.Fatal("surface leaked through log error")
				}
			}
		})
	}
}

func TestCR039UnicodeAndFullMultiwordCoordinates(t *testing.T) {
	v := testValidator(t)
	spec, candidate := mappingCandidate("learn", "🙂 İ learning、LEARN; learn\u0301 unlearned relearn 2learn learn2. learn!", "learn and learning", []string{"learning", "LEARN"}, []string{"learn"})
	batch, err := v.Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	occ := batch.Targets[0].PassageOccurrences
	if len(occ) != 3 || occ[0].Start != 4 || occ[0].Surface != "learning" {
		t.Fatalf("bad unicode spans: %+v", occ)
	}
	for _, position := range occ {
		if string([]rune(batch.Passage)[position.Start:position.End]) != position.Surface {
			t.Fatal("original slice mismatch")
		}
	}
	spec, candidate = mappingCandidate("coup d'etat", "The coups d'etat ended. A coup d'etat followed; uncoup d'etat does not match.", "coup d'etat and coups d'etat", []string{"coups d'etat"}, []string{"coup d'etat"})
	batch, err = v.Validate(context.Background(), spec, candidate)
	if err != nil {
		t.Fatal(err)
	}
	if len(batch.Targets[0].PassageOccurrences) != 2 || len(batch.Targets[0].HintOccurrences) != 2 {
		t.Fatal("multiword boundary/repetition mismatch")
	}
}

func TestCR039CollisionCannotBeHiddenByOmittedForms(t *testing.T) {
	v := testValidator(t)
	spec, candidate := mappingCandidate("vulnerable", "Vulnerable communities discussed vulnerability.", "vulnerable communities", []string{"vulnerable"}, []string{"vulnerable"})
	spec.Entries = append(spec.Entries, "vulnerability")
	candidate.Passage = strings.Replace(candidate.Passage, "vulnerability.", "vulnerability(vulnerability).", 1)
	candidate.Targets = append(candidate.Targets, CandidateTarget{"vulnerability", "exposure to harm", "vulnerability(vulnerability) to floods"})
	for range 2 {
		_, err := v.Validate(context.Background(), spec, candidate)
		var invalid *MappingValidationError
		if !errors.As(err, &invalid) || invalid.Reason != "passage_occurrence_collision" {
			t.Fatalf("collision=%v", err)
		}
		spec.Entries[0], spec.Entries[1] = spec.Entries[1], spec.Entries[0]
		candidate.Targets[0], candidate.Targets[1] = candidate.Targets[1], candidate.Targets[0]
	}
}

func TestCR039StrictMappingSchema(t *testing.T) {
	_, candidate := mappingCandidate("learn", "People learn.", "learn together", []string{"learn"}, []string{"learn"})
	body, _ := []byte(p0JSON(candidate)), error(nil)
	valid := string(body)
	for name, raw := range map[string]string{
		"missing":        strings.Replace(valid, `,"hint_phrase":"learn(learn) together"`, "", 1),
		"wrong_key_case": strings.Replace(valid, `"hint_phrase":`, `"Hint_Phrase":`, 1),
		"empty":          strings.Replace(valid, `"hint_phrase":"learn(learn) together"`, `"hint_phrase":""`, 1),
		"null":           strings.Replace(valid, `"hint_phrase":"learn(learn) together"`, `"hint_phrase":null`, 1),
		"null_item":      strings.Replace(valid, `"hint_phrase":"learn(learn) together"`, `"hint_phrase":[null]`, 1),
		"type":           strings.Replace(valid, `"hint_phrase":"learn(learn) together"`, `"hint_phrase":1`, 1),
		"object":         strings.Replace(valid, `"hint_phrase":"learn(learn) together"`, `"hint_phrase":{"form":"learn"}`, 1),
		"extra":          strings.Replace(valid, `"entry_meaning":`, `"relation":"synonym","entry_meaning":`, 1),
		"duplicate":      strings.Replace(valid, `"hint_phrase":`, `"hint_phrase":"learn(learn)","hint_phrase":`, 1),
		"trailing":       valid + `{}`,
		"old_arrays":     strings.Replace(valid, `"entry_meaning":`, `"passage_forms":["learn"],"hint_forms":["learn"],"entry_meaning":`, 1),
		"oversize":       strings.Replace(valid, `"hint_phrase":"learn(learn) together"`, `"hint_phrase":"`+strings.Repeat("a", maxAnnotatedHintRunes+1)+`"`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			var got Candidate
			if err := decodeCandidateStrict(context.Background(), []byte(raw), &got); err == nil {
				t.Fatal("invalid v5 schema accepted")
			}
		})
	}
	var got Candidate
	if err := decodeCandidateStrict(context.Background(), body, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, candidate) {
		t.Fatal("decode changed candidate")
	}
}

func TestCR039RandomSSEChunksAndFinalInvalidMapping(t *testing.T) {
	spec, candidate := mappingCandidate("vulnerable", "People discuss vulnerability. A quoted \"story\" helps. 🙂\nVulnerability matters.", "vulnerable communities", []string{"vulnerability"}, []string{"vulnerable"})
	for seed := uint64(0); seed < 20; seed++ {
		body, _ := []byte(p0JSON(candidate)), error(nil)
		body = []byte(strings.ReplaceAll(string(body), "🙂", `\ud83d\ude42`))
		rng := rand.New(rand.NewPCG(seed, 1))
		var sse strings.Builder
		for len(body) > 0 {
			n := min(len(body), rng.IntN(17)+1)
			chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string(body[:n])}}}})
			fmt.Fprintf(&sse, "data: %s\n\n", chunk)
			body = body[n:]
		}
		sse.WriteString("data: [DONE]\n\n")
		stream := openRouterStream{body: io.NopCloser(strings.NewReader(sse.String()))}
		var text strings.Builder
		got, err := stream.Receive(context.Background(), func(delta string) error { text.WriteString(delta); return nil })
		if err != nil || text.String() != strings.ReplaceAll(candidate.Passage, "(vulnerable)", "") || !reflect.DeepEqual(got, candidate) {
			t.Fatalf("seed=%d err=%v streamed=%q", seed, err, text.String())
		}
		if _, err := testValidator(t).Validate(context.Background(), spec, got); err != nil {
			t.Fatal(err)
		}
	}
	candidate.Passage += " A banana(vulnerable)."
	if _, err := testValidator(t).Validate(context.Background(), spec, candidate); err == nil {
		t.Fatal("final mapping should invalidate the already-rendered passage")
	}
}

func TestCR039AssetIntegrityAndReadOnlySingleton(t *testing.T) {
	a, err := LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	b, err := LoadEmbeddedLexicon()
	if err != nil || a != b {
		t.Fatal("not shared")
	}
	files := fstest.MapFS{}
	for _, name := range []string{"manifest.json", "wordnet31.json.gz", "NOTICE.txt"} {
		body, err := asset.Files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		files[name] = &fstest.MapFile{Data: body}
	}
	for _, name := range []string{"wordnet31.json.gz", "manifest.json", "NOTICE.txt"} {
		original := files[name]
		delete(files, name)
		if _, err := loadLexicon(files); !errors.Is(err, ErrLexiconUnavailable) {
			t.Fatalf("missing %s accepted", name)
		}
		files[name] = &fstest.MapFile{Data: []byte("tampered")}
		if _, err := loadLexicon(files); !errors.Is(err, ErrLexiconUnavailable) {
			t.Fatalf("corrupt %s accepted", name)
		}
		files[name] = original
	}
}

func TestCR039CancellationAndMeasurements(t *testing.T) {
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	start := time.Now()
	l, err := loadLexicon(asset.Files)
	if err != nil {
		t.Fatal(err)
	}
	runtime.GC()
	runtime.ReadMemStats(&after)
	t.Logf("cold load=%s retained_heap_delta=%d bytes words=%d", time.Since(start), int64(after.HeapAlloc)-int64(before.HeapAlloc), len(l.lemmas))
	v := NewValidator(l)
	for _, words := range []int{50, 100, 200, 350, 10000, 300000, 999990} {
		passage := "Vulnerability " + strings.Repeat("ordinary ", words-2) + "matters."
		spec, candidate := mappingCandidate("vulnerable", passage, "vulnerable communities", []string{"vulnerability"}, []string{"vulnerable"})
		if len(passage) > 2_000_000 {
			passage = "Vulnerability " + strings.Repeat("a ", words-2) + "matters."
			candidate.Passage = annotateFixture(passage, "vulnerable", []string{"vulnerability"})
		}
		start := time.Now()
		batch, err := v.Validate(context.Background(), spec, candidate)
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("words=%d runes=%d validation=%s", batch.WordCount, len([]rune(passage)), time.Since(start))
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	spec, candidate := mappingCandidate("vulnerable", "Vulnerability matters.", "vulnerable people", []string{"vulnerability"}, []string{"vulnerable"})
	if _, err := v.Validate(ctx, spec, candidate); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel=%v", err)
	}
	if _, err := newTextIndex(ctx, strings.Repeat("a ", 900000)); !errors.Is(err, context.Canceled) {
		t.Fatal("scanner ignored cancellation")
	}
}
