//go:build integration

package httpapi

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
	"wordweave/internal/ai"

	"github.com/google/uuid"

	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

func TestNoContentConsumersEnforcePrivateNoStoreResponse(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	testURL, cleanupDatabase := createTestDatabase(t, ctx, databaseURL)
	defer cleanupDatabase()

	pool, err := postgres.Open(ctx, testURL, "wordweave-cr038-no-content", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	provider := newFakeOpenRouter(t)
	defer provider.Close()
	api, err := integrationServer(t, integrationConfig(testURL, provider.URL), pool)
	if err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()

	adminPassword := "cr038-admin-password-123"
	adminHash, err := security.HashPassword(adminPassword)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code) VALUES ('cr038_admin',$1,'admin',NULL)`, adminHash); err != nil {
		t.Fatal(err)
	}

	adminClient := newBrowserClient(t)
	adminCSRF := bootstrap(t, adminClient, application.URL)
	adminLogin := postJSON(t, adminClient, application.URL+"/api/v1/auth/login", adminCSRF, map[string]any{
		"username": "cr038_admin", "password": adminPassword, "browser_ui_locale": "en-US",
	})
	requireStatus(t, adminLogin, http.StatusOK)
	adminCSRF = dataString(t, adminLogin.body, "csrf_token")

	// The global credential endpoint has been replaced. Seed the migrated
	// fixture connection; all model operations below use the unified HTTP API.
	var fixtureAdmin uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE role='admin' LIMIT 1`).Scan(&fixtureAdmin); err != nil {
		t.Fatal(err)
	}
	if err := api.credentials.Put(ctx, fixtureAdmin, "integration-secret-key"); err != nil {
		t.Fatal(err)
	}
	createdModel := postJSON(t, adminClient, application.URL+"/api/v1/admin/models", adminCSRF, map[string]any{
		"display_name": "CR038 synthetic model", "description": nil, "provider_model_id": "provider/integration", "connection_id": ai.LegacyProviderID, "output_mode": "json_schema", "expected_revision": configurationRevisionHTTP(t, adminClient, application.URL),
	})
	requireStatus(t, createdModel, http.StatusCreated)
	modelID := nestedString(t, createdModel.body, "data", "model", "id")
	requireStatus(t, postJSON(t, adminClient, application.URL+"/api/v1/admin/models/"+modelID+"/enable", adminCSRF, map[string]any{"expected_revision": configurationRevisionHTTP(t, adminClient, application.URL)}), http.StatusOK)
	requireStatus(t, putJSON(t, adminClient, application.URL+"/api/v1/admin/groups/basic", adminCSRF, map[string]any{
		"priority": 1, "expected_revision": configurationRevisionHTTP(t, adminClient, application.URL), "rolling_24h_limit": nil, "max_entries": 5, "allowed_lengths": []string{"short"}, "model_ids": []string{modelID},
	}), http.StatusOK)

	learnerClient := newBrowserClient(t)
	learnerCSRF := bootstrap(t, learnerClient, application.URL)
	registered := postJSON(t, learnerClient, application.URL+"/api/v1/auth/register", learnerCSRF, map[string]any{
		"username": "cr038_learner", "password": "cr038-learner-password-123",
		"password_confirmation": "cr038-learner-password-123", "ui_locale": "en-US",
	})
	requireStatus(t, registered, http.StatusCreated)
	learnerCSRF = dataString(t, registered.body, "csrf_token")

	t.Run("logout", func(t *testing.T) {
		response := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/auth/logout", learnerCSRF, map[string]any{}, nil)
		assertPrivateNoContentResponse(t, response)
	})

	learnerCSRF = bootstrap(t, learnerClient, application.URL)
	learnerLogin := postJSON(t, learnerClient, application.URL+"/api/v1/auth/login", learnerCSRF, map[string]any{
		"username": "cr038_learner", "password": "cr038-learner-password-123", "browser_ui_locale": "en-US",
	})
	requireStatus(t, learnerLogin, http.StatusOK)
	learnerCSRF = dataString(t, learnerLogin.body, "csrf_token")

	t.Run("learner password change", func(t *testing.T) {
		response := rawJSONRequest(t, learnerClient, http.MethodPut, application.URL+"/api/v1/me/password", learnerCSRF, map[string]any{
			"current_password": "cr038-learner-password-123", "new_password": "cr038-learner-password-456",
			"new_password_confirmation": "cr038-learner-password-456",
		}, nil)
		assertPrivateNoContentResponse(t, response)
	})

	generate := func(t *testing.T) (string, string) {
		t.Helper()
		response := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/stream", learnerCSRF, map[string]any{
			"model_id": modelID, "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"},
		}, nil)
		if response.StatusCode != http.StatusOK {
			raw, _ := io.ReadAll(response.Body)
			response.Body.Close()
			t.Fatalf("generation status=%d body=%s", response.StatusCode, raw)
		}
		runID, token, validated := readGenerationSSE(t, response.Body)
		response.Body.Close()
		if !validated {
			t.Fatal("generation did not validate")
		}
		return runID, token
	}

	t.Run("generation discard", func(t *testing.T) {
		runID, token := generate(t)
		response := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/"+runID+"/discard", learnerCSRF, map[string]any{}, map[string]string{
			"X-Generation-Token": token,
		})
		assertPrivateNoContentResponse(t, response)
	})

	t.Run("batch deletion cascades its single-batch review session", func(t *testing.T) {
		runID, token := generate(t)
		saved := decodeResponse(t, rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/"+runID+"/save", learnerCSRF, map[string]any{}, map[string]string{
			"X-Generation-Token": token,
		}))
		requireStatus(t, saved, http.StatusCreated)
		batchID := dataString(t, saved.body, "batch_id")
		session := postJSON(t, learnerClient, application.URL+"/api/v1/me/review-sessions", learnerCSRF, map[string]any{
			"mode": "single_batch", "batch_id": batchID,
		})
		requireStatus(t, session, http.StatusCreated)
		sessionID := nestedString(t, session.body, "data", "session", "session_id")

		response := rawJSONRequest(t, learnerClient, http.MethodDelete, application.URL+"/api/v1/me/batches/"+batchID, learnerCSRF, nil, nil)
		assertPrivateNoContentResponse(t, response)

		var remaining int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.review_sessions WHERE id=$1`, sessionID).Scan(&remaining); err != nil {
			t.Fatal(err)
		}
		if remaining != 0 {
			t.Fatalf("review session %s remains after batch deletion", sessionID)
		}
	})

	var learnerID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE lower(username)='cr038_learner'`).Scan(&learnerID); err != nil {
		t.Fatal(err)
	}
	t.Run("administrator password reset", func(t *testing.T) {
		response := rawJSONRequest(t, adminClient, http.MethodPut, application.URL+"/api/v1/admin/users/"+learnerID.String()+"/password", adminCSRF, map[string]any{
			"new_password": "cr038-admin-reset-password-789", "new_password_confirmation": "cr038-admin-reset-password-789", "confirmed": true,
		}, nil)
		assertPrivateNoContentResponse(t, response)
	})

	deleteClient := newBrowserClient(t)
	deleteCSRF := bootstrap(t, deleteClient, application.URL)
	deleteRegistration := postJSON(t, deleteClient, application.URL+"/api/v1/auth/register", deleteCSRF, map[string]any{
		"username": "cr038_delete", "password": "cr038-delete-password-123",
		"password_confirmation": "cr038-delete-password-123", "ui_locale": "en-US",
	})
	requireStatus(t, deleteRegistration, http.StatusCreated)
	deleteCSRF = dataString(t, deleteRegistration.body, "csrf_token")
	t.Run("account deletion", func(t *testing.T) {
		response := rawJSONRequest(t, deleteClient, http.MethodDelete, application.URL+"/api/v1/me/account", deleteCSRF, map[string]any{
			"current_password": "cr038-delete-password-123", "confirmed": true,
		}, nil)
		assertPrivateNoContentResponse(t, response)

		var remaining int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.accounts WHERE lower(username)='cr038_delete'`).Scan(&remaining); err != nil {
			t.Fatal(err)
		}
		if remaining != 0 {
			t.Fatal("deleted synthetic account still exists")
		}
	})
}

func assertPrivateNoContentResponse(t *testing.T, response *http.Response) {
	t.Helper()
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status=%d, want=%d body=%q", response.StatusCode, http.StatusNoContent, body)
	}
	if len(body) != 0 {
		t.Fatalf("body length=%d, want=0 body=%q", len(body), body)
	}
	if contentType := response.Header.Get("Content-Type"); contentType != "" {
		t.Fatalf("Content-Type=%q, want absent", contentType)
	}
	if cacheControl := response.Header.Get("Cache-Control"); cacheControl != "no-store" {
		t.Fatalf("Cache-Control=%q, want=no-store", cacheControl)
	}
}
