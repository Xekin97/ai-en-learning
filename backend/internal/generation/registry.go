package generation

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"wordweave/internal/generationtrace"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

var ErrRunNotFound = errors.New("generation run not found")

// TerminalTokenRetention is the existing one-hour terminal retry window.
const TerminalTokenRetention = time.Hour

type registryEntry struct {
	actor       identity.Actor
	tokenDigest []byte
	cancel      context.CancelFunc
	status      string
	updatedAt   time.Time
	pending     *PendingFailure
	trace       *generationtrace.Trace // Safe metadata only; no generated text.
}

type Registry struct {
	mutex sync.RWMutex
	key   []byte
	runs  map[uuid.UUID]*registryEntry
}

func NewRegistry(key []byte) *Registry {
	return &Registry{key: append([]byte(nil), key...), runs: make(map[uuid.UUID]*registryEntry)}
}

func (registry *Registry) Register(runID uuid.UUID, actor identity.Actor, token string) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	registry.runs[runID] = &registryEntry{
		actor: actor, tokenDigest: security.Digest(registry.key, "generation-token-v1", token),
		status: "active", updatedAt: time.Now(),
	}
}

func (registry *Registry) SetCancel(runID uuid.UUID, cancel context.CancelFunc) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if entry := registry.runs[runID]; entry != nil {
		entry.cancel = cancel
	}
}

func (registry *Registry) Authenticate(runID uuid.UUID, actor identity.Actor, token string) (string, context.CancelFunc, error) {
	registry.mutex.RLock()
	defer registry.mutex.RUnlock()
	entry := registry.runs[runID]
	if entry == nil || entry.actor.Kind != actor.Kind || entry.actor.ID != actor.ID ||
		!security.EqualDigest(entry.tokenDigest, security.Digest(registry.key, "generation-token-v1", token)) {
		return "", nil, ErrRunNotFound
	}
	return entry.status, entry.cancel, nil
}

func (registry *Registry) SetStatus(runID uuid.UUID, status string) {
	registry.mutex.Lock()
	var trace *generationtrace.Trace
	if entry := registry.runs[runID]; entry != nil {
		trace = entry.trace
		entry.status = status
		entry.cancel = nil
		entry.pending = nil
		entry.updatedAt = time.Now()
	}
	registry.mutex.Unlock()
	trace.Confirm(status, status == "failed")
}

func (registry *Registry) AttachTrace(runID uuid.UUID, trace *generationtrace.Trace) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	if entry := registry.runs[runID]; entry != nil && entry.trace == nil {
		entry.trace = trace
	}
}
func (registry *Registry) Trace(runID uuid.UUID) *generationtrace.Trace {
	registry.mutex.RLock()
	defer registry.mutex.RUnlock()
	if entry := registry.runs[runID]; entry != nil {
		return entry.trace
	}
	return nil
}

// PendingFailure contains only server-owned settlement metadata, never content.
type PendingFailure struct {
	RunID       uuid.UUID
	Status      string
	Code        string
	LastAttempt time.Time
}

func (registry *Registry) rememberFailure(runID uuid.UUID, status, code string) PendingFailure {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	failure := PendingFailure{RunID: runID, Status: status, Code: code, LastAttempt: time.Now()}
	if entry := registry.runs[runID]; entry != nil && entry.status == "active" {
		if entry.pending == nil {
			entry.pending = &failure
		} else {
			entry.pending.LastAttempt = failure.LastAttempt
		}
		return *entry.pending
	}
	return failure
}

// Oldest attempt first prevents a persistent failing row starving other refunds.
func (registry *Registry) PendingFailures(limit int) []PendingFailure {
	registry.mutex.RLock()
	defer registry.mutex.RUnlock()
	if limit <= 0 {
		return nil
	}
	var pending []PendingFailure
	for _, entry := range registry.runs {
		if entry.pending != nil {
			pending = append(pending, *entry.pending)
		}
	}
	sort.Slice(pending, func(i, j int) bool { return pending[i].LastAttempt.Before(pending[j].LastAttempt) })
	if len(pending) > limit {
		pending = pending[:limit]
	}
	return pending
}

func (registry *Registry) PurgeOlderThan(cutoff time.Time) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	for runID, entry := range registry.runs {
		if entry.status != "active" && entry.updatedAt.Before(cutoff) {
			delete(registry.runs, runID)
		}
	}
}

func (registry *Registry) CancelAll() {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	for _, entry := range registry.runs {
		if entry.status == "active" && entry.cancel != nil {
			entry.cancel()
		}
	}
}

func (registry *Registry) CancelActor(actor identity.Actor) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	for _, entry := range registry.runs {
		if entry.status == "active" && entry.actor.Kind == actor.Kind && entry.actor.ID == actor.ID && entry.cancel != nil {
			entry.cancel()
		}
	}
}
