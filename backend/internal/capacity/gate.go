package capacity

import (
	"context"
	"errors"
	"sync"
	"time"
)

var ErrBusy = errors.New("generation capacity is busy")

type Kind uint8

const (
	Generation Kind = iota
	Preview
	Probe
	Preflight
)

type Config struct {
	Global                 int
	Preview                int
	Probe                  int
	Preflight              int
	Connection             int
	RetryAfter             time.Duration
	ConnectionGroups       map[string]string
	DefaultConnectionGroup string
}

func (c Config) Valid() bool {
	return c.Global > 0 && c.Preview == 1 && c.Probe == 1 && c.Preflight > 0 && c.Connection > 0 && c.Connection <= c.Global && c.RetryAfter >= time.Second && c.RetryAfter <= 600*time.Second
}

// Gate performs a single all-or-none, zero-wait admission decision. A Lease is
// intentionally not copyable by API: release state is guarded by the Gate mutex.
type Gate struct {
	mu sync.Mutex
	c  Config

	draining           bool
	settlementHealthy  bool
	global             int
	preview            int
	probe              int
	preflight          int
	connections        map[string]int
	cooldowns          map[string]time.Time
	pendingUnknown     map[string]struct{}
	rejected           BusyCounts
	preflightCompleted uint64
	preflightDuration  time.Duration
}

func New(c Config) (*Gate, error) {
	if !c.Valid() {
		return nil, errors.New("invalid generation capacity configuration")
	}
	return &Gate{c: c, settlementHealthy: true, connections: make(map[string]int), cooldowns: make(map[string]time.Time), pendingUnknown: make(map[string]struct{})}, nil
}

type Lease struct {
	g        *Gate
	kind     Kind
	key      string
	acquired time.Time
	released bool // guarded by g.mu
}

type BusyCounts struct {
	Draining, Settlement, Preflight, Cooldown, ConnectionKey uint64
	Global, Connection, Preview, Probe                       uint64
}

func (l *Lease) Release() {
	if l == nil || l.g == nil {
		return
	}
	l.g.releaseLease(l)
}

func (g *Gate) TryAcquire(kind Kind, connectionKey string) (*Lease, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.draining {
		g.rejected.Draining++
		return nil, ErrBusy
	}
	if !g.settlementHealthy {
		g.rejected.Settlement++
		return nil, ErrBusy
	}
	if kind == Preflight {
		if g.preflight >= g.c.Preflight {
			g.rejected.Preflight++
			return nil, ErrBusy
		}
		g.preflight++
		return &Lease{g: g, kind: kind, acquired: time.Now()}, nil
	}
	connectionKey = g.connectionGroup(connectionKey)
	if until := g.cooldowns[connectionKey]; !until.IsZero() {
		if time.Now().Before(until) {
			g.rejected.Cooldown++
			return nil, ErrBusy
		}
		delete(g.cooldowns, connectionKey)
	}
	if connectionKey == "" {
		g.rejected.ConnectionKey++
		return nil, ErrBusy
	}
	if g.global >= g.c.Global {
		g.rejected.Global++
		return nil, ErrBusy
	}
	if g.connections[connectionKey] >= g.c.Connection {
		g.rejected.Connection++
		return nil, ErrBusy
	}
	if kind == Preview && g.preview >= g.c.Preview {
		g.rejected.Preview++
		return nil, ErrBusy
	}
	if kind == Probe && g.probe >= g.c.Probe {
		g.rejected.Probe++
		return nil, ErrBusy
	}
	g.global++
	g.connections[connectionKey]++
	if kind == Preview {
		g.preview++
	}
	if kind == Probe {
		g.probe++
	}
	return &Lease{g: g, kind: kind, key: connectionKey, acquired: time.Now()}, nil
}

func (g *Gate) releaseLease(lease *Lease) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if lease.g != g || lease.released {
		return
	}
	lease.released = true
	g.releaseLocked(lease.kind, lease.key, lease.acquired)
}

func (g *Gate) releaseLocked(kind Kind, key string, acquired time.Time) {
	if kind == Preflight {
		if g.preflight > 0 {
			g.preflight--
			g.preflightCompleted++
			if !acquired.IsZero() {
				g.preflightDuration += time.Since(acquired)
			}
		}
		return
	}
	if g.global > 0 {
		g.global--
	}
	if g.connections[key] <= 1 {
		delete(g.connections, key)
	} else {
		g.connections[key]--
	}
	if kind == Preview && g.preview > 0 {
		g.preview--
	}
	if kind == Probe && g.probe > 0 {
		g.probe--
	}
}

// ReleaseUnknown closes admission and relinquishes the lease under one mutex,
// so no new admission can slip between those state changes.
func (g *Gate) ReleaseUnknown(lease *Lease, pendingKey string) {
	if pendingKey == "" {
		if lease != nil {
			lease.Release()
		}
		return
	}
	g.mu.Lock()
	g.settlementHealthy = false
	g.pendingUnknown[pendingKey] = struct{}{}
	if lease != nil && lease.g == g && !lease.released {
		lease.released = true
		g.releaseLocked(lease.kind, lease.key, lease.acquired)
	}
	g.mu.Unlock()
}

func (g *Gate) MarkUnknown(pendingKey string) {
	if pendingKey == "" {
		return
	}
	g.mu.Lock()
	g.settlementHealthy = false
	g.pendingUnknown[pendingKey] = struct{}{}
	g.mu.Unlock()
}

func (g *Gate) SetSettlementHealthy(healthy bool) {
	g.mu.Lock()
	if !healthy {
		g.settlementHealthy = false
	} else if len(g.pendingUnknown) == 0 {
		g.settlementHealthy = true
	}
	g.mu.Unlock()
}

// ResolvePending records a database-confirmed pending fact. Admission reopens
// only after every unknown fact is resolved and the caller explicitly asks it
// to reopen, preventing a stale health probe from racing ReleaseUnknown.
func (g *Gate) ResolvePending(pendingKey string) {
	g.mu.Lock()
	delete(g.pendingUnknown, pendingKey)
	g.mu.Unlock()
}

// PendingKeys returns a stable copy for database reconciliation. Keys are
// deliberately opaque to the gate; the generation service owns their format.
func (g *Gate) PendingKeys() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	keys := make([]string, 0, len(g.pendingUnknown))
	for key := range g.pendingUnknown {
		keys = append(keys, key)
	}
	return keys
}

func (g *Gate) Cooldown(connectionKey string, duration time.Duration) {
	connectionKey = g.connectionGroup(connectionKey)
	if connectionKey == "" {
		return
	}
	if duration <= 0 {
		duration = 30 * time.Second
	}
	if duration > 600*time.Second {
		duration = 600 * time.Second
	}
	g.mu.Lock()
	until := time.Now().Add(duration)
	if until.After(g.cooldowns[connectionKey]) {
		g.cooldowns[connectionKey] = until
	}
	g.mu.Unlock()
}

func (g *Gate) connectionGroup(key string) string {
	if group := g.c.ConnectionGroups[key]; group != "" {
		return group
	}
	if g.c.DefaultConnectionGroup != "" {
		return g.c.DefaultConnectionGroup
	}
	return key
}

func (g *Gate) SetDraining(draining bool) {
	g.mu.Lock()
	g.draining = draining
	g.mu.Unlock()
}

func (g *Gate) WaitIdle(ctx context.Context) error {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for {
		snapshot := g.Snapshot()
		if snapshot.Global == 0 && snapshot.Preflight == 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func (g *Gate) RetryAfterSeconds() int {
	seconds := int(g.c.RetryAfter / time.Second)
	if seconds < 1 {
		return 1
	}
	return seconds
}

type Snapshot struct {
	Global, Preview, Probe, Preflight, Connection int
	ConnectionGroups                              int
	SettlementHealthy, Draining                   bool
	PendingUnknown                                int
	Rejected                                      BusyCounts
	PreflightCompleted                            uint64
	PreflightDuration                             time.Duration
}

func (g *Gate) Snapshot() Snapshot {
	g.mu.Lock()
	defer g.mu.Unlock()
	snapshot := Snapshot{
		Global: g.global, Preview: g.preview, Probe: g.probe, Preflight: g.preflight,
		ConnectionGroups: len(g.connections), SettlementHealthy: g.settlementHealthy,
		Draining: g.draining, PendingUnknown: len(g.pendingUnknown), Rejected: g.rejected,
		PreflightCompleted: g.preflightCompleted, PreflightDuration: g.preflightDuration,
	}
	for _, active := range g.connections {
		snapshot.Connection += active
	}
	return snapshot
}
