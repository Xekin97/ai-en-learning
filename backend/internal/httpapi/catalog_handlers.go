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
	}
	models := make([]modelDTO, 0, len(options.Models))
	for _, model := range options.Models {
		models = append(models, modelDTO{ID: model.ID, Name: model.Name, Description: model.Description})
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
		Models           []modelDTO `json:"models"`
		MeaningLanguages []string   `json:"meaning_languages"`
		Scenarios        []string   `json:"scenarios"`
		Lengths          []string   `json:"lengths"`
		MaxEntries       int        `json:"max_entries"`
		Availability     struct {
			CanGenerate bool    `json:"can_generate"`
			Reason      *string `json:"reason"`
		} `json:"availability"`
		Quota quotaDTO `json:"quota"`
	}{
		Models: models, MeaningLanguages: options.MeaningLanguages, Scenarios: options.Scenarios,
		Lengths: options.Lengths, MaxEntries: options.MaxEntries,
		Availability: struct {
			CanGenerate bool    `json:"can_generate"`
			Reason      *string `json:"reason"`
		}{CanGenerate: options.CanGenerate, Reason: options.Reason},
		Quota: quotaDTO{Kind: options.Quota.Kind, Limit: options.Quota.Limit, Remaining: options.Quota.Remaining, WindowHours: 24, RefreshesAt: refreshesAt},
	})
}
