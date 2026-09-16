package diagnostics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"wordweave/internal/ai"
	evidence "wordweave/internal/generationevidence"
	gt "wordweave/internal/generationtrace"
)

func TestOBS042CCommandReplaysProductionValidationAndRejectsOtherBuild(t *testing.T) {
	m, dir, _, fp := diagnosticFixture(t)
	b := m.Admit("account", evidence.DedicatedAccountID, "req_cli_replay", time.Now())
	if b == nil {
		t.Fatal("not admitted")
	}
	trace := gt.New("req_cli_replay", nil)
	trace.AttachCapture(b)
	spec := ai.GenerationSpec{Entries: []string{"grape"}, MeaningLanguage: "en", Scenario: "story", LengthCode: "short", MinimumWords: 1, PromptVersion: ai.PromptVersion}
	b.EffectiveSpec(gt.EffectiveSpec{Entries: spec.Entries, MeaningLanguage: spec.MeaningLanguage, Scenario: spec.Scenario, LengthCode: spec.LengthCode, MinimumWords: 1, PromptVersion: spec.PromptVersion})
	candidate := ai.Candidate{Passage: "Fresh grapes(grape) taste sweet.", Tags: []string{"food"}, Targets: []ai.CandidateTarget{{SourceEntry: "grape", EntryMeaning: "a small round fruit", HintPhrase: "fresh grapes(grape)"}}}
	raw, _ := json.Marshal(candidate)
	// Model wire targets are keyed; Candidate is the separate ordered domain DTO.
	wire, _ := json.Marshal(struct {
		Passage string                       `json:"passage"`
		Tags    []string                     `json:"tags"`
		Targets map[string]map[string]string `json:"targets"`
	}{candidate.Passage, candidate.Tags, map[string]map[string]string{"grape": {"entry_meaning": candidate.Targets[0].EntryMeaning, "hint_phrase": candidate.Targets[0].HintPhrase}}})
	b.ModelChunk(gt.ModelChunk{Index: 1, Text: string(wire), OriginalBytes: len(wire)})
	b.ModelEnd(gt.ModelEnd{Chunks: 1, Bytes: int64(len(wire))})
	b.Processing(gt.Processing{Kind: "candidate", SHA256: evidence.Digest(raw)})
	lexicon, err := ai.LoadEmbeddedLexicon()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ai.NewValidator(lexicon).Validate(gt.With(context.Background(), trace), spec, candidate); err != nil {
		t.Fatal(err)
	}
	trace.Finish()
	until := time.Now().Add(time.Second)
	for {
		v, err := evidence.Read(dir, b.ID(), time.Now())
		if err == nil && !v.Incomplete {
			break
		}
		if time.Now().After(until) {
			t.Fatal("writer incomplete")
		}
		time.Sleep(time.Millisecond)
	}
	deps := commandDeps{func(string) error { return nil }, func(string) (evidence.Fingerprint, error) { return fp, nil }, time.Now}
	var out bytes.Buffer
	args := []string{"replay", "--dir", dir, "--id", b.ID(), "--mode", "model"}
	if err := runCommand(context.Background(), args, &out, deps); err != nil {
		t.Fatal(err, out.String())
	}
	if !strings.Contains(out.String(), `"status":"reproduced"`) || strings.Contains(out.String(), "grape") {
		t.Fatal("replay failed or leaked content", out.String())
	}
	fp.Source = evidence.Digest([]byte("another build"))
	out.Reset()
	if err := runCommand(context.Background(), args, &out, deps); !errors.Is(err, ErrReplay) || !strings.Contains(out.String(), "fingerprint_mismatch") {
		t.Fatal("other build accepted", err, out.String())
	}
}

func diagnosticFixture(t *testing.T) (*evidence.Manager, string, string, evidence.Fingerprint) {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	h := evidence.Digest([]byte("synthetic command fixture"))
	fp := evidence.Fingerprint{Source: h, Binary: h, Template: h, Schema: h, Validator: h, Lexicon: h}
	m, err := evidence.Open(evidence.Options{Directory: dir, Fingerprint: fp})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := m.Close(ctx); err != nil {
			t.Error(err)
		}
	})
	b := m.Admit("account", evidence.DedicatedAccountID, "req_cli_fixture", time.Now())
	if b == nil {
		t.Fatal("not admitted")
	}
	raw := "private synthetic grapes(grape)"
	b.EffectiveSpec(gt.EffectiveSpec{Entries: []string{"grape"}, MeaningLanguage: "en", PromptVersion: ai.PromptVersion})
	b.ModelChunk(gt.ModelChunk{Index: 1, Text: raw, OriginalBytes: len(raw)})
	b.ModelEnd(gt.ModelEnd{Chunks: 1, Bytes: int64(len(raw))})
	b.Summary(gt.Summary{})
	until := time.Now().Add(time.Second)
	for time.Now().Before(until) {
		v, err := evidence.Read(dir, b.ID(), time.Now())
		if err == nil && !v.Incomplete {
			return m, dir, b.ID(), fp
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("writer not complete")
	return nil, "", "", fp
}
func TestOBS042CInspectExplicitContentAndOfflineReplay(t *testing.T) {
	_, dir, id, fp := diagnosticFixture(t)
	// The test substitutes only the OS/build gate, not storage or replay logic.
	deps := commandDeps{storage: func(string) error { return nil }, fingerprint: func(string) (evidence.Fingerprint, error) { return fp, nil }, now: time.Now}
	var out bytes.Buffer
	if err := runCommand(context.Background(), []string{"inspect", "--dir", dir, "--id", id}, &out, deps); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out.String(), "grapes") || strings.Contains(out.String(), "grape") || strings.Contains(out.String(), "private synthetic") {
		t.Fatal("default inspect leaked content")
	}
	out.Reset()
	if err := runCommand(context.Background(), []string{"inspect", "--dir", dir, "--id", id, "--content"}, &out, deps); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "grapes(grape)") {
		t.Fatal("explicit inspection missing raw content")
	}
	out.Reset()
	if err := runCommand(context.Background(), []string{"replay", "--dir", dir, "--id", id, "--server", "synthetic-local-binary"}, &out, deps); !errors.Is(err, ErrReplay) {
		t.Fatal("incomplete pipeline falsely replayed", err)
	}
	if strings.Contains(out.String(), "grape") || !strings.Contains(out.String(), "validation_not_observed") {
		t.Fatal("unsafe or misleading replay report")
	}
}
func TestOBS042CListClearAndTTLDoNotExtendRetention(t *testing.T) {
	m, dir, id, fp := diagnosticFixture(t)
	now := time.Now()
	deps := commandDeps{func(string) error { return nil }, func(string) (evidence.Fingerprint, error) { return fp, nil }, func() time.Time { return now }}
	var out bytes.Buffer
	if err := runCommand(context.Background(), []string{"inspect", "--dir", dir}, &out, deps); err != nil {
		t.Fatal(err)
	}
	var manifests []evidence.Manifest
	if json.Unmarshal(out.Bytes(), &manifests) != nil || len(manifests) != 1 {
		t.Fatal("list")
	}
	created := manifests[0].CreatedAt
	now = created.Add(evidence.Retention)
	out.Reset()
	if err := runCommand(context.Background(), []string{"inspect", "--dir", dir, "--id", id, "--content"}, &out, deps); !errors.Is(err, evidence.ErrUnavailable) || out.Len() != 0 {
		t.Fatal("expired content read")
	}
	if err := runCommand(context.Background(), []string{"clear", "--dir", dir, "--id", id}, &out, deps); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, id+".jsonl")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("clear retained file")
	}
	// No database account or model is touched by Clear.
	if m.Health().Admitted != 1 {
		t.Fatal("unexpected new capture")
	}
}
func TestOBS042CRecheckPreventsPublishingAfterExpiry(t *testing.T) {
	_, dir, id, fp := diagnosticFixture(t)
	calls := 0
	deps := commandDeps{func(string) error { return nil }, func(string) (evidence.Fingerprint, error) { return fp, nil }, func() time.Time {
		calls++
		if calls > 1 {
			return time.Now().Add(25 * time.Hour)
		}
		return time.Now()
	}}
	var out bytes.Buffer
	if err := runCommand(context.Background(), []string{"inspect", "--dir", dir, "--id", id, "--content"}, &out, deps); !errors.Is(err, evidence.ErrUnavailable) || out.Len() != 0 {
		t.Fatal("check/use expired evidence")
	}
}
