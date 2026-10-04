//go:build integration

package growth

import (
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"reflect"
	"sync"
	"testing"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func itemInput(kind string) ItemInput {
	return ItemInput{Kind: kind, Name: business.Bilingual{EN: ptrText("Test card")}, Description: business.Bilingual{EN: ptrText("Test effect")}, Price: 10, TTL: 86400, Effect: EffectInput{Kind: kind}}
}
func TestExchangeIsAtomicIdempotentAndPreservesIssuedSnapshots(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("test-items"))
	owner := testdb.Learner(t, ctx, pool)
	input := itemInput("extra_credit")
	input.Effect.ExtraCount = 3
	definition, revision, err := s.SaveDefinition(ctx, owner, uuid.Nil, "", input)
	if err != nil {
		t.Fatal(err)
	}
	if definition.Listed {
		t.Fatal("new card automatically listed")
	}
	if _, _, err = s.SetDefinitionListing(ctx, owner, definition.ID, revision, true); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,points) VALUES($1,100)`, owner); err != nil {
		t.Fatal(err)
	}
	key := uuid.New()
	first, err := s.Exchange(ctx, owner, key, definition.ID, 2)
	if err != nil {
		t.Fatal(err)
	}
	if first.PointsDelta != -20 || first.PointsAfter != 80 || len(first.Items) != 2 {
		t.Fatalf("bad receipt: %+v", first)
	}
	again, err := s.Exchange(ctx, owner, key, definition.ID, 2)
	if err != nil || !reflect.DeepEqual(first, again) {
		t.Fatalf("retry changed receipt: %+v %v", again, err)
	}
	_, err = s.Exchange(ctx, owner, key, definition.ID, 3)
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "idempotency_conflict" {
		t.Fatalf("same key different quantity accepted: %v", err)
	}
	current, rev, err := s.Definition(ctx, definition.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !current.EverIssued {
		t.Fatal("issuance history not recorded")
	}
	input.Price = 20
	input.Effect.ExtraCount = 9
	updated, newRev, err := s.SaveDefinition(ctx, owner, definition.ID, rev, input)
	if err != nil {
		t.Fatal(err)
	}
	if !updated.EverIssued || !updated.Listed {
		t.Fatal("edit reset lifecycle")
	}
	var snapshot issuedParameters
	var raw []byte
	if err = pool.QueryRow(ctx, `SELECT parameters_snapshot FROM wordweave.user_items WHERE id=$1`, first.Items[0].ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &snapshot); err != nil || snapshot.ExtraCount != 3 {
		t.Fatalf("issued effect changed: %+v %v", snapshot, err)
	}
	err = s.DeleteDefinition(ctx, definition.ID, newRev, true)
	if !errors.As(err, &domain) || domain.Code != "item_has_history" {
		t.Fatalf("issued definition deleted: %v", err)
	}
	if _, err = s.Exchange(ctx, owner, uuid.New(), definition.ID, 100); !errors.As(err, &domain) || domain.Code != "insufficient_points" {
		t.Fatalf("insufficient debit: %v", err)
	}
	var points, count int64
	if err = pool.QueryRow(ctx, `SELECT points,(SELECT count(*) FROM wordweave.user_items WHERE owner_id=$1) FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&points, &count); err != nil || points != 80 || count != 2 {
		t.Fatalf("failed exchange partially applied: %d %d %v", points, count, err)
	}
}
func TestConcurrentExchangesCannotOverdraw(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("test-items"))
	owner := testdb.Learner(t, ctx, pool)
	input := itemInput("makeup")
	d, rev, err := s.SaveDefinition(ctx, owner, uuid.Nil, "", input)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.SetDefinitionListing(ctx, owner, d.ID, rev, true); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,points) VALUES($1,10)`, owner); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.Exchange(ctx, owner, uuid.New(), d.ID, 1); results <- err }()
	}
	wg.Wait()
	close(results)
	accepted, rejected := 0, 0
	for err := range results {
		var domain *DomainError
		if err == nil {
			accepted++
		} else if errors.As(err, &domain) && domain.Code == "insufficient_points" {
			rejected++
		} else {
			t.Fatal(err)
		}
	}
	if accepted != 1 || rejected != 1 {
		t.Fatal("concurrent exchange overdrew balance")
	}
}
func TestItemDefinitionReferencesAndTypeImmutability(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("test-items"))
	owner := testdb.Learner(t, ctx, pool)
	input := itemInput("makeup")
	d, rev, err := s.SaveDefinition(ctx, owner, uuid.Nil, "", input)
	if err != nil {
		t.Fatal(err)
	}
	changed := itemInput("plan_trial")
	changed.Effect.Plan = "pro"
	changed.Effect.Seconds = 100
	_, _, err = s.SaveDefinition(ctx, owner, d.ID, rev, changed)
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "item_type_immutable" {
		t.Fatalf("changed card type: %v", err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points,item_definition_id,item_count) VALUES(2,100,true,0,$1,1)`, d.ID); err != nil {
		t.Fatal(err)
	}
	err = s.DeleteDefinition(ctx, d.ID, rev, true)
	if !errors.As(err, &domain) || domain.Code != "item_in_use" {
		t.Fatalf("deleted referenced definition: %v", err)
	}
	issued, refs, more, err := s.DefinitionReferences(ctx, d.ID, "en-US", nil, 20)
	if err != nil || issued || more || len(refs) != 1 || refs[0].Name != "Level 2" {
		t.Fatalf("references incomplete: %+v %v", refs, err)
	}
}
