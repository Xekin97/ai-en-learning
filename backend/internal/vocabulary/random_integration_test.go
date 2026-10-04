//go:build integration

package vocabulary

import (
	"testing"
	"wordweave/internal/identity"
	"wordweave/internal/testdb"
)

func TestM002RandomExcludesCurrentLibraryAndSelectedEntries(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	batch := testdb.Batch(t, ctx, pool, owner)
	actor := identity.Actor{Kind: "account", Role: "learner", ID: owner}
	s := NewService(pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.entitlement_groups SET max_entries_per_run=20000 WHERE code='registered'`); err != nil {
		t.Fatal(err)
	}
	rows, err := pool.Query(ctx, `SELECT entry FROM wordweave.vocabulary_entries WHERE entry<>'learn' ORDER BY entry`)
	if err != nil {
		t.Fatal(err)
	}
	selected := []string{}
	for rows.Next() {
		var entry string
		if err = rows.Scan(&entry); err != nil {
			t.Fatal(err)
		}
		selected = append(selected, entry)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	result, err := s.Random(ctx, actor, selected)
	if err != nil || result.Entry != nil || result.Reason == nil || *result.Reason != "no_candidates" {
		t.Fatalf("selected or library word recommended: %+v %v", result, err)
	}
	plan, err := pool.Query(ctx, "EXPLAIN (ANALYZE,BUFFERS) "+randomCandidateSQL, []string{"weave"}, owner, true)
	if err != nil {
		t.Fatal(err)
	}
	for plan.Next() {
		var line string
		if err = plan.Scan(&line); err != nil {
			t.Fatal(err)
		}
		t.Log(line)
	}
	plan.Close()
	if err = plan.Err(); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `DELETE FROM wordweave.learning_batches WHERE id=$1`, batch); err != nil {
		t.Fatal(err)
	}
	result, err = s.Random(ctx, actor, selected)
	if err != nil || result.Entry == nil || *result.Entry != "learn" {
		t.Fatalf("deleted library word was excluded forever: %+v %v", result, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.entitlement_groups SET max_entries_per_run=1 WHERE code='registered'`); err != nil {
		t.Fatal(err)
	}
	result, err = s.Random(ctx, actor, []string{"learn"})
	if err != nil || result.Reason == nil || *result.Reason != "limit_reached" {
		t.Fatal("random exceeded plan word limit")
	}
}
