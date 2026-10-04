package generation

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
)

type UsageCost struct {
	Amount string `json:"amount"`
	Unit   string `json:"unit"`
}
type UsageSummary struct {
	LogicalRuns   int64      `json:"logical_runs"`
	ProviderCalls int64      `json:"provider_calls"`
	InputTokens   *int64     `json:"input_tokens"`
	OutputTokens  *int64     `json:"output_tokens"`
	Cost          *UsageCost `json:"cost"`
	UnknownCalls  int64      `json:"unknown_calls"`
}
type usageRecorder struct {
	pool    *pgxpool.Pool
	run     uuid.UUID
	preview bool
	calls   atomic.Int32
}

func (s *Service) UsageContext(ctx context.Context, run uuid.UUID, preview bool) context.Context {
	return ai.WithUsageRecorder(ctx, &usageRecorder{pool: s.app, run: run, preview: preview})
}
func (r *usageRecorder) Begin(ctx context.Context, spec ai.GenerationSpec) (func(ai.Usage), error) {
	no := r.calls.Add(1)
	id := uuid.New()
	var user, preview *uuid.UUID
	if r.preview {
		preview = &r.run
	} else {
		user = &r.run
	}
	// Reserve an unknown observation before sending the provider request. Crashes
	// cannot turn an attempted call into a known zero or lose its existence.
	_, err := r.pool.Exec(ctx, `INSERT INTO wordweave.ai_call_usage(id,user_run_id,preview_run_id,call_no,model_snapshot,usage_status,completed_at) VALUES($1,$2,$3,$4,$5,'unknown',clock_timestamp())`, id, user, preview, no, spec.ProviderModelID)
	if err != nil {
		return nil, err
	}
	return func(u ai.Usage) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state := "partial"
		if u.InputTokens == nil && u.OutputTokens == nil && u.Cost == nil {
			state = "unknown"
		}
		if u.InputTokens != nil && u.OutputTokens != nil && u.Cost != nil {
			state = "known"
		}
		var currency *string
		if u.Cost != nil {
			v := "openrouter_credits"
			currency = &v
		}
		_, err := r.pool.Exec(ctx, `UPDATE wordweave.ai_call_usage SET provider_request_id=$2,input_tokens=$3,output_tokens=$4,cost_amount=$5::numeric,currency=$6,usage_status=$7,completed_at=clock_timestamp() WHERE id=$1`, id, u.RequestID, u.InputTokens, u.OutputTokens, u.Cost, currency, state)
		if err != nil {
			slog.ErrorContext(ctx, "ai_usage_persist_failed", "run_id", r.run.String(), "call_no", no)
		}
	}, nil
}

const usageAggregate = `count(*), CASE WHEN count(*)=count(input_tokens) THEN coalesce(sum(input_tokens),0)::bigint END, CASE WHEN count(*)=count(output_tokens) THEN coalesce(sum(output_tokens),0)::bigint END, CASE WHEN count(*)=count(cost_amount) THEN coalesce(sum(cost_amount),0)::text END, count(*) FILTER(WHERE usage_status<>'known')`

func readUsage(ctx context.Context, tx pgx.Tx, run uuid.UUID) (UsageSummary, error) {
	u := UsageSummary{LogicalRuns: 1}
	var cost *string
	err := tx.QueryRow(ctx, `SELECT `+usageAggregate+` FROM wordweave.ai_call_usage WHERE preview_run_id=$1`, run).Scan(&u.ProviderCalls, &u.InputTokens, &u.OutputTokens, &cost, &u.UnknownCalls)
	if cost != nil {
		u.Cost = &UsageCost{*cost, "openrouter_credits"}
	}
	return u, err
}
func (s *Service) PreviewUsage(ctx context.Context, run uuid.UUID) (UsageSummary, error) {
	tx, err := s.app.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return UsageSummary{}, err
	}
	defer tx.Rollback(ctx)
	return readUsage(ctx, tx, run)
}
