//go:build integration

package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/learning"
	"wordweave/internal/platform/security"
	"wordweave/internal/review"
)

type claimDeleteHarness struct {
	ctx      context.Context
	api      *Server
	pool     *pgxpool.Pool
	actor    identity.Actor
	model    uuid.UUID
	snapshot ai.ValidatedBatch
}

type claimDeleteFixture struct {
	run     generation.Run
	visitor identity.Actor
	claim   learning.Claim
	batch   uuid.UUID
}

func newClaimDeleteHarness(t *testing.T) claimDeleteHarness {
	t.Helper()
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "synthetic-unused-credential"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)`, model); err != nil {
		t.Fatal(err)
	}
	return claimDeleteHarness{ctx, api, pool, actor, model, cr039Snapshot(t)}
}

func (h claimDeleteHarness) fresh() *learning.Service {
	cfg := h.api.cfg
	return learning.NewService(h.pool, generation.NewRegistry(cfg.CapabilityKey), cfg.CapabilityKey, cfg.DraftTTL, cfg.ClaimTTL)
}

// Only the provider output is synthetic; Start, CompleteValid, claim creation,
// consumption and deletion use current production services and real PostgreSQL.
// The harness has no reachable provider or external credentials.
func (h claimDeleteHarness) seed(t *testing.T, consume bool) claimDeleteFixture {
	t.Helper()
	visitor, _, err := h.api.identity.CreateVisitor(h.ctx)
	if err != nil {
		t.Fatal(err)
	}
	run, err := h.api.generation.Start(h.ctx, visitor, generation.Input{ModelID: h.model.String(), MeaningLanguage: "en", Scenario: "discussion", Length: "short", Entries: []string{h.snapshot.Targets[0].Entry}})
	if err != nil {
		t.Fatal(err)
	}
	if err := h.api.generation.CompleteValid(h.ctx, run, h.snapshot); err != nil {
		t.Fatal(err)
	}
	claim, err := h.fresh().CreateClaim(h.ctx, visitor, run.ID.String(), run.Token)
	if err != nil {
		t.Fatal(err)
	}
	f := claimDeleteFixture{run: run, visitor: visitor, claim: claim}
	if consume {
		var saved learning.SavedBatch
		saved, _, err = h.fresh().ConsumeClaim(h.ctx, h.actor, claim.Token)
		f.batch = saved.ID
		if err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (h claimDeleteHarness) assertDeleted(t *testing.T, f claimDeleteFixture) {
	t.Helper()
	if _, err := h.fresh().BatchDetail(h.ctx, h.actor.ID, f.batch); !errors.Is(err, learning.ErrNotFound) {
		t.Fatalf("deleted batch readable: %v", err)
	}
	for _, actor := range []identity.Actor{h.actor, {Kind: "account", Role: "learner", ID: uuid.New()}} {
		if _, _, err := h.fresh().ConsumeClaim(h.ctx, actor, f.claim.Token); !errors.Is(err, learning.ErrNotFound) {
			t.Fatalf("deleted claim replay: %v", err)
		}
	}
	if _, err := h.fresh().CreateClaim(h.ctx, f.visitor, f.run.ID.String(), f.run.Token); !errors.Is(err, learning.ErrNotFound) {
		t.Fatalf("deleted resource got a new claim: %v", err)
	}
	var claims, batches, drafts int
	var charged, cumulative bool
	var credited uuid.UUID
	var disposition string
	err := h.pool.QueryRow(h.ctx, `SELECT
		(SELECT count(*) FROM wordweave.visitor_claims WHERE run_id=$1),
		(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=$1),
		(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1),
		quota_charged,counts_toward_cumulative,credited_account_id,disposition
		FROM wordweave.generation_runs WHERE id=$1`, f.run.ID).Scan(&claims, &batches, &drafts, &charged, &cumulative, &credited, &disposition)
	if err != nil || claims != 0 || batches != 0 || drafts != 0 || !charged || !cumulative || credited != h.actor.ID || disposition != "saved" {
		t.Fatalf("deletion/accounting invariant: claims=%d batches=%d drafts=%d charged=%v cumulative=%v credited=%v disposition=%s err=%v", claims, batches, drafts, charged, cumulative, credited, disposition, err)
	}
}

func TestClaimedBatchDeletionHTTP(t *testing.T) {
	h := newClaimDeleteHarness(t)
	application := httptest.NewServer(h.api.Handler())
	t.Cleanup(application.Close)
	password := "synthetic-delete-password-123"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.pool.Exec(h.ctx, `UPDATE wordweave.accounts SET password_hash=$1 WHERE id=$2`, hash, h.actor.ID); err != nil {
		t.Fatal(err)
	}
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, application.URL)
	login := postJSON(t, client, application.URL+"/api/v1/auth/login", csrf, map[string]any{"username": "cr039_learner", "password": password, "browser_ui_locale": "en-US"})
	requireStatus(t, login, http.StatusOK)
	csrf = dataString(t, login.body, "csrf_token")
	f := h.seed(t, false)
	consume := func(token string) testResponse {
		return decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/visitor-claims/consume", csrf, map[string]any{}, map[string]string{"X-Claim-Token": token}))
	}
	first := consume(f.claim.Token)
	requireStatus(t, first, http.StatusCreated)
	f.batch = uuid.MustParse(dataString(t, first.body, "batch_id"))
	retry := consume(f.claim.Token)
	requireStatus(t, retry, http.StatusOK)
	if dataString(t, retry.body, "batch_id") != f.batch.String() {
		t.Fatal("claim retry changed batch")
	}
	control := h.seed(t, true)
	cr039AssertReview(t, h.ctx, h.api, h.actor, f.batch, h.snapshot)
	single := postJSON(t, client, application.URL+"/api/v1/me/review-sessions", csrf, map[string]any{"mode": "single_batch", "batch_id": f.batch.String()})
	requireStatus(t, single, http.StatusCreated)
	singleID := nestedString(t, single.body, "data", "session", "session_id")
	today := time.Now().UTC().Format("2006-01-02")
	rangeSession, err := h.api.review.Create(h.ctx, h.actor.ID, review.CreateInput{Mode: "range", StartDate: today, EndDate: today, Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	before, err := h.fresh().Summary(h.ctx, h.actor.ID)
	if err != nil {
		t.Fatal(err)
	}
	endpoint := application.URL + "/api/v1/me/batches/" + f.batch.String()
	t.Run("missing CSRF cannot delete", func(t *testing.T) {
		requireStatus(t, decodeResponse(t, rawJSONRequest(t, client, http.MethodDelete, endpoint, "", nil, nil)), http.StatusForbidden)
	})
	t.Run("other account cannot delete", func(t *testing.T) {
		other := newBrowserClient(t)
		otherCSRF := bootstrap(t, other, application.URL)
		registered := postJSON(t, other, application.URL+"/api/v1/auth/register", otherCSRF, map[string]any{"username": "delete_other", "password": password, "password_confirmation": password, "ui_locale": "en-US"})
		requireStatus(t, registered, http.StatusCreated)
		otherCSRF = dataString(t, registered.body, "csrf_token")
		requireStatus(t, decodeResponse(t, rawJSONRequest(t, other, http.MethodDelete, endpoint, otherCSRF, nil, nil)), http.StatusNotFound)
	})
	t.Run("visitor cannot delete", func(t *testing.T) {
		visitor := newBrowserClient(t)
		visitorCSRF := bootstrap(t, visitor, application.URL)
		requireStatus(t, decodeResponse(t, rawJSONRequest(t, visitor, http.MethodDelete, endpoint, visitorCSRF, nil, nil)), http.StatusUnauthorized)
	})
	requireStatus(t, getJSON(t, client, endpoint), http.StatusOK)
	requireStatus(t, consume(f.claim.Token), http.StatusOK) // Failed requests kept the claim.
	assertPrivateNoContentResponse(t, rawJSONRequest(t, client, http.MethodDelete, endpoint, csrf, nil, nil))
	requireStatus(t, getJSON(t, client, endpoint), http.StatusNotFound)
	requireStatus(t, consume(f.claim.Token), http.StatusNotFound)
	requireStatus(t, consume("invalid-token"), http.StatusNotFound)
	requireStatus(t, decodeResponse(t, rawJSONRequest(t, client, http.MethodDelete, endpoint, csrf, nil, nil)), http.StatusNotFound)
	list := getJSON(t, client, application.URL+"/api/v1/me/batches?entry="+h.snapshot.Targets[0].Entry)
	requireStatus(t, list, http.StatusOK)
	if strings.Contains(list.raw, f.batch.String()) || !strings.Contains(list.raw, control.batch.String()) {
		t.Fatal("search did not remove only the deleted batch")
	}
	requireStatus(t, getJSON(t, client, application.URL+"/api/v1/me/review-sessions/"+singleID), http.StatusNotFound)
	requireStatus(t, postJSON(t, client, application.URL+"/api/v1/me/review-sessions", csrf, map[string]any{"mode": "single_batch", "batch_id": f.batch.String()}), http.StatusNotFound)
	var rangeRemaining, targets, positions, results int
	if err := h.pool.QueryRow(h.ctx, `SELECT
		(SELECT count(*) FROM wordweave.review_session_batches WHERE session_id=$1),
		(SELECT count(*) FROM wordweave.batch_targets WHERE batch_id=$2),
		(SELECT count(*) FROM wordweave.passage_occurrences WHERE batch_id=$2),
		(SELECT count(*) FROM wordweave.review_attempts WHERE batch_id=$2)`, rangeSession.ID, f.batch).Scan(&rangeRemaining, &targets, &positions, &results); err != nil || rangeRemaining != 1 || targets != 0 || positions != 0 || results != 0 {
		t.Fatalf("cascade/range state: %d/%d/%d/%d %v", rangeRemaining, targets, positions, results, err)
	}
	after, err := h.fresh().Summary(h.ctx, h.actor.ID)
	if err != nil || after.GenerationCount != before.GenerationCount || after.ParticipatingBatches != before.ParticipatingBatches-1 || after.SuccessfulReviewCount != before.SuccessfulReviewCount-1 {
		t.Fatalf("summary before=%+v after=%+v err=%v", before, after, err)
	}
	h.assertDeleted(t, f)
	if id, reused, err := h.fresh().ConsumeClaim(h.ctx, h.actor, control.claim.Token); err != nil || !reused || id.ID != control.batch {
		t.Fatalf("other consumed claim changed: %v", err)
	}
	// Deleting the final batch removes the now-empty range session as well.
	if err := h.fresh().DeleteBatch(h.ctx, h.actor.ID, control.batch); err != nil {
		t.Fatal(err)
	}
	if _, err := h.api.review.GetSession(h.ctx, h.actor.ID, rangeSession.ID); !errors.Is(err, review.ErrNotFound) {
		t.Fatalf("empty range session remains: %v", err)
	}
}

func (h claimDeleteHarness) lockBatch(t *testing.T, batch uuid.UUID) pgx.Tx {
	t.Helper()
	tx, err := h.pool.Begin(h.ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	if _, err := tx.Exec(h.ctx, `SELECT id FROM wordweave.learning_batches WHERE id=$1 FOR UPDATE`, batch); err != nil {
		t.Fatal(err)
	}
	return tx
}

func (h claimDeleteHarness) waitBlocked(t *testing.T, queryPart string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var found bool
		if err := h.pool.QueryRow(h.ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND position($1 in query)>0)`, queryPart).Scan(&found); err != nil {
			t.Fatal(err)
		}
		if found {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("query did not reach lock barrier: %s", queryPart)
}

func TestClaimedBatchDeletionRollback(t *testing.T) {
	h := newClaimDeleteHarness(t)
	f := h.seed(t, true)
	tx := h.lockBatch(t, f.batch)
	ctx, cancel := context.WithCancel(h.ctx)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- h.fresh().DeleteBatch(ctx, h.actor.ID, f.batch) }()
	h.waitBlocked(t, "DELETE FROM wordweave.learning_batches") // Claim removed inside uncommitted transaction.
	cancel()
	if err := <-done; err == nil {
		t.Fatal("cancelled deletion committed")
	}
	if err := tx.Rollback(h.ctx); err != nil {
		t.Fatal(err)
	}
	if id, reused, err := h.fresh().ConsumeClaim(h.ctx, h.actor, f.claim.Token); err != nil || !reused || id.ID != f.batch {
		t.Fatalf("rollback lost consumed claim: %v", err)
	}
	if _, err := h.fresh().BatchDetail(h.ctx, h.actor.ID, f.batch); err != nil {
		t.Fatal(err)
	}
	if err := h.fresh().DeleteBatch(h.ctx, h.actor.ID, f.batch); err != nil {
		t.Fatal(err)
	}
	h.assertDeleted(t, f)
}

func TestClaimedBatchDeletionConcurrency(t *testing.T) {
	h := newClaimDeleteHarness(t)
	t.Run("delete wins before blocked claim replay", func(t *testing.T) {
		f := h.seed(t, true)
		tx := h.lockBatch(t, f.batch)
		deleted := make(chan error, 1)
		go func() { deleted <- h.fresh().DeleteBatch(h.ctx, h.actor.ID, f.batch) }()
		h.waitBlocked(t, "DELETE FROM wordweave.learning_batches")
		replayed := make(chan error, 1)
		go func() { _, _, err := h.fresh().ConsumeClaim(h.ctx, h.actor, f.claim.Token); replayed <- err }()
		h.waitBlocked(t, "SELECT id FROM wordweave.accounts")
		if err := tx.Rollback(h.ctx); err != nil {
			t.Fatal(err)
		}
		if err := <-deleted; err != nil {
			t.Fatal(err)
		}
		if err := <-replayed; !errors.Is(err, learning.ErrNotFound) {
			t.Fatalf("replay after delete won: %v", err)
		}
		h.assertDeleted(t, f)
	})
	t.Run("concurrent deletes and claim replays", func(t *testing.T) {
		for range 8 {
			f := h.seed(t, true)
			start := make(chan struct{})
			deletes, replays := make(chan error, 2), make(chan error, 2)
			for range 2 {
				go func() { <-start; deletes <- h.fresh().DeleteBatch(h.ctx, h.actor.ID, f.batch) }()
				go func() {
					<-start
					id, reused, err := h.fresh().ConsumeClaim(h.ctx, h.actor, f.claim.Token)
					if err == nil && (!reused || id.ID != f.batch) {
						err = errors.New("concurrent replay created another batch")
					}
					replays <- err
				}()
			}
			close(start)
			deleted := 0
			for range 2 {
				if err := <-deletes; err == nil {
					deleted++
				} else if !errors.Is(err, learning.ErrNotFound) {
					t.Fatal(err)
				}
				if err := <-replays; err != nil && !errors.Is(err, learning.ErrNotFound) {
					t.Fatal(err)
				}
			}
			if deleted != 1 {
				t.Fatalf("successful deletions=%d, want 1", deleted)
			}
			h.assertDeleted(t, f)
		}
	})
}

func TestClaimedBatchDeletionRetention(t *testing.T) {
	h := newClaimDeleteHarness(t)
	fresh, expired := h.seed(t, true), h.seed(t, true)
	// Only synthetic time fixtures are changed; constraints and cleanup SQL stay intact.
	if _, err := h.pool.Exec(h.ctx, `UPDATE wordweave.visitor_claims SET created_at=clock_timestamp()-interval '26 hours',expires_at=clock_timestamp()-interval '25 hours',consumed_at=clock_timestamp()-interval '25 hours' WHERE consumed_batch_id=$1`, expired.batch); err != nil {
		t.Fatal(err)
	}
	// Delete holds the claim before waiting for a batch lock. Cleanup must skip it.
	tx := h.lockBatch(t, expired.batch)
	done := make(chan error, 1)
	go func() { done <- h.fresh().DeleteBatch(h.ctx, h.actor.ID, expired.batch) }()
	h.waitBlocked(t, "DELETE FROM wordweave.learning_batches")
	cleanupCtx, cancel := context.WithTimeout(h.ctx, 150*time.Millisecond)
	h.api.maintenance.Run(cleanupCtx)
	cancel()

	if err := tx.Rollback(h.ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if id, reused, err := h.fresh().ConsumeClaim(h.ctx, h.actor, fresh.claim.Token); err != nil || !reused || id.ID != fresh.batch {
		t.Fatalf("unexpired claim cleaned early: %v", err)
	}
	h.assertDeleted(t, expired)
	// Ordinary 24-hour cleanup still removes only the receipt, not its saved batch.
	if _, err := h.pool.Exec(h.ctx, `UPDATE wordweave.visitor_claims SET created_at=clock_timestamp()-interval '26 hours',expires_at=clock_timestamp()-interval '25 hours',consumed_at=clock_timestamp()-interval '25 hours' WHERE consumed_batch_id=$1`, fresh.batch); err != nil {
		t.Fatal(err)
	}
	cleanupCtx, cancel = context.WithTimeout(h.ctx, 150*time.Millisecond)
	h.api.maintenance.Run(cleanupCtx)
	cancel()
	if _, _, err := h.fresh().ConsumeClaim(h.ctx, h.actor, fresh.claim.Token); !errors.Is(err, learning.ErrNotFound) {
		t.Fatalf("expired consumed claim retained: %v", err)
	}
	if _, err := h.fresh().BatchDetail(h.ctx, h.actor.ID, fresh.batch); err != nil {
		t.Fatalf("cleanup deleted saved batch: %v", err)
	}
	if err := h.fresh().DeleteBatch(h.ctx, h.actor.ID, fresh.batch); err != nil {
		t.Fatalf("delete after receipt cleanup: %v", err)
	}
}
