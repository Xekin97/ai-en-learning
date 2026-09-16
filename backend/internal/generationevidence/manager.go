package generationevidence

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sys/unix"
	gt "wordweave/internal/generationtrace"
)

type Options struct {
	Directory   string
	Fingerprint Fingerprint
}
type Manager struct {
	mu              sync.Mutex // admission/lifecycle IO only; never acquired by capture callbacks
	disk            *disk
	owner           *os.File
	opts            Options
	entries         map[string]*Bundle
	admission       uint64
	closed, blocked bool
	closing         atomic.Bool
	closeOnce       sync.Once
	closeDone       chan struct{}
	closeErr        error
	now             func() time.Time
	stop            chan struct{}
	done            chan struct{}
	remove          func(Manifest) error
	counters        counters
	captureContext  context.Context
	cancelCapture   context.CancelFunc
}
type Bundle struct {
	manager                   *Manager
	manifest                  Manifest
	deadline                  time.Time // carries monotonic clock during this process
	revoked                   atomic.Bool
	mu                        sync.Mutex // bounded memory bookkeeping, no IO
	queue                     chan []byte
	wake                      chan struct{}
	done                      chan struct{}
	state                     State
	reserved, metadata, final int
	sequence                  uint64 // writer only
	previous                  string // writer only
	exact                     bool
	accepted                  uint64
	progress                  [3]*gt.Event
	ctx                       context.Context
	cancel                    context.CancelFunc
}

func Open(opts Options) (*Manager, error) {
	if !opts.Fingerprint.Valid() {
		return nil, ErrUnsafe
	}
	d, err := openDisk(opts.Directory)
	if err != nil {
		return nil, err
	}
	owner, err := d.root.OpenFile(".owner", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil || !d.validFile(".owner", owner) {
		if owner != nil {
			owner.Close()
		}
		d.close()
		return nil, ErrUnsafe
	}
	if unix.Flock(int(owner.Fd()), unix.LOCK_EX|unix.LOCK_NB) != nil {
		owner.Close()
		d.close()
		return nil, ErrBusy
	}
	m := &Manager{disk: d, owner: owner, opts: opts, entries: make(map[string]*Bundle), now: time.Now, stop: make(chan struct{}), done: make(chan struct{}), closeDone: make(chan struct{})}
	m.captureContext, m.cancelCapture = context.WithCancel(context.Background())
	m.remove = d.remove
	if err = m.load(); err != nil {
		m.cancelCapture()
		owner.Close()
		d.close()
		return nil, err
	}
	go m.run()
	return m, nil
}
func (m *Manager) load() error {
	if err := m.disk.acquire(); err != nil {
		return err
	}
	defer m.disk.release()
	manifests, err := m.disk.manifests()
	if err != nil {
		return err
	}
	blocked := m.disk.blocked()
	for _, mf := range manifests {
		if mf.Admission > m.admission {
			m.admission = mf.Admission
		}
		if blocked || !m.now().Before(mf.ExpiresAt) || m.now().Before(mf.CreatedAt) {
			if err = m.remove(mf); err != nil {
				m.markBlocked()
				return ErrCleanup
			}
			continue
		}
		// Restarted bundles remain inspectable but are never resumed or rewritten.
		b := &Bundle{manager: m, manifest: mf, deadline: m.now().Add(mf.ExpiresAt.Sub(m.now())), done: make(chan struct{})}
		close(b.done)
		m.entries[mf.ID] = b
	}
	for len(m.entries) > MaxBundles {
		if err := m.evictOldest(); err != nil {
			return err
		}
	}
	if blocked {
		if err := m.disk.root.Remove(".blocked"); err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return ErrCleanup
			}
		}
		if _, err := m.owner.WriteAt([]byte{0}, 0); err != nil {
			return ErrCleanup
		}
	}
	return nil
}
func (m *Manager) run() {
	defer close(m.done)
	timer := time.NewTicker(time.Second)
	defer timer.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-timer.C:
			_ = m.Sweep()
		}
	}
}
func (m *Manager) markBlocked() {
	if !m.blocked {
		slog.Warn("generation_evidence_cleanup_failed")
	}
	m.blocked = true
	m.counters.cleanupFailed.Add(1)
	// A pre-opened latch still works when creating a new marker is denied.
	// If the filesystem is entirely unavailable, errors remain explicit.
	_, _ = m.owner.WriteAt([]byte{'B'}, 0)
	// Readers fail closed on this control marker; never include paths in errors.
	f, err := m.disk.root.OpenFile(".blocked", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err == nil {
		_ = f.Close()
	}
}
func (m *Manager) revoke(b *Bundle) error {
	b.revoked.Store(true)
	if b.cancel != nil {
		b.cancel()
	}
	if b.wake != nil {
		select {
		case b.wake <- struct{}{}:
		default:
		}
	}
	if err := m.remove(b.manifest); err != nil {
		m.markBlocked()
		return ErrCleanup
	}
	delete(m.entries, b.manifest.ID)
	return nil
}
func (m *Manager) evictOldest() error {
	var oldest *Bundle
	for _, b := range m.entries {
		if oldest == nil || b.manifest.Admission < oldest.manifest.Admission {
			oldest = b
		}
	}
	if oldest == nil {
		return nil
	}
	return m.revoke(oldest)
}

// Admit is after server-side identity resolution, before Start. It may do small
// private tmpfs admission IO; streaming/content callbacks never acquire this lock.
func (m *Manager) Admit(kind, accountID, requestID string, started time.Time) *Bundle {
	if m == nil || kind != "account" || accountID != DedicatedAccountID {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	accepted := false
	defer func() {
		if !accepted {
			m.counters.rejected.Add(1)
		}
	}()
	if m.closing.Load() || m.closed || m.blocked || gt.SafeID(requestID) != requestID || requestID == "" {
		return nil
	}
	if err := m.disk.acquire(); err != nil {
		return nil
	}
	defer m.disk.release()
	now := m.now()
	if started.IsZero() || started.After(now) || !now.Before(started.Add(Retention)) {
		return nil
	}
	if len(m.entries) >= MaxBundles {
		if m.evictOldest() != nil {
			return nil
		}
	}
	m.admission++
	id := uuid.NewString()
	mf := Manifest{Schema: SchemaVersion, ID: id, AccountID: accountID, RequestID: requestID, Admission: m.admission, CreatedAt: started.UTC(), ExpiresAt: started.Add(Retention).UTC(), Fingerprint: m.opts.Fingerprint}
	data, _ := json.Marshal(Record{Manifest: &mf})
	wire := encodeLine(1, "", data)
	f, err := m.disk.root.OpenFile(id+".jsonl", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil
	}
	_, writeErr := f.Write(wire)
	closeErr := f.Close()
	if writeErr != nil || closeErr != nil {
		if m.remove(mf) != nil {
			m.markBlocked()
		}
		return nil
	}
	b := &Bundle{manager: m, manifest: mf, deadline: started.Add(Retention), queue: make(chan []byte, queueSlots), wake: make(chan struct{}, 1), done: make(chan struct{}), reserved: len(wire) + guardBudget, metadata: len(wire), sequence: 1, previous: Digest(data)}
	b.ctx, b.cancel = context.WithCancel(m.captureContext)
	m.entries[id] = b
	accepted = true
	m.counters.admitted.Add(1)
	go b.writeLoop()
	go func() {
		<-b.ctx.Done()
		b.mu.Lock()
		b.clearPending()
		b.mu.Unlock()
		select {
		case b.wake <- struct{}{}:
		default:
		}
	}()
	return b
}
func (b *Bundle) ID() string {
	if b == nil {
		return ""
	}
	return b.manifest.ID
}
func (b *Bundle) alive() bool {
	return b != nil && !b.manager.closing.Load() && !b.revoked.Load() && (b.ctx == nil || b.ctx.Err() == nil) && time.Now().Before(b.deadline)
}
func (b *Bundle) Revocation() <-chan struct{} {
	if b == nil || b.ctx == nil {
		return nil
	}
	return b.ctx.Done()
}
func (b *Bundle) clearPending() {
	for {
		select {
		case data := <-b.queue:
			clear(data)
		default:
			return
		}
	}
}
func (b *Bundle) submit(record Record, category string) {
	if !b.alive() || b.queue == nil {
		return
	}
	// Bound allocations before encoding caller-controlled content. Model fragments
	// are small (guard-owned); an oversized valid spec only truncates diagnostics.
	if record.Chunk != nil && len(record.Chunk.Text) > 4096 {
		b.drop(uint64(len(record.Chunk.Text)), true)
		return
	}
	if record.Spec != nil {
		n := len(record.Spec.ProviderModelID)
		for _, e := range record.Spec.Entries {
			n += len(e)
		}
		if n > 8<<10 {
			b.drop(uint64(n), true)
			return
		}
	}
	body, err := json.Marshal(record)
	if err != nil {
		b.drop(0, true)
		return
	}
	// Journal wrapping uses ~190 bytes; fixed reserve safely bounds sequence/hash.
	cost := len(body) + 256
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.alive() {
		return
	}
	limit := MaxBytes - finalBudget
	if category == "final" {
		limit = MaxBytes
	}
	if b.reserved+cost > limit || category == "metadata" && b.metadata+cost > metadataBudget || category == "final" && b.final+cost > finalBudget {
		b.dropped(uint64(len(body)), true)
		return
	}
	select {
	case b.queue <- body:
		b.accepted++
		b.reserved += cost
		if category == "metadata" {
			b.metadata += cost
		}
		if category == "final" {
			b.final += cost
		}
	default:
		b.dropped(uint64(len(body)), false)
	}
}
func (b *Bundle) drop(n uint64, truncated bool) {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.dropped(n, truncated)
}
func (b *Bundle) Event(e gt.Event) {
	if !b.alive() {
		return
	}
	// Private content retention needs stage boundaries and the failure summary,
	// not another copy of every sub-check or successful browser write. Those
	// remain in normal content-free logs; model chunks are retained separately.
	if e.Kind == "check_begin" || e.Kind == "check_end" ||
		e.Kind == "fact" && e.Fact.Stage == gt.Delivery.String() &&
			e.Fact.Check == "delta" && e.Fact.Detail.Reason == "" {
		return
	}
	// Raw fragments already preserve every content byte. Keep latest repetitive
	// progress counters, without spending the metadata reserve on every token.
	slot := -1
	if e.Kind == "fact" && e.Fact.Stage == gt.ProviderStream.String() && e.Fact.Detail.Reason == "" {
		if e.Fact.Check == "frame" {
			slot = 0
		}
		if e.Fact.Check == "content" {
			slot = 1
		}
	}
	if slot >= 0 {
		b.mu.Lock()
		b.progress[slot] = &e
		b.state.CoalescedProgress++
		b.mu.Unlock()
		return
	}
	if e.Kind == "provider" && e.Fact.Stage == gt.ProviderStream.String() && e.Provider != nil {
		p := e.Provider
		if !p.ErrorPresent && !p.UsageProvided && p.FinishReason == "not_provided" && p.SyntaxOffset < 0 {
			b.mu.Lock()
			previous := b.progress[2]
			same := false
			if previous != nil {
				a, c := *previous.Provider, *p
				a.Frame, c.Frame = 0, 0
				a.Bytes, c.Bytes = 0, 0
				same = a == c
			}
			b.progress[2] = &e
			if same {
				b.state.CoalescedProgress++
			}
			b.mu.Unlock()
			if same {
				return
			}
		}
	}
	b.submit(Record{Event: &e}, "metadata")
}
func (b *Bundle) Summary(s gt.Summary) {
	if b == nil {
		return
	}
	b.mu.Lock()
	state := b.state
	var progress []gt.Event
	for _, e := range b.progress {
		if e != nil {
			progress = append(progress, *e)
		}
	}
	b.mu.Unlock()
	b.submit(Record{Summary: &s, State: &state, Progress: progress}, "final")
}
func (b *Bundle) EffectiveSpec(s gt.EffectiveSpec) {
	if b == nil {
		return
	}
	// Only called after successful Start. Defensive generic credential rejection;
	// the provider boundary is responsible for exact-key and cross-chunk filtering.
	if suspect(s.ProviderModelID) {
		b.drop(0, true)
		return
	}
	if len(s.Entries) > 1024 {
		b.drop(0, true)
		return
	}
	s.Entries = append([]string(nil), s.Entries...)
	b.submit(Record{Spec: &s}, "metadata")
}
func suspect(value string) bool {
	v := strings.ToLower(value)
	for _, prefix := range []string{"sk-", "bearer ", "authorization:", "password=", "api_key="} {
		if strings.Contains(v, prefix) {
			return true
		}
	}
	return false
}
func (b *Bundle) ModelChunk(chunk gt.ModelChunk) {
	if b == nil {
		return
	}
	if chunk.Redacted {
		b.mu.Lock()
		b.state.Redacted = true
		b.mu.Unlock()
	}
	b.submit(Record{Chunk: &chunk}, "content")
}
func (b *Bundle) ModelEnd(end gt.ModelEnd) {
	if b == nil {
		return
	}
	b.mu.Lock()
	b.state.ModelEnded = true
	b.state.Redacted = b.state.Redacted || end.Redacted
	b.state.Unavailable = b.state.Unavailable || end.Unavailable
	b.exact = !b.state.Redacted && !b.state.Unavailable
	b.mu.Unlock()
	b.submit(Record{ModelEnd: &end}, "final")
}
func (b *Bundle) Processing(p gt.Processing) {
	if b == nil || !b.ByteExact() || (p.Kind != "candidate" && p.Kind != "validated" && p.Kind != "passage_deltas") || !digestValid(p.SHA256) {
		return
	}
	b.submit(Record{Processing: &p}, "metadata")
}
func (b *Bundle) ByteExact() bool {
	if !b.alive() {
		return false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.exact && !b.state.Truncated && b.state.DroppedRecords == 0 && !b.state.IOFailed
}
func (b *Bundle) writeLoop() {
	defer close(b.done)
	defer b.cancel()
	defer func() {
		b.clearPending()
	}()
	for {
		select {
		case <-b.wake:
			if !b.alive() {
				return
			}
		case data := <-b.queue:
			if !b.alive() {
				clear(data)
				return
			}
			b.manager.mu.Lock()
			if !b.alive() || b.manager.blocked || b.manager.closed {
				b.manager.mu.Unlock()
				clear(data)
				return
			}
			err := b.append(data)
			// An inspector holds the journal lock only briefly. Retry off the
			// streaming path; contention is not corruption or a model failure.
			retryUntil := time.Now().Add(time.Second)
			for errors.Is(err, ErrBusy) && b.alive() && time.Now().Before(retryUntil) {
				timer := time.NewTimer(5 * time.Millisecond)
				select {
				case <-timer.C:
				case <-b.wake:
				}
				timer.Stop()
				if !b.alive() {
					break
				}
				err = b.append(data)
			}
			b.manager.mu.Unlock()
			clear(data)
			if err != nil {
				if !b.alive() {
					return
				}
				slog.Warn("generation_evidence_write_failed")
				b.manager.counters.writeFailed.Add(1)
				b.mu.Lock()
				b.state.IOFailed = true
				b.mu.Unlock()
				b.revoked.Store(true)
				b.manager.mu.Lock()
				b.manager.markBlocked()
				b.manager.mu.Unlock()
				return
			}
		}
	}
}
func (b *Bundle) append(data []byte) error {
	d := b.manager.disk
	if err := d.acquire(); err != nil {
		return err
	}
	defer d.release()
	name := b.manifest.ID + ".jsonl"
	f, err := d.root.OpenFile(name, os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			b.revoked.Store(true)
		}
		return ErrUnavailable
	}
	defer f.Close()
	if !d.validFile(name, f) {
		return ErrUnsafe
	}
	info, err := f.Stat()
	if err != nil {
		return ErrUnsafe
	}
	wire := encodeLine(b.sequence+1, b.previous, data)
	if info.Size()+int64(len(wire)) > MaxBytes {
		return ErrUnsafe
	}
	if !b.alive() {
		return ErrUnavailable
	}
	if _, err = f.Write(wire); err != nil {
		return ErrUnavailable
	}
	var record Record
	if json.Unmarshal(data, &record) == nil && record.Summary != nil && record.State != nil {
		state := record.State
		switch {
		case state.Truncated || state.DroppedRecords > 0 || state.IOFailed || state.Redacted || state.Unavailable:
			b.manager.counters.incomplete.Add(1)
		case !state.ModelEnded:
			b.manager.counters.metadataOnly.Add(1)
		default:
			b.manager.counters.complete.Add(1)
		}
	}
	b.sequence++
	b.previous = Digest(append([]byte(b.previous), data...))
	return nil
}
func (m *Manager) Sweep() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed || m.closing.Load() {
		return nil
	}
	if err := m.disk.acquire(); err != nil {
		return err
	}
	defer m.disk.release()
	for _, b := range m.entries {
		if b.revoked.Load() || !m.now().Before(b.deadline) {
			if err := m.revoke(b); err != nil {
				return err
			}
		}
	}
	if m.blocked {
		if err := m.disk.root.Remove(".blocked"); err != nil && !errors.Is(err, os.ErrNotExist) {
			return ErrCleanup
		}
		m.blocked = false
		if _, err := m.owner.WriteAt([]byte{0}, 0); err != nil {
			m.markBlocked()
			return ErrCleanup
		}
	}
	return nil
}
func (m *Manager) RevokeAccount(accountID string) error {
	if m == nil || accountID != DedicatedAccountID {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return m.Close(ctx)
}
func (m *Manager) Close(ctx context.Context) error {
	if m == nil {
		return nil
	}
	// Revoke callbacks immediately, even while filesystem IO is stalled.
	m.closeOnce.Do(func() { m.closing.Store(true); m.cancelCapture(); go m.close() })
	select {
	case <-m.closeDone:
		return m.closeErr
	case <-ctx.Done():
		return ErrCleanup
	}
}
func (m *Manager) close() {
	defer close(m.closeDone)
	m.mu.Lock()
	m.closed = true
	close(m.stop)
	var workers []*Bundle
	for _, b := range m.entries {
		b.revoked.Store(true)
		if b.wake != nil {
			select {
			case b.wake <- struct{}{}:
			default:
			}
		}
		workers = append(workers, b)
	}
	err := m.disk.acquire()
	if err == nil {
		for _, b := range workers {
			if e := m.remove(b.manifest); e != nil {
				err = e
				m.markBlocked()
			} else {
				delete(m.entries, b.manifest.ID)
			}
		}
		m.disk.release()
	} else {
		m.markBlocked()
	}
	m.mu.Unlock()
	// The caller has a bounded wait; cleanup remains revoked if IO takes longer.
	for _, b := range workers {
		<-b.done
	}
	<-m.done
	m.mu.Lock()
	m.owner.Close()
	m.disk.close()
	m.mu.Unlock()
	m.closeErr = err
}
func (m *Manager) IDs() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]string, 0, len(m.entries))
	for id := range m.entries {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}
