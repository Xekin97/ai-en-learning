package observability

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"wordweave/internal/capacity"
	gt "wordweave/internal/generationtrace"
)

func TestOBS042CActorLabelsAreFixedAndCaptureCountersExist(t *testing.T) {
	m := NewMetrics()
	for _, actor := range []string{"account", "visitor", "private-arbitrary-actor"} {
		trace := m.GenerationTrace("req_not_a_label")
		trace.BindActor(actor)
		trace.BindActor("visitor")
		trace.Finish()
	}
	w := httptest.NewRecorder()
	m.writeGeneration(w)
	raw := w.Body.String()
	for _, actor := range []string{"account", "visitor", "unknown"} {
		if !strings.Contains(raw, `wordweave_generation_requests_by_actor_total{stage="",result="`+actor+`"} 1`) {
			t.Fatal("actor missing or counted twice", raw)
		}
	}
	for _, counter := range []string{"admitted", "rejected", "complete_summaries", "incomplete_summaries", "metadata_only_summaries", "dropped_records", "dropped_bytes", "truncated", "write_failed", "cleanup_failed"} {
		if !strings.Contains(raw, "wordweave_generation_capture_"+counter+"_total 0") {
			t.Fatal("missing capture health metric", counter)
		}
	}
	if strings.Contains(raw, "private-arbitrary-actor") || strings.Contains(raw, "req_not_a_label") {
		t.Fatal("private metric label")
	}
}

func TestOBS042MetricsNoDynamicLabelsOrDoubleOutcome(t *testing.T) {
	m := NewMetrics()
	trace := m.GenerationTrace("req_not_a_label")
	trace.BindRun("run-not-a-label", "model-not-a-label")
	trace.Begin(gt.ProviderStream)
	trace.End(gt.ProviderStream, gt.OK, gt.Why(""))
	trace.Begin(gt.Preflight)
	trace.End(gt.Preflight, gt.Failed, gt.Why("generation_busy"))
	trace.Begin(gt.Delivery)
	trace.Note(gt.Delivery, "plan_item", gt.Why(""))
	trace.Note(gt.Delivery, "delta", gt.Why(""))
	trace.Settled("pending", false)
	trace.Confirm("valid", false)
	trace.Confirm("valid", false)
	trace.Note(gt.Delivery, "validated", gt.Why("flush_failed"))
	trace.End(gt.Delivery, gt.Failed, gt.Why("flush_failed"))
	trace.Finish()
	trace.Finish()
	w := httptest.NewRecorder()
	m.writeGeneration(w)
	raw := w.Body.String()
	for _, want := range []string{"wordweave_generation_in_flight 0", `wordweave_generation_requests_total{stage="",result=""} 1`, `wordweave_generation_confirmed_outcomes_total{stage="",result="valid"} 1`, `wordweave_generation_busy_total{stage="",result="generation_busy"} 1`, `wordweave_generation_first_browser_plan_total{stage="",result=""} 1`, `wordweave_generation_first_browser_content_total{stage="",result=""} 1`, `wordweave_generation_delivery_failures_total{stage="",result="flush_failed"} 1`, `wordweave_generation_settlement_attempts_total{stage="",result="pending"} 1`} {
		if !strings.Contains(raw, want) {
			t.Fatalf("missing %s in %s", want, raw)
		}
	}
	for _, private := range []string{"req_not_a_label", "run-not-a-label", "model-not-a-label"} {
		if strings.Contains(raw, private) {
			t.Fatal("high-cardinality label")
		}
	}
}

func TestGenerationCapacityMetricsExposeActiveBusyAndPreflightFacts(t *testing.T) {
	gate, err := capacity.New(capacity.Config{Global: 2, Preview: 1, Probe: 1, Preflight: 1, Connection: 1, RetryAfter: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	preflight, err := gate.TryAcquire(capacity.Preflight, "")
	if err != nil {
		t.Fatal(err)
	}
	preflight.Release()
	active, err := gate.TryAcquire(capacity.Generation, "connection-a")
	if err != nil {
		t.Fatal(err)
	}
	defer active.Release()
	if _, err = gate.TryAcquire(capacity.Generation, "connection-a"); err == nil {
		t.Fatal("connection limit should reject")
	}
	metrics := NewMetrics()
	metrics.BindCapacityGate(gate)
	w := httptest.NewRecorder()
	metrics.writeGeneration(w)
	raw := w.Body.String()
	for _, want := range []string{
		`wordweave_generation_capacity_active{kind="global"} 1`,
		`wordweave_generation_capacity_active{kind="connection"} 1`,
		`wordweave_generation_capacity_connection_groups_active 1`,
		`wordweave_generation_capacity_busy_total{reason="connection_limit"} 1`,
		`wordweave_generation_preflight_guard_completed_total 1`,
		`wordweave_generation_preflight_guard_duration_seconds_sum `,
	} {
		if !strings.Contains(raw, want) {
			t.Fatalf("missing %q in metrics:\n%s", want, raw)
		}
	}
}
