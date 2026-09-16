package httpapi

import (
	"context"
	"errors"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/admin"
	"wordweave/internal/ai"
	"wordweave/internal/diagnostics"
	"wordweave/internal/entitlement"
	"wordweave/internal/generation"
	"wordweave/internal/generationevidence"
	"wordweave/internal/identity"
	"wordweave/internal/learning"
	"wordweave/internal/maintenance"
	"wordweave/internal/observability"
	"wordweave/internal/platform/config"
	"wordweave/internal/platform/security"
	"wordweave/internal/review"
	"wordweave/internal/vocabulary"
)

type Server struct {
	cfg         config.Config
	pool        *pgxpool.Pool
	identity    *identity.Service
	vocabulary  *vocabulary.Service
	entitlement *entitlement.Service
	credentials *ai.CredentialStore
	openrouter  *ai.OpenRouter
	generation  *generation.Service
	evidence    *generationevidence.Manager
	learning    *learning.Service
	review      *review.Service
	admin       *admin.Service
	maintenance *maintenance.Runner
	metrics     *observability.Metrics
	authLimiter *authRateLimiter
	readyState  atomic.Bool
	csrf        security.CSRFSigner
	cursor      security.CursorSigner
}

func New(cfg config.Config, pool, aiPool *pgxpool.Pool) (*Server, error) {
	lexicon, err := ai.LoadEmbeddedLexicon()
	if err != nil {
		return nil, err
	}
	validator := ai.NewValidator(lexicon)
	envelope, err := security.NewEnvelope(cfg.MasterKeys, cfg.CurrentKey)
	if err != nil {
		return nil, err
	}
	credentials := ai.NewCredentialStore(aiPool, envelope)
	openrouter := ai.NewOpenRouter(cfg.OpenRouterBaseURL, cfg.PublicOrigin, credentials, validator)
	generationService := generation.NewService(pool, credentials, openrouter, cfg.CapabilityKey, cfg.DraftTTL, validator)
	learningService := learning.NewService(pool, generationService.Registry(), cfg.CapabilityKey, cfg.DraftTTL, cfg.ClaimTTL)
	reviewService := review.NewService(pool, cfg.CapabilityKey, cfg.AttemptTTL)
	metrics := observability.NewMetrics()
	server := &Server{
		cfg: cfg, pool: pool,
		identity:    identity.NewService(pool, cfg.SessionPepper),
		vocabulary:  vocabulary.NewService(pool),
		entitlement: entitlement.NewService(pool, aiPool),
		credentials: credentials,
		openrouter:  openrouter,
		generation:  generationService,
		learning:    learningService,
		review:      reviewService,
		admin:       admin.NewService(pool, credentials, openrouter, learningService),
		metrics:     metrics,
		authLimiter: newAuthRateLimiter(cfg.CSRFKey),
		csrf:        security.NewCSRFSigner(cfg.CSRFKey, 2*time.Hour),
		cursor:      security.NewCursorSigner(cfg.CursorKey),
	}
	server.maintenance = maintenance.New(pool, generationService, reviewService)
	server.evidence, err = diagnostics.Open(cfg.PublicOrigin)
	if err != nil {
		return nil, err
	}
	server.metrics.BindGenerationCapture(server.evidence)
	return server, nil
}

func (server *Server) SetReady(ready bool) { server.readyState.Store(ready) }

func (server *Server) RunMaintenance(ctx context.Context) { server.maintenance.Run(ctx) }

func (server *Server) Stop(ctx context.Context) error {
	return errors.Join(server.CloseDiagnostics(ctx), server.maintenance.Stop(ctx))
}

// Separate from business shutdown: startup failure can clear private evidence
// without running database settlement a second time.
func (server *Server) CloseDiagnostics(ctx context.Context) error {
	return server.evidence.Close(ctx)
}

func (server *Server) MetricsHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /internal/metrics", server.metrics.Handler(server.pool))
	return mux
}

func (server *Server) Handler() http.Handler {
	router := chi.NewRouter()
	router.Use(server.requestContext, server.recoverPanic, server.securityHeaders)
	router.NotFound(func(writer http.ResponseWriter, request *http.Request) {
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The requested resource could not be found.")
	})
	router.MethodNotAllowed(func(writer http.ResponseWriter, request *http.Request) {
		writeProblem(writer, request, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed", "This method is not available for the requested resource.")
	})

	router.Get("/health/live", server.live)
	router.Get("/health/ready", server.ready)

	router.Route("/api/v1", func(api chi.Router) {
		api.Use(server.resolveActor)
		api.Get("/bootstrap", server.bootstrap)
		api.Get("/vocabulary/search", server.vocabularySearch)
		api.Get("/generation-options", server.generationOptions)

		api.Group(func(writes chi.Router) {
			writes.Use(server.requireSafeWrite)
			writes.Post("/auth/register", server.register)
			writes.Post("/auth/login", server.login)
			writes.Post("/auth/logout", server.logout)
			writes.Post("/generations/stream", server.generationStream)
			writes.Post("/generations/{run_id}/cancel", server.cancelGeneration)
			writes.With(requireLearner).Post("/generations/{run_id}/save", server.saveGeneration)
			writes.Post("/generations/{run_id}/discard", server.discardGeneration)
			writes.Post("/generations/{run_id}/visitor-claim", server.createVisitorClaim)
			writes.With(requireLearner).Post("/visitor-claims/consume", server.consumeVisitorClaim)
			writes.With(requireLearner).Patch("/me/batches/{batch_id}", server.patchBatch)
			writes.With(requireLearner).Delete("/me/batches/{batch_id}", server.deleteBatch)
			writes.With(requireLearner).Post("/me/review-sessions", server.createReviewSession)
			writes.With(requireLearner).Post("/me/review-sessions/{session_id}/attempts", server.startReviewAttempt)
			writes.With(requireLearner).Post("/me/review-attempts/{attempt_id}/actions", server.reviewAction)
			writes.Put("/me/ui-locale", server.updateLocale)
			writes.With(requireLearner).Put("/me/password", server.changePassword)
			writes.With(requireLearner).Delete("/me/account", server.deleteAccount)
		})

		api.With(requireLearner).Get("/me/account", server.account)
		api.With(requireLearner).Get("/me/learning-summary", server.learningSummary)
		api.With(requireLearner).Get("/me/batches", server.listBatches)
		api.With(requireLearner).Get("/me/batches/{batch_id}", server.getBatch)
		api.With(requireLearner).Get("/me/review-range/preview", server.reviewRangePreview)
		api.With(requireLearner).Get("/me/review-sessions/active-range", server.activeRangeSession)
		api.With(requireLearner).Get("/me/review-sessions/{session_id}", server.getReviewSession)

		api.Route("/admin", func(admin chi.Router) {
			admin.Use(requireAdmin)
			admin.Get("/openrouter-credential", server.adminCredential)
			admin.Get("/models", server.adminListModels)
			admin.Get("/groups", server.adminListGroups)
			admin.Get("/users", server.adminListUsers)
			admin.Get("/users/{user_id}", server.adminGetUser)
			admin.Get("/users/{user_id}/batches", server.adminListUserBatches)
			admin.Get("/users/{user_id}/batches/{batch_id}", server.adminGetUserBatch)

			admin.Group(func(writes chi.Router) {
				writes.Use(server.requireSafeWrite)
				writes.Put("/openrouter-credential", server.adminPutCredential)
				writes.Post("/models", server.adminCreateModel)
				writes.Patch("/models/{model_id}", server.adminPatchModel)
				writes.Post("/models/{model_id}/enable", server.adminEnableModel)
				writes.Post("/models/{model_id}/disable", server.adminDisableModel)
				writes.Put("/groups/{group_code}", server.adminPutGroup)
				writes.Put("/users/{user_id}/group", server.adminChangeUserGroup)
				writes.Put("/users/{user_id}/password", server.adminResetUserPassword)
			})
		})
	})
	return router
}

func (server *Server) live(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte("ok\n"))
}

func (server *Server) ready(writer http.ResponseWriter, request *http.Request) {
	if !server.readyState.Load() {
		http.Error(writer, "not ready", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
	defer cancel()
	if err := server.pool.Ping(ctx); err != nil {
		http.Error(writer, "not ready", http.StatusServiceUnavailable)
		return
	}
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte("ok\n"))
}

func (server *Server) sessionCookieName() string {
	if server.cfg.CookieSecure {
		return "__Host-ww_session"
	}
	return "ww_session"
}

func (server *Server) visitorCookieName() string {
	if server.cfg.CookieSecure {
		return "__Host-ww_visitor"
	}
	return "ww_visitor"
}

func (server *Server) setSessionCookie(writer http.ResponseWriter, credential identity.Credential) {
	http.SetCookie(writer, &http.Cookie{
		Name: server.sessionCookieName(), Value: credential.Token, Path: "/",
		Secure: server.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Expires: credential.ExpiresAt,
	})
}

func (server *Server) setVisitorCookie(writer http.ResponseWriter, credential identity.Credential) {
	http.SetCookie(writer, &http.Cookie{
		Name: server.visitorCookieName(), Value: credential.Token, Path: "/",
		Secure: server.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Expires: credential.ExpiresAt,
	})
}

func (server *Server) clearSessionCookie(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{Name: server.sessionCookieName(), Value: "", Path: "/", Secure: server.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}

func (server *Server) clearVisitorCookie(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{Name: server.visitorCookieName(), Value: "", Path: "/", Secure: server.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}
