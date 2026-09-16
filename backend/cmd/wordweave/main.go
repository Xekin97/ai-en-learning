package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"wordweave/internal/ai"
	"wordweave/internal/buildinfo"
	"wordweave/internal/diagnostics"
	"wordweave/internal/httpapi"
	"wordweave/internal/maintenance"
	"wordweave/internal/observability"
	"wordweave/internal/platform/config"
	"wordweave/internal/platform/postgres"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	observability.ConfigureLogging(cfg.LogLevel)
	if _, err := diagnostics.Check(cfg.PublicOrigin); err != nil {
		return err
	}
	if info, err := buildinfo.Executable("", true); err == nil {
		slog.Info("server_build", "source_sha256", info.Source, "binary_sha256", info.Binary, "validator_sha256", info.Validator)
	} else {
		slog.Info("server_build", "provenance", "unavailable")
	}
	// Fail before startup recovery can mutate database state. httpapi.New
	// obtains the same immutable instance through the once-only loader.
	if _, err := ai.LoadEmbeddedLexicon(); err != nil {
		return err
	}
	pool, err := postgres.Open(ctx, cfg.AppDatabaseURL, "wordweave", cfg.AppDBMaxConns)
	if err != nil {
		return err
	}
	defer pool.Close()
	aiPool, err := postgres.Open(ctx, cfg.AIDatabaseURL, "wordweave-ai", cfg.AIDBMaxConns)
	if err != nil {
		return err
	}
	defer aiPool.Close()
	if err := postgres.Verify(ctx, pool); err != nil {
		return err
	}
	apiServer, err := httpapi.New(cfg, pool, aiPool)
	if err != nil {
		return err
	}
	settled, err := maintenance.SettleActiveGenerations(ctx, pool, "startup_recovery")
	if err != nil {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		return errors.Join(err, apiServer.CloseDiagnostics(cleanupCtx))
	}
	if settled > 0 {
		slog.Warn("settled orphaned generations", "count", settled)
	}

	go apiServer.RunMaintenance(ctx)

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           apiServer.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	metricsServer := &http.Server{
		Addr: cfg.MetricsAddr, Handler: apiServer.MetricsHandler(),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second,
		WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second,
	}
	errCh := make(chan error, 2)
	go func() {
		errCh <- normalizeServerError(server.ListenAndServe())
	}()
	go func() {
		errCh <- normalizeServerError(metricsServer.ListenAndServe())
	}()
	apiServer.SetReady(true)

	select {
	case <-ctx.Done():
		apiServer.SetReady(false)
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		shutdownErr := server.Shutdown(shutdownCtx)
		cancel()
		settleCtx, settleCancel := context.WithTimeout(context.Background(), 5*time.Second)
		settleErr := apiServer.Stop(settleCtx)
		settleCancel()
		if shutdownErr != nil {
			_ = server.Close()
		}
		metricsCtx, metricsCancel := context.WithTimeout(context.Background(), 5*time.Second)
		metricsErr := metricsServer.Shutdown(metricsCtx)
		metricsCancel()
		return errors.Join(shutdownErr, settleErr, metricsErr)
	case err := <-errCh:
		apiServer.SetReady(false)
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		stopErr := apiServer.Stop(stopCtx)
		cancel()
		_ = server.Close()
		_ = metricsServer.Close()
		return errors.Join(err, stopErr)
	}
}

func normalizeServerError(err error) error {
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
