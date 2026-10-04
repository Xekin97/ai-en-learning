package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"wordweave/internal/generationtrace"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

type contextKey string

const (
	requestIDKey contextKey = "request-id"
	actorKey     contextKey = "actor"
)

func (server *Server) requestContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestIDValue, err := security.RandomID("req_")
		if err != nil {
			http.Error(writer, "internal server error", http.StatusInternalServerError)
			return
		}
		started := time.Now()
		finishMetrics := server.metrics.Begin()
		wrapped := &statusWriter{ResponseWriter: writer, status: http.StatusOK}
		ctx := context.WithValue(request.Context(), requestIDKey, requestIDValue)
		if request.Method == http.MethodPost && request.URL.Path == "/api/v1/generations/stream" {
			trace := server.metrics.GenerationTrace(requestIDValue)
			ctx = generationtrace.With(ctx, trace)
			trace.Begin(generationtrace.Request)
			defer func() {
				trace.End(generationtrace.Request, generationtrace.OK, generationtrace.Why(""))
				trace.Finish()
			}()
		}
		next.ServeHTTP(wrapped, request.WithContext(ctx))
		route := chi.RouteContext(request.Context()).RoutePattern()
		finishMetrics(request.Method, route, wrapped.status)
		slog.Info("http_request", "request_id", requestIDValue, "method", request.Method, "route", route, "status", wrapped.status, "duration_ms", time.Since(started).Milliseconds())
	})
}

func (server *Server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				if trace := generationtrace.From(request.Context()); trace != nil {
					trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("panic"))
					slog.Error("http panic", "request_id", requestID(request.Context()), "reason", "panic")
				} else {
					slog.Error("http panic", "request_id", requestID(request.Context()), "error", recovered, "stack", string(debug.Stack()))
				}
				writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
			}
		}()
		next.ServeHTTP(writer, request)
	})
}

func (server *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		writer.Header().Set("Content-Security-Policy", "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if server.cfg.CookieSecure {
			writer.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(writer, request)
	})
}

func (server *Server) resolveActor(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		trace := generationtrace.From(request.Context())
		trace.Check(generationtrace.Request, "identity", -1)
		if cookie, err := request.Cookie(server.sessionCookieName()); err == nil {
			actor, resolveErr := server.identity.ResolveSession(request.Context(), cookie.Value)
			if resolveErr == nil {
				server.attachGenerationEvidence(request.Context(), actor)
				next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), actorKey, actor)))
				return
			}
			server.clearSessionCookie(writer)
			observeIdentityFailure(request.Context(), "session_resolve", resolveErr)
		}
		if cookie, err := request.Cookie(server.visitorCookieName()); err == nil {
			actor, resolveErr := server.identity.ResolveVisitor(request.Context(), cookie.Value)
			if resolveErr == nil {
				server.attachGenerationEvidence(request.Context(), actor)
				next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), actorKey, actor)))
				return
			}
			server.clearVisitorCookie(writer)
			observeIdentityFailure(request.Context(), "visitor_resolve", resolveErr)
		}
		actor, credential, err := server.identity.CreateVisitor(request.Context())
		if err != nil {
			trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("identity_unavailable"))
			writeProblem(writer, request, http.StatusServiceUnavailable, "service_unavailable", "Service unavailable", "The service is temporarily unavailable.")
			return
		}
		server.setVisitorCookie(writer, credential)
		server.attachGenerationEvidence(request.Context(), actor)
		next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), actorKey, actor)))
	})
}

func observeIdentityFailure(ctx context.Context, check string, err error) {
	reason := "identity_unavailable"
	if errors.Is(err, identity.ErrUnauthorized) {
		reason = "actor_forbidden"
	}
	if errors.Is(err, context.Canceled) {
		reason = "context_cancelled"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		reason = "deadline_exceeded"
	}
	// Preserve the existing visitor fallback. Failure is a fact, not a claim
	// that an otherwise permitted generation request must be rejected.
	generationtrace.From(ctx).Note(generationtrace.Request, check, generationtrace.Why(reason))
}

func (server *Server) attachGenerationEvidence(ctx context.Context, actor identity.Actor) {
	trace := generationtrace.From(ctx)
	if trace == nil {
		return
	} // no captures from admin probes or unrelated routes
	trace.BindActor(actor.Kind)
	if server.evidence == nil {
		return
	}
	capture := server.evidence.Admit(actor.Kind, actor.ID.String(), requestID(ctx), trace.StartedAt())
	if capture != nil {
		trace.AttachCapture(capture)
	}
}

func (server *Server) requireSafeWrite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		trace := generationtrace.From(request.Context())
		trace.Check(generationtrace.Request, "origin", -1)
		if !server.sameOrigin(request) || request.Header.Get("Sec-Fetch-Site") == "cross-site" {
			trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("origin_rejected"))
			writeProblem(writer, request, http.StatusForbidden, "csrf_failed", "Request rejected", "The request origin could not be verified.")
			return
		}
		if request.Header.Get("Sec-Fetch-Site") == "" {
			trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("origin_rejected"))
			writeProblem(writer, request, http.StatusForbidden, "csrf_failed", "Request rejected", "The request origin could not be verified.")
			return
		}
		trace.Check(generationtrace.Request, "content_type", -1)
		mediaType := strings.ToLower(strings.TrimSpace(strings.Split(request.Header.Get("Content-Type"), ";")[0]))
		if mediaType != "application/json" {
			trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("content_type_rejected"))
			writeProblem(writer, request, http.StatusBadRequest, "malformed_request", "Malformed request", "Content-Type must be application/json.")
			return
		}
		actor, ok := actorFromContext(request.Context())
		trace.Check(generationtrace.Request, "csrf", -1)
		if !ok || !server.csrf.Verify(request.Header.Get("X-CSRF-Token"), actor.CSRFSubject(), time.Now()) {
			trace.End(generationtrace.Request, generationtrace.Failed, generationtrace.Why("csrf_rejected"))
			writeProblem(writer, request, http.StatusForbidden, "csrf_failed", "Request rejected", "The security token is invalid or expired.")
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func (server *Server) sameOrigin(request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin != "" {
		return origin == server.cfg.PublicOrigin
	}
	referer := request.Header.Get("Referer")
	parsed, err := url.Parse(referer)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}
	return parsed.Scheme+"://"+parsed.Host == server.cfg.PublicOrigin
}

func requireLearner(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		actor, ok := actorFromContext(request.Context())
		if !ok || actor.IsVisitor() {
			writeProblem(writer, request, http.StatusUnauthorized, "authentication_required", "Sign in required", "Authentication is required for this operation.")
			return
		}
		if !actor.IsLearner() {
			writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "This operation is not available for this account.")
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func requireAccount(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		actor, ok := actorFromContext(request.Context())
		if !ok || actor.IsVisitor() {
			writeProblem(writer, request, http.StatusUnauthorized, "authentication_required", "Sign in required", "Authentication is required for this operation.")
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		actor, ok := actorFromContext(request.Context())
		if !ok || actor.IsVisitor() {
			writeProblem(writer, request, http.StatusUnauthorized, "authentication_required", "Sign in required", "Authentication is required for this operation.")
			return
		}
		if !actor.IsAdmin() {
			writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "Administrator access is required.")
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func requestID(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey).(string)
	return value
}

func actorFromContext(ctx context.Context) (identity.Actor, bool) {
	value, ok := ctx.Value(actorKey).(identity.Actor)
	return value, ok
}

type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (writer *statusWriter) WriteHeader(status int) {
	if writer.wrote {
		return
	}
	writer.wrote = true
	writer.status = status
	writer.ResponseWriter.WriteHeader(status)
}

func (writer *statusWriter) Write(body []byte) (int, error) {
	if !writer.wrote {
		writer.WriteHeader(http.StatusOK)
	}
	return writer.ResponseWriter.Write(body)
}

func (writer *statusWriter) Unwrap() http.ResponseWriter { return writer.ResponseWriter }

func isIdentityError(err, target error) bool {
	return errors.Is(err, target)
}
