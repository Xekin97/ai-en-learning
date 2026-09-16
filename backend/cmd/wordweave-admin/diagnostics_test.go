package main

import (
	"context"
	"errors"
	"testing"
	"wordweave/internal/diagnostics"
)

func TestOBS042CAdminDiagnosticsDispatchBeforeAppConfiguration(t *testing.T) {
	t.Setenv("APP_DATABASE_URL", "not-a-database")
	t.Setenv("OPENROUTER_MASTER_KEYS", "invalid-private-config")
	err := run(context.Background(), []string{"diagnostics", "unknown"})
	if !errors.Is(err, diagnostics.ErrUsage) {
		t.Fatal("ordinary app/DB config loaded before diagnostic dispatch", err)
	}
}
