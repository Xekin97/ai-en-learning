//go:build integration

package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCR040InvalidDraftRejectedWithoutPartialBatch(t *testing.T) {
	for _, kind := range []string{"old", "dual", "null", "missing"} {
		t.Run(kind, func(t *testing.T) {
			ctx, api, pool, actor, model, _ := cr039Harness(t)
			snapshot := cr039Snapshot(t)
			run := cr039SeedRun(t, ctx, api, pool, actor, model, snapshot.Targets[0].Entry)
			if err := api.generation.CompleteValid(ctx, run, snapshot); err != nil {
				t.Fatal(err)
			}
			raw, err := json.Marshal(snapshot)
			if err != nil {
				t.Fatal(err)
			}
			body := string(raw)
			switch kind {
			case "old":
				body = strings.ReplaceAll(body, "entry_meaning", "contextual_meaning")
			case "dual":
				body = strings.Replace(body, `"entry_meaning":`, `"contextual_meaning":"old","entry_meaning":`, 1)
			case "null":
				body = strings.Replace(body, `"entry_meaning":"open to harm; easily injured"`, `"entry_meaning":null`, 1)
			case "missing":
				body = strings.Replace(body, `"entry_meaning":"open to harm; easily injured",`, "", 1)
			}
			if _, err := pool.Exec(ctx, "UPDATE wordweave.generation_drafts SET payload=$1 WHERE run_id=$2", body, run.ID); err != nil {
				t.Fatal(err)
			}
			if _, _, err := api.learning.Save(ctx, actor, run.ID.String(), run.Token); err == nil {
				t.Fatal("invalid current draft saved")
			}
			var batches, targets, drafts int
			var disposition string
			if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.learning_batches),
			(SELECT count(*) FROM wordweave.batch_targets),(SELECT count(*) FROM wordweave.generation_drafts),
			(SELECT disposition FROM wordweave.generation_runs WHERE id=$1)`, run.ID).Scan(&batches, &targets, &drafts, &disposition); err != nil {
				t.Fatal(err)
			}
			if batches != 0 || targets != 0 || drafts != 1 || disposition != "pending" {
				t.Fatal("failed save changed persisted state")
			}
		})
	}
}
