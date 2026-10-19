package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"wordweave/internal/ai"
	"wordweave/internal/generation"
)

func (s *Server) settlePreview(id uuid.UUID, code string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	status, err := s.generation.SettlePreview(ctx, id, "failed", code)
	if err != nil {
		s.generation.MarkSettlementUnknown(id, true)
		slog.ErrorContext(ctx, "preset_preview_settlement_failed", "preview_run_id", id.String())
		return "pending"
	}
	return status
}

func writePreviewFailure(w http.ResponseWriter, r *http.Request, seq *int, status, code string, retryable bool) {
	*seq++
	switch status {
	case "cancelled":
		_ = writeTracedSSE(r.Context(), w, "preview.cancelled", struct {
			Seq int `json:"seq"`
		}{*seq})
	case "pending":
		_ = writeTracedSSE(r.Context(), w, "preview.settlement_pending", struct {
			Seq       int    `json:"seq"`
			Code      string `json:"code"`
			RequestID string `json:"request_id"`
		}{*seq, "settlement_unconfirmed", requestID(r.Context())})
	default:
		_ = writeTracedSSE(r.Context(), w, "preview.failed", struct {
			Seq       int    `json:"seq"`
			Code      string `json:"code"`
			Retryable bool   `json:"retryable"`
			RequestID string `json:"request_id"`
		}{*seq, code, retryable, requestID(r.Context())})
	}
}

func (s *Server) adminPreviewStream(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "preset_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
		return
	}
	var body struct {
		Version uuid.UUID `json:"draft_version"`
		Mode    string    `json:"preview_content_mode"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	if body.Mode != "basic" && body.Mode != "enhanced" {
		s.writePresetProblem(w, r, generation.ErrInvalidInput)
		return
	}
	actor, _ := actorFromContext(r.Context())
	run, err := s.generation.StartPreviewMode(r.Context(), actor, id, body.Version, body.Mode)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	ctx, cancel := context.WithCancel(s.generation.UsageContext(r.Context(), run.ID, true))
	defer cancel()
	s.generation.PreviewRegistry().SetCancel(run.ID, cancel)
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	seq := 1
	streamID := uuid.NewString()
	if err = writeTracedSSE(r.Context(), w, "preview.started", struct {
		Seq                    int       `json:"seq"`
		ContractVersion        string    `json:"contract_version"`
		StreamID               string    `json:"stream_id"`
		ID                     uuid.UUID `json:"preview_run_id"`
		Token                  string    `json:"preview_token"`
		Version                uuid.UUID `json:"draft_version"`
		Mode                   string    `json:"preview_content_mode"`
		ContentService         any       `json:"content_service"`
		NativeCorrectionPolicy any       `json:"native_correction_policy"`
	}{seq, "m003-stream-v6", streamID, run.ID, run.Token, run.VersionID, run.Mode, run.Snapshot.ContentService, run.Snapshot.NativeCorrectionPolicy}); err != nil {
		s.settlePreview(run.ID, "browser_stream_failed")
		run.ReleaseCapacity()
		return
	}
	type pipelineEvent struct {
		name string
		data any
		ack  chan error
	}
	type pipelineResult struct {
		result generation.PipelineResult
		err    error
	}
	events := make(chan pipelineEvent)
	results := make(chan pipelineResult, 1)
	pipelineDone := make(chan struct{})
	emit := func(name string, data any) error {
		ack := make(chan error, 1)
		select {
		case events <- pipelineEvent{name, data, ack}:
		case <-ctx.Done():
			return ctx.Err()
		}
		select {
		case err := <-ack:
			return err
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	go func() {
		defer close(pipelineDone)
		result, pipelineErr := generation.ExecutePipeline(ctx, s.generation.Provider(), s.generation.Validator(), run.Spec, run.Snapshot.ContentService, generation.PipelineHooks{
			Progress: func(phase string) error {
				return emit("preview.progress", struct {
					Phase string `json:"phase"`
				}{phase})
			},
			Activity: func(activity string) error {
				return emit("preview.activity", struct {
					Activity string `json:"activity"`
				}{activity})
			},
			PlanItem: func(planID string, item ai.PlanItem) error {
				return emit("preview.plan_item", struct {
					PlanID          string      `json:"plan_id"`
					MeaningLanguage string      `json:"meaning_language"`
					Item            ai.PlanItem `json:"item"`
				}{planID, item.MeaningLanguage, item})
			},
			Edit: func(edit generation.PipelineEdit) error {
				return emit("preview.edit", edit)
			},
			Draft: func(draft generation.PipelineDraft) error {
				return emit("preview.draft", draft)
			},
			Review: func(_ int, review ai.Review, repairRequested bool) error {
				return s.generation.RecordReview(ctx, run.ID, true, review, repairRequested)
			},
			ReviewFailure: func(_ int) error {
				return s.generation.RecordReviewIndeterminate(ctx, run.ID, true)
			},
		})
		results <- pipelineResult{result, pipelineErr}
	}()
	defer releasePipelineAfterJoin(cancel, pipelineDone, pipelineJoinTimeout, run.ReleaseCapacity, func() {
		s.generation.MarkSettlementUnknown(run.ID, true)
	})
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			cancel()
			s.settlePreview(run.ID, "browser_disconnected")
			return
		case <-heartbeat.C:
			if err = writeTracedHeartbeat(r.Context(), w); err != nil {
				cancel()
				s.settlePreview(run.ID, "browser_stream_failed")
				return
			}
		case event := <-events:
			seq++
			payload, eventErr := withSequence(event.data, seq)
			if eventErr == nil {
				eventErr = writeTracedSSE(r.Context(), w, event.name, payload)
			}
			event.ack <- eventErr
			if eventErr != nil {
				cancel()
				s.settlePreview(run.ID, "browser_stream_failed")
				return
			}
		case pipeline := <-results:
			if pipeline.err != nil {
				phase := generation.PipelineFailurePhase(pipeline.err)
				code, retryable := providerFailureCode(pipeline.err), providerFailureRetryable(pipeline.err)
				if phase == "validation" {
					code, retryable = "content_validation_failed", true
				} else if phase == "delivery" {
					code, retryable = "browser_stream_failed", true
				} else if phase == "review_record" || phase == "usage_record" || phase == "pipeline" {
					code, retryable = "generation_failed", true
				}
				writePreviewFailure(w, r, &seq, s.settlePreview(run.ID, code), code, retryable)
				return
			}
			completeCtx, cancelComplete := context.WithTimeout(context.WithoutCancel(r.Context()), 10*time.Second)
			usage, completeErr := s.generation.CompletePreviewPipeline(completeCtx, run, pipeline.result)
			cancelComplete()
			if completeErr != nil {
				status := s.settlePreview(run.ID, "preview_publish_failed")
				if status != "valid" {
					writePreviewFailure(w, r, &seq, status, "generation_failed", true)
					return
				}
				readCtx, cancelRead := context.WithTimeout(context.Background(), 5*time.Second)
				usage, completeErr = s.generation.PreviewUsage(readCtx, run.ID)
				cancelRead()
				if completeErr != nil {
					writePreviewFailure(w, r, &seq, "pending", "settlement_unconfirmed", true)
					return
				}
			}
			seq++
			_ = writeTracedSSE(r.Context(), w, "preview.validated", struct {
				Seq                 int                     `json:"seq"`
				ID                  uuid.UUID               `json:"preview_run_id"`
				Version             uuid.UUID               `json:"draft_version"`
				Mode                string                  `json:"preview_content_mode"`
				FinalContentVersion int                     `json:"final_content_version"`
				Result              generationResultDTO     `json:"result"`
				ContentOutcome      string                  `json:"content_outcome"`
				CompletionNotice    *string                 `json:"completion_notice"`
				Usage               generation.UsageSummary `json:"usage"`
			}{seq, run.ID, run.VersionID, run.Mode, pipeline.result.Version, mapGenerationResult(pipeline.result.Batch), pipeline.result.Outcome, completionNotice(pipeline.result.Outcome), usage})
			return
		}
	}
}

func (s *Server) adminCancelPreview(w http.ResponseWriter, r *http.Request) {
	var body struct{}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "preview_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrRunNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	status, err := s.generation.CancelPreview(r.Context(), actor, id, r.Header.Get("X-Preview-Token"))
	if err != nil {
		if errors.Is(err, generation.ErrSettlementUnconfirmed) {
			s.generation.MarkSettlementUnknown(id, true)
			writeProblem(w, r, http.StatusServiceUnavailable, "settlement_unconfirmed", "Try again", "The preview status could not be confirmed.")
			return
		}
		s.writePresetProblem(w, r, err)
		return
	}
	if status == "pending" {
		s.generation.MarkSettlementUnknown(id, true)
		writeProblem(w, r, http.StatusServiceUnavailable, "settlement_unconfirmed", "Try again", "The preview status could not be confirmed.")
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		Status string `json:"status"`
	}{status})
}

func (s *Server) adminPreviewStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "preview_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrRunNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	view, err := s.generation.ReadPreviewStatus(r.Context(), actor, id, r.Header.Get("X-Preview-Token"))
	if err != nil {
		switch {
		case errors.Is(err, generation.ErrRunNotFound):
			writeProblem(w, r, http.StatusNotFound, "not_found", "Not found", "The preview could not be found.")
		case errors.Is(err, generation.ErrRunExpired):
			writeProblem(w, r, http.StatusGone, "capability_expired", "Preview expired", "The preview capability has expired.")
		default:
			writeProblem(w, r, http.StatusServiceUnavailable, "temporarily_unavailable", "Try again", "The preview status could not be confirmed.")
		}
		return
	}
	var result *generationResultDTO
	if view.Result != nil {
		mapped := mapGenerationResult(*view.Result)
		result = &mapped
	}
	writeJSON(w, r, http.StatusOK, struct {
		ContractVersion     string                  `json:"contract_version"`
		ID                  uuid.UUID               `json:"preview_run_id"`
		Status              string                  `json:"status"`
		Version             uuid.UUID               `json:"draft_version"`
		Mode                string                  `json:"preview_content_mode"`
		FinalContentVersion *int                    `json:"final_content_version"`
		Result              *generationResultDTO    `json:"result"`
		ContentOutcome      *string                 `json:"content_outcome"`
		CompletionNotice    *string                 `json:"completion_notice"`
		Usage               generation.UsageSummary `json:"usage"`
	}{"m003-stream-v6", view.PreviewRunID, view.Status, view.DraftVersion, view.PreviewContentMode, view.FinalContentVersion, result, view.ContentOutcome, view.CompletionNotice, view.Usage})
}
