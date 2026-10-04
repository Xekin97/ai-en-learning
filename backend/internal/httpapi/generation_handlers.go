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
	server.generation.Registry().SetCancel(run.ID, cancelUpstream)
	trace.Begin(generationtrace.ProviderOpen)
	stream, err := server.generation.Provider().Open(upstreamContext, run.Spec)
	traceProviderResult(upstreamContext, generationtrace.ProviderOpen, err)
	if err != nil {
		logGenerationDiagnostic(request.Context(), run.Spec, "provider_open", err)
		cancelUpstream()
		server.settleGenerationFailure(run.ID, "provider_failed", providerFailureCode(err))
		server.writeGenerationProblem(writer, request, err)
		return
	}
	defer stream.Close()
	defer cancelUpstream()
	// The public server has a defensive write timeout for ordinary JSON APIs.
	// A generation stream is explicitly exempt and instead ends on its request
	// context, provider terminal event, browser disconnect, or user cancellation.
	_ = http.NewResponseController(writer).SetWriteDeadline(time.Time{})

	writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	trace.Begin(generationtrace.Delivery)
	defer func() { trace.End(generationtrace.Delivery, generationtrace.OK, generationtrace.Why("")) }()
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Accel-Buffering", "no")
	writer.WriteHeader(http.StatusOK)
	if err := writeTracedSSE(request.Context(), writer, "generation.started", struct {
		RunID           string `json:"run_id"`
		GenerationToken string `json:"generation_token"`
	}{RunID: run.ID.String(), GenerationToken: run.Token}); err != nil {
		server.settleGenerationFailure(run.ID, "stream_failed", "browser_stream_failed")
		return
	}

	type providerResult struct {
		candidate ai.Candidate
		err       error
	}
	// A provider terminal result must not overtake its last passage delta.
	// With a buffered channel both select cases can be ready while a slow
	// browser is being written, causing the tail to be dropped on completion.
	deltas := make(chan string)
	result := make(chan providerResult, 1)
	go func() {
		trace.Begin(generationtrace.ProviderStream)
		candidate, receiveErr := ai.ReceiveWithCorrections(upstreamContext, server.generation.Provider(), server.generation.Validator(), run.Spec, stream, func(delta string) error {
			select {
			case deltas <- delta:
				return nil
			case <-upstreamContext.Done():
				return upstreamContext.Err()
			}
		})
		traceProviderResult(upstreamContext, generationtrace.ProviderStream, receiveErr)
		trace.Note(generationtrace.ProviderStream, "receiver_exit", generationtrace.Why(""))
		result <- providerResult{candidate: candidate, err: receiveErr}
	}()

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
		case delta := <-deltas:
			if err := writeTracedSSE(request.Context(), writer, "passage.delta", struct {
				Text string `json:"text"`
			}{Text: delta}); err != nil {
				cancelUpstream()
				server.settleGenerationFailure(run.ID, "stream_failed", "browser_stream_failed")
				return
			}
		case providerResult := <-result:
			if providerResult.err != nil {
				logGenerationDiagnostic(request.Context(), run.Spec, "provider_receive", providerResult.err)
				outcome := server.settleGenerationFailure(run.ID, "provider_failed", providerFailureCode(providerResult.err))
				writeGenerationFailure(writer, request, outcome, providerFailureCode(providerResult.err), providerFailureRetryable(providerResult.err))
				return
			}
			validated, validationErr := server.generation.Validator().Validate(upstreamContext, run.Spec, providerResult.candidate)
			if validationErr != nil {
				if upstreamContext.Err() != nil {
					outcome := server.settleGenerationFailure(run.ID, "stream_failed", "browser_disconnected")
					if request.Context().Err() == nil {
						writeGenerationFailure(writer, request, outcome, "generation_failed", true)
					}
					return
				}
				logGenerationDiagnostic(request.Context(), run.Spec, "validation", validationErr)
				settled := server.settleGenerationFailure(run.ID, "validation_failed", "content_validation_failed")
				writeGenerationFailure(writer, request, settled, "content_validation_failed", true)
				return
			}
			completeContext, cancel := context.WithTimeout(upstreamContext, 10*time.Second)
			completeErr := server.generation.CompleteValid(completeContext, run, validated)
			cancel()
			if completeErr != nil {
				logGenerationDiagnostic(request.Context(), run.Spec, "draft_publish", completeErr)
				outcome := server.settleGenerationFailure(run.ID, "server_failed", "draft_publish_failed")
				if outcome.Status != "valid" {
					writeGenerationFailure(writer, request, outcome, "generation_failed", true)
					return
				}
				// A commit acknowledgement may be lost after the valid draft committed.
				// The confirmed persisted outcome wins; never claim that it was refunded.
			}
			_ = writeTracedSSE(request.Context(), writer, "generation.validated", struct {
				RunID  string              `json:"run_id"`
				Result generationResultDTO `json:"result"`
			}{RunID: run.ID.String(), Result: mapGenerationResult(validated)})
			return
		}
	}
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
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Status        string `json:"status"`
		QuotaRefunded bool   `json:"quota_refunded"`
	}{Status: outcome.Status, QuotaRefunded: outcome.QuotaRefunded})
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

func writeGenerationFailure(writer http.ResponseWriter, request *http.Request, outcome generation.FailureOutcome, code string, retryable bool) {
	if outcome.Status == "cancelled" {
		_ = writeTracedSSE(request.Context(), writer, "generation.cancelled", struct {
			QuotaRefunded bool `json:"quota_refunded"`
		}{false})
		return
	}
	_ = writeTracedSSE(request.Context(), writer, "generation.failed", generationFailureDTO(code, outcome.QuotaRefunded, retryable, requestID(request.Context())))
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
	case errors.As(err, &providerError):
		writeProblem(writer, request, http.StatusServiceUnavailable, "generation_unavailable", "Generation unavailable", "The model provider is temporarily unavailable.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}
