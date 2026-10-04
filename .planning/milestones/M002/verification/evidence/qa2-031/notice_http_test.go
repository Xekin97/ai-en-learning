//go:build integration

package httpapi

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestQA31NoticeOnceHTTP(t *testing.T) {
	pool, ctx := testdb.Open(t)
	hash, err := security.HashPassword("notice-test-123")
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "once_admin", hash, "admin")
	insertSearchAccount(t, ctx, pool, "once_reader", hash, "learner")
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); w.WriteHeader(500) }))
	defer provider.Close()
	server, err := integrationServer(t, integrationConfig(pool.Config().ConnString(), provider.URL), pool)
	if err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(server.Handler())
	defer app.Close()
	admin := loginAdminForSearch(t, app.URL, "once_admin", "notice-test-123")
	learner := loginAdminForSearch(t, app.URL, "once_reader", "notice-test-123")
	visitor := newBrowserClient(t)
	bootstrap(t, visitor, app.URL)
	csrf := bootstrap(t, admin, app.URL)
	body := map[string]any{"title": map[string]any{"en_US": "One notice", "zh_CN": nil}, "body_markdown": map[string]any{"en_US": "**Full body**", "zh_CN": nil}, "visible": true, "remind": true, "remind_once": true}
	created := postJSON(t, admin, app.URL+"/api/v1/admin/notices", csrf, body)
	requireStatus(t, created, 201)
	n := nestedValue(t, created.body, "data", "notice").(map[string]any)
	id := n["id"].(string)
	if n["remind_once"] != true {
		t.Fatal("new field not accepted")
	}
	fetched := getJSON(t, admin, app.URL+"/api/v1/admin/notices/"+id)
	requireStatus(t, fetched, 200)
	if nestedValue(t, fetched.body, "data", "notice", "remind_once") != true {
		t.Fatal("config lost after read")
	}
	public := getJSON(t, learner, app.URL+"/api/v1/notices/"+id)
	requireStatus(t, public, 200)
	if nestedValue(t, public.body, "data", "notice", "remind_once") != true {
		t.Fatal("public once projection missing")
	}
	if nestedValue(t, public.body, "data", "notice", "body_html") != "<p><strong>Full body</strong></p>\n" {
		t.Fatal("Markdown projection changed")
	}
	reminders := getJSON(t, learner, app.URL+"/api/v1/notices?reminders_only=true")
	requireStatus(t, reminders, 200)
	if len(nestedValue(t, reminders.body, "data", "items").([]any)) != 1 {
		t.Fatal("eligible reminder missing")
	}
	requireStatus(t, getJSON(t, visitor, app.URL+"/api/v1/notices"), 401)
	requireStatus(t, postJSON(t, learner, app.URL+"/api/v1/admin/notices", bootstrap(t, learner, app.URL), body), 403)
	body["expected_revision"] = dataString(t, fetched.body, "revision")
	body["remind"] = false
	updated := putJSON(t, admin, app.URL+"/api/v1/admin/notices/"+id, csrf, body)
	requireStatus(t, updated, 200)
	if nestedValue(t, updated.body, "data", "notice", "remind_once") != true {
		t.Fatal("turning off reminders lost once config")
	}
	requireStatus(t, putJSON(t, admin, app.URL+"/api/v1/admin/notices/"+id, csrf, body), 409)
	filtered := getJSON(t, learner, app.URL+"/api/v1/notices?reminders_only=true")
	requireStatus(t, filtered, 200)
	if len(nestedValue(t, filtered.body, "data", "items").([]any)) != 0 {
		t.Fatal("disabled reminder leaked")
	}
	requireStatus(t, getJSON(t, learner, app.URL+"/api/v1/notices/"+id), 200)
	body["expected_revision"] = dataString(t, updated.body, "revision")
	body["visible"] = false
	body["remind"] = true
	requireStatus(t, putJSON(t, admin, app.URL+"/api/v1/admin/notices/"+id, csrf, body), 200)
	requireStatus(t, getJSON(t, learner, app.URL+"/api/v1/notices/"+id), 404)
	body["visible"] = true
	delete(body, "remind_once")
	delete(body, "expected_revision")
	legacy := postJSON(t, admin, app.URL+"/api/v1/admin/notices", csrf, body)
	requireStatus(t, legacy, 201)
	if nestedValue(t, legacy.body, "data", "notice", "remind_once") != false {
		t.Fatal("missing field must default false")
	}
	if calls.Load() != 0 {
		t.Fatal("notice flow called provider")
	}
	t.Log("QA31-HTTP PASS: actual admin create/read/update, public projection/Markdown, default false, revision conflict, visibility/reminder filtering, learner and visitor restrictions; 0 provider calls")
}
