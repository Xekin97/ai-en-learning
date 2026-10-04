package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"wordweave/internal/entitlement"
	"wordweave/internal/vocabulary"
)

func (server *Server) vocabularySearch(writer http.ResponseWriter, request *http.Request) {
	query := request.URL.Query().Get("q")
	limit := 10
	if raw := request.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeProblem(writer, request, http.StatusBadRequest, "malformed_request", "Malformed request", "The limit parameter is invalid.")
			return
		}
		limit = parsed
	}
	// Validate before narrowing: large int values can wrap into 1..20 as int32.
	if limit < 1 || limit > 20 {
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "The vocabulary query is invalid.")
		return
	}
	result, err := server.vocabulary.Search(request.Context(), query, int32(limit))
	if err != nil {
		if errors.Is(err, vocabulary.ErrInvalidQuery) {
			writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "The vocabulary query is invalid.")
			return
		}
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
		return
	}
	items := make([]struct {
		Entry string `json:"entry"`
	}, 0, len(result.Items))
	for _, entry := range result.Items {
		items = append(items, struct {
			Entry string `json:"entry"`
		}{Entry: entry})
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Items             any    `json:"items"`
		VocabularyVersion string `json:"vocabulary_version"`
	}{Items: items, VocabularyVersion: result.Version})
}

func (server *Server) generationOptions(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	options, err := server.entitlement.Options(request.Context(), actor)
	if err != nil {
		if errors.Is(err, entitlement.ErrForbidden) {
			writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "Generation is not available for this account.")
			return
		}
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
		return
	}
	type modelDTO struct {
		ID          string  `json:"id"`
		Name        string  `json:"name"`
		Description *string `json:"description"`
		Access      struct {
			FromPlan   bool       `json:"from_plan"`
			CardEndsAt *time.Time `json:"card_ends_at"`
		} `json:"access"`
	}
	models := make([]modelDTO, 0, len(options.Models))
	for _, model := range options.Models {
		dto := modelDTO{ID: model.ID, Name: model.Name, Description: model.Description}
		dto.Access.FromPlan = model.FromPlan
		dto.Access.CardEndsAt = model.CardEndsAt
		models = append(models, dto)
	}
	type quotaDTO struct {
		Kind        string  `json:"kind"`
		Limit       *int    `json:"limit"`
		Remaining   *int    `json:"remaining"`
		WindowHours int     `json:"window_hours"`
		RefreshesAt *string `json:"refreshes_at"`
	}
	var refreshesAt *string
	if options.Quota.RefreshesAt != nil {
		value := options.Quota.RefreshesAt.Format(time.RFC3339)
		refreshesAt = &value
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Models           []modelDTO                `json:"models"`
		MeaningLanguages []string                  `json:"meaning_languages"`
		Scenarios        []string                  `json:"scenarios"`
		Lengths          []string                  `json:"lengths"`
		MaxEntries       int                       `json:"max_entries"`
		EffectivePlan    entitlement.EffectivePlan `json:"effective_plan"`
		ExtraQuota       entitlement.ExtraQuota    `json:"extra_quota"`
		Availability     struct {
			CanGenerate bool    `json:"can_generate"`
			Reason      *string `json:"reason"`
		} `json:"availability"`
		Quota quotaDTO `json:"quota"`
	}{
		Models: models, MeaningLanguages: options.MeaningLanguages, Scenarios: options.Scenarios,
		Lengths: options.Lengths, MaxEntries: options.MaxEntries,
		EffectivePlan: options.EffectivePlan, ExtraQuota: options.ExtraQuota,
		Availability: struct {
			CanGenerate bool    `json:"can_generate"`
			Reason      *string `json:"reason"`
		}{CanGenerate: options.CanGenerate, Reason: options.Reason},
		Quota: quotaDTO{Kind: options.Quota.Kind, Limit: options.Quota.Limit, Remaining: options.Quota.Remaining, WindowHours: 24, RefreshesAt: refreshesAt},
	})
}

func (server *Server) randomVocabulary(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Selected requiredStrings `json:"selected_entries"`
	}
	if !decodeOrProblem(w, r, &body, 1<<20) {
		return
	}
	if !body.Selected.Set {
		writeProblem(w, r, 422, "validation_failed", "Choose words", "The selected entries field is required.")
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.vocabulary.Random(r.Context(), actor, body.Selected.Values)
	if err != nil {
		if errors.Is(err, vocabulary.ErrInvalidQuery) {
			writeProblem(w, r, 422, "validation_failed", "Check selected words", "One or more selected entries are invalid.")
		} else if errors.Is(err, entitlement.ErrForbidden) {
			writeProblem(w, r, 403, "forbidden", "Unavailable", "Word selection is unavailable for this account.")
		} else {
			writeProblem(w, r, 503, "service_unavailable", "Try again", "Word selection is temporarily unavailable.")
		}
		return
	}
	writeJSON(w, r, 200, result)
}
