package httpapi

import (
	"errors"
	"net/http"
	"wordweave/internal/growth"
	"wordweave/internal/platform/business"
)

func (server *Server) writeGrowthProblem(w http.ResponseWriter, r *http.Request, err error) {
	var validation *growth.ValidationError
	var conflict *business.RevisionConflict
	var domain *growth.DomainError
	switch {
	case errors.As(err, &domain):
		writeProblem(w, r, domain.Status, domain.Code, "Request could not be accepted", "The operation is not available in the current state.")
	case errors.Is(err, growth.ErrNotFound), errors.Is(err, business.ErrNotFound):
		writeProblem(w, r, 404, "not_found", "Not found", "The requested resource could not be found.")
	case errors.As(err, &validation):
		writeConfigurationValidation(w, r, validation)
	case errors.As(err, &conflict):
		writeProblemContext(w, r, 409, "revision_conflict", "Configuration changed", "Refresh the current configuration.", map[string]string{"current_revision": conflict.Current})
	case errors.Is(err, growth.ErrImpactChanged):
		writeProblem(w, r, 409, "impact_changed", "Confirmation changed", "Preview the changes again.")
	case errors.Is(err, growth.ErrPreviewStale):
		writeProblem(w, r, 409, "preview_stale", "Confirmation expired", "Preview the changes again.")
	default:
		writeProblem(w, r, 500, "internal_error", "Request could not be completed", "Please try again.")
	}
}
func configurationQuery(w http.ResponseWriter, r *http.Request, allowed ...string) bool {
	for key, values := range r.URL.Query() {
		valid := false
		for _, name := range allowed {
			if key == name {
				valid = true
				break
			}
		}
		if !valid || len(values) != 1 {
			writeProblem(w, r, 422, "validation_failed", "Request could not be accepted", "This configuration does not support the supplied query.", fieldError{"/" + key, "invalid"})
			return false
		}
	}
	return true
}
func (server *Server) adminGrowthSettings(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r) {
		return
	}
	result, err := server.growth.GetSettings(r.Context())
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) adminSaveGrowthSettings(w http.ResponseWriter, r *http.Request) {
	var body growth.SettingsInput
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.growth.SaveSettings(r.Context(), actor.ID, body)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) adminGrowthLevels(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r) {
		return
	}
	result, err := server.growth.Levels(r.Context())
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) adminPreviewGrowthLevels(w http.ResponseWriter, r *http.Request) {
	var body growth.LevelChanges
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.growth.PreviewLevels(r.Context(), actor.ID.String()+":"+actor.SessionID.String(), body)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) adminSaveGrowthLevels(w http.ResponseWriter, r *http.Request) {
	var body growth.LevelSave
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.growth.SaveLevels(r.Context(), actor.ID.String()+":"+actor.SessionID.String(), body)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) adminGrowthAchievements(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r, "kind") {
		return
	}
	result, err := server.growth.Achievements(r.Context(), r.URL.Query().Get("kind"))
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) adminSaveGrowthAchievements(w http.ResponseWriter, r *http.Request) {
	var body growth.AchievementChanges
	if !decodeConfiguration(w, r, &body) {
		return
	}
	result, err := server.growth.SaveAchievements(r.Context(), body)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
