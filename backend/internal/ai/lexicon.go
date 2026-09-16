package ai

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"slices"
	"strings"
	"sync"

	asset "wordweave/assets/lexicon"
	"wordweave/internal/wordnet"
)

var ErrLexiconUnavailable = errors.New("versioned lexical asset unavailable or invalid")

type RelationStatus string

const (
	RelationKnown    RelationStatus = "known"
	RelationUnknown  RelationStatus = "unknown"
	RelationRejected RelationStatus = "rejected"
)

// RelationProof is internal evidence, never a model assertion or a public DTO.
type RelationProof struct {
	Kind, EvidenceID string
	From, To         wordnet.Lexeme
}
type lexicalEdge struct {
	to wordnet.Lexeme
	id string
}

// Lexicon is immutable after construction and shared across all validators.
type Lexicon struct {
	lemmas            map[string][]wordnet.Lexeme
	edges             map[wordnet.Lexeme][]lexicalEdge
	exceptions        map[wordnet.Lexeme][]string
	reverseExceptions map[string][]wordnet.Lexeme
}

var embeddedLexicon = sync.OnceValues(func() (*Lexicon, error) { return loadLexicon(asset.Files) })

func LoadEmbeddedLexicon() (*Lexicon, error) { return embeddedLexicon() }

func loadLexicon(files fs.FS) (*Lexicon, error) {
	body, err := fs.ReadFile(files, "wordnet31.json.gz")
	if err != nil {
		return nil, ErrLexiconUnavailable
	}
	digest := sha256.Sum256(body)
	if hex.EncodeToString(digest[:]) != asset.AssetSHA256 {
		return nil, ErrLexiconUnavailable
	}
	manifestBody, err := fs.ReadFile(files, "manifest.json")
	if err != nil {
		return nil, ErrLexiconUnavailable
	}
	var manifest wordnet.Manifest
	if json.Unmarshal(manifestBody, &manifest) != nil || manifest.ParserVersion != wordnet.ParserVersion || manifest.SourceSHA256 != wordnet.SourceSHA256 || manifest.SourceURL != wordnet.SourceURL || manifest.AssetSHA256 != asset.AssetSHA256 || manifest.AssetBytes != len(body) {
		return nil, ErrLexiconUnavailable
	}
	if manifest.BuilderGoVersion != wordnet.BuilderGoVersion {
		return nil, ErrLexiconUnavailable
	}
	if notice, err := fs.ReadFile(files, "NOTICE.txt"); err != nil || !bytes.Contains(notice, []byte("Princeton")) {
		return nil, ErrLexiconUnavailable
	}
	z, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, ErrLexiconUnavailable
	}
	defer z.Close()
	decoder := json.NewDecoder(io.LimitReader(z, 64<<20))
	decoder.DisallowUnknownFields()
	var data wordnet.Data
	if decoder.Decode(&data) != nil || !errors.Is(decoder.Decode(&struct{}{}), io.EOF) || data.Version != wordnet.ParserVersion || len(data.Lemmas) != manifest.Lemmas || len(data.Edges) != manifest.Edges || len(data.Exceptions) != manifest.Exceptions {
		return nil, ErrLexiconUnavailable
	}
	return newLexicon(data)
}

func newLexicon(data wordnet.Data) (*Lexicon, error) {
	l := &Lexicon{map[string][]wordnet.Lexeme{}, map[wordnet.Lexeme][]lexicalEdge{}, map[wordnet.Lexeme][]string{}, map[string][]wordnet.Lexeme{}}
	for _, lemma := range data.Lemmas {
		if lemma.Word == "" || !slices.Contains([]string{"n", "v", "a", "r"}, lemma.POS) {
			return nil, ErrLexiconUnavailable
		}
		l.lemmas[lemma.Word] = append(l.lemmas[lemma.Word], lemma)
	}
	for _, edge := range data.Edges {
		if !slices.Contains(l.lemmas[edge.From.Word], edge.From) || !slices.Contains(l.lemmas[edge.To.Word], edge.To) || edge.ID == "" {
			return nil, ErrLexiconUnavailable
		}
		l.edges[edge.From] = append(l.edges[edge.From], lexicalEdge{edge.To, edge.ID})
		l.edges[edge.To] = append(l.edges[edge.To], lexicalEdge{edge.From, edge.ID})
	}
	for _, exception := range data.Exceptions {
		// A handful of historical exception lemmas have no current lexical node.
		// They cannot establish POS or a derivational edge by themselves.
		if !slices.Contains(l.lemmas[exception.Lemma.Word], exception.Lemma) {
			continue
		}
		l.exceptions[exception.Lemma] = append(l.exceptions[exception.Lemma], exception.Surface)
		l.reverseExceptions[exception.Surface] = append(l.reverseExceptions[exception.Surface], exception.Lemma)
	}
	// Reviewed local exceptions retain support even outside WordNet. They do
	// not invent a POS; only an existing lemma may be used for a derivation.
	for base, forms := range irregularForms {
		for _, surface := range forms {
			l.reverseExceptions[surface] = append(l.reverseExceptions[surface], l.lemmas[base]...)
		}
	}
	return l, nil
}

func (l *Lexicon) Analyze(entry, surface string) (RelationProof, RelationStatus) {
	entry, surface = strings.ToLower(entry), strings.ToLower(surface)
	if proof, ok := l.knownForms(entry)[surface]; ok {
		return proof, RelationKnown
	}
	if len(l.analyses(surface)) > 0 {
		return RelationProof{}, RelationRejected
	}
	return RelationProof{}, RelationUnknown
}

func (l *Lexicon) knownForms(entry string) map[string]RelationProof {
	entry = strings.ToLower(entry)
	result := map[string]RelationProof{entry: {Kind: "original", EvidenceID: ValidatorVersion + ":exact"}}
	for _, form := range irregularForms[entry] {
		result[form] = RelationProof{Kind: "inflection", EvidenceID: ValidatorVersion + ":reviewed"}
	}
	if entry == "coup d'etat" {
		result["coups d'etat"] = RelationProof{Kind: "inflection", EvidenceID: ValidatorVersion + ":reviewed-multiword"}
	}
	analyses := l.analyses(entry)
	for _, source := range analyses {
		for _, form := range l.inflections(source) {
			if _, exists := result[form]; !exists {
				result[form] = RelationProof{"inflection", ValidatorVersion + ":pos-rules", source, source}
			}
		}
	}
	for _, source := range analyses {
		// Exactly one word-level derivational edge. Never recurse to neighbors
		// of neighbors, synonyms, or other members of a synset.
		for _, edge := range l.edges[source] {
			for _, form := range l.inflections(edge.to) {
				if _, exists := result[form]; !exists {
					result[form] = RelationProof{"derivation", edge.id, source, edge.to}
				}
			}
		}
	}
	// r8 case 1: WordNet omits this direct word-family relation. This reviewed
	// pair is not a suffix heuristic, synonym expansion or a graph traversal.
	// Source: https://www.merriam-webster.com/dictionary/melancholic
	if entry == "melancholy" {
		result["melancholic"] = RelationProof{Kind: "derivation", EvidenceID: ValidatorVersion + ":reviewed-melancholic",
			From: wordnet.Lexeme{Word: "melancholy", POS: "n"}, To: wordnet.Lexeme{Word: "melancholic", POS: "a"}}
	}
	return result
}

func (l *Lexicon) analyses(surface string) []wordnet.Lexeme {
	result := append([]wordnet.Lexeme(nil), l.lemmas[surface]...)
	candidates := append([]wordnet.Lexeme(nil), l.reverseExceptions[surface]...)
	// Reverse stripping only proposes roots. Forward POS rules must reproduce
	// the surface exactly; Morphy-style stripping alone is never proof.
	roots := []string{}
	for _, suffix := range []string{"s", "es", "ies", "ed", "ied", "d", "ing"} {
		if !strings.HasSuffix(surface, suffix) || len(surface) <= len(suffix) {
			continue
		}
		stem := strings.TrimSuffix(surface, suffix)
		roots = append(roots, stem, stem+"e")
		if suffix == "ies" || suffix == "ied" {
			roots = append(roots, stem+"y")
		}
		if suffix == "ing" && strings.HasSuffix(stem, "y") {
			roots = append(roots, strings.TrimSuffix(stem, "y")+"ie")
		}
		if len(stem) > 1 && stem[len(stem)-1] == stem[len(stem)-2] {
			roots = append(roots, stem[:len(stem)-1])
		}
		if strings.HasSuffix(stem, "ck") {
			roots = append(roots, strings.TrimSuffix(stem, "k"))
		}
	}
	for _, root := range roots {
		candidates = append(candidates, l.lemmas[root]...)
	}
	for _, lemma := range candidates {
		if !slices.Contains(result, lemma) && slices.Contains(l.inflections(lemma), surface) {
			result = append(result, lemma)
		}
	}
	slices.SortFunc(result, func(a, b wordnet.Lexeme) int { return strings.Compare(a.POS+":"+a.Word, b.POS+":"+b.Word) })
	return result
}

func (l *Lexicon) inflections(lemma wordnet.Lexeme) []string {
	base := lemma.Word
	forms := []string{base}
	if reviewed, ok := irregularForms[base]; ok {
		return append(forms, reviewed...)
	}
	forms = append(forms, l.exceptions[lemma]...)
	if strings.ContainsAny(base, " -'") {
		return forms
	}
	switch lemma.POS {
	case "n":
		if len(l.exceptions[lemma]) == 0 {
			forms = append(forms, pluralOrThird(base))
		}
	case "v":
		present, past, participle := verbForms(base)
		forms = append(forms, present, participle)
		// Irregular past/participles are authoritative. Do not revive a
		// fabricated regular past via another branch of the analyzer.
		if len(l.exceptions[lemma]) == 0 {
			forms = append(forms, past)
		}
	}
	return forms
}

func pluralOrThird(base string) string {
	if strings.HasSuffix(base, "y") && len(base) > 1 && !strings.ContainsRune("aeiou", rune(base[len(base)-2])) {
		return base[:len(base)-1] + "ies"
	}
	for _, suffix := range []string{"s", "x", "z", "ch", "sh"} {
		if strings.HasSuffix(base, suffix) {
			return base + "es"
		}
	}
	return base + "s"
}

func verbForms(base string) (string, string, string) {
	present := pluralOrThird(base)
	if strings.HasSuffix(base, "ie") {
		return present, base + "d", base[:len(base)-2] + "ying"
	}
	if strings.HasSuffix(base, "e") {
		participle := base[:len(base)-1] + "ing"
		if strings.HasSuffix(base, "ee") || strings.HasSuffix(base, "ye") || strings.HasSuffix(base, "oe") {
			participle = base + "ing"
		}
		return present, base + "d", participle
	}
	if strings.HasSuffix(base, "y") && len(base) > 1 && !strings.ContainsRune("aeiou", rune(base[len(base)-2])) {
		return present, base[:len(base)-1] + "ied", base + "ing"
	}
	if strings.HasSuffix(base, "c") {
		return present, base + "ked", base + "king"
	}
	if _, double := doublingStems[base]; double {
		stem := base + base[len(base)-1:]
		return present, stem + "ed", stem + "ing"
	}
	return present, base + "ed", base + "ing"
}
