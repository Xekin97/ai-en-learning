//go:build integration

package httpapi

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/generation"
)

func TestMixedQuotaAndActiveReservation(t *testing.T) {
	for _, kind := range []string{"account", "visitor"} {
		for _, limited := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/limited=%v", kind, limited), func(t *testing.T) {
				ctx, api, pool, actor, model, _ := cr039Harness(t)
				if err := api.credentials.Put(ctx, actor.ID, "synthetic-reservation-key"); err != nil {
					t.Fatal(err)
				}
				group := "registered"
				if kind == "visitor" {
					var err error
					actor, _, err = api.identity.CreateVisitor(ctx)
					if err != nil {
						t.Fatal(err)
					}
					group = "visitor"
					if _, err := pool.Exec(ctx, "INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)", model); err != nil {
						t.Fatal(err)
					}
				}
				var limit any
				if limited {
					limit = 3
				}
				if _, err := pool.Exec(ctx, "UPDATE wordweave.entitlement_groups SET rolling_quota_limit=$2 WHERE code=$1", group, limit); err != nil {
					t.Fatal(err)
				}
				input := generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn"}}
				// Leave N-1 charged events; only one remaining quota slot may be reserved.
				for i := 0; i < 2; i++ {
					run, err := api.generation.Start(ctx, actor, input)
					if err != nil {
						t.Fatal(err)
					}
					if _, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token); err != nil {
						t.Fatal(err)
					}
				}
				type result struct {
					run generation.Run
					err error
				}
				results := make(chan result, 8)
				start := make(chan struct{})
				var wg sync.WaitGroup
				for i := 0; i < 8; i++ {
					wg.Add(1)
					go func() {
						defer wg.Done()
						<-start
						run, err := api.generation.Start(ctx, actor, input)
						results <- result{run, err}
					}()
				}
				close(start)
				wg.Wait()
				close(results)
				successes := 0
				var winning generation.Run
				for result := range results {
					if result.err == nil {
						successes++
						winning = result.run
						continue
					}
					expected := generation.ErrGenerationInProgress
					if limited {
						expected = generation.ErrQuotaExhausted
					}
					if !errors.Is(result.err, expected) {
						t.Fatalf("unexpected rejection: %v", result.err)
					}
				}
				var total, active, charged int
				if err := pool.QueryRow(ctx, "SELECT count(*),count(*) FILTER(WHERE call_status='active'),count(*) FILTER(WHERE quota_charged) FROM wordweave.generation_runs").Scan(&total, &active, &charged); err != nil {
					t.Fatal(err)
				}
				if successes != 1 || total != 3 || active != 1 || charged != 3 {
					t.Fatalf("reservation oversubscribed: %d/%d/%d/%d", successes, total, active, charged)
				}
				// System failure releases exactly that slot, without a model retry.
				if out, err := api.generation.ReconcileFailure(ctx, winning.ID, "provider_failed", "synthetic"); err != nil || !out.QuotaRefunded {
					t.Fatal("refund did not release reserved slot")
				}
				retry, err := api.generation.Start(ctx, actor, input)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := api.generation.Cancel(ctx, actor, retry.ID.String(), retry.Token); err != nil {
					t.Fatal(err)
				}
				if limited {
					if _, err := api.generation.Start(ctx, actor, input); !errors.Is(err, generation.ErrQuotaExhausted) {
						t.Fatal("N+1 cancellation charge was lost")
					}
				}
			})
		}
	}
}

func TestMixedActorPreflightHTTP(t *testing.T) {
	t.Run("admin_forbidden", func(t *testing.T) {
		f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) { t.Error("admin reached provider"); w.WriteHeader(500) })
		if _, err := f.pool.Exec(f.ctx, "UPDATE wordweave.accounts SET role='admin',group_code=NULL WHERE username='boundary_learner'"); err != nil {
			t.Fatal(err)
		}
		got := decodeResponse(t, f.start(t))
		requireStatus(t, got, 403)
		if got.body["code"] != "forbidden" || f.calls.Load() != 0 {
			t.Fatal("admin authorization failed")
		}
		var count int
		if err := f.pool.QueryRow(f.ctx, "SELECT count(*) FROM wordweave.generation_runs").Scan(&count); err != nil || count != 0 {
			t.Fatal("admin reserved generation")
		}
	})
	t.Run("visitor_assignment_and_identity", func(t *testing.T) {
		f := newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "data: broken\n\n")
		})
		f.client = newBrowserClient(t)
		f.csrf = bootstrap(t, f.client, f.base)
		denied := decodeResponse(t, f.start(t))
		requireStatus(t, denied, 422)
		if f.calls.Load() != 0 {
			t.Fatal("visitor used account assignment")
		}
		if _, err := f.pool.Exec(f.ctx, "INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('visitor',$1)", f.model); err != nil {
			t.Fatal(err)
		}
		response := f.start(t)
		_, err := io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		f.assertSettled(t, "provider_failed", false, 0)
		var visitor, account, credited bool
		var group string
		if err := f.pool.QueryRow(f.ctx, "SELECT visitor_id IS NOT NULL,account_id IS NOT NULL,credited_account_id IS NOT NULL,group_code_snapshot FROM wordweave.generation_runs").Scan(&visitor, &account, &credited, &group); err != nil {
			t.Fatal(err)
		}
		if !visitor || account || credited || group != "visitor" {
			t.Fatal("visitor charge attributed to account")
		}
	})
	t.Run("missing_actor", func(t *testing.T) {
		ctx, api, pool, actor, model, _ := cr039Harness(t)
		if err := api.credentials.Put(ctx, actor.ID, "synthetic-reservation-key"); err != nil {
			t.Fatal(err)
		}
		actor.ID = uuid.New()
		_, err := api.generation.Start(ctx, actor, generation.Input{ModelID: model.String(), MeaningLanguage: "en", Scenario: "story", Length: "short", Entries: []string{"learn"}})
		if !errors.Is(err, generation.ErrForbidden) {
			t.Fatal("nonexistent actor accepted")
		}
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM wordweave.generation_runs").Scan(&count); err != nil || count != 0 {
			t.Fatal("unknown actor consumed quota")
		}
	})
}
