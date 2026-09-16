package config

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestLoadRejectsMalformedOperationalValues(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv("COOKIE_SECURE", "sometimes")
	if _, err := Load(); err == nil {
		t.Fatal("invalid COOKIE_SECURE unexpectedly accepted")
	}
}

func TestLoadAcceptsCompleteConfiguration(t *testing.T) {
	setValidEnvironment(t)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PublicOrigin != "http://localhost:3000" || cfg.AppDBMaxConns != 4 || cfg.CurrentKey != 1 {
		t.Fatalf("unexpected config: %#v", cfg)
	}
}

func setValidEnvironment(t *testing.T) {
	t.Helper()
	for name, value := range map[string]string{
		"PUBLIC_ORIGIN": "http://localhost:3000", "HTTP_ADDR": ":8080", "METRICS_ADDR": ":9090",
		"APP_DATABASE_URL": "postgres://localhost/wordweave", "AI_DATABASE_URL": "postgres://localhost/wordweave",
		"SESSION_PEPPER": strings.Repeat("s", 32), "CAPABILITY_PEPPER": strings.Repeat("a", 32),
		"CSRF_HMAC_KEY": strings.Repeat("c", 32), "CURSOR_HMAC_KEY": strings.Repeat("u", 32),
		"OPENROUTER_MASTER_KEYS":         "1:" + base64.StdEncoding.EncodeToString([]byte(strings.Repeat("m", 32))),
		"OPENROUTER_CURRENT_KEY_VERSION": "1", "OPENROUTER_BASE_URL": "https://openrouter.ai/api/v1",
		"COOKIE_SECURE": "true", "LOG_LEVEL": "info", "APP_DB_MAX_CONNS": "4", "AI_DB_MAX_CONNS": "4",
		"SHUTDOWN_TIMEOUT": "30s", "DRAFT_TTL": "30m", "CLAIM_TTL": "30m", "REVIEW_ATTEMPT_TTL": "2h",
		"TRUSTED_PROXY_CIDRS": "",
	} {
		t.Setenv(name, value)
	}
}
