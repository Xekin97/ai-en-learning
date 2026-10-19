package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"wordweave/internal/ai"
	"wordweave/internal/generation"
	"wordweave/internal/generationtrace"
)

func (server *Server) generationStream(writer http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	trace := generationtrace.From(request.Context())
	trace.Check(generationtrace.Request, "body", -1)
	var body struct {
		ModelID         string   `json:"model_id"`
		MeaningLanguage string   `json:"meaning_language"`
		Scenario        string   `json:"scenario"`
		Length          string   `json:"length"`
		Entries         []string `json:"entries"`
	}
	if !decodeOrProblem(writer, request, &body, 64<<10) {
		trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("request_body_invalid"))
		slog.WarnContext(request.Context(), "ai_generation_failure", "request_id", requestID(request.Context()), "phase", "preflight", "reason", "request_body_invalid")
		return
	}
	actor, _ := actorFromContext(request.Context())
	run, err := server.generation.Start(request.Context(), actor, generation.Input{
		ModelID: body.ModelID, MeaningLanguage: body.MeaningLanguage,
		Scenario: body.Scenario, Length: body.Length, Entries: body.Entries,
	})
	if err != nil {
		server.recordGenerationPrecheck(request)
		logGenerationDiagnostic(request.Context(), ai.GenerationSpec{}, "preflight", err)
		server.writeGenerationProblem(writer, request, err)
		return
	}
	server.streamGenerationRun(writer, request, run, startedAt)
}

func (server *Server) streamGenerationRun(writer http.ResponseWriter, request *http.Request, run generation.Run, startedAt time.Time) {
	trace := generationtrace.From(request.Context())
	defer func() {
		slog.InfoContext(request.Context(), "ai_generation_request_finished", "request_id", requestID(request.Context()), "run_id", run.ID.String(), "model_id", run.Spec.ModelID, "elapsed_ms", time.Since(startedAt).Milliseconds())
	}()
	upstreamContext, cancelUpstream := context.WithCancel(server.generation.UsageContext(request.Context(), run.ID, false))
	defer cancelUpstream()
	server.generation.Registry().SetCancel(run.ID, cancelUpstream)
	_ = http.NewResponseController(writer).SetWriteDeadline(time.Time{})
	writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	trace.Begin(generationtrace.Delivery)
	defer func() { trace.End(generationtrace.Delivery, generationtrace.OK, generationtrace.Why("")) }()
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Accel-Buffering", "no")
	writer.WriteHeader(http.StatusOK)
	seq := 1
	streamID := uuid.NewString()
	if err := writeTracedSSE(request.Context(), writer, "generation.started", struct {
		Seq             int                    `json:"seq"`
		ContractVersion string                 `json:"contract_version"`
		StreamID        string                 `json:"stream_id"`
		RunID           string                 `json:"run_id"`
		GenerationToken string                 `json:"generation_token"`
		Snapshot        generation.RunSnapshot `json:"snapshot"`
	}{Seq: seq, ContractVersion: "m003-stream-v6", StreamID: streamID, RunID: run.ID.String(), GenerationToken: run.Token, Snapshot: run.Snapshot}); err != nil {
		server.settleGenerationFailure(run.ID, "stream_failed", "browser_stream_failed")
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
	result := make(chan pipelineResult, 1)
	pipelineDone := make(chan struct{})
	emit := func(name string, data any) error {
		ack := make(chan error, 1)
		select {
		case events <- pipelineEvent{name, data, ack}:
		case <-upstreamContext.Done():
			return upstreamContext.Err()
		}
		select {
		case err := <-ack:
			return err
		case <-upstreamContext.Done():
			return upstreamContext.Err()
		}
	}
	go func() {
		defer close(pipelineDone)
		out, err := generation.ExecutePipeline(upstreamContext, server.generation.Provider(), server.generation.Validator(), run.Spec, run.Snapshot.ContentService, generation.PipelineHooks{
			Progress: func(phase string) error {
				return emit("generation.progress", struct {
					Phase string `json:"phase"`
				}{phase})
			},
			Activity: func(activity string) error {
				return emit("generation.activity", struct {
					Activity string `json:"activity"`
				}{activity})
			},
			PlanItem: func(planID string, item ai.PlanItem) error {
				return emit("generation.plan_item", struct {
					PlanID          string      `json:"plan_id"`
					MeaningLanguage string      `json:"meaning_language"`
					Item            ai.PlanItem `json:"item"`
				}{planID, item.MeaningLanguage, item})
			},
			Edit: func(edit generation.PipelineEdit) error {
				return emit("generation.edit", edit)
			},
			Draft: func(draft generation.PipelineDraft) error {
				return emit("generation.draft", draft)
			},
			Review: func(_ int, review ai.Review, repairRequested bool) error {
				return server.generation.RecordReview(upstreamContext, run.ID, false, review, repairRequested)
			},
			ReviewFailure: func(_ int) error {
				return server.generation.RecordReviewIndeterminate(upstreamContext, run.ID, false)
			},
		})
		result <- pipelineResult{out, err}
	}()
	defer releasePipelineAfterJoin(cancelUpstream, pipelineDone, pipelineJoinTimeout, run.ReleaseCapacity, func() {
		server.generation.MarkSettlementUnknown(run.ID, false)
	})

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-request.Context().Done():
			recordDelivery(request.Context(), "request_exit", 0, "browser_disconnected")
			cancelUpstream()
			server.settleGenerationFailure(run.ID, "stream_failed", "browser_disconnected")
			return
		case <-heartbeat.C:
			if err := writeTracedHeartbeat(request.Context(), writer); err != nil {
				cancelUpstream()
				server.settleGenerationFailure(run.ID, "stream_failed", "browser_stream_failed")
				return
			}
		case event := <-events:
			seq++
			payload, err := withSequence(event.data, seq)
			if err == nil {
				err = writeTracedSSE(request.Context(), writer, event.name, payload)
			}
			event.ack <- err
			if err != nil {
				cancelUpstream()
				server.settleGenerationFailure(run.ID, "stream_failed", "browser_stream_failed")
				return
			}
		case pipeline := <-result:
			if pipeline.err != nil {
				phase := generation.PipelineFailurePhase(pipeline.err)
				logGenerationDiagnostic(request.Context(), run.Spec, phase, pipeline.err)
				status, code, retryable := "provider_failed", providerFailureCode(pipeline.err), providerFailureRetryable(pipeline.err)
				switch phase {
				case "validation":
					status, code, retryable = "validation_failed", "content_validation_failed", true
				case "delivery":
					status, code, retryable = "stream_failed", "browser_stream_failed", true
				case "review_record", "usage_record", "pipeline":
					status, code, retryable = "server_failed", "generation_failed", true
				}
				outcome := server.settleGenerationFailure(run.ID, status, code)
				writeGenerationFailureWithSequence(writer, request, &seq, outcome, code, retryable)
				return
			}
			completeContext, cancel := context.WithTimeout(context.WithoutCancel(request.Context()), 10*time.Second)
			completeErr := server.generation.CompletePipeline(completeContext, run, pipeline.result)
			cancel()
			if completeErr != nil {
				logGenerationDiagnostic(request.Context(), run.Spec, "draft_publish", completeErr)
				outcome := server.settleGenerationFailure(run.ID, "server_failed", "draft_publish_failed")
				if outcome.Status != "valid" {
					writeGenerationFailureWithSequence(writer, request, &seq, outcome, "generation_failed", true)
					return
				}
				// A commit acknowledgement may be lost after the valid draft committed.
				// The confirmed persisted outcome wins; never claim that it was refunded.
			}
			seq++
			_ = writeTracedSSE(request.Context(), writer, "generation.validated", struct {
				Seq                 int                 `json:"seq"`
				RunID               string              `json:"run_id"`
				FinalContentVersion int                 `json:"final_content_version"`
				Result              generationResultDTO `json:"result"`
				ContentOutcome      string              `json:"content_outcome"`
				CompletionNotice    *string             `json:"completion_notice"`
			}{Seq: seq, RunID: run.ID.String(), FinalContentVersion: pipeline.result.Version, Result: mapGenerationResult(pipeline.result.Batch), ContentOutcome: pipeline.result.Outcome, CompletionNotice: completionNotice(pipeline.result.Outcome)})
			return
		}
	}
}

func withSequence(data any, seq int) (map[string]any, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err = json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	payload["seq"] = seq
	return payload, nil
}

func completionNotice(outcome string) *string {
	if outcome != generation.OutcomeServiceIncomplete {
		return nil
	}
	value := "content_review_incomplete"
	return &value
}

func (server *Server) cancelGeneration(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	outcome, err := server.generation.Cancel(request.Context(), actor, chi.URLParam(request, "run_id"), request.Header.Get("X-Generation-Token"))
	if err != nil {
		if errors.Is(err, generation.ErrRunNotFound) {
			writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The generation could not be found.")
			return
		}
		if errors.Is(err, generation.ErrSettlementUnconfirmed) {
			if runID, parseErr := uuid.Parse(chi.URLParam(request, "run_id")); parseErr == nil {
				server.generation.MarkSettlementUnknown(runID, false)
			}
			writeProblem(writer, request, http.StatusServiceUnavailable, "settlement_unconfirmed", "Try again", "The generation status could not be confirmed.")
			return
		}
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Status        string `json:"status"`
		QuotaRefunded bool   `json:"quota_refunded"`
	}{Status: outcome.Status, QuotaRefunded: outcome.QuotaRefunded})
}

func (server *Server) generationStatus(writer http.ResponseWriter, request *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(request, "run_id"))
	if err != nil {
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The generation could not be found.")
		return
	}
	actor, _ := actorFromContext(request.Context())
	view, err := server.generation.ReadStatus(request.Context(), actor, runID, request.Header.Get("X-Generation-Token"))
	if err != nil {
		switch {
		case errors.Is(err, generation.ErrRunNotFound):
			writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The generation could not be found.")
		case errors.Is(err, generation.ErrRunExpired):
			writeProblem(writer, request, http.StatusGone, "capability_expired", "Generation expired", "The generation capability has expired.")
		default:
			writeProblem(writer, request, http.StatusServiceUnavailable, "temporarily_unavailable", "Try again", "The generation status could not be confirmed.")
		}
		return
	}
	var result *generationResultDTO
	if view.Result != nil {
		mapped := mapGenerationResult(*view.Result)
		result = &mapped
	}
	writeJSON(writer, request, http.StatusOK, struct {
		ContractVersion     string                 `json:"contract_version"`
		RunID               string                 `json:"run_id"`
		Status              string                 `json:"status"`
		Snapshot            generation.RunSnapshot `json:"snapshot"`
		FinalContentVersion *int                   `json:"final_content_version"`
		Result              *generationResultDTO   `json:"result"`
		CanSave             bool                   `json:"can_save"`
		QuotaRefunded       bool                   `json:"quota_refunded"`
		ContentOutcome      *string                `json:"content_outcome"`
		CompletionNotice    *string                `json:"completion_notice"`
	}{"m003-stream-v6", view.RunID.String(), view.Status, view.Snapshot, view.FinalContentVersion, result, view.CanSave, view.QuotaRefunded, view.ContentOutcome, view.CompletionNotice})
}

type generationFailureEvent struct {
	Code          string `json:"code"`
	QuotaRefunded bool   `json:"quota_refunded"`
	Retryable     bool   `json:"retryable"`
	RequestID     string `json:"request_id"`
}

func generationFailureDTO(code string, refunded, retryable bool, requestID string) generationFailureEvent {
	return generationFailureEvent{Code: code, QuotaRefunded: refunded, Retryable: retryable, RequestID: requestID}
}

func writeGenerationFailureWithSequence(writer http.ResponseWriter, request *http.Request, seq *int, outcome generation.FailureOutcome, code string, retryable bool) {
	*seq++
	if outcome.Status == "pending" {
		_ = writeTracedSSE(request.Context(), writer, "generation.settlement_pending", struct {
			Seq       int    `json:"seq"`
			Code      string `json:"code"`
			RequestID string `json:"request_id"`
		}{*seq, "settlement_unconfirmed", requestID(request.Context())})
		return
	}
	if outcome.Status == "cancelled" {
		_ = writeTracedSSE(request.Context(), writer, "generation.cancelled", struct {
			Seq           int  `json:"seq"`
			QuotaRefunded bool `json:"quota_refunded"`
		}{*seq, false})
		return
	}
	_ = writeTracedSSE(request.Context(), writer, "generation.failed", struct {
		Seq int `json:"seq"`
		generationFailureEvent
	}{*seq, generationFailureDTO(code, outcome.QuotaRefunded, retryable, requestID(request.Context()))})
}

type generationResultDTO struct {
	Passage string                `json:"passage"`
	Tags    []string              `json:"tags"`
	Targets []generationTargetDTO `json:"targets"`
}

type generationTargetDTO struct {
	Entry        string          `json:"entry"`
	EntryMeaning string          `json:"entry_meaning"`
	HintPhrase   string          `json:"hint_phrase"`
	HintBlanks   []ai.Span       `json:"hint_blanks"`
	Occurrences  []ai.Occurrence `json:"occurrences"`
}

func mapGenerationResult(batch ai.ValidatedBatch) generationResultDTO {
	targets := make([]generationTargetDTO, 0, len(batch.Targets))
	for _, target := range batch.Targets {
		hintBlanks := make([]ai.Span, 0, len(target.HintOccurrences))
		for _, occurrence := range target.HintOccurrences {
			hintBlanks = append(hintBlanks, ai.Span{Start: occurrence.Start, End: occurrence.End})
		}
		targets = append(targets, generationTargetDTO{
			Entry: target.Entry, EntryMeaning: target.EntryMeaning,
			HintPhrase: target.HintPhrase, HintBlanks: hintBlanks,
			Occurrences: append([]ai.Occurrence(nil), target.PassageOccurrences...),
		})
	}
	return generationResultDTO{Passage: batch.Passage, Tags: append([]string(nil), batch.Tags...), Targets: targets}
}

func writeSSE(writer http.ResponseWriter, event string, data any) error {
	_, _, err := writeSSEParts(writer, event, data)
	return err
}

func flush(writer http.ResponseWriter) error {
	return http.NewResponseController(writer).Flush()
}

func (server *Server) settleGenerationFailure(runID uuid.UUID, status, code string) generation.FailureOutcome {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	outcome, err := server.generation.ReconcileFailure(ctx, runID, status, code)
	if err != nil {
		server.generation.MarkSettlementUnknown(runID, false)
		slog.ErrorContext(ctx, "ai_generation_settlement_failed", "run_id", runID.String(), "stage", "settlement", "reason", "database_settlement_failed", "failure_code", code)
		return outcome
	}
	slog.InfoContext(ctx, "ai_generation_settlement", "run_id", runID.String(), "stage", "settlement", "outcome", outcome.Status, "quota_refunded", outcome.QuotaRefunded, "failure_code", code)
	return outcome
}

func providerFailureCode(err error) string {
	var providerError *ai.ProviderError
	if errors.As(err, &providerError) {
		return string(providerError.Category)
	}
	if errors.Is(err, ai.ErrCredentialMissing) {
		return "credential_missing"
	}
	return "provider_unavailable"
}

func providerFailureRetryable(err error) bool {
	var providerError *ai.ProviderError
	if errors.As(err, &providerError) {
		return providerError.Retryable
	}
	return !errors.Is(err, ai.ErrCredentialMissing)
}

func (server *Server) writeGenerationProblem(writer http.ResponseWriter, request *http.Request, err error) {
	var providerError *ai.ProviderError
	switch {
	case errors.Is(err, generation.ErrForbidden):
		writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "Generation is not available for this account.")
	case errors.Is(err, generation.ErrInvalidInput):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more generation fields are invalid.")
	case errors.Is(err, generation.ErrGenerationInProgress):
		writeProblem(writer, request, http.StatusConflict, "generation_in_progress", "Generation already running", "Finish or cancel the current generation first.")
	case errors.Is(err, generation.ErrQuotaExhausted):
		writeProblem(writer, request, http.StatusTooManyRequests, "quota_exhausted", "Generation limit reached", "The rolling generation limit has been reached.")
	case errors.Is(err, generation.ErrGenerationUnavailable), errors.Is(err, ai.ErrCredentialMissing):
		writeProblem(writer, request, http.StatusServiceUnavailable, "generation_unavailable", "Generation unavailable", "Generation is not configured right now.")
	case errors.Is(err, generation.ErrGenerationConfigurationInvalid):
		writeProblemContext(writer, request, http.StatusServiceUnavailable, "generation_unavailable", "Generation unavailable", "Generation is not configured right now.", map[string]bool{"accepted": false})
	case errors.Is(err, generation.ErrGenerationBusy):
		server.writeGenerationBusyProblem(writer, request)
	case errors.As(err, &providerError):
		writeProblem(writer, request, http.StatusServiceUnavailable, "generation_unavailable", "Generation unavailable", "The model provider is temporarily unavailable.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}

func (server *Server) writeGenerationBusyProblem(writer http.ResponseWriter, request *http.Request) {
	retryAfterSeconds := server.generation.CapacityRetryAfterSeconds()
	writer.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
	writeProblemContext(writer, request, http.StatusServiceUnavailable, "generation_busy", "Generation temporarily busy", "Generation is temporarily unavailable. Try again later.", map[string]any{
		"accepted":            false,
		"retry_after_seconds": retryAfterSeconds,
	})
}
