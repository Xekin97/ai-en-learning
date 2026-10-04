package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/diagnostics"
	"wordweave/internal/observability"
	"wordweave/internal/platform/config"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		slog.Error("administrative command failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	if len(args) > 0 && args[0] == "activate-growth" {
		return runActivateGrowth(ctx, args[1:], os.Getenv("MAINTENANCE_DATABASE_URL"))
	}
	if len(args) > 0 && args[0] == "diagnostics" {
		return diagnostics.Run(ctx, args[1:], os.Stdout)
	}
	if len(args) > 0 && args[0] == "cutover-entry-meaning" {
		return runEntryMeaningCutover(ctx, args[1:], os.Getenv("MAINTENANCE_DATABASE_URL"))
	}
	if len(args) != 1 {
		return errors.New("usage: wordweave-admin migrate|verify|create-admin|activate-growth [options]")
	}
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	observability.ConfigureLogging(cfg.LogLevel)
	pool, err := postgres.Open(ctx, cfg.AppDatabaseURL, "wordweave-admin", 2)
	if err != nil {
		return err
	}
	defer pool.Close()

	switch args[0] {
	case "migrate":
		return postgres.Migrate(ctx, pool)
	case "verify":
		return postgres.Verify(ctx, pool)
	case "create-admin":
		return createAdmin(ctx, pool, os.Getenv("ADMIN_USERNAME"), os.Getenv("ADMIN_PASSWORD"))
	default:
		return errors.New("usage: wordweave-admin migrate|verify|create-admin")
	}
}

func createAdmin(ctx context.Context, pool *pgxpool.Pool, username, password string) error {
	if !validUsername(username) {
		return errors.New("ADMIN_USERNAME must be 3-32 ASCII letters, digits, or underscores")
	}
	if err := security.ValidatePassword(password); err != nil {
		return fmt.Errorf("ADMIN_PASSWORD: %w", err)
	}
	hash, err := security.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash administrator password: %w", err)
	}
	commandCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if _, err := pool.Exec(commandCtx, `
		INSERT INTO wordweave.accounts(username, password_hash, role, group_code, status, ui_locale)
		VALUES ($1, $2, 'admin', NULL, 'active', NULL)`, username, hash); err != nil {
		return fmt.Errorf("create administrator: %w", err)
	}
	return nil
}

func validUsername(username string) bool {
	if len(username) < 3 || len(username) > 32 || strings.TrimSpace(username) != username {
		return false
	}
	for _, char := range username {
		if !((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '_') {
			return false
		}
	}
	return true
}
