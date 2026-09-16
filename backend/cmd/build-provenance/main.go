// Build helper; only source files, module locks and embedded assets are read.
// Output contains digests, never source text, environment values or secrets.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type sourceFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}
type manifest struct {
	Source    string       `json:"source_sha256"`
	Validator string       `json:"validator_sha256"`
	Files     []sourceFile `json:"files"`
}

func digest(data []byte) string { h := sha256.Sum256(data); return hex.EncodeToString(h[:]) }
func build(root string) (manifest, error) {
	var files, validation []sourceFile
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, p)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if rel != "." && (strings.HasPrefix(d.Name(), ".") || d.Name() == "node_modules" || d.Name() == "vendor") {
				return filepath.SkipDir
			}
			return nil
		}
		included := strings.HasSuffix(rel, ".go") && !strings.HasSuffix(rel, "_test.go") || strings.HasPrefix(rel, "db/") && strings.HasSuffix(rel, ".sql") || rel == "go.mod" || rel == "go.sum" ||
			strings.HasPrefix(rel, "assets/lexicon/") || rel == "assets/vocabulary/english-words.json"
		if !included {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("source link not accepted")
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		f := sourceFile{rel, digest(data)}
		files = append(files, f)
		if strings.HasPrefix(rel, "internal/ai/") || strings.HasPrefix(rel, "internal/wordnet/") || strings.HasPrefix(rel, "assets/lexicon/") {
			validation = append(validation, f)
		}
		return nil
	})
	if err != nil {
		return manifest{}, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	sort.Slice(validation, func(i, j int) bool { return validation[i].Path < validation[j].Path })
	all, _ := json.Marshal(files)
	rules, _ := json.Marshal(validation)
	if len(files) == 0 || len(validation) == 0 {
		return manifest{}, fmt.Errorf("source tree incomplete")
	}
	return manifest{digest(all), digest(rules), files}, nil
}
func main() {
	m, err := build(".")
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot fingerprint source tree")
		os.Exit(1)
	}
	if len(os.Args) == 2 && os.Args[1] == "manifest" {
		_ = json.NewEncoder(os.Stdout).Encode(m)
		return
	}
	if len(os.Args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: build-provenance [manifest]")
		os.Exit(1)
	}
	fmt.Printf("-X=wordweave/internal/buildinfo.SourceSHA256=%s -X=wordweave/internal/buildinfo.ValidatorSHA256=%s", m.Source, m.Validator)
}
