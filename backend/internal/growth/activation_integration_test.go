//go:build integration

package growth

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"testing"
	"time"
	"wordweave/internal/testdb"
)

func fixtureModel(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	id := uuid.New()
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.ai_models(id,display_name,provider_model_id,enabled) VALUES($1,$2,$2,true)`, id, id.String()); err != nil {
		t.Fatal(err)
	}
	return id
}
func issueFixture(t *testing.T, ctx context.Context, s *Service, owner uuid.UUID, in ItemInput) ReceiptItem {
	t.Helper()
	in.Price = 0
	d, rev, err := s.SaveDefinition(ctx, owner, uuid.Nil, "", in)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.SetDefinitionListing(ctx, owner, d.ID, rev, true); err != nil {
		t.Fatal(err)
	}
	receipt, err := s.Exchange(ctx, owner, uuid.New(), d.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	return receipt.Items[0]
}
func activateFixture(t *testing.T, ctx context.Context, s *Service, owner, id uuid.UUID, discard bool) ItemResult {
	t.Helper()
	preview, err := s.ActivationPreview(ctx, owner, id, "en-US")
	if err != nil || !preview.Can || preview.Token == nil {
		t.Fatalf("preview unavailable: %+v %v", preview, err)
	}
	result, err := s.Activate(ctx, owner, uuid.New(), id, "en-US", *preview.Token, discard)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func TestModelCardTimesAccumulatePerModelInEitherOrder(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("item-test"))
	a, b, c := fixtureModel(t, ctx, pool), fixtureModel(t, ctx, pool), fixtureModel(t, ctx, pool)
	for _, reverse := range []bool{false, true} {
		owner := testdb.Learner(t, ctx, pool)
		ab := itemInput("model_trial")
		ab.Effect.Models = []uuid.UUID{a, b}
		ab.Effect.Seconds = 3 * 86400
		bc := itemInput("model_trial")
		bc.Effect.Models = []uuid.UUID{b, c}
		bc.Effect.Seconds = 6 * 86400
		first := issueFixture(t, ctx, s, owner, ab)
		second := issueFixture(t, ctx, s, owner, bc)
		if reverse {
			first, second = second, first
		}
		one := activateFixture(t, ctx, s, owner, first.ID, false)
		two := activateFixture(t, ctx, s, owner, second.ID, false)
		var bStart, bEnd time.Time
		for _, m := range one.Item.ModelTimes {
			if m.ID == b {
				bStart = m.Starts
				bEnd = m.Ends
			}
		}
		for _, m := range two.Item.ModelTimes {
			if m.ID == b {
				if !m.Starts.Equal(bEnd) || m.Ends.Sub(bStart) != 9*24*time.Hour {
					t.Fatalf("overlap overwritten (reverse=%v): %+v", reverse, m)
				}
			}
		}
		repeat, err := s.Activate(ctx, owner, uuid.New(), second.ID, "en-US", "already-completed-token", false)
		if err != nil || repeat.Receipt.ID != two.Receipt.ID {
			t.Fatalf("repeat activation failed: %v", err)
		}
		var count int
		if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.model_time_contributions WHERE owner_id=$1`, owner).Scan(&count); err != nil || count != 4 {
			t.Fatal("repeat added contributions")
		}
	}
}
func TestModelCardCoverageUsesPlanOnly(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("item-test"))
	owner := testdb.Learner(t, ctx, pool)
	model := fixtureModel(t, ctx, pool)
	input := itemInput("model_trial")
	input.Effect.Models = []uuid.UUID{model}
	input.Effect.Seconds = 86400
	first := issueFixture(t, ctx, s, owner, input)
	second := issueFixture(t, ctx, s, owner, input)
	activateFixture(t, ctx, s, owner, first.ID, false)
	preview, err := s.ActivationPreview(ctx, owner, second.ID, "en-US")
	if err != nil || !preview.Can {
		t.Fatal("other model card counted as plan coverage")
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('registered',$1)`, model); err != nil {
		t.Fatal(err)
	}
	preview, err = s.ActivationPreview(ctx, owner, second.ID, "en-US")
	if err != nil || preview.Can || preview.Reason == nil || *preview.Reason != "plan_already_covers_models" {
		t.Fatalf("plan coverage not reported: %+v %v", preview, err)
	}
}
func TestExtraCardKeepsOriginalDeadline(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("item-test"))
	owner := testdb.Learner(t, ctx, pool)
	input := itemInput("extra_credit")
	input.Effect.ExtraCount = 4
	issued := issueFixture(t, ctx, s, owner, input)
	result := activateFixture(t, ctx, s, owner, issued.ID, false)
	if result.Item.Extra == nil || result.Item.Extra.Remaining != 4 || !result.Item.Extra.Expires.Equal(issued.Deadline) {
		t.Fatalf("extra card duration reset: %+v", result)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.extra_credit_balances SET remaining_count=2 WHERE item_id=$1`, issued.ID); err != nil {
		t.Fatal(err)
	}
	repeat, err := s.Activate(ctx, owner, uuid.New(), issued.ID, "en-US", "", false)
	if err != nil || repeat.Item.Extra.Remaining != 2 {
		t.Fatal("activation retry restored spent extra credits")
	}
}
func TestPlanTrialExtensionReplacementAndStaleConfirmation(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("item-test"))
	owner := testdb.Learner(t, ctx, pool)
	pro := itemInput("plan_trial")
	pro.Effect.Plan = "pro"
	pro.Effect.Seconds = 6 * 86400
	first := issueFixture(t, ctx, s, owner, pro)
	pro.Effect.Seconds = 3 * 86400
	extension := issueFixture(t, ctx, s, owner, pro)
	low := issueFixture(t, ctx, s, owner, pro)
	plus := pro
	plus.Effect.Plan = "plus"
	higher := issueFixture(t, ctx, s, owner, plus)
	started := activateFixture(t, ctx, s, owner, first.ID, false)
	preview, err := s.ActivationPreview(ctx, owner, higher.ID, "en-US")
	if err != nil || preview.Discard == nil {
		t.Fatalf("replacement preview missing: %+v %v", preview, err)
	}
	_, err = s.Activate(ctx, owner, uuid.New(), higher.ID, "en-US", *preview.Token, false)
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "replacement_confirmation_required" {
		t.Fatalf("replacement did not require consent: %v", err)
	}
	extended := activateFixture(t, ctx, s, owner, extension.ID, false)
	if extended.Item.Plan.Ends.Sub(started.Item.Plan.Ends) != 3*24*time.Hour {
		t.Fatal("same plan did not extend duration")
	}
	_, err = s.Activate(ctx, owner, uuid.New(), higher.ID, "en-US", *preview.Token, true)
	if !errors.Is(err, ErrPreviewStale) {
		t.Fatalf("old confirmation discarded newly extended time: %v", err)
	}
	current := activateFixture(t, ctx, s, owner, higher.ID, true)
	if current.Item.Plan.Code != "plus" {
		t.Fatal("higher plan did not replace")
	}
	blocked, err := s.ActivationPreview(ctx, owner, low.ID, "en-US")
	if err != nil || blocked.Can || blocked.Reason == nil || *blocked.Reason != "lower_than_current_trial" {
		t.Fatalf("lower trial not blocked: %+v %v", blocked, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.accounts SET group_code='plus' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	var end time.Time
	if err = pool.QueryRow(ctx, `SELECT ends_at FROM wordweave.plan_trials WHERE owner_id=$1 AND closed_at IS NULL`, owner).Scan(&end); err != nil || !end.Equal(current.Item.Plan.Ends) {
		t.Fatal("base upgrade changed trial expiry")
	}
}
func TestModelRetirementRefundUsesCurrentPointsAndSurvivesExpiry(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("item-test"))
	owner := testdb.Learner(t, ctx, pool)
	a, b := fixtureModel(t, ctx, pool), fixtureModel(t, ctx, pool)
	input := itemInput("model_trial")
	input.Effect.Models = []uuid.UUID{a, b}
	input.Effect.Seconds = 3 * 86400
	input.Effect.Retirement = 7
	card := issueFixture(t, ctx, s, owner, input)
	other := issueFixture(t, ctx, s, owner, input)
	activateFixture(t, ctx, s, owner, card.ID, false)
	activateFixture(t, ctx, s, owner, other.ID, false)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false WHERE id=ANY($1::uuid[])`, []uuid.UUID{a, b}); err != nil {
		t.Fatal(err)
	}
	preview, err := s.RefundPreview(ctx, owner, card.ID, "en-US")
	if err != nil || preview.Eligible {
		t.Fatal("temporary disable allowed refund")
	}
	// Reconstruct eligibility after natural expiry: the last retirement happened
	// while a contribution (including queued contributions) was still unended.
	if _, err = pool.Exec(ctx, `UPDATE wordweave.user_items SET issued_at=clock_timestamp()-interval '4 days',activation_deadline=clock_timestamp()-interval '2 days',activated_at=clock_timestamp()-interval '3 days' WHERE id=$1`, card.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.model_time_contributions SET starts_at=clock_timestamp()-interval '3 days',ends_at=clock_timestamp()-interval '1 day' WHERE item_id=$1`, card.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false,retired_at=clock_timestamp()-interval '36 hours' WHERE id=ANY($1::uuid[])`, []uuid.UUID{a, b}); err != nil {
		t.Fatal(err)
	}
	preview, err = s.RefundPreview(ctx, owner, card.ID, "en-US")
	if err != nil || !preview.Eligible || preview.Points == nil || *preview.Points != 7 {
		t.Fatalf("expired card lost earned refund: %+v %v", preview, err)
	}
	// Retirement points are the one non-snapshot field; an edit invalidates the
	// prior quote. Definition model edits cannot rewrite owned model identities.
	definition, revision, err := s.Definition(ctx, card.DefinitionID)
	if err != nil {
		t.Fatal(err)
	}
	definition.Effect.Retirement = 19
	if _, _, err = s.SaveDefinition(ctx, owner, card.DefinitionID, revision, definition.ItemInput); err != nil {
		t.Fatal(err)
	}
	_, err = s.Refund(ctx, owner, uuid.New(), card.ID, "en-US", *preview.Token)
	if !errors.Is(err, ErrPreviewStale) {
		t.Fatalf("accepted obsolete refund price: %v", err)
	}
	preview, err = s.RefundPreview(ctx, owner, card.ID, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	result, err := s.Refund(ctx, owner, uuid.New(), card.ID, "en-US", *preview.Token)
	if err != nil || result.Receipt.PointsDelta != 19 || result.Item.State != "refunded" {
		t.Fatalf("refund failed: %+v %v", result, err)
	}
	var otherRevoked int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.model_time_contributions WHERE item_id=$1 AND revoked_at IS NOT NULL`, other.ID).Scan(&otherRevoked); err != nil || otherRevoked != 0 {
		t.Fatal("refund revoked another card's contribution")
	}
	again, err := s.Refund(ctx, owner, uuid.New(), card.ID, "en-US", "lost-response")
	if err != nil || again.Receipt.ID != result.Receipt.ID || again.Receipt.PointsDelta != 19 {
		t.Fatal("duplicate refund changed actual settlement")
	}
}
