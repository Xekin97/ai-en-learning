// Package tracetest contains a memory-only sink for synthetic development tests.
package tracetest

import (
	"sync"
	"wordweave/internal/generationtrace"
)

type Recorder struct {
	mu        sync.Mutex
	events    []generationtrace.Event
	summaries []generationtrace.Summary
}

func (r *Recorder) Event(e generationtrace.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
}
func (r *Recorder) Summary(s generationtrace.Summary) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.summaries = append(r.summaries, s)
}
func (r *Recorder) Read() ([]generationtrace.Event, []generationtrace.Summary) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]generationtrace.Event(nil), r.events...), append([]generationtrace.Summary(nil), r.summaries...)
}
