package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOBS042CSourceDigestExcludesSecretsAndTracksSource(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "internal", "ai"), 0700); err != nil {
		t.Fatal(err)
	}
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("go.mod", "module wordweave\ngo 1.26.0\n")
	write("internal/ai/validator.go", "package ai\n")
	write(".env", "synthetic private config")
	write("internal/ai/validator_test.go", "synthetic unit test")
	a, err := build(root)
	if err != nil {
		t.Fatal(err)
	}
	write(".env", "different synthetic private config")
	write("internal/ai/validator_test.go", "different unit test")
	b, err := build(root)
	if err != nil || a.Source != b.Source {
		t.Fatal("runtime digest included secrets or tests")
	}
	if len(a.Files) != 2 {
		t.Fatal("unexpected file allowlist")
	}
	write("internal/ai/validator.go", "package ai\nconst Revision=2\n")
	c, err := build(root)
	if err != nil || c.Source == a.Source || c.Validator == a.Validator {
		t.Fatal("source change not tracked")
	}
}
