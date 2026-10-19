//go:build integration

package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"wordweave/internal/platform/security"
)

func TestConfigPortabilityHTTPAdminCSRFAndSecretBoundary(t *testing.T) {
	ctx, api, pool, _, _, _ := cr039Harness(t)
	const password = "synthetic-portability-admin-123"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "portability_admin", hash, "admin")
	application := httptest.NewServer(api.Handler())
	t.Cleanup(application.Close)

	unauthenticated := newBrowserClient(t)
	requireStatus(t, getJSON(t, unauthenticated, application.URL+"/api/v1/admin/config-portability/models/current"), http.StatusUnauthorized)

	admin := loginAdminForSearch(t, application.URL, "portability_admin", password)
	csrf := bootstrap(t, admin, application.URL)
	requireStatus(t, getJSON(t, admin, application.URL+"/api/v1/admin/config-portability/models/current"), http.StatusOK)

	endpoint := application.URL + "/api/v1/admin/config-portability/models/exports"
	withoutCSRF := decodeResponse(t, rawJSONRequest(t, admin, http.MethodPost, endpoint, "", map[string]any{"include_credentials": false}, nil))
	requireStatus(t, withoutCSRF, http.StatusForbidden)

	response := rawJSONRequest(t, admin, http.MethodPost, endpoint, csrf, map[string]any{"include_credentials": false}, nil)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("export status=%d", response.StatusCode)
	}
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	if !strings.Contains(body, `"credential_mode":"none"`) || strings.Contains(body, `"api_key"`) || strings.Contains(body, password) {
		t.Fatalf("plain export crossed secret boundary: %s", body)
	}
	if response.Header.Get("Cache-Control") != "no-store" || response.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("missing secure export headers: %#v", response.Header)
	}

	emptyGrowth := decodeResponse(t, rawJSONRequest(t, admin, http.MethodPost, application.URL+"/api/v1/admin/config-portability/growth/exports", csrf, map[string]any{"include_credentials": false}, nil))
	if emptyGrowth.status != http.StatusUnprocessableEntity || emptyGrowth.body["code"] != "source_configuration_incomplete" {
		t.Fatalf("missing current checkin status=%d body=%s", emptyGrowth.status, emptyGrowth.raw)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES(current_date-1,0,0,0,0) ON CONFLICT(effective_day) DO NOTHING; DELETE FROM wordweave.growth_levels`); err != nil {
		t.Fatal(err)
	}
	incomplete := decodeResponse(t, rawJSONRequest(t, admin, http.MethodPost, application.URL+"/api/v1/admin/config-portability/growth/exports", csrf, map[string]any{"include_credentials": false}, nil))
	if incomplete.status != http.StatusUnprocessableEntity || incomplete.body["code"] != "source_configuration_incomplete" {
		t.Fatalf("incomplete export status=%d body=%s", incomplete.status, incomplete.raw)
	}
}
