//go:build integration

package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/admin"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
)

func TestAdminUserSearchCursorV2(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	testURL, cleanupDatabase := createTestDatabase(t, ctx, databaseURL)
	defer cleanupDatabase()
	pool, err := postgres.Open(ctx, testURL, "wordweave-admin-user-search", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	const password = "admin-search-password-123"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	adminAID := insertSearchAccount(t, ctx, pool, "search_admin_a", hash, "admin")
	insertSearchAccount(t, ctx, pool, "search_admin_b", hash, "admin")

	wantExactFirst := []string{
		"qeky2nak",
		"aqeky2nakz",
		"bqeky2nak",
		"cqeky2nak",
		"qeky2naka",
		"zqeky2nak",
	}
	accountIDs := make(map[string]uuid.UUID, len(wantExactFirst))
	for _, username := range wantExactFirst {
		accountIDs[username] = insertSearchAccount(t, ctx, pool, username, hash, "learner")
	}

	cfg := integrationConfig(testURL, "http://127.0.0.1:1")
	api, err := integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	api.SetReady(true)
	application := httptest.NewServer(api.Handler())
	defer application.Close()

	adminAClient := loginAdminForSearch(t, application.URL, "search_admin_a", password)
	adminBClient := loginAdminForSearch(t, application.URL, "search_admin_b", password)

	for _, limit := range []int{1, 2, 20, 100} {
		got := collectAdminUserSearch(t, adminAClient, application.URL, "QeKy2NaK", limit)
		if !reflect.DeepEqual(got, wantExactFirst) {
			t.Fatalf("limit=%d names=%v want=%v", limit, got, wantExactFirst)
		}
	}

	wantWithoutExact := []string{
		"aqeky2nakz",
		"bqeky2nak",
		"cqeky2nak",
		"qeky2nak",
		"qeky2naka",
		"zqeky2nak",
	}
	if got := collectAdminUserSearch(t, adminAClient, application.URL, "eky2na", 2); !reflect.DeepEqual(got, wantWithoutExact) {
		t.Fatalf("no-exact names=%v want=%v", got, wantWithoutExact)
	}
	if got := collectAdminUserSearch(t, adminAClient, application.URL, "no_such_qeky2nak_account", 20); len(got) != 0 {
		t.Fatalf("empty-result search returned %v", got)
	}

	firstPage := getJSON(t, adminAClient, application.URL+"/api/v1/admin/users?username=qeky2nak&limit=2")
	requireStatus(t, firstPage, http.StatusOK)
	validCursor := nestedString(t, firstPage.body, "meta", "next_cursor")

	caseInsensitiveContinuation := getJSON(t, adminAClient, application.URL+"/api/v1/admin/users?username=QEKY2NAK&limit=2&cursor="+url.QueryEscape(validCursor))
	requireStatus(t, caseInsensitiveContinuation, http.StatusOK)

	crossQuery := getJSON(t, adminAClient, application.URL+"/api/v1/admin/users?username=other&limit=2&cursor="+url.QueryEscape(validCursor))
	requireCursorInvalidProblem(t, crossQuery, "other", validCursor)
	crossAdmin := getJSON(t, adminBClient, application.URL+"/api/v1/admin/users?username=qeky2nak&limit=2&cursor="+url.QueryEscape(validCursor))
	requireCursorInvalidProblem(t, crossAdmin, "qeky2nak", validCursor)

	normalizedQuery := admin.NormalizeUserQuery("qeky2nak")
	scope := adminUserCursorScope(adminAID, normalizedQuery)
	lastID := accountIDs["aqeky2nakz"]
	invalidPayloads := map[string]any{
		"old two-field payload": struct {
			Username string    `json:"username"`
			ID       uuid.UUID `json:"id"`
		}{Username: "aqeky2nakz", ID: lastID},
		"missing fields": map[string]any{
			"version": admin.UserCursorVersion,
		},
		"unknown version": admin.UserCursorV2{
			Version: admin.UserCursorVersion + 1, MatchTier: 1,
			NormalizedUsername: "aqeky2nakz", ID: lastID,
		},
		"invalid tier": admin.UserCursorV2{
			Version: admin.UserCursorVersion, MatchTier: 2,
			NormalizedUsername: "aqeky2nakz", ID: lastID,
		},
		"tier inconsistent with exact username": admin.UserCursorV2{
			Version: admin.UserCursorVersion, MatchTier: 1,
			NormalizedUsername: "qeky2nak", ID: accountIDs["qeky2nak"],
		},
		"unnormalized username": admin.UserCursorV2{
			Version: admin.UserCursorVersion, MatchTier: 1,
			NormalizedUsername: "Aqeky2nakZ", ID: lastID,
		},
		"malformed id": map[string]any{
			"version": admin.UserCursorVersion, "match_tier": 1,
			"normalized_username": "aqeky2nakz", "id": "not-a-uuid",
		},
		"nil id": admin.UserCursorV2{
			Version: admin.UserCursorVersion, MatchTier: 1,
			NormalizedUsername: "aqeky2nakz", ID: uuid.Nil,
		},
		"unknown field": map[string]any{
			"version": admin.UserCursorVersion, "match_tier": 1,
			"normalized_username": "aqeky2nakz", "id": lastID,
			"unexpected": true,
		},
	}
	for name, payload := range invalidPayloads {
		t.Run(name, func(t *testing.T) {
			cursor, encodeErr := api.cursor.Encode(scope, payload)
			if encodeErr != nil {
				t.Fatal(encodeErr)
			}
			response := getJSON(t, adminAClient, application.URL+"/api/v1/admin/users?username=qeky2nak&limit=2&cursor="+url.QueryEscape(cursor))
			requireCursorInvalidProblem(t, response, "qeky2nak", cursor)
		})
	}

	tamperedCursor := validCursor
	if tamperedCursor[0] == 'A' {
		tamperedCursor = "B" + tamperedCursor[1:]
	} else {
		tamperedCursor = "A" + tamperedCursor[1:]
	}
	tampered := getJSON(t, adminAClient, application.URL+"/api/v1/admin/users?username=qeky2nak&limit=2&cursor="+url.QueryEscape(tamperedCursor))
	requireCursorInvalidProblem(t, tampered, "qeky2nak", tamperedCursor)

	recoveredFirstPage := getJSON(t, adminAClient, application.URL+"/api/v1/admin/users?username=qeky2nak&limit=2")
	requireStatus(t, recoveredFirstPage, http.StatusOK)
	recoveredItems, ok := nestedValue(t, recoveredFirstPage.body, "data", "items").([]any)
	if !ok || len(recoveredItems) != 2 || nestedString(t, recoveredItems[0].(map[string]any), "username") != "qeky2nak" {
		t.Fatalf("cursor-free recovery did not restore the first page: %s", recoveredFirstPage.raw)
	}
}

func insertSearchAccount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, username, passwordHash, role string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	var group any
	if role == "learner" {
		group = "registered"
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO wordweave.accounts(username,password_hash,role,group_code)
		VALUES ($1,$2,$3,$4) RETURNING id`, username, passwordHash, role, group).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func loginAdminForSearch(t *testing.T, baseURL, username, password string) *http.Client {
	t.Helper()
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, baseURL)
	login := postJSON(t, client, baseURL+"/api/v1/auth/login", csrf, map[string]any{
		"username": username, "password": password, "browser_ui_locale": "en-US",
	})
	requireStatus(t, login, http.StatusOK)
	return client
}

func collectAdminUserSearch(t *testing.T, client *http.Client, baseURL, query string, limit int) []string {
	t.Helper()
	endpoint := baseURL + "/api/v1/admin/users?username=" + url.QueryEscape(query) + "&limit=" + strconv.Itoa(limit)
	seen := map[string]struct{}{}
	var names []string
	for page := 0; page < 20; page++ {
		response := getJSON(t, client, endpoint)
		requireStatus(t, response, http.StatusOK)
		items, ok := nestedValue(t, response.body, "data", "items").([]any)
		if !ok {
			t.Fatalf("items is not an array: %s", response.raw)
		}
		for _, rawItem := range items {
			item, ok := rawItem.(map[string]any)
			if !ok {
				t.Fatalf("item is %T, want object", rawItem)
			}
			id, idOK := item["id"].(string)
			username, usernameOK := item["username"].(string)
			if !idOK || !usernameOK {
				t.Fatalf("invalid user summary: %#v", item)
			}
			if _, duplicate := seen[id]; duplicate {
				t.Fatalf("duplicate account across pages: %s", id)
			}
			seen[id] = struct{}{}
			names = append(names, username)
		}
		hasMore := nestedBool(t, response.body, "meta", "has_more")
		nextCursor := nestedValue(t, response.body, "meta", "next_cursor")
		if !hasMore {
			if nextCursor != nil {
				t.Fatalf("terminal page cursor=%#v", nextCursor)
			}
			return names
		}
		cursor, ok := nextCursor.(string)
		if !ok || cursor == "" {
			t.Fatalf("non-terminal page cursor=%#v", nextCursor)
		}
		endpoint = baseURL + "/api/v1/admin/users?username=" + url.QueryEscape(query) + "&limit=" + strconv.Itoa(limit) + "&cursor=" + url.QueryEscape(cursor)
	}
	t.Fatal("admin user pagination did not terminate")
	return nil
}

func requireCursorInvalidProblem(t *testing.T, response testResponse, query, cursor string) {
	t.Helper()
	requireStatus(t, response, http.StatusUnprocessableEntity)
	if response.body["code"] != "validation_failed" {
		t.Fatalf("code=%#v body=%s", response.body["code"], response.raw)
	}
	fields, ok := response.body["field_errors"].([]any)
	if !ok || len(fields) != 1 {
		t.Fatalf("field_errors=%#v body=%s", response.body["field_errors"], response.raw)
	}
	field, ok := fields[0].(map[string]any)
	if !ok || field["field"] != "cursor" || field["code"] != "invalid" {
		t.Fatalf("cursor field error=%#v body=%s", fields[0], response.raw)
	}
	if strings.Contains(response.raw, query) || strings.Contains(response.raw, cursor) {
		t.Fatalf("cursor problem leaked query or cursor: %s", response.raw)
	}
}
