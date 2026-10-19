package generation

import (
	"context"
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
	LogicalRuns            int64      `json:"logical_runs"`
	ProviderCalls          int64      `json:"provider_calls"`
	InputTokens            *int64     `json:"input_tokens"`
	OutputTokens           *int64     `json:"output_tokens"`
	Cost                   *UsageCost `json:"cost"`
	UnknownCalls           int64      `json:"unknown_calls"`
	InvocationUnknownCalls int64      `json:"invocation_unknown_calls"`
	NotInvokedCalls        int64      `json:"not_invoked_calls"`
}
type usageCallHandle struct {
	pool *pgxpool.Pool
	id   uuid.UUID
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
	handle, err := r.BeginCall(ctx, spec)
	if err != nil {
		return nil, err
	}
	return func(usage ai.Usage) {
		finishCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = handle.FinishUsage(finishCtx, usage)
	}, nil
}

func (r *usageRecorder) BeginCall(ctx context.Context, spec ai.GenerationSpec) (ai.UsageCallHandle, error) {
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
	stage, prompt := spec.UsageMetadata()
	reasons := spec.UsageReasonCodes()
	if reasons == nil {
		reasons = []string{}
	}
	reviewResult := "not_applicable"
	if stage == "content_review" {
		reviewResult = "pending"
	}
	_, err := r.pool.Exec(ctx, `INSERT INTO wordweave.ai_call_usage(id,user_run_id,preview_run_id,call_no,model_snapshot,usage_status,completed_at,call_stage,prompt_version,provider_invoked,review_result,reason_codes) VALUES($1,$2,$3,$4,$5,'unknown',clock_timestamp(),$6,$7,NULL,$8,$9)`, id, user, preview, no, spec.ProviderModelID, stage, prompt, reviewResult, reasons)
	if err != nil {
		return nil, err
	}
	return &usageCallHandle{pool: r.pool, id: id}, nil
}

func (s *Service) RecordReview(ctx context.Context, run uuid.UUID, preview bool, review ai.Review, repairRequested bool) error {
	result := review.Verdict
	reasons := []string{}
	seen := map[string]bool{}
	for _, issue := range review.Issues {
		code := "other_content"
		if issue.Code == ai.ReviewForcedWording {
			code = "forced_wording"
		}
		if issue.Code == ai.ReviewContradiction {
			code = "contradiction"
		}
		seen[code] = true
	}
	for _, code := range []string{"forced_wording", "contradiction", "other_content"} {
		if seen[code] {
			reasons = append(reasons, code)
		}
	}
	column := "user_run_id"
	if preview {
		column = "preview_run_id"
	}
	query := `UPDATE wordweave.ai_call_usage SET review_result=$2,reason_codes=$3,repair_requested=$4 WHERE id=(SELECT id FROM wordweave.ai_call_usage WHERE ` + column + `=$1 AND call_stage='content_review' AND review_result='pending' ORDER BY call_no DESC LIMIT 1)`
	tag, err := s.app.Exec(ctx, query, run, result, reasons, repairRequested)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrTerminalRace
	}
	return nil
}

func (s *Service) RecordReviewIndeterminate(ctx context.Context, run uuid.UUID, preview bool) error {
	column := "user_run_id"
	if preview {
		column = "preview_run_id"
	}
	query := `UPDATE wordweave.ai_call_usage SET review_result='indeterminate',reason_codes='{}',repair_requested=false WHERE id=(SELECT id FROM wordweave.ai_call_usage WHERE ` + column + `=$1 AND call_stage='content_review' AND review_result='pending' ORDER BY call_no DESC LIMIT 1)`
	tag, err := s.app.Exec(ctx, query, run)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrTerminalRace
	}
	return nil
}

func (h *usageCallHandle) MarkInvoked(ctx context.Context, value *bool) error {
	tag, err := h.pool.Exec(ctx, `UPDATE wordweave.ai_call_usage SET provider_invoked=$2 WHERE id=$1`, h.id, value)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrTerminalRace
	}
	return nil
}

func (h *usageCallHandle) FinishUsage(ctx context.Context, u ai.Usage) error {
	state := "partial"
	if u.InputTokens == nil && u.OutputTokens == nil && u.Cost == nil {
		state = "unknown"
	}
	if u.InputTokens != nil && u.OutputTokens != nil && u.Cost != nil {
		state = "known"
	}
	var currency *string
	if u.Cost != nil {
		value := "openrouter_credits"
		currency = &value
	}
	tag, err := h.pool.Exec(ctx, `UPDATE wordweave.ai_call_usage SET provider_request_id=$2,input_tokens=$3,output_tokens=$4,cost_amount=$5::numeric,currency=$6,usage_status=$7,completed_at=clock_timestamp() WHERE id=$1`, h.id, u.RequestID, u.InputTokens, u.OutputTokens, u.Cost, currency, state)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return ErrTerminalRace
	}
	return nil
}

const usageAggregate = `count(*) FILTER(WHERE provider_invoked IS TRUE), CASE WHEN count(*) FILTER(WHERE provider_invoked IS TRUE)=count(input_tokens) FILTER(WHERE provider_invoked IS TRUE) THEN coalesce(sum(input_tokens) FILTER(WHERE provider_invoked IS TRUE),0)::bigint END, CASE WHEN count(*) FILTER(WHERE provider_invoked IS TRUE)=count(output_tokens) FILTER(WHERE provider_invoked IS TRUE) THEN coalesce(sum(output_tokens) FILTER(WHERE provider_invoked IS TRUE),0)::bigint END, CASE WHEN count(*) FILTER(WHERE provider_invoked IS TRUE)=count(cost_amount) FILTER(WHERE provider_invoked IS TRUE) THEN coalesce(sum(cost_amount) FILTER(WHERE provider_invoked IS TRUE),0)::text END, count(*) FILTER(WHERE provider_invoked IS TRUE AND usage_status<>'known'), count(*) FILTER(WHERE provider_invoked IS NULL), count(*) FILTER(WHERE provider_invoked IS FALSE)`

func readUsage(ctx context.Context, tx pgx.Tx, run uuid.UUID) (UsageSummary, error) {
	u := UsageSummary{LogicalRuns: 1}
	var cost *string
	err := tx.QueryRow(ctx, `SELECT `+usageAggregate+` FROM wordweave.ai_call_usage WHERE preview_run_id=$1`, run).Scan(&u.ProviderCalls, &u.InputTokens, &u.OutputTokens, &cost, &u.UnknownCalls, &u.InvocationUnknownCalls, &u.NotInvokedCalls)
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
