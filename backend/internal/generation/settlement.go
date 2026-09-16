package generation

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/generationtrace"
)

// Status is internal: pending must never be projected as a confirmed refund.
type FailureOutcome struct {
	Status        string
	QuotaRefunded bool
	Transitioned  bool
}

func (service *Service) ReconcileFailure(ctx context.Context, runID uuid.UUID, status, code string) (result FailureOutcome, resultErr error) {
	trace := service.registry.Trace(runID)
	ctx = generationtrace.With(ctx, trace)
	trace.Begin(generationtrace.Settlement)
	trace.Check(generationtrace.Settlement, "cas", -1)
	defer func() {
		trace.Settled(result.Status, result.QuotaRefunded)
		finishTrace(ctx, generationtrace.Settlement, resultErr)
	}()
	if status != "provider_failed" && status != "server_failed" && status != "stream_failed" && status != "validation_failed" {
		return FailureOutcome{Status: "pending"}, errors.New("invalid generation failure status")
	}
	failure := service.registry.rememberFailure(runID, status, code)
	err := service.CompleteFailure(ctx, runID, failure.Status, failure.Code)
	if err == nil {
		return FailureOutcome{Status: "failed", QuotaRefunded: true, Transitioned: true}, nil
	}
	// A lost commit acknowledgement or a competing CAS cannot be interpreted
	// from the write error alone. Only the persisted terminal row is authoritative.
	var persisted string
	trace.Note(generationtrace.Settlement, "confirm", generationtrace.Why("transaction_unknown"))
	var charged, cumulative bool
	readErr := service.app.QueryRow(ctx, `SELECT call_status, quota_charged, counts_toward_cumulative
		FROM wordweave.generation_runs WHERE id=$1`, runID).Scan(&persisted, &charged, &cumulative)
	if errors.Is(readErr, pgx.ErrNoRows) {
		service.registry.SetStatus(runID, "gone")
		return FailureOutcome{Status: "gone"}, nil
	}
	if readErr != nil {
		return FailureOutcome{Status: "pending"}, errors.Join(err, readErr)
	}
	var outcome FailureOutcome
	switch persisted {
	case "user_cancelled":
		outcome.Status = "cancelled"
	case "valid":
		outcome.Status = "valid"
	case "provider_failed", "server_failed", "stream_failed", "validation_failed":
		if charged || cumulative {
			return FailureOutcome{Status: "pending"}, errors.New("generation settlement invariant violated")
		}
		outcome = FailureOutcome{Status: "failed", QuotaRefunded: true}
	default:
		return FailureOutcome{Status: "pending"}, err
	}
	service.registry.SetStatus(runID, outcome.Status)
	return outcome, nil
}

// Runs under the maintenance caller's whole-batch timeout, never retries AI.
func (service *Service) RetryPendingFailures(ctx context.Context, limit int) {
	for _, failure := range service.registry.PendingFailures(limit) {
		if ctx.Err() != nil {
			return
		}
		outcome, err := service.ReconcileFailure(ctx, failure.RunID, failure.Status, failure.Code)
		if err != nil {
			slog.ErrorContext(ctx, "ai_generation_settlement_failed", "run_id", failure.RunID.String(), "stage", "settlement", "reason", "database_settlement_failed", "outcome", "pending")
			continue
		}
		slog.InfoContext(ctx, "ai_generation_settlement_recovered", "run_id", failure.RunID.String(), "stage", "settlement", "outcome", outcome.Status, "quota_refunded", outcome.QuotaRefunded)
	}
}
