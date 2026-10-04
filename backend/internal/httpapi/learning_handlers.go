package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"wordweave/internal/learning"
	"wordweave/internal/platform/business"
)

func (server *Server) saveGeneration(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	batch, reused, err := server.learning.Save(request.Context(), actor, chi.URLParam(request, "run_id"), request.Header.Get("X-Generation-Token"))
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	status := http.StatusCreated
	if reused {
		status = http.StatusOK
	}
	writeJSON(writer, request, status, struct {
		BatchID string `json:"batch_id"`
		SavedAt string `json:"saved_at"`
		Title   string `json:"title"`
	}{BatchID: batch.ID.String(), SavedAt: batch.SavedAt.Format(time.RFC3339Nano), Title: batch.Title})
}

func (server *Server) discardGeneration(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if err := server.learning.Discard(request.Context(), actor, chi.URLParam(request, "run_id"), request.Header.Get("X-Generation-Token")); err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeNoContent(writer)
}

func (server *Server) createVisitorClaim(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	claim, err := server.learning.CreateClaim(request.Context(), actor, chi.URLParam(request, "run_id"), request.Header.Get("X-Generation-Token"))
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		ClaimToken string `json:"claim_token"`
		ExpiresAt  string `json:"expires_at"`
	}{ClaimToken: claim.Token, ExpiresAt: claim.ExpiresAt.Format(time.RFC3339Nano)})
}

func (server *Server) consumeVisitorClaim(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	batch, reused, err := server.learning.ConsumeClaim(request.Context(), actor, request.Header.Get("X-Claim-Token"))
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	status := http.StatusCreated
	if reused {
		status = http.StatusOK
	}
	writeJSON(writer, request, status, struct {
		BatchID string `json:"batch_id"`
		Claimed bool   `json:"claimed"`
		Title   string `json:"title"`
	}{batch.ID.String(), true, batch.Title})
}

func (server *Server) learningSummary(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	summary, err := server.learning.Summary(request.Context(), actor.ID)
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		GenerationCount                 int `json:"generation_count"`
		UniqueLearnedEntries            int `json:"unique_learned_entries"`
		ParticipatingBatches            int `json:"participating_batches"`
		PausedBatches                   int `json:"paused_batches"`
		SuccessfulReviewCount           int `json:"successful_review_count"`
		BatchesEverReviewedSuccessfully int `json:"batches_ever_reviewed_successfully"`
	}{
		GenerationCount: summary.GenerationCount, UniqueLearnedEntries: summary.UniqueLearnedEntries,
		ParticipatingBatches: summary.ParticipatingBatches, PausedBatches: summary.PausedBatches,
		SuccessfulReviewCount:           summary.SuccessfulReviewCount,
		BatchesEverReviewedSuccessfully: summary.BatchesEverReviewedSuccessfully,
	})
}

func (server *Server) listBatches(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	limit := 20
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			server.writeLearningProblem(writer, request, learning.ErrValidation)
			return
		}
		limit = parsed
	}
	var entry *string
	if raw := request.URL.Query().Get("entry"); raw != "" {
		normalized := learning.NormalizeEntryQuery(raw)
		entry = &normalized
	}
	scope := "learner-batches:" + actor.ID.String() + ":"
	if entry != nil {
		scope += *entry
	}
	var cursor *learning.BatchCursor
	if raw := request.URL.Query().Get("cursor"); raw != "" {
		var decoded learning.BatchCursor
		if err := server.cursor.Decode(scope, raw, &decoded); err != nil {
			server.writeLearningProblem(writer, request, learning.ErrValidation)
			return
		}
		cursor = &decoded
	}
	items, hasMore, err := server.learning.ListBatches(request.Context(), actor.ID, entry, cursor, limit)
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	dtos := make([]batchSummaryDTO, 0, len(items))
	for _, item := range items {
		dto := mapBatchSummary(item)
		if item.ResumeSessionID == nil {
			dto.SingleBatchReview = &singleBatchReviewDTO{Action: "start", SessionID: nil}
		} else {
			sessionID := item.ResumeSessionID.String()
			dto.SingleBatchReview = &singleBatchReviewDTO{Action: "resume", SessionID: &sessionID}
		}
		dtos = append(dtos, dto)
	}
	var nextCursor *string
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		encoded, err := server.cursor.Encode(scope, learning.BatchCursor{SavedAt: last.SavedAt, ID: last.ID})
		if err != nil {
			server.writeLearningProblem(writer, request, err)
			return
		}
		nextCursor = &encoded
	}
	writeListJSON(writer, request, struct {
		Items []batchSummaryDTO `json:"items"`
	}{Items: dtos}, nextCursor, hasMore)
}

func (server *Server) getBatch(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	batchID, err := uuid.Parse(chi.URLParam(request, "batch_id"))
	if err != nil {
		server.writeLearningProblem(writer, request, learning.ErrNotFound)
		return
	}
	detail, err := server.learning.BatchDetail(request.Context(), actor.ID, batchID)
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Batch batchDetailDTO `json:"batch"`
	}{Batch: mapBatchDetail(detail)})
}

func (server *Server) patchBatch(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Participates     requiredBool   `json:"participates_in_range_review"`
		Title            optionalString `json:"title"`
		ExpectedRevision optionalString `json:"expected_title_revision"`
	}
	if !decodeOrProblem(writer, request, &body, 1<<20) {
		return
	}
	if (body.Participates.Set && (body.Title.Set || body.ExpectedRevision.Set)) || (!body.Participates.Set && (!body.Title.Set || body.Title.Value == nil || !body.ExpectedRevision.Set || body.ExpectedRevision.Value == nil)) {
		server.writeLearningProblem(writer, request, learning.ErrValidation)
		return
	}
	actor, _ := actorFromContext(request.Context())
	batchID, err := uuid.Parse(chi.URLParam(request, "batch_id"))
	if err != nil {
		server.writeLearningProblem(writer, request, learning.ErrNotFound)
		return
	}
	if body.Title.Set {
		result, err := server.learning.SetTitle(request.Context(), actor.ID, batchID, *body.Title.Value, *body.ExpectedRevision.Value)
		if err != nil {
			server.writeLearningProblem(writer, request, err)
			return
		}
		writeJSON(writer, request, http.StatusOK, result)
		return
	}
	if err := server.learning.SetRangeParticipation(request.Context(), actor.ID, batchID, body.Participates.Value); err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		BatchID      string `json:"batch_id"`
		Participates bool   `json:"participates_in_range_review"`
	}{BatchID: batchID.String(), Participates: body.Participates.Value})
}

type requiredBool struct {
	Set   bool
	Value bool
}

func (value *requiredBool) UnmarshalJSON(raw []byte) error {
	if string(raw) == "null" {
		return errors.New("boolean cannot be null")
	}
	if err := json.Unmarshal(raw, &value.Value); err != nil {
		return err
	}
	value.Set = true
	return nil
}

func (server *Server) deleteBatch(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	batchID, err := uuid.Parse(chi.URLParam(request, "batch_id"))
	if err != nil {
		server.writeLearningProblem(writer, request, learning.ErrNotFound)
		return
	}
	if err := server.learning.DeleteBatch(request.Context(), actor.ID, batchID); err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeNoContent(writer)
}

type singleBatchReviewDTO struct {
	Action    string  `json:"action"`
	SessionID *string `json:"session_id"`
}

type batchSummaryDTO struct {
	Title          string   `json:"title"`
	TitleRevision  string   `json:"title_revision"`
	ID             string   `json:"id"`
	SavedAt        string   `json:"saved_at"`
	PassagePreview string   `json:"passage_preview"`
	Tags           []string `json:"tags"`
	Entries        []string `json:"entries"`
	Model          struct {
		Name string `json:"name"`
	} `json:"model"`
	MeaningLanguage           string                `json:"meaning_language"`
	Scenario                  string                `json:"scenario"`
	Length                    string                `json:"length"`
	ParticipatesInRangeReview bool                  `json:"participates_in_range_review"`
	SingleBatchReview         *singleBatchReviewDTO `json:"single_batch_review,omitempty"`
}

func mapBatchSummary(item learning.BatchSummary) batchSummaryDTO {
	dto := batchSummaryDTO{
		Title: item.Title, TitleRevision: item.TitleRevision,
		ID: item.ID.String(), SavedAt: item.SavedAt.Format(time.RFC3339Nano), PassagePreview: item.PassagePreview,
		Tags: item.Tags, Entries: item.Entries, MeaningLanguage: item.MeaningLanguage,
		Scenario: item.Scenario, Length: item.Length,
		ParticipatesInRangeReview: item.ParticipatesInRangeReview,
	}
	dto.Model.Name = item.ModelName
	return dto
}

type batchDetailDTO struct {
	Title          string `json:"title"`
	TitleRevision  string `json:"title_revision"`
	TitleMaxLength int    `json:"title_max_length"`
	ID             string `json:"id"`
	SavedAt        string `json:"saved_at"`
	Configuration  struct {
		Model struct {
			Name string `json:"name"`
		} `json:"model"`
		MeaningLanguage string `json:"meaning_language"`
		Scenario        string `json:"scenario"`
		Length          string `json:"length"`
	} `json:"configuration"`
	ParticipatesInRangeReview bool              `json:"participates_in_range_review"`
	Passage                   string            `json:"passage"`
	Tags                      []string          `json:"tags"`
	Targets                   []targetDetailDTO `json:"targets"`
	ReviewSummary             struct {
		CompletedCount  int     `json:"completed_count"`
		SuccessfulCount int     `json:"successful_count"`
		LastCompletedAt *string `json:"last_completed_at"`
	} `json:"review_summary"`
}

type targetDetailDTO struct {
	Entry        string `json:"entry"`
	EntryMeaning string `json:"entry_meaning"`
	HintPhrase   string `json:"hint_phrase"`
	HintBlanks   []struct {
		Start int `json:"start"`
		End   int `json:"end"`
	} `json:"hint_blanks"`
	Occurrences []struct {
		Surface string `json:"surface"`
		Start   int    `json:"start"`
		End     int    `json:"end"`
	} `json:"occurrences"`
}

func mapBatchDetail(detail learning.BatchDetail) batchDetailDTO {
	dto := batchDetailDTO{
		Title: detail.Title, TitleRevision: detail.TitleRevision, TitleMaxLength: detail.TitleMaxLength,
		ID: detail.ID.String(), SavedAt: detail.SavedAt.Format(time.RFC3339Nano),
		ParticipatesInRangeReview: detail.ParticipatesInRangeReview,
		Passage:                   detail.Passage, Tags: detail.Tags,
	}
	dto.Configuration.Model.Name = detail.ModelName
	dto.Configuration.MeaningLanguage = detail.MeaningLanguage
	dto.Configuration.Scenario = detail.Scenario
	dto.Configuration.Length = detail.Length
	dto.ReviewSummary.CompletedCount = detail.Review.CompletedCount
	dto.ReviewSummary.SuccessfulCount = detail.Review.SuccessfulCount
	if detail.Review.LastCompletedAt != nil {
		value := detail.Review.LastCompletedAt.Format(time.RFC3339Nano)
		dto.ReviewSummary.LastCompletedAt = &value
	}
	dto.Targets = make([]targetDetailDTO, 0, len(detail.Targets))
	for _, target := range detail.Targets {
		targetDTO := targetDetailDTO{Entry: target.Entry, EntryMeaning: target.EntryMeaning, HintPhrase: target.HintPhrase}
		targetDTO.HintBlanks = make([]struct {
			Start int `json:"start"`
			End   int `json:"end"`
		}, 0, len(target.HintBlanks))
		for _, blank := range target.HintBlanks {
			targetDTO.HintBlanks = append(targetDTO.HintBlanks, struct {
				Start int `json:"start"`
				End   int `json:"end"`
			}{Start: blank.Start, End: blank.End})
		}
		targetDTO.Occurrences = make([]struct {
			Surface string `json:"surface"`
			Start   int    `json:"start"`
			End     int    `json:"end"`
		}, 0, len(target.Occurrences))
		for _, occurrence := range target.Occurrences {
			targetDTO.Occurrences = append(targetDTO.Occurrences, struct {
				Surface string `json:"surface"`
				Start   int    `json:"start"`
				End     int    `json:"end"`
			}{Surface: occurrence.Surface, Start: occurrence.Start, End: occurrence.End})
		}
		dto.Targets = append(dto.Targets, targetDTO)
	}
	return dto
}

func (server *Server) writeLearningProblem(writer http.ResponseWriter, request *http.Request, err error) {
	var conflict *business.RevisionConflict
	if errors.As(err, &conflict) {
		writeProblemContext(writer, request, http.StatusConflict, "revision_conflict", "Content changed", "Reload the current version before saving.", struct {
			Current string `json:"current_revision"`
		}{conflict.Current})
		return
	}
	switch {
	case errors.Is(err, learning.ErrNotFound):
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The requested resource could not be found.")
	case errors.Is(err, learning.ErrCapabilityExpired):
		writeProblem(writer, request, http.StatusGone, "capability_expired", "Action expired", "This temporary action has expired.")
	case errors.Is(err, learning.ErrConflict):
		writeProblem(writer, request, http.StatusConflict, "state_conflict", "Action conflict", "The resource is already in another state.")
	case errors.Is(err, learning.ErrValidation):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.")
	case errors.Is(err, learning.ErrForbidden):
		writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "This operation is not available for this account.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}
