package httpapi

import (
	"context"
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
		slog.ErrorContext(ctx, "preset_preview_settlement_failed", "preview_run_id", id.String())
		return "failed"
	}
	return status
}
func writePreviewFailure(w http.ResponseWriter, r *http.Request, status, code string, retryable bool) {
	if status == "cancelled" {
		_ = writeSSE(w, "preview.cancelled", struct{}{})
		return
	}
	_ = writeSSE(w, "preview.failed", struct {
		Code      string `json:"code"`
		Retryable bool   `json:"retryable"`
		RequestID string `json:"request_id"`
	}{code, retryable, requestID(r.Context())})
}
func (s *Server) adminPreviewStream(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "preset_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
		return
	}
	var body struct {
		Version uuid.UUID `json:"draft_version"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	run, err := s.generation.StartPreview(r.Context(), actor, id, body.Version)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	ctx, cancel := context.WithCancel(s.generation.UsageContext(r.Context(), run.ID, true))
	defer cancel()
	s.generation.PreviewRegistry().SetCancel(run.ID, cancel)
	stream, err := s.generation.Provider().Open(ctx, run.Spec)
	if err != nil {
		s.settlePreview(run.ID, providerFailureCode(err))
		s.writeGenerationProblem(w, r, err)
		return
	}
	defer stream.Close()
	_ = http.NewResponseController(w).SetWriteDeadline(time.Time{})
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)
	if err = writeSSE(w, "preview.started", struct {
		ID    uuid.UUID `json:"preview_run_id"`
		Token string    `json:"preview_token"`
	}{run.ID, run.Token}); err != nil {
		s.settlePreview(run.ID, "browser_stream_failed")
		return
	}
	type received struct {
		candidate ai.Candidate
		err       error
	}
	deltas := make(chan string)
	result := make(chan received, 1)
	go func() {
		candidate, err := ai.ReceiveWithCorrections(ctx, s.generation.Provider(), s.generation.Validator(), run.Spec, stream, func(delta string) error {
			select {
			case deltas <- delta:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
		result <- received{candidate, err}
	}()
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
		case delta := <-deltas:
			if err = writeSSE(w, "passage.delta", struct {
				Text string `json:"text"`
			}{delta}); err != nil {
				cancel()
				s.settlePreview(run.ID, "browser_stream_failed")
				return
			}
		case received := <-result:
			if received.err != nil {
				code := providerFailureCode(received.err)
				status := s.settlePreview(run.ID, code)
				writePreviewFailure(w, r, status, code, providerFailureRetryable(received.err))
				return
			}
			batch, err := s.generation.Validator().Validate(ctx, run.Spec, received.candidate)
			if err != nil {
				status := s.settlePreview(run.ID, "content_validation_failed")
				writePreviewFailure(w, r, status, "content_validation_failed", true)
				return
			}
			complete, cancelComplete := context.WithTimeout(ctx, 10*time.Second)
			usage, err := s.generation.CompletePreview(complete, run, batch)
			cancelComplete()
			if err != nil {
				status := s.settlePreview(run.ID, "preview_publish_failed")
				if status != "valid" {
					writePreviewFailure(w, r, status, "generation_failed", true)
					return
				}
				// Lost COMMIT acknowledgement: read the actual recorded usage, never make up zeros.
				read, cancelRead := context.WithTimeout(context.Background(), 5*time.Second)
				usage, err = s.generation.PreviewUsage(read, run.ID)
				cancelRead()
				if err != nil {
					writePreviewFailure(w, r, "failed", "temporarily_unavailable", true)
					return
				}
			}
			_ = writeSSE(w, "preview.validated", struct {
				ID      uuid.UUID               `json:"preview_run_id"`
				Version uuid.UUID               `json:"draft_version"`
				Result  generation.PublicResult `json:"result"`
				Usage   generation.UsageSummary `json:"usage"`
			}{run.ID, run.VersionID, generation.UserResult(batch), usage})
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
		s.writePresetProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Status string `json:"status"`
	}{status})
}
