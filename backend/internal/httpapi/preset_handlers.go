package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"wordweave/internal/entitlement"
	"wordweave/internal/generation"
	"wordweave/internal/platform/business"
)

func (s *Server) writePresetProblem(w http.ResponseWriter, r *http.Request, err error) {
	var conflict *business.RevisionConflict
	var domain generation.PresetError
	switch {
	case errors.As(err, &conflict):
		writeProblemContext(w, r, 409, "revision_conflict", "Configuration changed", "Refresh the current configuration.", map[string]string{"current_revision": conflict.Current})
	case errors.As(err, &domain):
		status := 422
		if domain == generation.ErrPresetChanged {
			status = 409
		}
		if domain == generation.ErrPresetUnavailable {
			status = 404
		}
		code := string(domain)
		if domain == generation.ErrPresetInvalidReference {
			code = "preset_unavailable"
		}
		writeProblem(w, r, status, code, "Preset unavailable", "Refresh the preset and check its configuration.")
	case errors.Is(err, generation.ErrInvalidInput), errors.Is(err, generation.ErrForbidden), errors.Is(err, generation.ErrQuotaExhausted), errors.Is(err, generation.ErrGenerationInProgress), errors.Is(err, generation.ErrGenerationUnavailable):
		s.writeGenerationProblem(w, r, err)
	case errors.Is(err, generation.ErrRunNotFound):
		writeProblem(w, r, 404, "not_found", "Not found", "The preview could not be found.")
	default:
		writeProblem(w, r, 503, "temporarily_unavailable", "Temporarily unavailable", "Please try again.")
	}
}
func (s *Server) adminGenerationOptions(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r) {
		return
	}
	data, err := s.generation.AdminGenerationOptions(r.Context())
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, data)
}
func (s *Server) adminSavePreset(w http.ResponseWriter, r *http.Request) {
	var input generation.PresetInput
	expected := ""
	id := uuid.Nil
	status := 201
	if r.Method == http.MethodPut {
		var body struct {
			generation.PresetInput
			Expected string `json:"expected_revision"`
		}
		if !decodeConfiguration(w, r, &body) {
			return
		}
		input = body.PresetInput
		expected = body.Expected
		status = 200
		var err error
		id, err = uuid.Parse(chi.URLParam(r, "preset_id"))
		if err != nil {
			s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
			return
		}
	} else {
		if !decodeConfiguration(w, r, &input) {
			return
		}
	}
	actor, _ := actorFromContext(r.Context())
	p, revision, err := s.generation.SavePreset(r.Context(), actor, id, input, expected)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	writeJSON(w, r, status, struct {
		Preset   generation.AdminPreset `json:"preset"`
		Revision string                 `json:"revision"`
	}{p, revision})
}
func (s *Server) adminGetPreset(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "preset_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
		return
	}
	p, rev, err := s.generation.AdminPreset(r.Context(), id)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Preset   generation.AdminPreset `json:"preset"`
		Revision string                 `json:"revision"`
	}{p, rev})
}
func (s *Server) adminPublishPreset(w http.ResponseWriter, r *http.Request) {
	s.publishPreset(w, r, true)
}
func (s *Server) adminUnpublishPreset(w http.ResponseWriter, r *http.Request) {
	s.publishPreset(w, r, false)
}
func (s *Server) publishPreset(w http.ResponseWriter, r *http.Request, publish bool) {
	id, err := uuid.Parse(chi.URLParam(r, "preset_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
		return
	}
	var version uuid.UUID
	var expected string
	var confirmed bool
	if publish {
		var body struct {
			Version   uuid.UUID `json:"draft_version"`
			Expected  string    `json:"expected_revision"`
			Confirmed bool      `json:"confirmed"`
		}
		if !decodeConfiguration(w, r, &body) {
			return
		}
		version = body.Version
		expected = body.Expected
		confirmed = body.Confirmed
	} else {
		var body struct {
			Expected  string `json:"expected_revision"`
			Confirmed bool   `json:"confirmed"`
		}
		if !decodeConfiguration(w, r, &body) {
			return
		}
		expected = body.Expected
		confirmed = body.Confirmed
	}
	if !confirmed {
		s.writePresetProblem(w, r, generation.ErrInvalidInput)
		return
	}
	actor, _ := actorFromContext(r.Context())
	p, rev, err := s.generation.PublishPreset(r.Context(), actor, id, version, expected, publish)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Preset   generation.AdminPreset `json:"preset"`
		Revision string                 `json:"revision"`
	}{p, rev})
}
func (s *Server) publicPresets(w http.ResponseWriter, r *http.Request) { s.presetList(w, r, false) }
func (s *Server) adminPresets(w http.ResponseWriter, r *http.Request)  { s.presetList(w, r, true) }
func (s *Server) presetList(w http.ResponseWriter, r *http.Request, admin bool) {
	allowed := []string{"cursor", "limit"}
	if !admin {
		allowed = append(allowed, "meaning_language")
	}
	if !configurationQuery(w, r, allowed...) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	if !admin && actor.IsAdmin() {
		s.writePresetProblem(w, r, generation.ErrForbidden)
		return
	}
	limit := 20
	var err error
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
	}
	if err != nil || limit < 1 || limit > 100 {
		s.writePresetProblem(w, r, generation.ErrInvalidInput)
		return
	}
	language := r.URL.Query().Get("meaning_language")
	scope := "presets:" + actor.ID.String() + ":" + strconv.FormatBool(admin) + ":" + language
	var cursor *generation.PresetCursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		cursor = &generation.PresetCursor{}
		if s.cursor.Decode(scope, raw, cursor) != nil {
			writeProblem(w, r, 400, "invalid_cursor", "Invalid cursor", "Refresh the list.")
			return
		}
	}
	var data any
	var more bool
	var last generation.PresetCursor
	if admin {
		var items []generation.AdminPreset
		var rev string
		items, rev, more, err = s.generation.AdminPresets(r.Context(), cursor, limit)
		if len(items) > 0 {
			p := items[len(items)-1]
			last = generation.PresetCursor{At: p.UpdatedAt, ID: p.ID, Revision: rev}
		}
		data = struct {
			Items    []generation.AdminPreset `json:"items"`
			Revision string                   `json:"revision"`
		}{items, rev}
	} else {
		var items []generation.PublicPreset
		items, more, err = s.generation.PublicPresets(r.Context(), language, cursor, limit)
		if len(items) > 0 {
			p := items[len(items)-1]
			last = generation.PresetCursor{At: p.VersionCreatedAt, ID: p.ID}
		}
		data = struct {
			Items []generation.PublicPreset `json:"items"`
		}{items}
	}
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	var next *string
	if more {
		token, e := s.cursor.Encode(scope, last)
		if e != nil {
			s.writePresetProblem(w, r, e)
			return
		}
		next = &token
	}
	writeListJSON(w, r, data, next, more)
}
func (s *Server) publicPreset(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "preset_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
		return
	}
	actor, _ := actorFromContext(r.Context())
	p, err := s.generation.PresetDetail(r.Context(), actor, id)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Preset      generation.PublicPreset `json:"preset"`
		Quota       entitlement.Quota       `json:"quota"`
		Extra       entitlement.ExtraQuota  `json:"extra_quota"`
		CanStart    bool                    `json:"can_start"`
		BlockReason *string                 `json:"block_reason"`
	}{p.Preset, p.Quota, p.Extra, p.CanStart, p.BlockReason})
}
func (s *Server) presetGenerationStream(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	id, err := uuid.Parse(chi.URLParam(r, "preset_id"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrPresetUnavailable)
		return
	}
	var body struct {
		Version uuid.UUID `json:"published_version"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	run, err := s.generation.StartPreset(r.Context(), actor, id, body.Version)
	if err != nil {
		s.recordGenerationPrecheck(r)
		s.writePresetProblem(w, r, err)
		return
	}
	s.streamGenerationRun(w, r, run, started)
}
func (s *Server) adminPreviewUsage(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r, "start_date", "end_date", "cursor", "limit") {
		return
	}
	start, err := time.Parse("2006-01-02", r.URL.Query().Get("start_date"))
	if err != nil {
		s.writePresetProblem(w, r, generation.ErrInvalidInput)
		return
	}
	end, err := time.Parse("2006-01-02", r.URL.Query().Get("end_date"))
	if err != nil || start.After(end) {
		s.writePresetProblem(w, r, generation.ErrInvalidInput)
		return
	}
	limit := 20
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
	}
	if err != nil || limit < 1 || limit > 100 {
		s.writePresetProblem(w, r, generation.ErrInvalidInput)
		return
	}
	actor, _ := actorFromContext(r.Context())
	scope := "preview-usage:" + actor.ID.String() + ":" + start.Format("2006-01-02") + ":" + end.Format("2006-01-02")
	var cursor *generation.PresetCursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		cursor = &generation.PresetCursor{}
		if s.cursor.Decode(scope, raw, cursor) != nil {
			writeProblem(w, r, 400, "invalid_cursor", "Invalid cursor", "Refresh the list.")
			return
		}
	}
	summary, items, more, err := s.generation.PreviewUsageHistory(r.Context(), start, end, cursor, limit)
	if err != nil {
		s.writePresetProblem(w, r, err)
		return
	}
	var next *string
	if more {
		last := items[len(items)-1]
		token, err := s.cursor.Encode(scope, generation.PresetCursor{At: last.StartedAt, ID: last.ID})
		if err != nil {
			s.writePresetProblem(w, r, err)
			return
		}
		next = &token
	}
	writeListJSON(w, r, struct {
		Summary generation.UsageSummary   `json:"summary"`
		Items   []generation.PreviewUsage `json:"items"`
	}{summary, items}, next, more)
}
