package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"wordweave/internal/notices"
	"wordweave/internal/platform/business"
)

func (server *Server) writeNoticeProblem(w http.ResponseWriter, r *http.Request, err error) {
	var conflict *business.RevisionConflict
	switch {
	case errors.As(err, &conflict):
		writeProblemContext(w, r, 409, "revision_conflict", "Configuration changed", "Refresh the current configuration.", map[string]string{"current_revision": conflict.Current})
	case errors.Is(err, notices.ErrNotFound):
		writeProblem(w, r, 404, "not_found", "Not found", "This notice is unavailable.")
	case errors.Is(err, notices.ErrValidation):
		writeProblem(w, r, 422, "validation_failed", "Request could not be accepted", "One or more fields need attention.")
	default:
		writeProblem(w, r, 500, "internal_error", "Request could not be completed", "Please try again.")
	}
}

func (server *Server) listNotices(w http.ResponseWriter, r *http.Request) {
	server.noticeList(w, r, false)
}
func (server *Server) adminListNotices(w http.ResponseWriter, r *http.Request) {
	server.noticeList(w, r, true)
}
func (server *Server) noticeList(w http.ResponseWriter, r *http.Request, admin bool) {
	actor, _ := actorFromContext(r.Context())
	locale := "zh-CN"
	if actor.UILocale != nil {
		locale = *actor.UILocale
	}
	limit := 20
	var err error
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			server.writeNoticeProblem(w, r, notices.ErrValidation)
			return
		}
	}
	reminders := false
	if raw := r.URL.Query().Get("reminders_only"); raw != "" {
		if admin || (raw != "true" && raw != "false") {
			server.writeNoticeProblem(w, r, notices.ErrValidation)
			return
		}
		reminders = raw == "true"
	}
	scope := "notices:" + actor.ID.String() + ":" + locale + ":" + strconv.FormatBool(reminders) + ":" + strconv.FormatBool(admin)
	var cursor *notices.Cursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		var decoded notices.Cursor
		if err = server.cursor.Decode(scope, raw, &decoded); err != nil {
			server.writeNoticeProblem(w, r, notices.ErrValidation)
			return
		}
		cursor = &decoded
	}
	var data any
	var more bool
	var last notices.Cursor
	if admin {
		var items []notices.AdminNotice
		var revision string
		items, revision, more, err = server.notices.AdminList(r.Context(), cursor, limit)
		if err == nil && len(items) > 0 {
			n := items[len(items)-1]
			last = notices.Cursor{PublishedAt: n.PublishedAt, ID: n.ID, Revision: revision}
		}
		data = struct {
			Items    []notices.AdminNotice `json:"items"`
			Revision string                `json:"revision"`
		}{items, revision}
	} else {
		var items []notices.Notice
		items, more, err = server.notices.List(r.Context(), locale, reminders, cursor, limit)
		if err == nil && len(items) > 0 {
			n := items[len(items)-1]
			last = notices.Cursor{PublishedAt: n.PublishedAt, ID: n.ID, Remind: n.Remind}
		}
		data = struct {
			Items []notices.Notice `json:"items"`
		}{items}
	}
	if err != nil {
		server.writeNoticeProblem(w, r, err)
		return
	}
	var next *string
	if more {
		token, err := server.cursor.Encode(scope, last)
		if err != nil {
			server.writeNoticeProblem(w, r, err)
			return
		}
		next = &token
	}
	writeListJSON(w, r, data, next, more)
}
func (server *Server) getNotice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "notice_id"))
	if err != nil {
		server.writeNoticeProblem(w, r, notices.ErrNotFound)
		return
	}
	actor, _ := actorFromContext(r.Context())
	locale := "zh-CN"
	if actor.UILocale != nil {
		locale = *actor.UILocale
	}
	n, err := server.notices.Get(r.Context(), id, locale)
	if err != nil {
		server.writeNoticeProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Notice notices.Notice `json:"notice"`
	}{n})
}
func (server *Server) adminGetNotice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "notice_id"))
	if err != nil {
		server.writeNoticeProblem(w, r, notices.ErrNotFound)
		return
	}
	n, revision, err := server.notices.AdminGet(r.Context(), id)
	if err != nil {
		server.writeNoticeProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Notice   notices.AdminNotice `json:"notice"`
		Revision string              `json:"revision"`
	}{n, revision})
}

// The new switch is optional on writes; responses always include its boolean value.
// Keep other configuration fields required by the existing structural validator.
type NoticeConfigurationInput struct {
	Title      business.Bilingual `json:"title"`
	Body       business.Bilingual `json:"body_markdown"`
	Visible    bool               `json:"visible"`
	Remind     bool               `json:"remind"`
	RemindOnce bool               `json:"remind_once,omitempty"`
}

func (input NoticeConfigurationInput) domain() notices.Input {
	return notices.Input{Title: input.Title, Body: input.Body, Visible: input.Visible, Remind: input.Remind, RemindOnce: input.RemindOnce}
}

func (server *Server) adminSaveNotice(w http.ResponseWriter, r *http.Request) {
	var input NoticeConfigurationInput
	expected := ""
	update := r.Method == http.MethodPut
	if update {
		var body struct {
			NoticeConfigurationInput
			Expected string `json:"expected_revision"`
		}
		if !decodeConfiguration(w, r, &body) {
			return
		}
		input = body.NoticeConfigurationInput
		expected = body.Expected
	} else {
		if !decodeConfiguration(w, r, &input) {
			return
		}
	}
	id := uuid.Nil
	var err error
	if update {
		id, err = uuid.Parse(chi.URLParam(r, "notice_id"))
		if err != nil {
			server.writeNoticeProblem(w, r, notices.ErrNotFound)
			return
		}
	}
	actor, _ := actorFromContext(r.Context())
	n, revision, err := server.notices.Save(r.Context(), actor.ID, id, expected, input.domain())
	if err != nil {
		server.writeNoticeProblem(w, r, err)
		return
	}
	status := 201
	if update {
		status = 200
	}
	writeJSON(w, r, status, struct {
		Notice   notices.AdminNotice `json:"notice"`
		Revision string              `json:"revision"`
	}{n, revision})
}
func (server *Server) adminPreviewNotice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Body *string `json:"body_markdown"`
	}
	if !decodeOrProblem(w, r, &body, 512<<10) {
		return
	}
	if body.Body == nil {
		server.writeNoticeProblem(w, r, notices.ErrValidation)
		return
	}
	html, err := notices.Render(*body.Body)
	if err != nil {
		server.writeNoticeProblem(w, r, notices.ErrValidation)
		return
	}
	writeJSON(w, r, 200, struct {
		HTML string `json:"body_html"`
	}{html})
}
