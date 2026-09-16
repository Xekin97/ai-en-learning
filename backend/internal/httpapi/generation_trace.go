package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"wordweave/internal/ai"
	"wordweave/internal/generationtrace"
)

func traceProviderResult(ctx context.Context, stage generationtrace.Stage, err error) {
	d, state := generationtrace.Why(""), generationtrace.OK
	if err != nil {
		state = generationtrace.Failed
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			state = generationtrace.Cancelled
		}
		failure := ai.DescribeFailure(err)
		d.Reason, d.Field, d.Target = failure.Reason, failure.Field, failure.Target
	}
	generationtrace.From(ctx).End(stage, state, d)
}

// The observer sees only event category, byte count and write/flush result.
// data (which can contain a capability token) is never passed to the trace.
func writeTracedSSE(ctx context.Context, writer http.ResponseWriter, event string, data any) error {
	check := "unknown"
	switch event {
	case "generation.started":
		check = "started"
	case "passage.delta":
		check = "delta"
	case "generation.validated":
		check = "validated"
	case "generation.failed":
		check = "failed"
	case "generation.cancelled":
		check = "cancelled"
	}
	count, reason, err := writeSSEParts(writer, event, data)
	recordDelivery(ctx, check, count, reason)
	return err
}
func recordDelivery(ctx context.Context, check string, count int, reason string) {
	trace := generationtrace.From(ctx)
	d := generationtrace.Why(reason)
	d.Actual = count
	if reason != "" {
		// A fact alone does not update the stage's current check. Keep the
		// failed event category in the terminal summary without adding a
		// check pair for every successful streaming delta.
		trace.Check(generationtrace.Delivery, check, -1)
	}
	trace.Note(generationtrace.Delivery, check, d)
	if reason != "" {
		trace.End(generationtrace.Delivery, generationtrace.Failed, d)
	}
}

func writeTracedHeartbeat(ctx context.Context, writer http.ResponseWriter) error {
	n, err := fmt.Fprint(writer, ": heartbeat\n\n")
	reason := ""
	if err != nil {
		reason = "write_failed"
	} else if err = flush(writer); err != nil {
		reason = "flush_failed"
	}
	recordDelivery(ctx, "heartbeat", n, reason)
	return err
}
func writeSSEParts(writer http.ResponseWriter, event string, data any) (int, string, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return 0, "write_failed", err
	}
	n, err := fmt.Fprintf(writer, "event: %s\ndata: %s\n\n", event, payload)
	if err != nil {
		return n, "write_failed", err
	}
	if err := flush(writer); err != nil {
		return n, "flush_failed", err
	}
	return n, "", nil
}
