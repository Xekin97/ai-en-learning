package observability

import (
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"sync"

	"wordweave/internal/generationevidence"
	"wordweave/internal/generationtrace"
)

type generationKey struct{ name, stage, result string }
type generationMetrics struct {
	mu       sync.Mutex
	inflight int64
	values   map[generationKey]float64
	capture  *generationevidence.Manager
}

func (m *Metrics) BindGenerationCapture(capture *generationevidence.Manager) {
	m.generation.mu.Lock()
	m.generation.capture = capture
	m.generation.mu.Unlock()
}

func (m *Metrics) GenerationTrace(requestID string) *generationtrace.Trace {
	g := &m.generation
	g.mu.Lock()
	if g.values == nil {
		g.values = make(map[generationKey]float64)
	}
	g.inflight++
	g.values[generationKey{name: "requests_total"}]++
	g.mu.Unlock()
	return generationtrace.New(requestID, g)
}
func (g *generationMetrics) Event(e generationtrace.Event) {
	g.mu.Lock()
	add := func(name, stage, result string, value float64) { g.values[generationKey{name, stage, result}] += value }
	switch e.Kind {
	case "actor_resolved":
		add("requests_by_actor_total", "", e.ActorKind, 1)
	case "stage_end":
		add("stage_total", e.Fact.Stage, string(e.Fact.State), 1)
		add("stage_duration_seconds_sum", e.Fact.Stage, string(e.Fact.State), float64(e.Fact.DurationMS)/1000)
		if e.Fact.State == generationtrace.Failed || e.Fact.State == generationtrace.Cancelled {
			add("failure_total", e.Fact.Stage, e.Fact.Detail.Reason, 1)
		}
	case "outcome_confirmed":
		add("confirmed_outcomes_total", "", e.Outcome, 1)
		if e.Refunded {
			add("confirmed_refunds_total", "", "", 1)
		}
	case "settlement":
		add("settlement_attempts_total", "", e.Outcome, 1)
		if e.Late && e.Outcome != "pending" && e.Outcome != "unknown" {
			add("late_settlement_attempts_total", "", e.Outcome, 1)
		}
	case "settlement_recovered":
		add("settlements_recovered_total", "", e.Outcome, 1)
	case "first_provider_content", "first_browser_content":
		add(e.Kind+"_seconds_sum", "", "", float64(e.ElapsedMS)/1000)
		add(e.Kind+"_total", "", "", 1)
	case "fact":
		if e.Fact.Stage == "provider_stream" && e.Fact.Check == "termination" {
			add("provider_terminations_total", "", e.Fact.Detail.Reason, 1)
		}
		if e.Fact.Stage == "delivery" && e.Fact.Detail.Reason != "" {
			add("delivery_failures_total", "", e.Fact.Detail.Reason, 1)
		}
	}
	g.mu.Unlock()
	// Only Trace-sanitized values; never an error string or arbitrary payload.
	slog.Info("generation_trace", "event", e)
}
func (g *generationMetrics) Summary(s generationtrace.Summary) {
	g.mu.Lock()
	g.inflight--
	g.values[generationKey{name: "request_duration_seconds_sum"}] += float64(s.ElapsedMS) / 1000
	g.mu.Unlock()
	slog.Info("generation_summary", "summary", s)
}
func (m *Metrics) writeGeneration(w http.ResponseWriter) {
	g := &m.generation
	g.mu.Lock()
	values := make(map[generationKey]float64, len(g.values))
	keys := make([]generationKey, 0, len(g.values))
	for k, v := range g.values {
		values[k] = v
		keys = append(keys, k)
	}
	active := g.inflight
	capture := g.capture
	g.mu.Unlock()
	sort.Slice(keys, func(i, j int) bool {
		a, b := keys[i], keys[j]
		if a.name != b.name {
			return a.name < b.name
		}
		if a.stage != b.stage {
			return a.stage < b.stage
		}
		return a.result < b.result
	})
	fmt.Fprintln(w, "# TYPE wordweave_generation_in_flight gauge")
	fmt.Fprintf(w, "wordweave_generation_in_flight %d\n", active)
	last := ""
	for _, k := range keys {
		if k.name != last {
			fmt.Fprintf(w, "# TYPE wordweave_generation_%s counter\n", k.name)
			last = k.name
		}
		fmt.Fprintf(w, "wordweave_generation_%s{stage=%s,result=%s} %g\n", k.name, strconv.Quote(k.stage), strconv.Quote(k.result), values[k])
	}
	h := capture.Health()
	for _, v := range []struct {
		name  string
		value uint64
	}{
		{"admitted", h.Admitted}, {"rejected", h.Rejected}, {"complete_summaries", h.Complete}, {"incomplete_summaries", h.Incomplete}, {"metadata_only_summaries", h.MetadataOnly},
		{"dropped_records", h.DroppedRecords}, {"dropped_bytes", h.DroppedBytes}, {"truncated", h.Truncated}, {"write_failed", h.WriteFailed}, {"cleanup_failed", h.CleanupFailed},
	} {
		fmt.Fprintf(w, "# TYPE wordweave_generation_capture_%s_total counter\nwordweave_generation_capture_%s_total %d\n", v.name, v.name, v.value)
	}
}
