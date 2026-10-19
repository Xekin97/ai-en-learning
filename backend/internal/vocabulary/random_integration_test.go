//go:build integration

package vocabulary

import (
	"strings"
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
	plan, err := pool.Query(ctx, "EXPLAIN (ANALYZE,BUFFERS) "+randomCandidateSQL, []string{"weave"}, owner, true, blockedCandidateEntries)
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

func TestCR311SearchAndRandomFilterExactCatalogueBeforeLimit(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	actor := identity.Actor{Kind: "account", Role: "learner", ID: owner}
	service := NewService(pool)

	var hashBefore string
	if err := pool.QueryRow(ctx, `SELECT btrim(sha256)::text FROM wordweave.vocabulary_snapshots WHERE version='m001'`).Scan(&hashBefore); err != nil {
		t.Fatal(err)
	}
	result, err := service.Search(ctx, "the", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 2 {
		t.Fatalf("blocked prefix rows starved the limit: %+v", result.Items)
	}
	blocked := make(map[string]bool, len(blockedCandidateEntries))
	for _, entry := range blockedCandidateEntries {
		blocked[entry] = true
	}
	searched := make(map[string]bool)
	for _, blockedEntry := range blockedCandidateEntries {
		for _, query := range []string{blockedEntry, strings.ToUpper(blockedEntry)} {
			search, searchErr := service.Search(ctx, query, 20)
			if searchErr != nil {
				t.Fatal(searchErr)
			}
			for _, entry := range search.Items {
				lower := strings.ToLower(entry)
				searched[lower] = true
				if blocked[lower] {
					t.Fatalf("search %q returned blocked entry %q", query, entry)
				}
			}
		}
	}
	for _, entry := range result.Items {
		if blocked[strings.ToLower(entry)] {
			t.Fatalf("search returned blocked entry %q", entry)
		}
	}
	for _, allowed := range []string{"theater", "another"} {
		exact, searchErr := service.Search(ctx, allowed, 20)
		if searchErr != nil {
			t.Fatal(searchErr)
		}
		found := false
		for _, entry := range exact.Items {
			found = found || entry == allowed
		}
		if !found {
			t.Fatalf("exact filtering hid allowed substring entry %q: %v", allowed, exact.Items)
		}
	}

	eligibilitySQL := strings.TrimSuffix(randomCandidateSQL, " ORDER BY random() LIMIT 1")
	rows, err := pool.Query(ctx, eligibilitySQL, []string{}, owner, actor.IsLearner(), blockedCandidateEntries)
	if err != nil {
		t.Fatal(err)
	}
	eligible := map[string]bool{}
	for rows.Next() {
		var entry string
		if err := rows.Scan(&entry); err != nil {
			t.Fatal(err)
		}
		eligible[entry] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	allRows, err := pool.Query(ctx, `SELECT lower(v.entry) FROM wordweave.vocabulary_entries v
		JOIN wordweave.vocabulary_snapshots s ON s.id=v.snapshot_id WHERE s.version='m001'`)
	if err != nil {
		t.Fatal(err)
	}
	expected := map[string]bool{}
	for allRows.Next() {
		var entry string
		if err = allRows.Scan(&entry); err != nil {
			t.Fatal(err)
		}
		if !blocked[entry] {
			expected[entry] = true
		}
	}
	allRows.Close()
	if err = allRows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(eligible) != len(expected) {
		t.Fatalf("production random eligibility count=%d want=%d", len(eligible), len(expected))
	}
	for entry := range expected {
		if !eligible[entry] {
			t.Fatalf("production random eligibility omitted compliant entry %q", entry)
		}
	}
	for entry := range searched {
		if !eligible[entry] {
			t.Fatalf("search returned %q outside production random eligibility", entry)
		}
	}
	for _, entry := range blockedCandidateEntries {
		if eligible[entry] {
			t.Fatalf("random eligibility retained blocked entry %q", entry)
		}
	}
	for _, entry := range []string{"art", "go", "theater", "another"} {
		if !eligible[entry] {
			t.Fatalf("random eligibility removed allowed entry %q", entry)
		}
	}

	random, err := service.Random(ctx, actor, []string{"the"})
	if err != nil || random.Entry == nil || blocked[strings.ToLower(*random.Entry)] {
		t.Fatalf("old selected target was rejected or random returned blocked entry: %+v err=%v", random, err)
	}
	resolved, err := service.queries.ResolveVocabularyEntries(ctx, []string{"the"})
	if err != nil || len(resolved) != 1 || resolved[0].Entry != "the" {
		t.Fatalf("resolve started rejecting an existing target: %+v err=%v", resolved, err)
	}
	var hashAfter string
	if err := pool.QueryRow(ctx, `SELECT btrim(sha256)::text FROM wordweave.vocabulary_snapshots WHERE version='m001'`).Scan(&hashAfter); err != nil {
		t.Fatal(err)
	}
	if hashAfter != hashBefore || result.Version != "sha256:"+hashBefore {
		t.Fatalf("vocabulary source hash changed: before=%q after=%q result=%q", hashBefore, hashAfter, result.Version)
	}
}
