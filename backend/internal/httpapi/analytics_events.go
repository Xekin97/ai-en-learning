package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/analytics"
	"wordweave/internal/platform/security"
)

func (s *Server) browserCookieName() string {
	if s.cfg.CookieSecure {
		return "__Host-ww_browser"
	}
	return "ww_browser"
}
func (s *Server) analyticsBrowser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, _ := actorFromContext(r.Context())
		if actor.IsAdmin() {
			next.ServeHTTP(w, r)
			return
		}
		token := ""
		if cookie, err := r.Cookie(s.browserCookieName()); err == nil {
			raw, err := base64.RawURLEncoding.Strict().DecodeString(cookie.Value)
			if err == nil && len(raw) == 32 && base64.RawURLEncoding.EncodeToString(raw) == cookie.Value {
				token = cookie.Value
			}
		}
		if token == "" {
			var err error
			token, err = security.RandomToken()
			if err != nil {
				writeProblem(w, r, 503, "temporarily_unavailable", "Temporarily unavailable", "Please try again.")
				return
			}
			http.SetCookie(w, &http.Cookie{Name: s.browserCookieName(), Value: token, Path: "/", Secure: s.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode, Expires: time.Now().AddDate(1, 0, 0)})
		}
		ctx := analytics.WithBrowser(r.Context(), security.Digest(s.cfg.SessionPepper, "analytics-browser-v1", token))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
func (s *Server) clearAnalyticsBrowser(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: s.browserCookieName(), Value: "", Path: "/", Secure: s.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}
func (s *Server) analyticsEvent(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	if actor.IsAdmin() {
		writeNoContent(w)
		return
	}
	// Unknown analytics attributes are explicitly a 422; malformed JSON remains
	// 400. No private or arbitrary payload is forwarded into the analytics store.
	var raw json.RawMessage
	if !decodeOrProblem(w, r, &raw, 8192) {
		return
	}
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil || object == nil {
		writeProblem(w, r, 400, "malformed_request", "Malformed request", "Expected an event object.")
		return
	}
	allowed := map[string]bool{"event_id": true, "kind": true, "page": true, "action": true, "source": true}
	for key, value := range object {
		if !allowed[key] || string(value) == "null" {
			writeProblem(w, r, 422, "validation_failed", "Invalid event", "Use the supported event fields.")
			return
		}
	}
	if source, ok := object["source"]; ok {
		var fields map[string]json.RawMessage
		if json.Unmarshal(source, &fields) != nil || fields == nil {
			writeProblem(w, r, 400, "malformed_request", "Malformed request", "Expected a source object.")
			return
		}
		for key, value := range fields {
			if (key != "utm_source" && key != "utm_medium" && key != "utm_campaign" && key != "referrer_host") || string(value) == "null" {
				writeProblem(w, r, 422, "validation_failed", "Invalid source", "Use the supported source fields.")
				return
			}
		}
	}
	var event analytics.Event
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&event); err != nil {
		writeProblem(w, r, 400, "malformed_request", "Malformed request", "The event format is invalid.")
		return
	}
	var owner *uuid.UUID
	if actor.IsLearner() {
		owner = &actor.ID
	}
	err := s.analytics.Record(r.Context(), owner, event)
	if errors.Is(err, analytics.ErrValidation) {
		writeProblem(w, r, 422, "validation_failed", "Invalid event", "Use the supported page and action.")
		return
	}
	if err != nil {
		writeProblem(w, r, 503, "temporarily_unavailable", "Temporarily unavailable", "Please try again.")
		return
	}
	writeNoContent(w)
}
func (s *Server) recordGenerationPrecheck(r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	if actor.IsAdmin() {
		return
	}
	var owner *uuid.UUID
	if actor.IsLearner() {
		owner = &actor.ID
	}
	if err := s.analytics.Precheck(r.Context(), owner, requestID(r.Context())); err != nil {
		slog.ErrorContext(r.Context(), "generation_precheck_event_failed", "reason", "database_operation_failed")
	}
}
