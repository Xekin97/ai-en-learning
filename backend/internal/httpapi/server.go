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
	"wordweave/internal/analytics"
	"wordweave/internal/diagnostics"
	"wordweave/internal/entitlement"
	"wordweave/internal/generation"
	"wordweave/internal/generationevidence"
	"wordweave/internal/growth"
	"wordweave/internal/identity"
	"wordweave/internal/learning"
	"wordweave/internal/maintenance"
	"wordweave/internal/notices"
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
	gateway     *ai.Gateway
	generation  *generation.Service
	evidence    *generationevidence.Manager
	learning    *learning.Service
	review      *review.Service
	admin       *admin.Service
	analytics   *analytics.Service
	notices     *notices.Service
	growth      *growth.Service
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
	initCtx, initCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer initCancel()
	if _, err = pool.Exec(initCtx, `UPDATE wordweave.ai_providers SET base_url=$1,legacy_url_pending=false WHERE id=$2 AND legacy_url_pending`, cfg.OpenRouterBaseURL, ai.LegacyProviderID); err != nil {
		return nil, err
	}
	gateway := ai.NewGateway(credentials, cfg.PublicOrigin, cfg.OpenRouterBaseURL)
	generationService := generation.NewService(pool, credentials, gateway, cfg.CapabilityKey, cfg.DraftTTL, validator)
	learningService := learning.NewService(pool, generationService.Registry(), cfg.CapabilityKey, cfg.DraftTTL, cfg.ClaimTTL)
	reviewService := review.NewService(pool, cfg.CapabilityKey, cfg.AttemptTTL)
	metrics := observability.NewMetrics()
	server := &Server{
		cfg: cfg, pool: pool,
		identity:    identity.NewService(pool, cfg.SessionPepper),
		vocabulary:  vocabulary.NewService(pool),
		entitlement: entitlement.NewService(pool, aiPool),
		credentials: credentials,
		gateway:     gateway,
		generation:  generationService,
		learning:    learningService,
		review:      reviewService,
		analytics:   analytics.NewService(pool, cfg.PublicOrigin, cfg.ClarityURL()),
		admin:       admin.NewService(pool, credentials, gateway, learningService, cfg.CapabilityKey),
		notices:     notices.NewService(pool, cfg.CapabilityKey),
		growth:      growth.NewService(pool, cfg.CapabilityKey),
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
		if request.Method == http.MethodPost && (request.URL.Path == "/api/v1/admin/growth/levels" || request.URL.Path == "/api/v1/admin/growth/achievements") {
			writeProblem(writer, request, 404, "not_found", "Not found", "The requested resource could not be found.")
			return
		}

		writeProblem(writer, request, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed", "This method is not available for the requested resource.")
	})

	router.Get("/health/live", server.live)
	router.Get("/health/ready", server.ready)

	router.Route("/api/v1", func(api chi.Router) {
		api.Use(server.resolveActor, server.analyticsBrowser)
		api.Get("/bootstrap", server.bootstrap)
		api.Get("/vocabulary/search", server.vocabularySearch)
		api.Get("/generation-options", server.generationOptions)
		api.Get("/presets", server.publicPresets)
		api.Get("/presets/{preset_id}", server.publicPreset)
		api.With(requireAccount).Get("/notices", server.listNotices)
		api.With(requireAccount).Get("/notices/{notice_id}", server.getNotice)

		api.Group(func(writes chi.Router) {
			writes.Use(server.requireSafeWrite)
			writes.Post("/analytics/events", server.analyticsEvent)
			writes.Post("/vocabulary/random", server.randomVocabulary)
			writes.Post("/auth/register", server.register)
			writes.Post("/auth/login", server.login)
			writes.Post("/auth/logout", server.logout)
			writes.Post("/generations/stream", server.generationStream)
			writes.Post("/presets/{preset_id}/generations/stream", server.presetGenerationStream)
			writes.Post("/generations/{run_id}/cancel", server.cancelGeneration)
			writes.With(requireLearner).Post("/generations/{run_id}/save", server.saveGeneration)
			writes.Post("/generations/{run_id}/discard", server.discardGeneration)
			writes.Post("/generations/{run_id}/visitor-claim", server.createVisitorClaim)
			writes.With(requireLearner).Post("/visitor-claims/consume", server.consumeVisitorClaim)
			writes.With(requireLearner).Patch("/me/batches/{batch_id}", server.patchBatch)
			writes.With(requireLearner).Delete("/me/batches/{batch_id}", server.deleteBatch)
			writes.With(requireLearner).Post("/me/review-sessions", server.createReviewSession)
			writes.With(requireLearner).Post("/me/review-sessions/{session_id}/attempts", server.startReviewAttempt)
			writes.With(requireLearner).Post("/me/review-attempts/{attempt_id}/submit", server.submitReviewAttempt)
			writes.With(requireLearner).Post("/me/review-attempts/{attempt_id}/restart", server.restartReviewAttempt)
			writes.With(requireLearner).Post("/me/review-sessions/{session_id}/replace", server.replaceReviewSession)
			writes.Put("/me/ui-locale", server.updateLocale)
			writes.With(requireLearner).Put("/me/password", server.changePassword)
			writes.With(requireLearner).Delete("/me/account", server.deleteAccount)
			writes.With(requireLearner).Patch("/me/account", server.updateProfile)
			writes.With(requireLearner).Post("/me/growth/level-rewards/{award_id}/claim", server.claimLevelReward)
			writes.With(requireLearner).Post("/me/growth/achievements/{award_id}/claim", server.claimAchievement)
			writes.With(requireLearner).Post("/shop/exchanges", server.exchangeItems)
			writes.With(requireLearner).Post("/me/growth/makeup-preview", server.makeupPreview)
			writes.With(requireLearner).Post("/me/growth/makeups", server.makeupCheckin)
			writes.With(requireLearner).Post("/me/items/{item_id}/activation-preview", server.activationPreview)
			writes.With(requireLearner).Post("/me/items/{item_id}/activate", server.activateItem)
			writes.With(requireLearner).Post("/me/items/{item_id}/refund-preview", server.refundPreview)
			writes.With(requireLearner).Post("/me/items/{item_id}/retirement-refund", server.refundItem)
		})

		api.With(requireLearner).Get("/me/account", server.account)
		api.With(requireLearner).Get("/me/growth", server.personalGrowth)
		api.With(requireLearner).Get("/me/growth/checkins", server.checkinCalendar)
		api.With(requireLearner).Get("/me/growth/level-rewards", server.personalLevelAwards)
		api.With(requireLearner).Get("/me/growth/achievements", server.personalAchievements)
		api.With(requireLearner).Get("/me/points-ledger", server.personalPointsLedger)
		api.With(requireLearner).Get("/shop/items", server.shopItems)
		api.With(requireLearner).Get("/me/items", server.ownedItems)
		api.With(requireLearner).Get("/me/learning-summary", server.learningSummary)
		api.With(requireLearner).Get("/me/batches", server.listBatches)
		api.With(requireLearner).Get("/me/batches/{batch_id}", server.getBatch)
		api.With(requireLearner).Get("/me/review-range/preview", server.reviewRangePreview)
		api.With(requireLearner).Get("/me/review-sessions/active-range", server.activeRangeSession)
		api.With(requireLearner).Get("/me/review-sessions/{session_id}", server.getReviewSession)
		api.With(requireLearner).Get("/me/review-attempts/{attempt_id}", server.getReviewAttempt)

		api.Route("/admin", func(admin chi.Router) {
			admin.Use(requireAdmin)
			admin.Get("/overview", server.adminOverview)
			admin.Get("/analytics/traffic", server.adminTraffic)
			admin.Get("/analytics/funnel", server.adminFunnel)
			admin.Get("/analytics/retention", server.adminRetention)
			admin.Get("/generation-options", server.adminGenerationOptions)
			admin.Get("/presets", server.adminPresets)
			admin.Get("/preset-preview-usage", server.adminPreviewUsage)
			admin.Get("/presets/{preset_id}", server.adminGetPreset)
			admin.Get("/model-connections", server.adminModelConnections)
			admin.Get("/model-providers", server.adminModelProviders)
			admin.Get("/models", server.adminListModels)
			admin.Get("/models/{model_id}", server.adminGetModel)
			admin.Get("/models/{model_id}/removal-impact", server.adminModelRemovalImpact)
			admin.Get("/groups", server.adminListGroups)
			admin.Get("/notices", server.adminListNotices)
			admin.Get("/notices/{notice_id}", server.adminGetNotice)
			admin.Get("/growth/settings", server.adminGrowthSettings)
			admin.Get("/growth/levels", server.adminGrowthLevels)
			admin.Get("/growth/achievements", server.adminGrowthAchievements)
			admin.Get("/growth/items", server.adminListItemDefinitions)
			admin.Get("/growth/items/{item_id}", server.adminGetItemDefinition)
			admin.Get("/growth/items/{item_id}/references", server.adminItemReferences)
			admin.Get("/users", server.adminListUsers)
			admin.Get("/users/{user_id}", server.adminGetUser)
			admin.Get("/users/{user_id}/benefits", server.adminUserBenefits)
			admin.Get("/users/{user_id}/points-ledger", server.adminPointsLedger)
			admin.Get("/users/{user_id}/batches", server.adminListUserBatches)
			admin.Get("/users/{user_id}/batches/{batch_id}", server.adminGetUserBatch)

			admin.Group(func(writes chi.Router) {
				writes.Use(server.requireSafeWrite)
				writes.Post("/presets", server.adminSavePreset)
				writes.Put("/presets/{preset_id}", server.adminSavePreset)
				writes.Post("/presets/{preset_id}/publish", server.adminPublishPreset)
				writes.Post("/presets/{preset_id}/unpublish", server.adminUnpublishPreset)
				writes.Post("/presets/{preset_id}/previews/stream", server.adminPreviewStream)
				writes.Post("/preset-previews/{preview_id}/cancel", server.adminCancelPreview)
				writes.Post("/model-connection-test", server.adminTestModelConnection)
				writes.Post("/notices", server.adminSaveNotice)
				writes.Put("/notices/{notice_id}", server.adminSaveNotice)
				writes.Post("/notices/preview", server.adminPreviewNotice)
				writes.Put("/growth/settings", server.adminSaveGrowthSettings)
				writes.Put("/growth/levels", server.adminSaveGrowthLevels)
				writes.Post("/growth/levels/impact-preview", server.adminPreviewGrowthLevels)
				writes.Put("/growth/achievements", server.adminSaveGrowthAchievements)
				writes.Post("/growth/items", server.adminCreateItemDefinition)
				writes.Put("/growth/items/{item_id}", server.adminUpdateItemDefinition)
				writes.Put("/growth/items/{item_id}/listing", server.adminSetItemListing)
				writes.Delete("/growth/items/{item_id}", server.adminDeleteItemDefinition)
				writes.Post("/models", server.adminCreateModel)
				writes.Post("/models/batch", server.adminCreateModels)
				writes.Post("/model-providers", server.adminSaveModelProvider)
				writes.Patch("/model-providers/{provider_id}", server.adminSaveModelProvider)
				writes.Patch("/models/{model_id}", server.adminPatchModel)
				writes.Delete("/models/{model_id}", server.adminRemoveModel)
				writes.Post("/models/{model_id}/enable", server.adminEnableModel)
				writes.Post("/models/{model_id}/disable", server.adminDisableModel)
				writes.Post("/groups/priority-impact", server.adminPriorityImpact)
				writes.Put("/groups/priorities", server.adminSavePriorities)
				writes.Post("/groups/{group_code}/impact-preview", server.adminGroupImpact)
				writes.Put("/groups/{group_code}", server.adminPutGroup)
				writes.Put("/users/{user_id}/group", server.adminChangeUserGroup)
				writes.Put("/users/{user_id}/password", server.adminResetUserPassword)
				writes.Post("/users/{user_id}/point-grants", server.adminGrantPoints)
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
