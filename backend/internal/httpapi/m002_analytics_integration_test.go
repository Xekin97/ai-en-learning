//go:build integration

package httpapi

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
	"wordweave/internal/analytics"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

func TestM002AnalyticsHTTPPrivacyRolesAndBrowserDedup(t *testing.T) {
	ctx, _, pool, _, _, cfg := cr039Harness(t)
	hash, err := security.HashPassword("analytics-test-password")
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "analytics_admin", hash, "admin")
	appCfg := pool.Config()
	appCfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE wordweave_app`)
		return err
	}
	app, err := pgxpool.NewWithConfig(ctx, appCfg)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	api, err := integrationServer(t, cfg, app)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.Handler())
	defer server.Close()
	visitor := newBrowserClient(t)
	csrf := bootstrap(t, visitor, server.URL)
	endpoint := server.URL + "/api/v1/analytics/events"
	u, _ := url.Parse(server.URL)
	before := ""
	for _, c := range visitor.Jar.Cookies(u) {
		if c.Name == "ww_browser" {
			before = c.Value
		}
	}
	if before == "" {
		t.Fatal("missing independent first-party browser")
	}
	// No fabricated numbers until analytics is enabled and a snapshot exists.
	admin := loginAdminForSearch(t, server.URL, "analytics_admin", "analytics-test-password")
	day := business.LearningDay(time.Now()).Format("2006-01-02")
	traffic := server.URL + "/api/v1/admin/analytics/traffic?start_day=" + day + "&end_day=" + day
	noData := getJSON(t, admin, traffic)
	requireStatus(t, noData, 200)
	if nestedString(t, noData.body, "data", "freshness") != "no_data" {
		t.Fatal("invented analytics snapshot")
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '10 days'`); err != nil {
		t.Fatal(err)
	}
	event := map[string]any{"event_id": uuid.NewString(), "kind": "page_view", "page": "PAGE-205", "source": map[string]any{"utm_source": "example", "referrer_host": "search.example"}}
	requireStatus(t, postJSON(t, visitor, endpoint, csrf, event), 204)
	requireStatus(t, postJSON(t, visitor, endpoint, csrf, event), 204)
	requireStatus(t, postJSON(t, visitor, endpoint, "", event), 403)
	for _, bad := range []map[string]any{
		{"event_id": uuid.NewString(), "kind": "page_view", "page": "PAGE-205", "passage": "private body"},
		{"event_id": uuid.NewString(), "kind": "page_view", "page": "PAGE-208"},
		{"event_id": uuid.NewString(), "kind": "page_view", "page": "PAGE-205", "source": map[string]any{"referrer_host": "https://example.com/private?q=secret"}},
		{"event_id": uuid.NewString(), "kind": "key_action", "page": "PAGE-205", "action": "arbitrary"},
	} {
		requireStatus(t, postJSON(t, visitor, endpoint, csrf, bad), 422)
	}
	requireStatus(t, getJSON(t, visitor, traffic), 401)
	registered := postJSON(t, visitor, server.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "analytics_reader", "password": "analytics-test-password", "password_confirmation": "analytics-test-password", "ui_locale": "en-US"})
	requireStatus(t, registered, 201)
	csrf = dataString(t, registered.body, "csrf_token")
	for _, c := range visitor.Jar.Cookies(u) {
		if c.Name == "ww_browser" && c.Value != before {
			t.Fatal("login changed browser identity")
		}
	}
	requireStatus(t, getJSON(t, visitor, traffic), 403)
	requireStatus(t, postJSON(t, visitor, endpoint, csrf, map[string]any{"event_id": uuid.NewString(), "kind": "page_view", "page": "PAGE-204"}), 204)
	requireStatus(t, postJSON(t, admin, endpoint, bootstrap(t, admin, server.URL), event), 204)
	if err = analytics.Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	result := getJSON(t, admin, traffic)
	requireStatus(t, result, 200)
	if nestedFloat(t, result.body, "data", "uv", "value") != 1 || nestedFloat(t, result.body, "data", "pv", "value") != 2 || strings.Contains(result.raw, before) || strings.Contains(result.raw, "analytics_reader") {
		t.Fatalf("private/duplicated traffic: %s", result.raw)
	}
	for _, path := range []string{"funnel", "retention"} {
		requireStatus(t, getJSON(t, admin, server.URL+"/api/v1/admin/analytics/"+path+"?start_day="+day+"&end_day="+day), 200)
	}
	requireStatus(t, getJSON(t, admin, server.URL+"/api/v1/admin/overview"), 200)
	requireStatus(t, getJSON(t, admin, traffic+"&owner_id="+uuid.NewString()), 422)
	var events int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.analytics_events WHERE event_kind='page_view'`).Scan(&events); err != nil || events != 2 {
		t.Fatalf("admin or invalid events entered analytics: %d %v", events, err)
	}
}
