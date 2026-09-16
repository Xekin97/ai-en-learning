package wordnet

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
)

type rawEdge struct {
	from, to, symbol         string
	sourceIndex, targetIndex int
}

// Build projects only POS, lexical derivations and exception pairs. Glosses,
// synonyms and semantic graph traversal are deliberately excluded.
func Build(source io.Reader) (Data, string, error) {
	z, err := gzip.NewReader(source)
	if err != nil {
		return Data{}, "", err
	}
	defer z.Close()
	archive := tar.NewReader(z)
	files := map[string]string{}
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return Data{}, "", err
		}
		name := strings.TrimPrefix(header.Name, "dict/")
		if header.Typeflag != tar.TypeReg {
			continue
		}
		for _, pos := range []string{"noun", "verb", "adj", "adv"} {
			if name == "data."+pos || name == "index."+pos || name == pos+".exc" {
				if _, exists := files[name]; exists {
					return Data{}, "", errors.New("duplicate source file")
				}
				if header.Size > 32<<20 {
					return Data{}, "", errors.New("source file too large")
				}
				body, err := io.ReadAll(archive)
				if err != nil {
					return Data{}, "", err
				}
				files[name] = string(body)
			}
		}
	}
	data := Data{Version: ParserVersion}
	lemmas := map[Lexeme]bool{}
	nodes := map[string][]Lexeme{}
	var pending []rawEdge
	var notices strings.Builder
	notices.WriteString("WordWeave WordNet 3.1 projection. Source: " + SourceURL + "\nParser: " + ParserVersion + "\n\nThe following original source headers are preserved verbatim.\n")
	for i, pos := range []string{"noun", "verb", "adj", "adv"} {
		for _, prefix := range []string{"index.", "data."} {
			name := prefix + pos
			body, ok := files[name]
			if !ok {
				return Data{}, "", fmt.Errorf("missing source file %s", name)
			}
			notices.WriteString("\n--- " + name + " ---\n")
			scanner := bufio.NewScanner(strings.NewReader(body))
			scanner.Buffer(make([]byte, 65536), 1<<20)
			headerCount := 0
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "  ") {
					notices.WriteString(line + "\n")
					headerCount++
					continue
				}
				if prefix != "data." || line == "" {
					continue
				}
				key, words, pointers, err := parseSynset(line)
				if err != nil {
					return Data{}, "", fmt.Errorf("%s: %w", name, err)
				}
				if _, duplicate := nodes[key]; duplicate {
					return Data{}, "", errors.New("duplicate synset")
				}
				nodes[key] = words
				for _, word := range words {
					lemmas[word] = true
				}
				pending = append(pending, pointers...)
			}
			if err := scanner.Err(); err != nil {
				return Data{}, "", err
			}
			if headerCount == 0 {
				return Data{}, "", errors.New("license header missing")
			}
		}
		body, ok := files[pos+".exc"]
		if !ok {
			return Data{}, "", errors.New("exception source missing")
		}
		for _, line := range strings.Split(body, "\n") {
			fields := strings.Fields(line)
			if len(fields) == 0 {
				continue
			}
			if len(fields) < 2 {
				return Data{}, "", errors.New("malformed exception")
			}
			for _, lemma := range fields[1:] {
				data.Exceptions = append(data.Exceptions, Exception{normalizeWord(fields[0]), Lexeme{normalizeWord(lemma), []string{"n", "v", "a", "r"}[i]}})
			}
		}
	}
	for lemma := range lemmas {
		data.Lemmas = append(data.Lemmas, lemma)
	}
	for _, pointer := range pending {
		from, to := nodes[pointer.from], nodes[pointer.to]
		if pointer.sourceIndex < 1 || pointer.sourceIndex > len(from) || pointer.targetIndex < 1 || pointer.targetIndex > len(to) {
			return Data{}, "", errors.New("lexical pointer has invalid word index or missing synset")
		}
		data.Edges = append(data.Edges, Edge{from[pointer.sourceIndex-1], to[pointer.targetIndex-1], fmt.Sprintf("%s:%02x%s%s:%02x", pointer.from, pointer.sourceIndex, pointer.symbol, pointer.to, pointer.targetIndex)})
	}
	slices.SortFunc(data.Lemmas, func(a, b Lexeme) int { return strings.Compare(a.POS+":"+a.Word, b.POS+":"+b.Word) })
	slices.SortFunc(data.Edges, func(a, b Edge) int { return strings.Compare(a.ID, b.ID) })
	slices.SortFunc(data.Exceptions, func(a, b Exception) int {
		return strings.Compare(a.Lemma.POS+":"+a.Surface+":"+a.Lemma.Word, b.Lemma.POS+":"+b.Surface+":"+b.Lemma.Word)
	})
	return data, notices.String(), nil
}

func normalizeWord(word string) string {
	for _, suffix := range []string{"(a)", "(p)", "(ip)"} {
		word = strings.TrimSuffix(word, suffix)
	}
	return strings.ToLower(strings.ReplaceAll(word, "_", " "))
}

func normalizePOS(pos string) string {
	if pos == "s" {
		return "a"
	}
	return pos
}

func parseSynset(line string) (string, []Lexeme, []rawEdge, error) {
	fields := strings.Fields(strings.SplitN(line, "|", 2)[0])
	bad := errors.New("malformed WordNet synset")
	if len(fields) < 5 {
		return "", nil, nil, bad
	}
	if _, err := strconv.ParseUint(fields[0], 10, 32); err != nil {
		return "", nil, nil, bad
	}
	pos := normalizePOS(fields[2])
	if !slices.Contains([]string{"n", "v", "a", "r"}, pos) {
		return "", nil, nil, bad
	}
	count, err := strconv.ParseUint(fields[3], 16, 8)
	if err != nil || count == 0 || len(fields) <= 4+2*int(count) {
		return "", nil, nil, bad
	}
	key := pos + ":" + fields[0]
	words := make([]Lexeme, int(count))
	for i := range words {
		words[i] = Lexeme{normalizeWord(fields[4+i*2]), pos}
	}
	cursor := 4 + 2*int(count)
	pointers, err := strconv.Atoi(fields[cursor])
	cursor++
	if err != nil || pointers < 0 || len(fields) < cursor+pointers*4 {
		return "", nil, nil, bad
	}
	var result []rawEdge
	for i := 0; i < pointers; i++ {
		p := fields[cursor+i*4 : cursor+i*4+4]
		if p[0] != "+" && !(p[0] == "\\" && pos == "r" && normalizePOS(p[2]) == "a") {
			continue
		}
		indices, err := strconv.ParseUint(p[3], 16, 16)
		if err != nil || len(p[3]) != 4 {
			return "", nil, nil, bad
		}
		if indices == 0 {
			continue
		} // Semantic pointer, never a lexical proof.
		sourceIndex, targetIndex := int(indices>>8), int(indices&255)
		if sourceIndex == 0 || sourceIndex > len(words) || targetIndex == 0 {
			return "", nil, nil, bad
		}
		result = append(result, rawEdge{key, normalizePOS(p[2]) + ":" + p[1], p[0], sourceIndex, targetIndex})
	}
	return key, words, result, nil
}
