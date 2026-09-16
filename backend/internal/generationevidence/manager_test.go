package generationevidence

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	gt "wordweave/internal/generationtrace"
)

func testFingerprint() Fingerprint {
	h := Digest([]byte("synthetic test provenance, never a runtime fingerprint"))
	return Fingerprint{h, h, h, h, h, h}
}
func privateDirectory(t *testing.T) string {
	t.Helper()
	p, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(p, 0700); err != nil {
		t.Fatal(err)
	}
	return p
}
func testManager(t *testing.T) (*Manager, string) {
	t.Helper()
	p := privateDirectory(t)
	m, err := Open(Options{p, testFingerprint()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := m.Close(ctx); err != nil {
			t.Errorf("close: %v", err)
		}
	})
	return m, p
}
func admit(t *testing.T, m *Manager) *Bundle {
	t.Helper()
	b := m.Admit("account", DedicatedAccountID, "req_synthetic", time.Now())
	if b == nil {
		t.Fatal("not admitted")
	}
	return b
}
func drain(t *testing.T, b *Bundle) {
	t.Helper()
	until := time.Now().Add(3 * time.Second)
	for time.Now().Before(until) {
		b.manager.mu.Lock()
		b.mu.Lock()
		idle := b.sequence == b.accepted+1
		failed := b.state.IOFailed
		b.mu.Unlock()
		b.manager.mu.Unlock()
		if failed {
			t.Fatal("writer IO failure")
		}
		if idle {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("writer did not drain")
}
func finish(t *testing.T, b *Bundle) {
	t.Helper()
	b.ModelEnd(gt.ModelEnd{})
	b.Summary(gt.Summary{})
	drain(t, b)
}
func TestOBS042BIdentityAndPrivateFiles(t *testing.T) {
	m, p := testManager(t)
	for _, identity := range [][2]string{{"visitor", DedicatedAccountID}, {"account", "different-account"}, {"admin", DedicatedAccountID}} {
		if m.Admit(identity[0], identity[1], "req_synthetic", time.Now()) != nil {
			t.Fatal("unapproved identity captured")
		}
	}
	if m.Admit("account", DedicatedAccountID, "Bearer private", time.Now()) != nil {
		t.Fatal("unsafe request ID")
	}
	b := admit(t, m)
	finish(t, b)
	v, err := Read(p, b.ID(), time.Now())
	if err != nil || v.Incomplete {
		t.Fatalf("read: %v", err)
	}
	if len(m.IDs()) != 1 || v.Manifest.AccountID != DedicatedAccountID || v.Manifest.ExpiresAt.Sub(v.Manifest.CreatedAt) != Retention {
		t.Fatal("scope or retention")
	}
	entries, _ := os.ReadDir(p)
	for _, e := range entries {
		info, _ := e.Info()
		if info.Mode().Perm() != 0600 {
			t.Fatal("public diagnostic file")
		}
	}
	if _, err = Open(Options{p, testFingerprint()}); !errors.Is(err, ErrBusy) {
		t.Fatal("second writer accepted", err)
	}
}

func TestStageRetentionDoesNotDuplicatePerTokenChecks(t *testing.T) {
	m, dir := testManager(t)
	b := admit(t, m)
	trace := gt.New("req_synthetic", nil)
	trace.AttachCapture(b)
	trace.Begin(gt.ContentValidate)
	for i := 0; i < 1000; i++ {
		trace.Check(gt.ContentValidate, "hint_scan", i)
		trace.Note(gt.Delivery, "delta", gt.Why(""))
	}
	trace.End(gt.ContentValidate, gt.Failed, gt.Why("hint_annotation_missing"))
	b.ModelEnd(gt.ModelEnd{})
	trace.Finish()
	drain(t, b)
	v, err := Read(dir, b.ID(), time.Now())
	if err != nil || v.Incomplete {
		t.Fatal("stage log unavailable", err)
	}
	foundFailure := false
	for _, record := range v.Records {
		if record.Event != nil && (record.Event.Kind == "check_begin" || record.Event.Kind == "check_end") {
			t.Fatal("sub-checks duplicated into private content retention")
		}
		if record.State != nil && (record.State.Truncated || record.State.DroppedRecords != 0) {
			t.Fatal("ordinary streaming bookkeeping displaced retained content")
		}
		if record.Summary != nil {
			f := record.Summary.FirstFailure
			foundFailure = f != nil && f.Check == "hint_scan" && f.Detail.Reason == "hint_annotation_missing"
		}
	}
	if !foundFailure {
		t.Fatal("stage failure detail lost")
	}
}
func TestOBS042BLatest50IncludesActiveAndRevokesOldest(t *testing.T) {
	m, p := testManager(t)
	first := admit(t, m)
	for i := 1; i < MaxBundles; i++ {
		admit(t, m)
	}
	if len(m.IDs()) != 50 {
		t.Fatal("capacity")
	}
	last := admit(t, m)
	if len(m.IDs()) != 50 || last.ID() == first.ID() {
		t.Fatal("rotation")
	}
	first.ModelChunk(gt.ModelChunk{Index: 1, OriginalBytes: 4, Text: "late"})
	select {
	case <-first.done:
	case <-time.After(time.Second):
		t.Fatal("revoked worker alive")
	}
	if _, err := os.Stat(filepath.Join(p, first.ID()+".jsonl")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("oldest recreated")
	}
	if _, err := Read(p, first.ID(), time.Now()); !errors.Is(err, ErrUnavailable) {
		t.Fatal("revoked readable", err)
	}
}
func TestOBS042BTTLReadSweepAndRecheck(t *testing.T) {
	m, p := testManager(t)
	start := time.Now().Add(-Retention + 500*time.Millisecond)
	b := m.Admit("account", DedicatedAccountID, "req_ttl", start)
	if b == nil {
		t.Fatal("admit")
	}
	finish(t, b)
	view, err := Read(p, b.ID(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Read(p, b.ID(), start.Add(Retention)); !errors.Is(err, ErrUnavailable) {
		t.Fatal("expired read")
	}
	if err = Recheck(p, view.Manifest, start.Add(Retention)); !errors.Is(err, ErrUnavailable) {
		t.Fatal("expired replay")
	}
	// Exercise the production timer, not just a manual read-triggered cleanup.
	until := time.Now().Add(2500 * time.Millisecond)
	for time.Now().Before(until) {
		if _, err = os.Stat(filepath.Join(p, b.ID()+".jsonl")); errors.Is(err, os.ErrNotExist) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatal("TTL timer did not delete")
	}
	b.ModelChunk(gt.ModelChunk{Text: "late"})
	if b.ByteExact() {
		t.Fatal("expired still exact")
	}
	if m.Admit("account", DedicatedAccountID, "req_expired", time.Now().Add(-Retention)) != nil {
		t.Fatal("expired admission")
	}
}
func TestOBS042BClearRevokesWriterWithoutRecreation(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	finish(t, b)
	v, err := Read(p, b.ID(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if err = Clear(p, b.ID()); err != nil {
		t.Fatal(err)
	}
	if err = Recheck(p, v.Manifest, time.Now()); err == nil {
		t.Fatal("cleared replay allowed")
	}
	b.ModelChunk(gt.ModelChunk{Index: 1, Text: "late", OriginalBytes: 4})
	select {
	case <-b.done:
	case <-time.After(time.Second):
		t.Fatal("late writer alive")
	}
	if _, err = os.Stat(filepath.Join(p, b.ID()+".jsonl")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("cleared file recreated")
	}
}
func TestOBS042BDeleteFailureDenies51stAndReadsUntilRetry(t *testing.T) {
	m, p := testManager(t)
	first := admit(t, m)
	for i := 1; i < 50; i++ {
		admit(t, m)
	}
	m.mu.Lock()
	m.remove = func(Manifest) error { return ErrCleanup }
	m.mu.Unlock()
	if m.Admit("account", DedicatedAccountID, "req_denied", time.Now()) != nil {
		t.Fatal("51st admitted despite failed deletion")
	}
	if _, err := Read(p, first.ID(), time.Now()); !errors.Is(err, ErrCleanup) {
		t.Fatal("blocked read", err)
	}
	m.mu.Lock()
	m.remove = m.disk.remove
	m.mu.Unlock()
	if err := m.Sweep(); err != nil {
		t.Fatal(err)
	}
	admit(t, m)
	if len(m.IDs()) != 50 {
		t.Fatal("recovery capacity")
	}
}
func TestOBS042BCallbacksBoundedDuringStalledIOAndClose(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	m.mu.Lock() // Simulates the lifecycle/writer being stuck in filesystem IO.
	var wg sync.WaitGroup
	wg.Add(1)
	done := make(chan struct{})
	go func() {
		defer wg.Done()
		defer close(done)
		for i := 0; i < 1000; i++ {
			b.ModelChunk(gt.ModelChunk{Index: uint64(i + 1), Text: strings.Repeat("a", 2048), OriginalBytes: 2048})
		}
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		m.mu.Unlock()
		t.Fatal("capture blocked on IO")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	err := m.Close(ctx)
	cancel()
	if !errors.Is(err, ErrCleanup) || b.alive() {
		m.mu.Unlock()
		t.Fatal("unbounded close or not revoked")
	}
	m.mu.Unlock()
	wg.Wait()
	ctx, cancel = context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err = m.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(p, b.ID()+".jsonl")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("shutdown did not clear")
	}
}
func TestOBS042BBudgetIncludesQueueAndMetadataAndPreservesFinal(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	for i := 0; i < 600; i++ {
		b.ModelChunk(gt.ModelChunk{Index: uint64(i + 1), Text: strings.Repeat("界", 680), OriginalBytes: 2040})
		if i%20 == 0 {
			drain(t, b)
		}
	}
	b.ModelEnd(gt.ModelEnd{Chunks: 600, Bytes: 600 * 2040})
	b.Summary(gt.Summary{})
	drain(t, b)
	b.mu.Lock()
	reserved, state := b.reserved, b.state
	b.mu.Unlock()
	if reserved > MaxBytes || !state.Truncated || state.DroppedRecords == 0 || b.ByteExact() {
		t.Fatalf("bad bounded state: %+v", state)
	}
	v, err := Read(p, b.ID(), time.Now())
	if err != nil || v.Bytes > MaxBytes || v.Incomplete {
		t.Fatal("invalid capped journal", err)
	}
	found := false
	for _, r := range v.Records {
		if r.State != nil && r.State.Truncated {
			found = true
		}
	}
	if !found {
		t.Fatal("final truncation missing")
	}
}
func TestOBS042BMetadataReserveAndSpecPrivacy(t *testing.T) {
	m, _ := testManager(t)
	b := admit(t, m)
	b.EffectiveSpec(gt.EffectiveSpec{ProviderModelID: "sk-synthetic-secret"})
	for i := 0; i < 1500; i++ {
		b.Event(gt.Event{RequestID: "req_synthetic"})
		if i%20 == 0 {
			drain(t, b)
		}
	}
	b.ModelChunk(gt.ModelChunk{Index: 1, Text: "raw", OriginalBytes: 3})
	b.ModelEnd(gt.ModelEnd{Chunks: 1, Bytes: 3})
	b.Summary(gt.Summary{})
	drain(t, b)
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.metadata > metadataBudget || b.reserved >= MaxBytes-finalBudget {
		t.Fatal("metadata consumed raw/final reserves")
	}
}
func TestOBS042BUnsafePathsLinksAndTampering(t *testing.T) {
	for _, kind := range []string{"permissions", "symlink_directory", "symlink_file", "hardlink_file", "traversal", "corruption", "partial_tail"} {
		t.Run(kind, func(t *testing.T) {
			m, p := testManager(t)
			b := admit(t, m)
			finish(t, b)
			path := filepath.Join(p, b.ID()+".jsonl")
			switch kind {
			case "permissions":
				os.Chmod(p, 0755)
				defer os.Chmod(p, 0700)
				if _, err := Read(p, b.ID(), time.Now()); !errors.Is(err, ErrUnsafe) {
					t.Fatal(err)
				}
			case "symlink_directory":
				link := filepath.Join(t.TempDir(), "alias")
				if err := os.Symlink(p, link); err != nil {
					t.Fatal(err)
				}
				if _, err := Read(link, b.ID(), time.Now()); !errors.Is(err, ErrUnsafe) {
					t.Fatal(err)
				}
			case "symlink_file", "hardlink_file":
				other := filepath.Join(privateDirectory(t), "other")
				raw, _ := os.ReadFile(path)
				if err := os.WriteFile(other, raw, 0600); err != nil {
					t.Fatal(err)
				}
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				if kind == "symlink_file" {
					if err := os.Symlink(other, path); err != nil {
						t.Fatal(err)
					}
				} else {
					if err := os.Link(other, path); err != nil {
						t.Fatal(err)
					}
				}
				if _, err := Read(p, b.ID(), time.Now()); !errors.Is(err, ErrUnsafe) {
					t.Fatal(err)
				}
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				} // Restore only this synthetic fixture for cleanup.
			case "traversal":
				if _, err := Read(p, "../../other", time.Now()); !errors.Is(err, ErrUnsafe) {
					t.Fatal(err)
				}
			case "corruption":
				f, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0600)
				if err != nil {
					t.Fatal(err)
				}
				f.WriteString("{}\n")
				f.Close()
				if _, err := Read(p, b.ID(), time.Now()); !errors.Is(err, ErrUnsafe) {
					t.Fatal(err)
				}
			case "partial_tail":
				f, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0600)
				if err != nil {
					t.Fatal(err)
				}
				f.WriteString("{")
				f.Close()
				v, err := Read(p, b.ID(), time.Now())
				if err != nil || !v.Incomplete {
					t.Fatal("partial tail accepted as complete", err)
				}
			}
		})
	}
}
func TestOBS042BAccountDeletionAndPersistentCloseError(t *testing.T) {
	m, p := testManager(t)
	b := admit(t, m)
	if err := m.RevokeAccount("different-account"); err != nil || !b.alive() {
		t.Fatal("other account revoked")
	}
	if err := m.RevokeAccount(DedicatedAccountID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(p, b.ID()+".jsonl")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("account evidence remains")
	}
	if m.Admit("account", DedicatedAccountID, "req_after_delete", time.Now()) != nil {
		t.Fatal("deleted account readmitted")
	}
}
func TestOBS042BRecoveryCleansBlockedAndExpiredWithoutTTLReset(t *testing.T) {
	p := privateDirectory(t)
	now := time.Now()
	var ids []string
	for i := 0; i < 2; i++ {
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i+1)
		ids = append(ids, id)
		start := now.Add(-time.Hour)
		if i == 0 {
			start = now.Add(-25 * time.Hour)
		}
		mf := Manifest{Schema: 1, ID: id, AccountID: DedicatedAccountID, RequestID: "req_restart", Admission: uint64(i + 1), CreatedAt: start, ExpiresAt: start.Add(Retention), Fingerprint: testFingerprint()}
		raw, _ := json.Marshal(Record{Manifest: &mf})
		if err := os.WriteFile(filepath.Join(p, id+".jsonl"), encodeLine(1, "", raw), 0600); err != nil {
			t.Fatal(err)
		}
	}
	m, err := Open(Options{p, testFingerprint()})
	if err != nil {
		t.Fatal(err)
	}
	if len(m.IDs()) != 1 {
		t.Fatal("expired survived startup")
	}
	v, err := Read(p, ids[1], time.Now())
	if err != nil || !v.Incomplete || !v.Manifest.CreatedAt.Equal(now.Add(-time.Hour)) {
		t.Fatal("restart changed provenance or TTL", err)
	}
	// Simulate a crash: no Close cleanup, no active writers in these fixtures.
	close(m.stop)
	<-m.done
	m.owner.Close()
	m.disk.close()
	if err = os.WriteFile(filepath.Join(p, ".blocked"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	m, err = Open(Options{p, testFingerprint()})
	if err != nil {
		t.Fatal(err)
	}
	if len(m.IDs()) != 0 {
		t.Fatal("blocked recovery exposed old data")
	}
	if err = m.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
}
