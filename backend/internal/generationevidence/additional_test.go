package generationevidence

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	gt "wordweave/internal/generationtrace"
)

func TestContinuationResponsesRemainSeparatelyInspectable(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	first, second, third := `{"passage":"first synthetic response"}`, `{"passage":"new synthetic paragraphs"}`, `{"passage":"corrected annotations"}`
	b.ModelChunk(gt.ModelChunk{Index: 1, OriginalBytes: len(first), Text: first})
	b.ModelEnd(gt.ModelEnd{Chunks: 1, Bytes: int64(len(first))})
	b.Event(gt.Event{Kind: "fact", Fact: gt.StageFact{Stage: gt.ProviderStream.String(), Check: "correction_started"}})
	b.ModelChunk(gt.ModelChunk{Index: 1, OriginalBytes: len(second), Text: second})
	b.ModelEnd(gt.ModelEnd{Chunks: 1, Bytes: int64(len(second))})
	b.Event(gt.Event{Kind: "fact", Fact: gt.StageFact{Stage: gt.ProviderStream.String(), Check: "correction_started", Detail: gt.Detail{Actual: 2, Limit: 2}}})
	b.ModelChunk(gt.ModelChunk{Index: 1, OriginalBytes: len(third), Text: third})
	b.ModelEnd(gt.ModelEnd{Chunks: 1, Bytes: int64(len(third))})
	b.Summary(gt.Summary{})
	drain(t, b)
	view, err := Read(p, b.ID(), time.Now())
	if err != nil || view.Incomplete {
		t.Fatal("cannot inspect both attempts", err)
	}
	var texts []string
	ends, boundaries := 0, 0
	for _, record := range view.Records {
		if record.Chunk != nil {
			texts = append(texts, record.Chunk.Text)
		}
		if record.ModelEnd != nil {
			ends++
		}
		if record.Event != nil && record.Event.Fact.Check == "correction_started" {
			boundaries++
		}
	}
	if len(texts) != 3 || texts[0] != first || texts[1] != second || texts[2] != third || ends != 3 || boundaries != 2 {
		t.Fatal("attempt content/boundary lost")
	}
	if _, reason := Reconstruct(view, testFingerprint(), time.Now()); reason != "multiple_model_attempts" {
		t.Fatalf("single-response replay misrepresents attempts: %s", reason)
	}
}

func TestOBS042COwnerLatchBlocksReadWhenNewMarkerCannotBeCreated(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	finish(t, b)
	m.mu.Lock()
	// Existing descriptor remains writable, but creation of .blocked fails.
	if err := os.Chmod(p, 0500); err != nil {
		m.mu.Unlock()
		t.Fatal(err)
	}
	m.markBlocked()
	err := os.Chmod(p, 0700)
	m.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(p, ".blocked")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("fixture did not deny marker creation")
	}
	if _, err := Read(p, b.ID(), time.Now()); !errors.Is(err, ErrCleanup) {
		t.Fatal("latch allowed read", err)
	}
	if _, err := List(p, time.Now()); !errors.Is(err, ErrCleanup) {
		t.Fatal("latch allowed list", err)
	}
	if m.Health().CleanupFailed == 0 {
		t.Fatal("missing cleanup failure counter")
	}
	if err := m.Sweep(); err != nil {
		t.Fatal(err)
	}
	if _, err := Read(p, b.ID(), time.Now()); err != nil {
		t.Fatal("recovered latch still blocked", err)
	}
}

func TestOBS042CCloseWipesPendingQueueWhileWriterIsStalled(t *testing.T) {
	m, _ := testManager(t)
	b := admit(t, m)
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := 0; i < 20; i++ {
		b.ModelChunk(gt.ModelChunk{Index: uint64(i + 1), OriginalBytes: 7, Text: "private"})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := m.Close(ctx); !errors.Is(err, ErrCleanup) {
		t.Fatal("stalled IO not reported", err)
	}
	select {
	case <-b.Revocation():
	default:
		t.Fatal("provider guard not revoked")
	}
	until := time.Now().Add(time.Second)
	for len(b.queue) != 0 && time.Now().Before(until) {
		time.Sleep(time.Millisecond)
	}
	if len(b.queue) != 0 || b.alive() {
		t.Fatal("revoked queue still retains content")
	}
}

func TestOBS042BConcurrentRotationNeverExceeds50(t *testing.T) {
	m, p := testManager(t)
	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		wg.Go(func() {
			b := m.Admit("account", DedicatedAccountID, "req_concurrent", time.Now())
			if b == nil {
				t.Error("admission failed")
			}
		})
	}
	wg.Wait()
	if len(m.IDs()) != 50 {
		t.Fatal("in-memory bound")
	}
	files, err := filepath.Glob(filepath.Join(p, "*.jsonl"))
	if err != nil || len(files) != 50 {
		t.Fatal("on-disk bound", err, len(files))
	}
}
func TestOBS042BCloseFailureRemainsAnErrorAndRestartCleans(t *testing.T) {
	p := privateDirectory(t)
	m, err := Open(Options{p, testFingerprint()})
	if err != nil {
		t.Fatal(err)
	}
	b := admit(t, m)
	m.mu.Lock()
	m.remove = func(Manifest) error { return ErrCleanup }
	m.mu.Unlock()
	for i := 0; i < 2; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		err = m.Close(ctx)
		cancel()
		if !errors.Is(err, ErrCleanup) {
			t.Fatal("cleanup failure swallowed", err)
		}
	}
	if _, err = Read(p, b.ID(), time.Now()); !errors.Is(err, ErrCleanup) {
		t.Fatal("shutdown failure read allowed")
	}
	m, err = Open(Options{p, testFingerprint()})
	if err != nil {
		t.Fatal(err)
	}
	if len(m.IDs()) != 0 {
		t.Fatal("failed-close data exposed at restart")
	}
	if err = m.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(p, b.ID()+".jsonl")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("recovery did not remove")
	}
}
func TestOBS042BRepeatedProgressIsCoalescedButFailuresAndUsageRemain(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	for i := 0; i < 1000; i++ {
		b.Event(gt.Event{Kind: "fact", Fact: gt.StageFact{Stage: gt.ProviderStream.String(), Check: "frame", Detail: gt.Detail{Actual: i}}})
		b.Event(gt.Event{Kind: "fact", Fact: gt.StageFact{Stage: gt.ProviderStream.String(), Check: "content", Detail: gt.Detail{Actual: i * 10}}})
		b.Event(gt.Event{Kind: "provider", Fact: gt.StageFact{Stage: gt.ProviderStream.String()}, Provider: &gt.ProviderFact{Frame: int64(i), ID: "gen_fixture", FinishReason: "not_provided", SyntaxOffset: -1}})
	}
	b.Event(gt.Event{Kind: "provider", Fact: gt.StageFact{Stage: gt.ProviderStream.String()}, Provider: &gt.ProviderFact{UsageProvided: true, TotalTokens: 10}})
	b.Event(gt.Event{Kind: "stage_end", Fact: gt.StageFact{Stage: gt.ContentValidate.String(), State: gt.Failed, Detail: gt.Why("hint_annotation_missing")}})
	finish(t, b)
	view, err := Read(p, b.ID(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	usage, failure, progress := false, false, false
	for _, r := range view.Records {
		if r.Event != nil {
			if r.Event.Provider != nil && r.Event.Provider.UsageProvided {
				usage = true
			}
			if r.Event.Fact.Detail.Reason == "hint_annotation_missing" {
				failure = true
			}
		}
		if r.State != nil {
			if r.State.Truncated || r.State.DroppedRecords != 0 || r.State.CoalescedProgress != 2999 {
				t.Fatalf("bad coalescing: %+v", r.State)
			}
			if len(r.Progress) != 3 || r.Progress[0].Fact.Detail.Actual != 999 || r.Progress[1].Fact.Detail.Actual != 9990 {
				t.Fatal("latest counters lost")
			}
			progress = true
		}
	}
	if !usage || !failure || !progress || !b.ByteExact() {
		t.Fatal("coalescing discarded meaningful evidence")
	}
}
