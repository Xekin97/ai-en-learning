package generation

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"

	"wordweave/internal/ai"
	"wordweave/internal/generationtrace"
)

func finishTrace(ctx context.Context, stage generationtrace.Stage, err error) {
	state, reason := generationtrace.OK, ""
	if err != nil {
		state, reason = generationtrace.Failed, "unknown_internal"
		var pgError *pgconn.PgError
		if errors.As(err, &pgError) {
			reason = "database_failed"
		}
		switch {
		case errors.Is(err, context.Canceled):
			state, reason = generationtrace.Cancelled, "context_cancelled"
		case errors.Is(err, context.DeadlineExceeded):
			state, reason = generationtrace.Cancelled, "deadline_exceeded"
		case errors.Is(err, ErrInvalidInput):
			reason = "input_invalid"
		case errors.Is(err, ErrForbidden):
			reason = "actor_forbidden"
		case errors.Is(err, ErrQuotaExhausted):
			reason = "quota_exhausted"
		case errors.Is(err, ErrGenerationInProgress):
			reason = "generation_in_progress"
		case errors.Is(err, ErrGenerationUnavailable):
			reason = "generation_unavailable"
		case errors.Is(err, ErrTerminalRace):
			reason = "terminal_race"
		case errors.Is(err, ai.ErrInvalidCandidate):
			reason = "content_validation_failed"
		}
	}
	generationtrace.From(ctx).End(stage, state, generationtrace.Why(reason))
}
