//go:build integration

package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"sort"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/learning"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

// CR011 exercises the actual authenticated HTTP boundary, signed pagination,
// exact vocabulary lookup and owner isolation using the restricted app role.
func TestM002LibrarySearchHTTP(t *testing.T) {
	ctx, _, pool, _, _, cfg := cr039Harness(t)
	const password = "synthetic-library-search-password"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	owner := insertSearchAccount(t, ctx, pool, "library_reader", hash, "learner")
	other := insertSearchAccount(t, ctx, pool, "library_other", hash, "learner")
	insertSearchAccount(t, ctx, pool, "library_admin", hash, "admin")
	first, second := testdb.Batch(t, ctx, pool, owner), testdb.Batch(t, ctx, pool, owner)
	deleted := testdb.Batch(t, ctx, pool, owner)
	otherBatch := testdb.Batch(t, ctx, pool, other)
	if _, err = pool.Exec(ctx, `UPDATE wordweave.learning_batches SET saved_at='2026-09-01T12:00:00Z',title='book' WHERE owner_id=$1;
`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.learning_batches SET participates_in_range_review=false WHERE id=$1`, second); err != nil {
		t.Fatal(err)
	}
	options := pool.Config()
	options.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE wordweave_app`)
		return err
	}
	appPool, err := pgxpool.NewWithConfig(ctx, options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(appPool.Close)
	api, err := integrationServer(t, cfg, appPool)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.Handler())
	t.Cleanup(server.Close)
	client := loginAdminForSearch(t, server.URL, "library_reader", password)
	otherClient := loginAdminForSearch(t, server.URL, "library_other", password)
	adminClient := loginAdminForSearch(t, server.URL, "library_admin", password)
	csrf := bootstrap(t, client, server.URL)
	requireStatus(t, decodeResponse(t, rawJSONRequest(t, client, http.MethodDelete, server.URL+"/api/v1/me/batches/"+deleted.String(), csrf, map[string]any{}, nil)), http.StatusNoContent)
	wantIDs := []string{first.String(), second.String()}
	sort.Strings(wantIDs) // Both saved_at values are equal; ID breaks the tie.
	list := func(t *testing.T, c *http.Client, entry, cursor string, limit int) testResponse {
		t.Helper()
		query := url.Values{"entry": {entry}, "limit": {"100"}}
		if limit == 1 {
			query.Set("limit", "1")
		}
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		return getJSON(t, c, server.URL+"/api/v1/me/batches?"+query.Encode())
	}
	ids := func(t *testing.T, response testResponse) []string {
		t.Helper()
		items := nestedValue(t, response.body, "data", "items").([]any)
		result := make([]string, 0, len(items))
		for _, item := range items {
			result = append(result, nestedString(t, item, "id"))
		}
		return result
	}
	before := getJSON(t, client, server.URL+"/api/v1/me/learning-summary")
	requireStatus(t, before, http.StatusOK)

	t.Run("complete word normalization includes paused but not deleted or other-owner batches", func(t *testing.T) {
		for _, entry := range []string{"learn", "LEARN", "Learn", " \tLeArN\n", "\u00a0LEARN\u00a0"} {
			t.Run(entry, func(t *testing.T) {
				response := list(t, client, entry, "", 100)
				requireStatus(t, response, http.StatusOK)
				if got := ids(t, response); !reflect.DeepEqual(got, wantIDs) {
					t.Fatalf("entry %q: ids=%v, want=%v", entry, got, wantIDs)
				}
				for _, item := range nestedValue(t, response.body, "data", "items").([]any) {
					if nestedString(t, item, "id") == second.String() && nestedBool(t, item, "participates_in_range_review") {
						t.Fatal("paused batch was not preserved")
					}
				}
			})
		}
	})
	t.Run("cursor follows normalized spelling in both directions", func(t *testing.T) {
		for _, spellings := range [][2]string{{"learn", " LEARN "}, {"Learn", "learn"}} {
			t.Run(spellings[0], func(t *testing.T) {
				response := list(t, client, spellings[0], "", 1)
				requireStatus(t, response, http.StatusOK)
				if got := ids(t, response); !reflect.DeepEqual(got, wantIDs[:1]) || !nestedBool(t, response.body, "meta", "has_more") {
					t.Fatalf("invalid first page: %s", response.raw)
				}
				cursor := nestedString(t, response.body, "meta", "next_cursor")
				next := list(t, client, spellings[1], cursor, 1)
				requireStatus(t, next, http.StatusOK)
				if got := ids(t, next); !reflect.DeepEqual(got, wantIDs[1:]) || nestedBool(t, next.body, "meta", "has_more") || nestedValue(t, next.body, "meta", "next_cursor") != nil {
					t.Fatalf("invalid terminal page: %s", next.raw)
				}
			})
		}
	})
	t.Run("cursor remains bound to owner and exact filter", func(t *testing.T) {
		response := list(t, client, "learn", "", 1)
		requireStatus(t, response, http.StatusOK)
		cursor := nestedString(t, response.body, "meta", "next_cursor")
		for _, entry := range []string{"book", "", "lear"} {
			requireStatus(t, list(t, client, entry, cursor, 1), http.StatusUnprocessableEntity)
		}
		requireStatus(t, list(t, otherClient, "LEARN", cursor, 1), http.StatusUnprocessableEntity)
		requireStatus(t, list(t, client, "learn", "not-a-valid-cursor", 1), http.StatusUnprocessableEntity)
		control := list(t, otherClient, "learn", "", 100)
		requireStatus(t, control, http.StatusOK)
		if got := ids(t, control); !reflect.DeepEqual(got, []string{otherBatch.String()}) {
			t.Fatalf("other owner's library is not isolated: %v", got)
		}
	})
	t.Run("title and tags are not searched and invalid words stay invalid", func(t *testing.T) {
		for _, entry := range []string{"book", "study"} {
			response := list(t, client, entry, "", 100)
			requireStatus(t, response, http.StatusOK)
			if len(ids(t, response)) != 0 {
				t.Fatalf("non-target text matched for %q", entry)
			}
		}
		for _, entry := range []string{"lear", "learn book", "le arn", "learn%", " \t\n"} {
			response := list(t, client, entry, "", 100)
			requireStatus(t, response, http.StatusUnprocessableEntity)
			if response.body["code"] != "validation_failed" {
				t.Fatalf("invalid word returned unexpected problem: %s", response.raw)
			}
		}
	})
	t.Run("omitted and empty filters preserve unfiltered listing and access rules", func(t *testing.T) {
		for _, response := range []testResponse{list(t, client, "", "", 100), getJSON(t, client, server.URL+"/api/v1/me/batches")} {
			requireStatus(t, response, http.StatusOK)
			if got := ids(t, response); !reflect.DeepEqual(got, wantIDs) {
				t.Fatalf("unfiltered listing changed: %v", got)
			}
		}
		requireStatus(t, list(t, newBrowserClient(t), "LEARN", "", 100), http.StatusUnauthorized)
		requireStatus(t, list(t, adminClient, "LEARN", "", 100), http.StatusForbidden)
		adminList := getJSON(t, adminClient, server.URL+"/api/v1/admin/users/"+owner.String()+"/batches")
		requireStatus(t, adminList, http.StatusOK)
		if got := ids(t, adminList); !reflect.DeepEqual(got, wantIDs) {
			t.Fatalf("administrator readonly listing changed: %v", got)
		}
		for _, item := range nestedValue(t, adminList.body, "data", "items").([]any) {
			if _, exists := item.(map[string]any)["single_batch_review"]; exists {
				t.Fatal("administrator received a learner action")
			}
		}
	})
	t.Run("direct library service uses the same exact normalization", func(t *testing.T) {
		for _, entry := range []string{"LEARN", " Learn "} {
			batches, more, err := api.learning.ListBatches(ctx, owner, &entry, nil, 100)
			if err != nil || more || len(batches) != 2 {
				t.Fatalf("service entry %q: batches=%d, more=%v, error=%v", entry, len(batches), more, err)
			}
		}
		blank := "   "
		if _, _, err := api.learning.ListBatches(ctx, owner, &blank, nil, 100); !errors.Is(err, learning.ErrValidation) {
			t.Fatalf("blank service filter was not rejected: %v", err)
		}
	})
	after := getJSON(t, client, server.URL+"/api/v1/me/learning-summary")
	requireStatus(t, after, http.StatusOK)
	if !reflect.DeepEqual(before.body["data"], after.body["data"]) {
		t.Fatal("search changed full-library statistics")
	}
}
