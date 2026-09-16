package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const minSecretBytes = 32

type Config struct {
	HTTPAddr          string
	MetricsAddr       string
	PublicOrigin      string
	OpenRouterBaseURL string
	AppDatabaseURL    string
	AIDatabaseURL     string
	SessionPepper     []byte
	CapabilityKey     []byte
	CSRFKey           []byte
	CursorKey         []byte
	MasterKeys        map[int][]byte
	CurrentKey        int
	CookieSecure      bool
	LogLevel          string
	AppDBMaxConns     int32
	AIDBMaxConns      int32
	ShutdownTimeout   time.Duration
	DraftTTL          time.Duration
	ClaimTTL          time.Duration
	AttemptTTL        time.Duration
	TrustedProxyCIDRs []*net.IPNet
}

func Load() (Config, error) {
	cookieSecure, err := envBoolStrict("COOKIE_SECURE", true)
	if err != nil {
		return Config{}, err
	}
	appMaxConns, err := envIntStrict("APP_DB_MAX_CONNS", 4)
	if err != nil {
		return Config{}, err
	}
	aiMaxConns, err := envIntStrict("AI_DB_MAX_CONNS", 4)
	if err != nil {
		return Config{}, err
	}
	shutdownTimeout, err := envDurationStrict("SHUTDOWN_TIMEOUT", 30*time.Second)
	if err != nil {
		return Config{}, err
	}
	draftTTL, err := envDurationStrict("DRAFT_TTL", 30*time.Minute)
	if err != nil {
		return Config{}, err
	}
	claimTTL, err := envDurationStrict("CLAIM_TTL", 30*time.Minute)
	if err != nil {
		return Config{}, err
	}
	attemptTTL, err := envDurationStrict("REVIEW_ATTEMPT_TTL", 2*time.Hour)
	if err != nil {
		return Config{}, err
	}
	trustedProxyCIDRs, err := parseCIDRs(os.Getenv("TRUSTED_PROXY_CIDRS"))
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		HTTPAddr:          envOr("HTTP_ADDR", ":8080"),
		MetricsAddr:       envOr("METRICS_ADDR", ":9090"),
		PublicOrigin:      os.Getenv("PUBLIC_ORIGIN"),
		OpenRouterBaseURL: envOr("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
		AppDatabaseURL:    os.Getenv("APP_DATABASE_URL"),
		AIDatabaseURL:     os.Getenv("AI_DATABASE_URL"),
		SessionPepper:     []byte(os.Getenv("SESSION_PEPPER")),
		CapabilityKey:     []byte(os.Getenv("CAPABILITY_PEPPER")),
		CSRFKey:           []byte(os.Getenv("CSRF_HMAC_KEY")),
		CursorKey:         []byte(os.Getenv("CURSOR_HMAC_KEY")),
		CookieSecure:      cookieSecure,
		LogLevel:          envOr("LOG_LEVEL", "info"),
		AppDBMaxConns:     int32(appMaxConns),
		AIDBMaxConns:      int32(aiMaxConns),
		ShutdownTimeout:   shutdownTimeout,
		DraftTTL:          draftTTL,
		ClaimTTL:          claimTTL,
		AttemptTTL:        attemptTTL,
		TrustedProxyCIDRs: trustedProxyCIDRs,
	}

	if cfg.AIDatabaseURL == "" {
		cfg.AIDatabaseURL = cfg.AppDatabaseURL
	}
	if err := cfg.validate(); err != nil {
		return Config{}, err
	}

	keys, current, err := parseMasterKeys(os.Getenv("OPENROUTER_MASTER_KEYS"), os.Getenv("OPENROUTER_CURRENT_KEY_VERSION"))
	if err != nil {
		return Config{}, err
	}
	cfg.MasterKeys = keys
	cfg.CurrentKey = current
	return cfg, nil
}

func (c Config) validate() error {
	var errs []error
	if c.PublicOrigin == "" {
		errs = append(errs, errors.New("PUBLIC_ORIGIN is required"))
	} else if parsed, err := url.Parse(c.PublicOrigin); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") ||
		parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		errs = append(errs, errors.New("PUBLIC_ORIGIN must be an origin without a path"))
	}
	if _, _, err := net.SplitHostPort(c.HTTPAddr); err != nil {
		errs = append(errs, errors.New("HTTP_ADDR must contain a host and port"))
	}
	if _, _, err := net.SplitHostPort(c.MetricsAddr); err != nil {
		errs = append(errs, errors.New("METRICS_ADDR must contain a host and port"))
	}
	if parsed, err := url.Parse(c.OpenRouterBaseURL); err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		errs = append(errs, errors.New("OPENROUTER_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment"))
	}
	if c.AppDatabaseURL == "" {
		errs = append(errs, errors.New("APP_DATABASE_URL is required"))
	}
	for name, value := range map[string][]byte{
		"SESSION_PEPPER":    c.SessionPepper,
		"CAPABILITY_PEPPER": c.CapabilityKey,
		"CSRF_HMAC_KEY":     c.CSRFKey,
		"CURSOR_HMAC_KEY":   c.CursorKey,
	} {
		if len(value) < minSecretBytes {
			errs = append(errs, fmt.Errorf("%s must contain at least %d bytes", name, minSecretBytes))
		}
	}
	if c.AppDBMaxConns < 1 || c.AIDBMaxConns < 1 {
		errs = append(errs, errors.New("database pool sizes must be positive"))
	}
	if c.LogLevel != "debug" && c.LogLevel != "info" && c.LogLevel != "warn" && c.LogLevel != "error" {
		errs = append(errs, errors.New("LOG_LEVEL must be debug, info, warn, or error"))
	}
	if c.DraftTTL <= 0 || c.ClaimTTL <= 0 || c.AttemptTTL <= 0 || c.ShutdownTimeout <= 0 {
		errs = append(errs, errors.New("configured durations must be positive"))
	}
	return errors.Join(errs...)
}

func parseMasterKeys(raw, currentRaw string) (map[int][]byte, int, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, 0, errors.New("OPENROUTER_MASTER_KEYS is required")
	}
	keys := make(map[int][]byte)
	for _, item := range strings.Split(raw, ",") {
		versionRaw, encoded, ok := strings.Cut(strings.TrimSpace(item), ":")
		if !ok {
			return nil, 0, errors.New("OPENROUTER_MASTER_KEYS entries must be version:base64")
		}
		version, err := strconv.Atoi(versionRaw)
		if err != nil || version < 1 {
			return nil, 0, fmt.Errorf("invalid OpenRouter master key version %q", versionRaw)
		}
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(decoded) != 32 {
			return nil, 0, fmt.Errorf("OpenRouter master key version %d must be exactly 32 base64-encoded bytes", version)
		}
		keys[version] = decoded
	}
	current, err := strconv.Atoi(currentRaw)
	if err != nil || current < 1 {
		return nil, 0, errors.New("OPENROUTER_CURRENT_KEY_VERSION must be a positive integer")
	}
	if _, ok := keys[current]; !ok {
		return nil, 0, errors.New("current OpenRouter master key version is not configured")
	}
	return keys, current, nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func envBoolStrict(name string, fallback bool) (bool, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", name, err)
	}
	return value, nil
}

func envIntStrict(name string, fallback int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value > math.MaxInt32 {
		return 0, fmt.Errorf("%s must be a 32-bit integer", name)
	}
	return value, nil
}

func envDurationStrict(name string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be a duration: %w", name, err)
	}
	return value, nil
}

func parseCIDRs(raw string) ([]*net.IPNet, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var networks []*net.IPNet
	for _, item := range strings.Split(raw, ",") {
		_, network, err := net.ParseCIDR(strings.TrimSpace(item))
		if err != nil {
			return nil, fmt.Errorf("TRUSTED_PROXY_CIDRS contains invalid CIDR %q", item)
		}
		networks = append(networks, network)
	}
	return networks, nil
}
