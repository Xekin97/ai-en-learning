package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"wordweave/internal/review"
)

func (server *Server) reviewRangePreview(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	preview, err := server.review.Preview(
		request.Context(), actor.ID, request.URL.Query().Get("start_date"),
		request.URL.Query().Get("end_date"), request.URL.Query().Get("timezone"),
	)
	if err != nil {
		server.writeReviewProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		BatchCount int  `json:"batch_count"`
		EntryCount int  `json:"entry_count"`
		Empty      bool `json:"empty"`
	}{BatchCount: preview.BatchCount, EntryCount: preview.EntryCount, Empty: preview.BatchCount == 0 && preview.EntryCount == 0})
}

func (server *Server) activeRangeSession(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	session, err := server.review.ActiveRange(request.Context(), actor.ID)
	if err != nil {
		server.writeReviewProblem(writer, request, err)
		return
	}
	if session == nil {
		writeJSON(writer, request, http.StatusOK, struct {
			Session any `json:"session"`
		}{Session: nil})
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Session activeRangeDTO `json:"session"`
	}{Session: mapActiveRange(*session)})
}

func (server *Server) createReviewSession(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Mode      string         `json:"mode"`
		StartDate optionalString `json:"start_date"`
		EndDate   optionalString `json:"end_date"`
		Timezone  optionalString `json:"timezone"`
		BatchID   optionalString `json:"batch_id"`
	}
	if !decodeOrProblem(writer, request, &body, 2048) {
		return
	}
	input := review.CreateInput{Mode: body.Mode}
	if body.Mode == "range" {
		if !body.StartDate.Set || body.StartDate.Value == nil || !body.EndDate.Set || body.EndDate.Value == nil ||
			!body.Timezone.Set || body.Timezone.Value == nil || body.BatchID.Set {
			server.writeReviewProblem(writer, request, review.ErrValidation)
			return
		}
		input.StartDate, input.EndDate, input.Timezone = *body.StartDate.Value, *body.EndDate.Value, *body.Timezone.Value
	} else if body.Mode == "single_batch" {
		if !body.BatchID.Set || body.BatchID.Value == nil || body.StartDate.Set || body.EndDate.Set || body.Timezone.Set {
			server.writeReviewProblem(writer, request, review.ErrValidation)
			return
		}
		batchID, err := uuid.Parse(*body.BatchID.Value)
		if err != nil {
			server.writeReviewProblem(writer, request, review.ErrValidation)
			return
		}
		input.BatchID = batchID
	} else {
		server.writeReviewProblem(writer, request, review.ErrValidation)
		return
	}
	actor, _ := actorFromContext(request.Context())
	session, err := server.review.Create(request.Context(), actor.ID, input)
	if err != nil {
		server.writeReviewProblem(writer, request, err)
		return
	}
	status := http.StatusCreated
	if session.Reused {
		status = http.StatusOK
	}
	writeJSON(writer, request, status, mapReviewCreation(session))
}

func (server *Server) getReviewSession(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	sessionID, err := uuid.Parse(chi.URLParam(request, "session_id"))
	if err != nil {
		server.writeReviewProblem(writer, request, review.ErrNotFound)
		return
	}
	session, err := server.review.GetSession(request.Context(), actor.ID, sessionID)
	if err != nil {
		server.writeReviewProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Session reviewSessionDTO `json:"session"`
	}{Session: mapReviewSession(session)})
}

func (server *Server) startReviewAttempt(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	sessionID, err := uuid.Parse(chi.URLParam(request, "session_id"))
	if err != nil {
		server.writeReviewProblem(writer, request, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(request.Context())
	attempt, err := server.review.StartAttempt(request.Context(), actor, sessionID)
	if err != nil {
		server.writeReviewProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusCreated, struct {
		AttemptID    string                `json:"attempt_id"`
		AttemptToken string                `json:"attempt_token"`
		Item         map[string]any        `json:"item"`
		Progress     reviewItemProgressDTO `json:"progress"`
	}{
		AttemptID: attempt.ID, AttemptToken: attempt.Token,
		Item: mapReviewItem(attempt.Item), Progress: mapReviewItemProgress(attempt.Progress),
	})
}

func (server *Server) reviewAction(writer http.ResponseWriter, request *http.Request) {
	var body reviewActionRequest
	if !decodeOrProblem(writer, request, &body, 64<<10) {
		return
	}
	if body.Action == "skip" && (body.Answer.Set || body.Answers.Set) ||
		body.Action == "answer" && body.Answer.Set == body.Answers.Set ||
		(body.Action != "skip" && body.Action != "answer") {
		server.writeReviewProblem(writer, request, review.ErrValidation)
		return
	}
	if body.Answer.Set && body.Answer.Value == nil {
		server.writeReviewProblem(writer, request, review.ErrValidation)
		return
	}
	answers := []review.BlankAnswer(nil)
	if body.Answers.Set {
		answers = make([]review.BlankAnswer, 0, len(body.Answers.Values))
		for _, answer := range body.Answers.Values {
			answers = append(answers, review.BlankAnswer{BlankID: answer.BlankID, Answer: answer.Answer})
		}
	}
	var answer *string
	if body.Answer.Set {
		answer = body.Answer.Value
	}
	actor, _ := actorFromContext(request.Context())
	outcome, err := server.review.Act(request.Context(), actor, chi.URLParam(request, "attempt_id"), request.Header.Get("X-Review-Attempt-Token"), review.Action{
		ActionID: body.ActionID, ItemID: body.ItemID, Kind: body.Action,
		Answer: answer, Answers: answers,
	})
	if err != nil {
		server.writeReviewProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, mapReviewOutcome(outcome))
}

type reviewAnswerDTO struct {
	BlankID string `json:"blank_id"`
	Answer  string `json:"answer"`
}

type reviewActionRequest struct {
	ActionID string          `json:"action_id"`
	ItemID   string          `json:"item_id"`
	Action   string          `json:"action"`
	Answer   optionalString  `json:"answer"`
	Answers  optionalAnswers `json:"answers"`
}

type optionalAnswers struct {
	Set    bool
	Values []reviewAnswerDTO
}

func (value *optionalAnswers) UnmarshalJSON(raw []byte) error {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errors.New("answers cannot be null")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var answers []reviewAnswerDTO
	if err := decoder.Decode(&answers); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("answers must contain one JSON value")
	}
	value.Values = answers
	value.Set = true
	return nil
}

type progressDTO struct {
	CompletedBatches    int `json:"completed_batches"`
	TotalBatches        int `json:"total_batches"`
	SuccessfulBatches   int `json:"successful_batches"`
	UnsuccessfulBatches int `json:"unsuccessful_batches"`
}

type dateRangeDTO struct {
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Timezone  string `json:"timezone"`
}

type batchProjectionDTO struct {
	BatchID  string `json:"batch_id"`
	SavedAt  string `json:"saved_at"`
	Scenario string `json:"scenario"`
}

type summaryDTO struct {
	TotalBatches        int `json:"total_batches"`
	SuccessfulBatches   int `json:"successful_batches"`
	UnsuccessfulBatches int `json:"unsuccessful_batches"`
	SkippedBatches      int `json:"skipped_batches"`
}

type activeRangeDTO struct {
	SessionID string       `json:"session_id"`
	Mode      string       `json:"mode"`
	Status    string       `json:"status"`
	DateRange dateRangeDTO `json:"date_range"`
	Progress  progressDTO  `json:"progress"`
}

type reviewSessionDTO struct {
	SessionID    string              `json:"session_id"`
	Mode         string              `json:"mode"`
	Status       string              `json:"status"`
	DateRange    *dateRangeDTO       `json:"date_range"`
	Progress     progressDTO         `json:"progress"`
	CurrentBatch *batchProjectionDTO `json:"current_batch"`
	Summary      *summaryDTO         `json:"summary"`
}

type reviewCreationDTO struct {
	SessionID    string              `json:"session_id"`
	Mode         string              `json:"mode"`
	Status       string              `json:"status"`
	Reused       bool                `json:"reused"`
	DateRange    *dateRangeDTO       `json:"date_range"`
	Progress     progressDTO         `json:"progress"`
	CurrentBatch *batchProjectionDTO `json:"current_batch"`
}

type reviewItemProgressDTO struct {
	Stage        string `json:"stage"`
	ItemNumber   int    `json:"item_number"`
	ItemsInStage int    `json:"items_in_stage"`
}

func mapActiveRange(session review.Session) activeRangeDTO {
	return activeRangeDTO{
		SessionID: session.ID.String(), Mode: "range", Status: "active",
		DateRange: mapDateRange(*session.DateRange), Progress: mapReviewProgress(session.Progress),
	}
}

func mapReviewCreation(session review.Session) reviewCreationDTO {
	dto := reviewCreationDTO{
		SessionID: session.ID.String(), Mode: session.Mode, Status: session.Status,
		Reused: session.Reused, Progress: mapReviewProgress(session.Progress),
	}
	if session.DateRange != nil {
		value := mapDateRange(*session.DateRange)
		dto.DateRange = &value
	}
	if session.CurrentBatch != nil {
		value := mapBatchProjection(*session.CurrentBatch)
		dto.CurrentBatch = &value
	}
	return dto
}

func mapReviewSession(session review.Session) reviewSessionDTO {
	dto := reviewSessionDTO{
		SessionID: session.ID.String(), Mode: session.Mode, Status: session.Status,
		Progress: mapReviewProgress(session.Progress),
	}
	if session.DateRange != nil {
		value := mapDateRange(*session.DateRange)
		dto.DateRange = &value
	}
	if session.CurrentBatch != nil {
		value := mapBatchProjection(*session.CurrentBatch)
		dto.CurrentBatch = &value
	}
	if session.Summary != nil {
		value := mapSummary(*session.Summary)
		dto.Summary = &value
	}
	return dto
}

func mapReviewItem(item review.Item) map[string]any {
	if item.Stage == "spelling" {
		segments := make([]any, 0, len(item.HintSegments))
		for _, segment := range item.HintSegments {
			if segment.Kind == "text" {
				segments = append(segments, map[string]any{"kind": "text", "text": segment.Text})
			} else {
				segments = append(segments, map[string]any{"kind": "blank", "length_hint": segment.LengthHint})
			}
		}
		return map[string]any{
			"stage": "spelling", "item_id": item.ID, "entry_meaning": item.EntryMeaning,
			"hint": map[string]any{"segments": segments},
		}
	}
	segments := make([]any, 0, len(item.PassageSegments))
	for _, segment := range item.PassageSegments {
		if segment.Kind == "text" {
			segments = append(segments, map[string]any{"kind": "text", "text": segment.Text})
		} else {
			segments = append(segments, map[string]any{"kind": "blank", "blank_id": segment.BlankID, "group_key": segment.GroupKey})
		}
	}
	return map[string]any{"stage": "passage_cloze", "item_id": item.ID, "passage_segments": segments}
}

func mapReviewOutcome(outcome review.Outcome) any {
	switch outcome.Kind {
	case "retry":
		var incorrect any
		if outcome.Item != nil && outcome.Item.Stage == "passage_cloze" {
			incorrect = outcome.IncorrectBlankIDs
		}
		return struct {
			Outcome           string                `json:"outcome"`
			Result            string                `json:"result"`
			Item              map[string]any        `json:"item"`
			Progress          reviewItemProgressDTO `json:"progress"`
			IncorrectBlankIDs any                   `json:"incorrect_blank_ids"`
		}{"retry", "incorrect", mapReviewItem(*outcome.Item), mapReviewItemProgress(*outcome.Progress), incorrect}
	case "advanced":
		return struct {
			Outcome  string                `json:"outcome"`
			Result   string                `json:"result"`
			Item     map[string]any        `json:"item"`
			Progress reviewItemProgressDTO `json:"progress"`
		}{"advanced", outcome.Result, mapReviewItem(*outcome.Item), mapReviewItemProgress(*outcome.Progress)}
	case "batch_completed":
		return struct {
			Outcome         string             `json:"outcome"`
			BatchResult     batchResultDTO     `json:"batch_result"`
			SessionProgress progressDTO        `json:"session_progress"`
			NextBatch       batchProjectionDTO `json:"next_batch"`
		}{"batch_completed", mapBatchResult(*outcome.BatchResult), mapReviewProgress(*outcome.SessionProgress), mapBatchProjection(*outcome.NextBatch)}
	default:
		return struct {
			Outcome         string         `json:"outcome"`
			BatchResult     batchResultDTO `json:"batch_result"`
			SessionProgress progressDTO    `json:"session_progress"`
			NextBatch       any            `json:"next_batch"`
			SessionSummary  summaryDTO     `json:"session_summary"`
		}{"session_completed", mapBatchResult(*outcome.BatchResult), mapReviewProgress(*outcome.SessionProgress), nil, mapSummary(*outcome.SessionSummary)}
	}
}

type batchResultDTO struct {
	BatchID    string `json:"batch_id"`
	Successful bool   `json:"successful"`
	ErrorCount int    `json:"error_count"`
	SkipCount  int    `json:"skip_count"`
}

func mapBatchResult(result review.BatchResult) batchResultDTO {
	return batchResultDTO{BatchID: result.BatchID.String(), Successful: result.Successful, ErrorCount: result.ErrorCount, SkipCount: result.SkipCount}
}

func mapReviewProgress(progress review.Progress) progressDTO {
	return progressDTO{progress.Completed, progress.Total, progress.Successful, progress.Unsuccessful}
}

func mapReviewItemProgress(progress review.ItemProgress) reviewItemProgressDTO {
	return reviewItemProgressDTO{Stage: progress.Stage, ItemNumber: progress.ItemNumber, ItemsInStage: progress.ItemsInStage}
}

func mapDateRange(value review.DateRange) dateRangeDTO {
	return dateRangeDTO{StartDate: value.StartDate, EndDate: value.EndDate, Timezone: value.Timezone}
}

func mapBatchProjection(value review.BatchProjection) batchProjectionDTO {
	return batchProjectionDTO{BatchID: value.ID.String(), SavedAt: value.SavedAt.Format(time.RFC3339Nano), Scenario: value.Scenario}
}

func mapSummary(value review.Summary) summaryDTO {
	return summaryDTO{TotalBatches: value.Total, SuccessfulBatches: value.Successful, UnsuccessfulBatches: value.Unsuccessful, SkippedBatches: value.Skipped}
}

func (server *Server) writeReviewProblem(writer http.ResponseWriter, request *http.Request, err error) {
	switch {
	case errors.Is(err, review.ErrNotFound):
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The review resource could not be found.")
	case errors.Is(err, review.ErrAttemptExpired):
		writeProblem(writer, request, http.StatusGone, "capability_expired", "Review expired", "Start the current batch again.")
	case errors.Is(err, review.ErrConflict), errors.Is(err, review.ErrIncorrectAction):
		writeProblem(writer, request, http.StatusConflict, "conflict", "Review state changed", "Reload the current review state and try again.")
	case errors.Is(err, review.ErrEmpty):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Nothing to review", "No saved batches match this review selection.")
	case errors.Is(err, review.ErrValidation):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more review fields are invalid.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}
