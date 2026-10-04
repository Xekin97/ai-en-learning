package httpapi

import (
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"net/http"
	"wordweave/internal/platform/business"
	"wordweave/internal/review"
)

func (server *Server) reviewRangePreview(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	p, err := server.review.Preview(r.Context(), actor.ID, r.URL.Query().Get("start_date"), r.URL.Query().Get("end_date"), r.URL.Query().Get("timezone"))
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		BatchCount int  `json:"batch_count"`
		EntryCount int  `json:"entry_count"`
		Empty      bool `json:"empty"`
	}{p.BatchCount, p.EntryCount, p.BatchCount == 0 && p.EntryCount == 0})
}
func (server *Server) activeRangeSession(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	session, err := server.review.ActiveRange(r.Context(), actor.ID)
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		Session *review.Session `json:"session"`
	}{session})
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
	writeJSON(writer, request, status, struct {
		Session review.Session `json:"session"`
		Reused  bool           `json:"reused"`
	}{session, session.Reused})
}

func (server *Server) getReviewSession(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "session_id"))
	if err != nil {
		server.writeReviewProblem(w, r, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	session, err := server.review.GetSession(r.Context(), actor.ID, id)
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		Session  review.Session `json:"session"`
		Revision string         `json:"session_revision"`
	}{session, session.Revision})
}
func (server *Server) startReviewAttempt(w http.ResponseWriter, r *http.Request) {
	var body struct{}
	if !decodeOrProblem(w, r, &body, 128) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "session_id"))
	if err != nil {
		server.writeReviewProblem(w, r, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	attempt, err := server.review.StartAttempt(r.Context(), actor, id)
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	status := http.StatusCreated
	if attempt.Reused {
		status = http.StatusOK
	}
	writeJSON(w, r, status, struct {
		Attempt review.DraftAttempt `json:"attempt"`
	}{attempt})
}
func (server *Server) getReviewAttempt(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "attempt_id"))
	if err != nil {
		server.writeReviewProblem(w, r, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.review.GetAttempt(r.Context(), actor, id)
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, result)
}

type reviewSubmitRequest struct {
	ExpectedRevision *string `json:"expected_revision"`
	Words            *[]struct {
		QuestionID *string `json:"question_id"`
		Answer     *string `json:"answer"`
	} `json:"words"`
	Passage *[]struct {
		BlankID *string `json:"blank_id"`
		Answer  *string `json:"answer"`
	} `json:"passage"`
}

func (server *Server) submitReviewAttempt(w http.ResponseWriter, r *http.Request) {
	var body reviewSubmitRequest
	if !decodeOrProblem(w, r, &body, 1<<20) {
		return
	}
	if body.ExpectedRevision == nil || body.Words == nil || body.Passage == nil {
		server.writeReviewProblem(w, r, review.ErrValidation)
		return
	}
	input := review.SubmitInput{ExpectedRevision: *body.ExpectedRevision, Words: make([]review.WordAnswer, 0, len(*body.Words)), Passage: make([]review.PassageAnswer, 0, len(*body.Passage))}
	for _, a := range *body.Words {
		if a.QuestionID == nil || a.Answer == nil {
			server.writeReviewProblem(w, r, review.ErrValidation)
			return
		}
		input.Words = append(input.Words, review.WordAnswer{QuestionID: *a.QuestionID, Answer: *a.Answer})
	}
	for _, a := range *body.Passage {
		if a.BlankID == nil || a.Answer == nil {
			server.writeReviewProblem(w, r, review.ErrValidation)
			return
		}
		input.Passage = append(input.Passage, review.PassageAnswer{BlankID: *a.BlankID, Answer: *a.Answer})
	}
	id, err := uuid.Parse(chi.URLParam(r, "attempt_id"))
	if err != nil {
		server.writeReviewProblem(w, r, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.review.Submit(r.Context(), actor, id, r.Header.Get("X-Review-Attempt-Token"), input)
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, result)
}
func (server *Server) restartReviewAttempt(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ExpectedRevision *string `json:"expected_revision"`
	}
	if !decodeOrProblem(w, r, &body, 2048) {
		return
	}
	if body.ExpectedRevision == nil {
		server.writeReviewProblem(w, r, review.ErrValidation)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "attempt_id"))
	if err != nil {
		server.writeReviewProblem(w, r, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.review.Restart(r.Context(), actor, id, *body.ExpectedRevision)
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	status := http.StatusCreated
	if result.Reused {
		status = http.StatusOK
	}
	writeJSON(w, r, status, result)
}
func (server *Server) replaceReviewSession(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Confirmed        requiredBool      `json:"confirmed"`
		ExpectedRevision *string           `json:"expected_session_revision"`
		Range            *review.DateRange `json:"range"`
	}
	if !decodeOrProblem(w, r, &body, 4096) {
		return
	}
	if !body.Confirmed.Set || !body.Confirmed.Value || body.ExpectedRevision == nil || body.Range == nil {
		server.writeReviewProblem(w, r, review.ErrValidation)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "session_id"))
	if err != nil {
		server.writeReviewProblem(w, r, review.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	session, err := server.review.Replace(r.Context(), actor.ID, id, *body.ExpectedRevision, true, review.CreateInput{Mode: "range", StartDate: body.Range.StartDate, EndDate: body.Range.EndDate, Timezone: body.Range.Timezone})
	if err != nil {
		server.writeReviewProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusCreated, struct {
		Session  review.Session `json:"session"`
		Replaced uuid.UUID      `json:"replaced_session_id"`
	}{session, id})
}
func (server *Server) writeReviewProblem(w http.ResponseWriter, r *http.Request, err error) {
	var conflict *business.RevisionConflict
	switch {
	case errors.As(err, &conflict):
		writeProblemContext(w, r, 409, "revision_conflict", "Review changed", "Reload the review before confirming.", struct {
			Revision string `json:"current_revision"`
		}{conflict.Current})
	case errors.Is(err, review.ErrNotFound), errors.Is(err, business.ErrNotFound):
		writeProblem(w, r, 404, "not_found", "Not found", "The review resource could not be found.")
	case errors.Is(err, review.ErrReplaced):
		writeProblem(w, r, 409, "session_replaced", "Review replaced", "Open your current review to continue.")
	case errors.Is(err, review.ErrSessionConflict):
		writeProblem(w, r, 409, "review_session_conflict", "Another review is active", "Resume your active review.")
	case errors.Is(err, review.ErrAttemptExpired):
		writeProblem(w, r, 410, "capability_expired", "Refresh review access", "Reload this attempt to continue with your saved answers.")
	case errors.Is(err, review.ErrConflict):
		writeProblem(w, r, 409, "state_conflict", "Review state changed", "Reload the current review state.")
	case errors.Is(err, review.ErrEmpty):
		writeProblem(w, r, 422, "empty_review_range", "Nothing to review", "No saved batches match this selection.")
	case errors.Is(err, review.ErrValidation):
		writeProblem(w, r, 422, "validation_failed", "Check your answers", "One or more review fields are invalid.")
	default:
		writeProblem(w, r, 500, "internal_error", "Request failed", "The review could not be completed.")
	}
}
