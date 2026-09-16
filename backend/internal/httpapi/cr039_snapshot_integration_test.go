//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/platform/config"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/review"
)

// Snapshot fixtures exercise persisted resources. USER-COMPAT-001 removed the
// old-binary compatibility requirement; helpers issue only current capabilities.
func cr039Harness(t *testing.T) (context.Context, *Server, *pgxpool.Pool, identity.Actor, uuid.UUID, config.Config) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	url, cleanup := createTestDatabase(t, ctx, url)
	t.Cleanup(cleanup)
	pool, err := postgres.Open(ctx, url, "cr039-synthetic", 4)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	// No provider is reachable. Loading, saving and reviewing must stay offline.
	cfg := integrationConfig(url, "http://127.0.0.1:1")
	api, err := New(cfg, pool, pool)
	if err != nil {
		t.Fatal(err)
	}
	var account, model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code) VALUES ('cr039_learner','synthetic-unused-hash','learner','registered') RETURNING id`).Scan(&account); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES ('Synthetic CR039','test/no-online-provider',true) RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('registered',$1)`, model); err != nil {
		t.Fatal(err)
	}
	return ctx, api, pool, identity.Actor{ID: account, Kind: "account", Role: "learner", GroupCode: "registered"}, model, cfg
}

func cr039Snapshot(t *testing.T) ai.ValidatedBatch {
	t.Helper()
	body, err := os.ReadFile("../../testdata/cr040/v4-validated.json")
	if err != nil {
		t.Fatal(err)
	}
	var batch ai.ValidatedBatch
	if err := json.Unmarshal(body, &batch); err != nil {
		t.Fatal(err)
	}
	return batch
}

func cr039SeedRun(t *testing.T, ctx context.Context, api *Server, pool *pgxpool.Pool, actor identity.Actor, model uuid.UUID, entry string) generation.Run {
	t.Helper()
	run := generation.Run{ID: uuid.New()}
	var err error
	run.Token, err = generation.NewRunToken(api.cfg.CapabilityKey, run.ID, actor)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.generation_runs(id,account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot)
	VALUES ($1,$2,$2,'registered',$3,'Synthetic CR039','test/no-online-provider','en','discussion','short',1,1)`, run.ID, actor.ID, model); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.generation_run_entries(run_id,vocabulary_entry_id,input_order,source_entry_snapshot) SELECT $1,id,0,entry FROM wordweave.vocabulary_entries WHERE entry=$2`, run.ID, entry); err != nil {
		t.Fatal(err)
	}
	api.generation.Registry().Register(run.ID, actor, run.Token)
	return run
}

func cr039AssertReview(t *testing.T, ctx context.Context, api *Server, actor identity.Actor, batchID uuid.UUID, snapshot ai.ValidatedBatch) {
	t.Helper()
	session, err := api.review.Create(ctx, actor.ID, review.CreateInput{Mode: "single_batch", BatchID: batchID})
	if err != nil {
		t.Fatal(err)
	}
	attempt, err := api.review.StartAttempt(ctx, actor, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if attempt.Item.EntryMeaning != snapshot.Targets[0].EntryMeaning ||
		mapReviewItem(attempt.Item)["entry_meaning"] != snapshot.Targets[0].EntryMeaning {
		t.Fatal("spelling did not preserve original entry meaning")
	}
	hintBlanks := 0
	for _, segment := range attempt.Item.HintSegments {
		if segment.Kind == "blank" {
			hintBlanks++
		} else if strings.Contains(strings.ToLower(segment.Text), "vulnerab") {
			t.Fatal("hint leaked target")
		}
	}
	if hintBlanks != len(snapshot.Targets[0].HintOccurrences) {
		t.Fatal("hint positions changed")
	}
	action := func(itemID string, answer *string, answers []review.BlankAnswer) review.Outcome {
		out, err := api.review.Act(ctx, actor, attempt.ID, attempt.Token, review.Action{ActionID: uuid.NewString(), ItemID: itemID, Kind: "answer", Answer: answer, Answers: answers})
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	wrong := snapshot.Targets[0].PassageOccurrences[0].Surface
	out := action(attempt.Item.ID, &wrong, nil)
	if out.Kind != "retry" {
		t.Fatalf("spelling accepted derived instead of original: %+v", out)
	}
	correct := snapshot.Targets[0].Entry
	out = action(attempt.Item.ID, &correct, nil)
	if out.Item == nil {
		t.Fatal("passage question missing")
	}
	var correctAnswers, badAnswers []review.BlankAnswer
	group := ""
	for _, segment := range out.Item.PassageSegments {
		if segment.Kind != "blank" {
			if strings.Contains(strings.ToLower(segment.Text), "vulnerab") {
				t.Fatal("passage leaked known form")
			}
			continue
		}
		if group == "" {
			group = segment.GroupKey
		}
		if group == "" || segment.GroupKey != group {
			t.Fatal("one target has inconsistent anonymous group")
		}
		index := len(correctAnswers)
		correctAnswers = append(correctAnswers, review.BlankAnswer{BlankID: segment.BlankID, Answer: snapshot.Targets[0].PassageOccurrences[index].Surface})
		badAnswers = append(badAnswers, review.BlankAnswer{BlankID: segment.BlankID, Answer: correct})
	}
	if len(correctAnswers) != len(snapshot.Targets[0].PassageOccurrences) {
		t.Fatal("passage positions changed")
	}
	itemID := out.Item.ID
	if wrong := action(itemID, nil, badAnswers); wrong.Kind != "retry" {
		t.Fatal("passage accepted original for derived gaps")
	}
	if done := action(itemID, nil, correctAnswers); done.Kind != "session_completed" {
		t.Fatalf("surface answers did not finish: %+v", done)
	}
}

func TestCR040CurrentStoredSnapshotRoundTrip(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	for _, version := range []string{ai.ValidatorVersion} {
		t.Run(version, func(t *testing.T) {
			snapshot := cr039Snapshot(t)
			snapshot.ValidatorVersion = version
			run := cr039SeedRun(t, ctx, api, pool, actor, model, snapshot.Targets[0].Entry)
			if err := api.generation.CompleteValid(ctx, run, snapshot); err != nil {
				t.Fatal(err)
			}
			first, reused, err := api.learning.Save(ctx, actor, run.ID.String(), run.Token)
			if err != nil || reused {
				t.Fatalf("first save %v reused=%v", err, reused)
			}
			second, reused, err := api.learning.Save(ctx, actor, run.ID.String(), run.Token)
			if err != nil || !reused || first.ID != second.ID {
				t.Fatalf("idempotency: %v", err)
			}
			restarted, err := New(cfg, pool, pool)
			if err != nil {
				t.Fatal(err)
			}
			detail, err := restarted.learning.BatchDetail(ctx, actor.ID, first.ID)
			if err != nil {
				t.Fatal(err)
			}
			if detail.Targets[0].EntryMeaning != snapshot.Targets[0].EntryMeaning || detail.Passage != snapshot.Passage || !reflect.DeepEqual(detail.Targets[0].Occurrences, snapshot.Targets[0].PassageOccurrences) {
				t.Fatal("saved snapshot was recomputed")
			}
			var gotVersion string
			if err := pool.QueryRow(ctx, `SELECT validator_version FROM wordweave.learning_batches WHERE id=$1`, first.ID).Scan(&gotVersion); err != nil || gotVersion != version {
				t.Fatal("version overwritten")
			}
			if mapBatchDetail(detail).Targets[0].EntryMeaning != snapshot.Targets[0].EntryMeaning {
				t.Fatal("learner/admin shared projection changed meaning")
			}
			cr039AssertReview(t, ctx, restarted, actor, first.ID, snapshot)
		})
	}
}
