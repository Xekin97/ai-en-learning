//go:build integration

package httpapi

import (
	"errors"
	"github.com/google/uuid"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"wordweave/internal/growth"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestM002BulkConfigurationLostCommitAcknowledgement(t *testing.T) {
	ctx, _, pool, _, _, _ := cr039Harness(t)
	proxy, wrapped := newCommitAckProxy(t, pool, "COMMIT")
	s := growth.NewService(wrapped, []byte("m002-config-fault-key"))
	initial, err := s.Levels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	changes := growth.LevelChanges{Expected: initial.Revision, Changes: []growth.LevelChange{}}
	for i := int64(1); i <= 6; i++ {
		changes.Changes = append(changes.Changes, growth.LevelChange{ClientKey: uuid.New(), Value: growth.LevelInput{Number: i, Minimum: business.Amount((i - 1) * 100), Enabled: i > 1}})
	}
	preview, err := s.PreviewLevels(ctx, "configuration-test-session", changes)
	if err != nil {
		t.Fatal(err)
	}
	proxy.armed.Store(true)
	if _, err = s.SaveLevels(ctx, "configuration-test-session", growth.LevelSave{LevelChanges: changes, Token: preview.Token, Confirmed: true}); err == nil {
		t.Fatal("lost commit acknowledgement concealed")
	}
	if proxy.dropped.Load() != 1 {
		t.Fatal("commit fault not injected")
	}
	observed, err := s.Levels(ctx)
	if err != nil || len(observed.Items) != 6 || observed.Revision == initial.Revision {
		t.Fatalf("committed configuration cannot be reconciled: %+v %v", observed, err)
	}
	_, err = s.SaveLevels(ctx, "configuration-test-session", growth.LevelSave{LevelChanges: changes, Token: preview.Token, Confirmed: true})
	var conflict *business.RevisionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("uncertain save replay created duplicate levels: %v", err)
	}
	again, err := s.Levels(ctx)
	if err != nil || len(again.Items) != 6 || again.Revision != observed.Revision {
		t.Fatal("replay changed committed group")
	}
}
func TestM002ProfileWelcomeAndPrivateTitleHTTP(t *testing.T) {
	ctx, api, pool, _, _, _ := cr039Harness(t)
	password := "profile-test-password"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	owner := insertSearchAccount(t, ctx, pool, "profile_reader", hash, "learner")
	insertSearchAccount(t, ctx, pool, "profile_other", hash, "learner")
	insertSearchAccount(t, ctx, pool, "profile_admin", hash, "admin")
	batch := testdb.Batch(t, ctx, pool, owner)
	if _, err = pool.Exec(ctx, `UPDATE wordweave.accounts SET nickname='小树',last_learning_at=clock_timestamp()-interval '5 days' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, application.URL)
	login := postJSON(t, client, application.URL+"/api/v1/auth/login", csrf, map[string]any{"username": "profile_reader", "password": password, "browser_ui_locale": "zh-CN"})
	requireStatus(t, login, 200)
	if nestedFloat(t, login.body, "data", "welcome", "days_since_learning") != 5 || nestedString(t, login.body, "data", "welcome", "display_name") != "小树" {
		t.Fatalf("wrong learning welcome: %s", login.raw)
	}
	csrf = dataString(t, login.body, "csrf_token")
	profile := decodeResponse(t, rawJSONRequest(t, client, http.MethodPatch, application.URL+"/api/v1/me/account", csrf, map[string]any{"nickname": nil, "gender": "female"}, nil))
	requireStatus(t, profile, 200)
	if nestedString(t, profile.body, "data", "account", "display_name") != "profile_reader" {
		t.Fatal("cleared nickname did not restore username fallback")
	}
	endpoint := application.URL + "/api/v1/me/batches/" + batch.String()
	detail := getJSON(t, client, endpoint)
	requireStatus(t, detail, 200)
	revision := nestedString(t, detail.body, "data", "batch", "title_revision")
	var before string
	if err = pool.QueryRow(ctx, `SELECT md5((to_jsonb(b)-'title'-'title_revision')::text) FROM wordweave.learning_batches b WHERE id=$1`, batch).Scan(&before); err != nil {
		t.Fatal(err)
	}
	input := map[string]any{"title": "My <first> story", "expected_title_revision": revision}
	saved := decodeResponse(t, rawJSONRequest(t, client, http.MethodPatch, endpoint, csrf, input, nil))
	requireStatus(t, saved, 200)
	requireStatus(t, decodeResponse(t, rawJSONRequest(t, client, http.MethodPatch, endpoint, csrf, input, nil)), 409)
	for _, actor := range []struct {
		name   string
		status int
	}{{"profile_other", 404}, {"profile_admin", 403}} {
		c := loginAdminForSearch(t, application.URL, actor.name, password)
		token := bootstrap(t, c, application.URL)
		requireStatus(t, decodeResponse(t, rawJSONRequest(t, c, http.MethodPatch, endpoint, token, input, nil)), actor.status)
	}
	var after string
	if err = pool.QueryRow(ctx, `SELECT md5((to_jsonb(b)-'title'-'title_revision')::text) FROM wordweave.learning_batches b WHERE id=$1`, batch).Scan(&after); err != nil || before != after {
		t.Fatal("title editing changed learning material or timestamps")
	}
	var learned time.Time
	if err = pool.QueryRow(ctx, `SELECT last_learning_at FROM wordweave.accounts WHERE id=$1`, owner).Scan(&learned); err != nil || time.Since(learned) < 4*24*time.Hour {
		t.Fatal("login/profile edit counted as learning")
	}
}
