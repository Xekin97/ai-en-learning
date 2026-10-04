//go:build integration

package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

// CR013: real authentication, HTTP error mapping and durable lifecycle with the
// restricted application role. Provider output is a validated local fixture;
// no external provider is reachable. The HTTP server has a fresh run registry.
func TestM002SaveStateHTTP(t *testing.T) {
	ctx, seedAPI, pool, actor, model, cfg := cr039Harness(t)
	const password = "synthetic-save-state-password"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.accounts SET password_hash=$1 WHERE id=$2`, hash, actor.ID); err != nil {
		t.Fatal(err)
	}
	otherID := insertSearchAccount(t, ctx, pool, "save_state_other", hash, "learner")
	otherActor := identity.Actor{Kind: "account", Role: "learner", ID: otherID, GroupCode: "registered"}
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
	client := loginAdminForSearch(t, server.URL, "cr039_learner", password)
	otherClient := loginAdminForSearch(t, server.URL, "save_state_other", password)
	csrf, otherCSRF := bootstrap(t, client, server.URL), bootstrap(t, otherClient, server.URL)
	snapshot := cr039Snapshot(t)
	request := func(t *testing.T, c *http.Client, csrf, id, token, action string) testResponse {
		t.Helper()
		return decodeResponse(t, rawJSONRequest(t, c, http.MethodPost, server.URL+"/api/v1/generations/"+id+"/"+action, csrf, map[string]any{}, map[string]string{"X-Generation-Token": token}))
	}
	problem := func(t *testing.T, response testResponse, status int, code string) {
		t.Helper()
		requireStatus(t, response, status)
		if response.body["code"] != code {
			t.Fatalf("problem code=%v, want=%s", response.body["code"], code)
		}
	}
	seed := func(t *testing.T, status string) generation.Run {
		t.Helper()
		run := cr039SeedRun(t, ctx, seedAPI, pool, actor, model, snapshot.Targets[0].Entry)
		var err error
		switch status {
		case "valid":
			err = seedAPI.generation.CompleteValid(ctx, run, snapshot)
		case "user_cancelled":
			_, err = seedAPI.generation.Cancel(ctx, actor, run.ID.String(), run.Token)
		case "active":
			t.Cleanup(func() {
				if err := seedAPI.generation.CompleteFailure(ctx, run.ID, "server_failed", "synthetic-cleanup"); err != nil {
					t.Error(err)
				}
			})
		default:
			err = seedAPI.generation.CompleteFailure(ctx, run.ID, status, "synthetic")
		}
		if err != nil {
			t.Fatal(err)
		}
		return run
	}
	facts := func(t *testing.T, run generation.Run) string {
		t.Helper()
		var facts string
		err := pool.QueryRow(ctx, `SELECT jsonb_build_object(
			'run',to_jsonb(r),
			'charge',(SELECT to_jsonb(c) FROM wordweave.generation_charges c WHERE c.run_id=r.id),
			'batches',(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=r.id),
			'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id),
			'claims',(SELECT count(*) FROM wordweave.visitor_claims WHERE run_id=r.id))::text
			FROM wordweave.generation_runs r WHERE r.id=$1`, run.ID).Scan(&facts)
		if err != nil {
			t.Fatal(err)
		}
		return facts
	}
	for _, status := range []string{"active", "provider_failed", "server_failed", "stream_failed", "validation_failed", "user_cancelled"} {
		t.Run(status+" is conflict without side effects", func(t *testing.T) {
			run := seed(t, status)
			before := facts(t, run)
			for range 2 {
				problem(t, request(t, client, csrf, run.ID.String(), run.Token, "save"), http.StatusConflict, "state_conflict")
			}
			// Failed lifecycle state is not disclosed until capability and ownership pass.
			problem(t, request(t, client, csrf, run.ID.String(), "wrong", "save"), http.StatusNotFound, "not_found")
			problem(t, request(t, otherClient, otherCSRF, run.ID.String(), run.Token, "save"), http.StatusNotFound, "not_found")
			otherBound, err := generation.NewRunToken(cfg.CapabilityKey, run.ID, otherActor)
			if err != nil {
				t.Fatal(err)
			}
			problem(t, request(t, otherClient, otherCSRF, run.ID.String(), otherBound, "save"), http.StatusNotFound, "not_found")
			// Discard shares the durable valid-run guard; it cannot change an invalid run.
			problem(t, request(t, client, csrf, run.ID.String(), run.Token, "discard"), http.StatusConflict, "state_conflict")
			if facts(t, run) != before {
				t.Fatal("rejected request changed generation, charge, batch, draft or claim facts")
			}
		})
	}
	t.Run("abandoned conflicts and repeated discard stays idempotent", func(t *testing.T) {
		run := seed(t, "valid")
		requireStatus(t, request(t, client, csrf, run.ID.String(), run.Token, "discard"), http.StatusNoContent)
		before := facts(t, run)
		for range 2 {
			problem(t, request(t, client, csrf, run.ID.String(), run.Token, "save"), http.StatusConflict, "state_conflict")
			requireStatus(t, request(t, client, csrf, run.ID.String(), run.Token, "discard"), http.StatusNoContent)
		}
		problem(t, request(t, client, csrf, run.ID.String(), "wrong", "save"), http.StatusNotFound, "not_found")
		if facts(t, run) != before {
			t.Fatal("abandoned retry changed persisted facts")
		}
	})
	t.Run("valid save retries and deleted batch cannot be recreated", func(t *testing.T) {
		run := seed(t, "valid")
		unissued, err := generation.NewRunToken(cfg.CapabilityKey, run.ID, actor)
		if err != nil {
			t.Fatal(err)
		}
		problem(t, request(t, client, csrf, run.ID.String(), unissued, "save"), http.StatusNotFound, "not_found")
		created := request(t, client, csrf, run.ID.String(), run.Token, "save")
		requireStatus(t, created, http.StatusCreated)
		before := facts(t, run)
		retry := request(t, client, csrf, run.ID.String(), run.Token, "save")
		requireStatus(t, retry, http.StatusOK)
		batchID := dataString(t, created.body, "batch_id")
		if dataString(t, retry.body, "batch_id") != batchID {
			t.Fatal("save retry created another batch")
		}
		requireStatus(t, request(t, client, csrf, run.ID.String(), run.Token, "discard"), http.StatusNoContent)
		if facts(t, run) != before {
			t.Fatal("saved retry or losing discard changed persisted facts")
		}
		requireStatus(t, decodeResponse(t, rawJSONRequest(t, client, http.MethodDelete, server.URL+"/api/v1/me/batches/"+batchID, csrf, map[string]any{}, nil)), http.StatusNoContent)
		before = facts(t, run)
		problem(t, request(t, client, csrf, run.ID.String(), run.Token, "save"), http.StatusNotFound, "not_found")
		if facts(t, run) != before {
			t.Fatal("deleted resource was mutated by retry")
		}
	})
	t.Run("expired valid draft and abandoned token remain gone", func(t *testing.T) {
		run := seed(t, "valid")
		if _, err := pool.Exec(ctx, `UPDATE wordweave.generation_drafts SET validated_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE run_id=$1`, run.ID); err != nil {
			t.Fatal(err)
		}
		problem(t, request(t, client, csrf, run.ID.String(), run.Token, "save"), http.StatusGone, "capability_expired")
		run = seed(t, "valid")
		requireStatus(t, request(t, client, csrf, run.ID.String(), run.Token, "discard"), http.StatusNoContent)
		if _, err := pool.Exec(ctx, `UPDATE wordweave.generation_runs SET started_at=clock_timestamp()-interval '2 hours',completed_at=clock_timestamp()-interval '61 minutes' WHERE id=$1`, run.ID); err != nil {
			t.Fatal(err)
		}
		problem(t, request(t, client, csrf, run.ID.String(), run.Token, "save"), http.StatusGone, "capability_expired")
		problem(t, request(t, client, csrf, run.ID.String(), "wrong", "save"), http.StatusNotFound, "not_found")
	})
	t.Run("missing run with valid signature stays hidden", func(t *testing.T) {
		id := uuid.New()
		token, err := generation.NewRunToken(cfg.CapabilityKey, id, actor)
		if err != nil {
			t.Fatal(err)
		}
		problem(t, request(t, client, csrf, id.String(), token, "save"), http.StatusNotFound, "not_found")
	})
	t.Run("invalid visitor claim uses the shared conflict guard", func(t *testing.T) {
		if err := seedAPI.credentials.Put(ctx, actor.ID, "synthetic-unused-credential"); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)`, model); err != nil {
			t.Fatal(err)
		}
		visitorClient := newBrowserClient(t)
		visitorCSRF := bootstrap(t, visitorClient, server.URL)
		serverURL, err := url.Parse(server.URL)
		if err != nil {
			t.Fatal(err)
		}
		var visitorToken string
		for _, cookie := range visitorClient.Jar.Cookies(serverURL) {
			if cookie.Name == api.visitorCookieName() {
				visitorToken = cookie.Value
			}
		}
		visitor, err := api.identity.ResolveVisitor(ctx, visitorToken)
		if err != nil {
			t.Fatal(err)
		}
		run, err := seedAPI.generation.Start(ctx, visitor, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "discussion", Length: "short", Entries: []string{snapshot.Targets[0].Entry}})
		if err != nil {
			t.Fatal(err)
		}
		if err := seedAPI.generation.CompleteFailure(ctx, run.ID, "provider_failed", "synthetic"); err != nil {
			t.Fatal(err)
		}
		problem(t, request(t, visitorClient, visitorCSRF, run.ID.String(), run.Token, "visitor-claim"), http.StatusConflict, "state_conflict")
	})
}
