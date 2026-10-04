//go:build integration

package httpapi

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"wordweave/internal/maintenance"
	"wordweave/internal/platform/postgres"
)

// An actual separate OS process, with its own empty registry and connection
// pools. Only explicitly supplied disposable-test configuration is inherited.
func TestDraftProcessHelper(t *testing.T) {
	if os.Getenv("WORDWEAVE_DEV095_CHILD") != "yes" {
		t.Skip("subprocess helper")
	}
	ctx := context.Background()
	provider := newFakeOpenRouter(t)
	defer provider.Close()
	cfg := integrationConfig(os.Getenv("TEST_DATABASE_URL"), provider.URL)
	pool, err := postgres.Open(ctx, cfg.AppDatabaseURL, "dev095-child", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := maintenance.SettleActiveGenerations(ctx, pool, "startup_recovery"); err != nil {
		t.Fatal(err)
	}
	api, err := integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	api.SetReady(true)
	server := httptest.NewServer(api.Handler())
	defer server.Close()
	fmt.Println("DEV095_READY=" + server.URL)
	_, _ = io.Copy(io.Discard, os.Stdin) // EOF allows an orderly test-process exit.
}

func startDraftProcess(t *testing.T, databaseURL string) (string, func()) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestDraftProcessHelper$")
	cmd.Env = append(os.Environ(), "WORDWEAVE_DEV095_CHILD=yes", "TEST_DATABASE_URL="+databaseURL)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stderr = io.Discard // The parent reports exit status, never capabilities.
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	stopped := false
	stop := func() {
		if stopped {
			return
		}
		stopped = true
		_ = cmd.Process.Kill() // Simulate abrupt process loss, not a browser refresh.
		_ = stdin.Close()
		_ = cmd.Wait()
	}
	t.Cleanup(stop)
	ready := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		sent := false
		for scanner.Scan() {
			if !sent && strings.HasPrefix(scanner.Text(), "DEV095_READY=") {
				ready <- strings.TrimPrefix(scanner.Text(), "DEV095_READY=")
				sent = true
			}
		}
		if !sent {
			ready <- ""
		}
	}()
	select {
	case endpoint := <-ready:
		if endpoint == "" {
			t.Fatal("child exited before readiness")
		}
		return endpoint, stop
	case <-time.After(15 * time.Second):
		stop()
		t.Fatal("child readiness timeout")
	}
	return "", stop
}

func TestDraftHTTPAcrossProcessRestart(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "integration-secret-key"); err != nil {
		t.Fatal(err)
	}
	endpoint, stop := startDraftProcess(t, cfg.AppDatabaseURL)
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, endpoint)
	registration := postJSON(t, client, endpoint+"/api/v1/auth/register", csrf, map[string]any{"username": "dev095_process", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US"})
	requireStatus(t, registration, http.StatusCreated)
	csrf = dataString(t, registration.body, "csrf_token")
	response := rawJSONRequest(t, client, http.MethodPost, endpoint+"/api/v1/generations/stream", csrf, map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"}}, nil)
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		t.Fatalf("generate status %d", response.StatusCode)
	}
	runID, token, valid := readGenerationSSE(t, response.Body)
	response.Body.Close()
	if !valid {
		t.Fatal("synthetic generation was not validated")
	}
	var payloadBefore string
	var expiryBefore time.Time
	if err := pool.QueryRow(ctx, `SELECT md5(payload::text),expires_at FROM wordweave.generation_drafts WHERE run_id=$1`, runID).Scan(&payloadBefore, &expiryBefore); err != nil {
		t.Fatal(err)
	}
	stop()
	endpoint, stop = startDraftProcess(t, cfg.AppDatabaseURL)
	var payloadAfter string
	var expiryAfter time.Time
	if err := pool.QueryRow(ctx, `SELECT md5(payload::text),expires_at FROM wordweave.generation_drafts WHERE run_id=$1`, runID).Scan(&payloadAfter, &expiryAfter); err != nil {
		t.Fatal(err)
	}
	if payloadBefore != payloadAfter || !expiryBefore.Equal(expiryAfter) {
		t.Fatal("restart changed draft")
	}
	save := func(capability string) testResponse {
		return decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, endpoint+"/api/v1/generations/"+runID+"/save", csrf, map[string]any{}, map[string]string{"X-Generation-Token": capability}))
	}
	requireStatus(t, save("wrong"), http.StatusNotFound)
	first := save(token)
	requireStatus(t, first, http.StatusCreated)
	batchID := dataString(t, first.body, "batch_id")
	stop()
	endpoint, stop = startDraftProcess(t, cfg.AppDatabaseURL)
	defer stop()
	requireStatus(t, save("wrong"), http.StatusNotFound)
	retry := save(token)
	requireStatus(t, retry, http.StatusOK)
	if dataString(t, retry.body, "batch_id") != batchID {
		t.Fatal("restart retry returned another batch")
	}
	var drafts, batches, runs int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1),(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=$1),(SELECT count(*) FROM wordweave.generation_runs WHERE id=$1 AND call_status='valid' AND disposition='saved' AND quota_charged AND counts_toward_cumulative)`, runID).Scan(&drafts, &batches, &runs); err != nil || drafts != 0 || batches != 1 || runs != 1 {
		t.Fatalf("persistence or accounting mismatch %d/%d/%d %v", drafts, batches, runs, err)
	}
	detail := getJSON(t, client, endpoint+"/api/v1/me/batches/"+batchID)
	requireStatus(t, detail, http.StatusOK)
	t.Log("same-version process restart: validated draft unchanged; save 201; second restart retry 200; wrong token 404; one batch and unchanged accounting")
}
