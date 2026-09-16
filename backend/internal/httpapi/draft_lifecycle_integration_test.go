//go:build integration

package httpapi

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/learning"
)

func TestDraftLifecycleWithoutRegistry(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	snapshot := cr039Snapshot(t)
	fresh := func() *learning.Service {
		return learning.NewService(pool, generation.NewRegistry(cfg.CapabilityKey), cfg.CapabilityKey, cfg.DraftTTL, cfg.ClaimTTL)
	}
	seed := func() generation.Run {
		run := cr039SeedRun(t, ctx, api, pool, actor, model, snapshot.Targets[0].Entry)
		if err := api.generation.CompleteValid(ctx, run, snapshot); err != nil {
			t.Fatal(err)
		}
		return run
	}
	expire := func(run generation.Run) {
		if _, err := pool.Exec(ctx, `UPDATE wordweave.generation_drafts SET validated_at=clock_timestamp()-interval '31 minutes', expires_at=clock_timestamp()-interval '1 minute' WHERE run_id=$1`, run.ID); err != nil {
			t.Fatal(err)
		}
	}
	checkMissing := func(err error) {
		t.Helper()
		if !errors.Is(err, learning.ErrNotFound) {
			t.Fatalf("expected not found, got %v", err)
		}
	}

	t.Run("save retry concurrent and delete", func(t *testing.T) {
		run := seed()
		wrong := actor
		wrong.ID = uuid.New()
		_, _, err := fresh().Save(ctx, wrong, run.ID.String(), run.Token)
		checkMissing(err)
		wrongBound, _ := generation.NewRunToken(cfg.CapabilityKey, run.ID, wrong)
		_, _, err = fresh().Save(ctx, wrong, run.ID.String(), wrongBound)
		checkMissing(err) // A valid signature never replaces persisted ownership.
		unissued, _ := generation.NewRunToken(cfg.CapabilityKey, run.ID, actor)
		_, _, err = fresh().Save(ctx, actor, run.ID.String(), unissued)
		checkMissing(err) // Pending drafts also require the exact stored digest.
		const workers = 8
		type result struct {
			batch  learning.SavedBatch
			reused bool
			err    error
		}
		results := make(chan result, workers)
		for range workers {
			go func() { b, r, e := fresh().Save(ctx, actor, run.ID.String(), run.Token); results <- result{b, r, e} }()
		}
		var id uuid.UUID
		created := 0
		for range workers {
			r := <-results
			if r.err != nil {
				t.Fatal(r.err)
			}
			if id != uuid.Nil && id != r.batch.ID {
				t.Fatal("duplicate batch")
			}
			id = r.batch.ID
			if !r.reused {
				created++
			}
		}
		if created != 1 {
			t.Fatalf("created %d batches", created)
		}
		var drafts int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1`, run.ID).Scan(&drafts); err != nil || drafts != 0 {
			t.Fatal("saved payload retained")
		}
		_, _, err = fresh().Save(ctx, actor, run.ID.String(), "wrong")
		checkMissing(err) // Authentication is still required after deleting the draft.
		cr039AssertReview(t, ctx, api, actor, id, snapshot)
		if err := fresh().DeleteBatch(ctx, actor.ID, id); err != nil {
			t.Fatal(err)
		}
		_, _, err = fresh().Save(ctx, actor, run.ID.String(), run.Token)
		checkMissing(err)
	})
	t.Run("discard and save cannot resurrect", func(t *testing.T) {
		run := seed()
		checkMissing(fresh().Discard(ctx, actor, run.ID.String(), "wrong"))
		if err := fresh().Discard(ctx, actor, run.ID.String(), run.Token); err != nil {
			t.Fatal(err)
		}
		if err := fresh().Discard(ctx, actor, run.ID.String(), run.Token); err != nil {
			t.Fatal(err)
		}
		_, _, err := fresh().Save(ctx, actor, run.ID.String(), run.Token)
		checkMissing(err)
	})
	t.Run("save versus discard serialized", func(t *testing.T) {
		for range 6 {
			run := seed()
			var wg sync.WaitGroup
			var saveErr, discardErr error
			wg.Add(2)
			go func() { defer wg.Done(); _, _, saveErr = fresh().Save(ctx, actor, run.ID.String(), run.Token) }()
			go func() { defer wg.Done(); discardErr = fresh().Discard(ctx, actor, run.ID.String(), run.Token) }()
			wg.Wait()
			if saveErr != nil && !errors.Is(saveErr, learning.ErrNotFound) {
				t.Fatal(saveErr)
			}
			if discardErr != nil {
				t.Fatal(discardErr)
			}
			var state string
			var count int
			if err := pool.QueryRow(ctx, `SELECT disposition,(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=$1) FROM wordweave.generation_runs WHERE id=$1`, run.ID).Scan(&state, &count); err != nil {
				t.Fatal(err)
			}
			if !((state == "saved" && count == 1 && saveErr == nil) || (state == "abandoned" && count == 0 && errors.Is(saveErr, learning.ErrNotFound))) {
				t.Fatalf("non-atomic result %s/%d/%v", state, count, saveErr)
			}
		}
	})
	t.Run("expired pending and terminal tokens", func(t *testing.T) {
		run := seed()
		expire(run)
		_, _, err := fresh().Save(ctx, actor, run.ID.String(), run.Token)
		if !errors.Is(err, learning.ErrCapabilityExpired) {
			t.Fatal(err)
		}
		if err := fresh().Discard(ctx, actor, run.ID.String(), run.Token); !errors.Is(err, learning.ErrCapabilityExpired) {
			t.Fatal(err)
		}
		run = seed()
		if _, _, err := fresh().Save(ctx, actor, run.ID.String(), run.Token); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `UPDATE wordweave.generation_runs SET started_at=clock_timestamp()-interval '2 hours',completed_at=clock_timestamp()-interval '61 minutes' WHERE id=$1`, run.ID); err != nil {
			t.Fatal(err)
		}
		_, _, err = fresh().Save(ctx, actor, run.ID.String(), run.Token)
		if !errors.Is(err, learning.ErrCapabilityExpired) {
			t.Fatal(err)
		}
	})
	for _, status := range []string{"active", "provider_failed", "server_failed", "stream_failed", "validation_failed", "user_cancelled"} {
		t.Run(status+" never saves", func(t *testing.T) {
			run := cr039SeedRun(t, ctx, api, pool, actor, model, snapshot.Targets[0].Entry)
			if status == "user_cancelled" {
				if _, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token); err != nil {
					t.Fatal(err)
				}
			} else if status != "active" {
				if err := api.generation.CompleteFailure(ctx, run.ID, status, "synthetic"); err != nil {
					t.Fatal(err)
				}
			}
			_, _, err := fresh().Save(ctx, actor, run.ID.String(), run.Token)
			checkMissing(err)
			if status == "active" {
				if err := api.generation.CompleteFailure(ctx, run.ID, "server_failed", "synthetic"); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
	t.Run("visitor claim after restart and expired draft", func(t *testing.T) {
		if err := api.credentials.Put(ctx, actor.ID, "synthetic-unused-credential"); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)`, model); err != nil {
			t.Fatal(err)
		}
		visitor, _, err := api.identity.CreateVisitor(ctx)
		if err != nil {
			t.Fatal(err)
		}
		start := func() generation.Run {
			run, err := api.generation.Start(ctx, visitor, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "discussion", Length: "short", Entries: []string{snapshot.Targets[0].Entry}})
			if err != nil {
				t.Fatal(err)
			}
			if err := api.generation.CompleteValid(ctx, run, snapshot); err != nil {
				t.Fatal(err)
			}
			return run
		}
		run := start()
		if _, err := fresh().CreateClaim(ctx, visitor, run.ID.String(), "wrong"); !errors.Is(err, learning.ErrNotFound) {
			t.Fatal(err)
		}
		claim, err := fresh().CreateClaim(ctx, visitor, run.ID.String(), run.Token)
		if err != nil {
			t.Fatal(err)
		}
		id, reused, err := fresh().ConsumeClaim(ctx, actor, claim.Token)
		if err != nil || reused {
			t.Fatalf("claim: %v", err)
		}
		id2, reused, err := fresh().ConsumeClaim(ctx, actor, claim.Token)
		if err != nil || !reused || id != id2 {
			t.Fatalf("claim retry: %v", err)
		}
		other := identity.Actor{Kind: "account", Role: "learner", ID: uuid.New()}
		_, _, err = fresh().ConsumeClaim(ctx, other, claim.Token)
		checkMissing(err)
		cr039AssertReview(t, ctx, api, actor, id, snapshot)
		run = start()
		claim, err = fresh().CreateClaim(ctx, visitor, run.ID.String(), run.Token)
		if err != nil {
			t.Fatal(err)
		}
		expire(run)
		_, _, err = fresh().ConsumeClaim(ctx, actor, claim.Token)
		if !errors.Is(err, learning.ErrCapabilityExpired) {
			t.Fatal(err)
		}
		_, err = fresh().CreateClaim(ctx, visitor, run.ID.String(), run.Token)
		if !errors.Is(err, learning.ErrCapabilityExpired) {
			t.Fatal(err)
		}
	})
	t.Run("cleanup skips locked run and later removes expired draft", func(t *testing.T) {
		run := seed()
		expire(run)
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `SELECT id FROM wordweave.generation_runs WHERE id=$1 FOR UPDATE`, run.ID); err != nil {
			t.Fatal(err)
		}
		cleanup := func() {
			cleanupCtx, cancel := context.WithTimeout(ctx, 150*time.Millisecond)
			defer cancel()
			api.maintenance.Run(cleanupCtx)
		}
		cleanup()
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1`, run.ID).Scan(&n); err != nil || n != 1 {
			t.Fatalf("locked draft not skipped: %d %v", n, err)
		}
		if err := tx.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		cleanup()
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1`, run.ID).Scan(&n); err != nil || n != 0 {
			t.Fatalf("expired draft not removed: %d %v", n, err)
		}
	})
}
