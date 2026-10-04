//go:build integration

package growth

import (
	"errors"
	"github.com/google/uuid"
	"sync"
	"testing"
	"time"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func TestMakeupUsesHistoricalRulesAndOnlyPositivePointsDifference(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("makeup-test"))
	owner := testdb.Learner(t, ctx, pool)
	today := business.LearningDay(time.Now())
	target := today.AddDate(0, 0, -3)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.accounts SET created_at=clock_timestamp()-interval '60 days' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	var oldRule, newRule uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES($1,10,2,100,1) RETURNING id`, today.AddDate(0, 0, -60)).Scan(&oldRule); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES($1,20,3,100,5) RETURNING id`, target.AddDate(0, 0, 1)).Scan(&newRule); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,points,experience) VALUES($1,53,11)`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.user_growth(owner_id,highest_checkin_streak,highest_review_streak) VALUES($1,2,7)`, owner); err != nil {
		t.Fatal(err)
	}
	for _, d := range []struct {
		day                time.Time
		rule               uuid.UUID
		streak, points, xp int
	}{{target.AddDate(0, 0, -1), oldRule, 1, 10, 1}, {target.AddDate(0, 0, 1), newRule, 1, 20, 5}, {target.AddDate(0, 0, 2), newRule, 2, 23, 5}} {
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.user_checkins(owner_id,learning_day,kind,rule_id,streak_at_last_settlement,points_paid,normal_experience_paid) VALUES($1,$2,'normal',$3,$4,$5,$6)`, owner, d.day, d.rule, d.streak, d.points, d.xp); err != nil {
			t.Fatal(err)
		}
	}
	card := issueFixture(t, ctx, s, owner, itemInput("makeup"))
	second := issueFixture(t, ctx, s, owner, itemInput("makeup"))
	preview, err := s.MakeupPreview(ctx, owner, card.ID, target.Format(time.DateOnly))
	if err != nil || !preview.Can || preview.Points != 24 || preview.Experience != 0 || len(preview.Days) != 3 {
		t.Fatalf("wrong historic supplement: %+v %v", preview, err)
	}
	expected := []int64{12, 26, 29}
	for i, day := range preview.Days {
		if int64(day.After) != expected[i] {
			t.Fatalf("used current rule for historic day: %+v", preview)
		}
	}
	result, err := s.Makeup(ctx, owner, uuid.New(), card.ID, target.Format(time.DateOnly), *preview.Token)
	if err != nil {
		t.Fatal(err)
	}
	if result.Receipt.PointsDelta != 24 || result.Receipt.ExperienceDelta != 0 || result.Receipt.PointsAfter != 77 || result.Receipt.ExperienceAfter != 11 || result.Checkin.Current != 4 || result.Checkin.Highest != 4 {
		t.Fatalf("wrong supplement settlement: %+v", result)
	}
	repeat, err := s.Makeup(ctx, owner, uuid.New(), card.ID, target.Format(time.DateOnly), "lost-response")
	if err != nil || repeat.Receipt.ID != result.Receipt.ID {
		t.Fatal("makeup replay did not return original receipt")
	}
	_, err = s.Makeup(ctx, owner, uuid.New(), second.ID, target.Format(time.DateOnly), "stale-confirmation")
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "day_already_checked_in" {
		t.Fatalf("second card used for signed day: %v", err)
	}
	var activated *time.Time
	var xp, reviewHigh int
	if err = pool.QueryRow(ctx, `SELECT activated_at FROM wordweave.user_items WHERE id=$1`, second.ID).Scan(&activated); err != nil || activated != nil {
		t.Fatal("rejected makeup consumed second card")
	}
	if err = pool.QueryRow(ctx, `SELECT normal_experience_paid FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day=$2`, owner, target).Scan(&xp); err != nil || xp != 0 {
		t.Fatal("makeup granted historical experience")
	}
	if err = pool.QueryRow(ctx, `SELECT highest_review_streak FROM wordweave.user_growth WHERE owner_id=$1`, owner).Scan(&reviewHigh); err != nil || reviewHigh != 7 {
		t.Fatal("checkin changed review streak")
	}
	calendar, err := s.Calendar(ctx, owner, target.Format(time.DateOnly), today.Format(time.DateOnly))
	if err != nil || calendar.Days[0].State != "makeup" || calendar.Days[0].Paid != 12 || calendar.Days[0].CanMakeup {
		t.Fatalf("calendar incorrect: %+v %v", calendar, err)
	}
	personal, err := s.Personal(ctx, owner, "en-US")
	if err != nil || personal.Checkin.Signed || personal.Checkin.Current != 4 || personal.Checkin.Points != 32 {
		t.Fatalf("next checkin projection incorrect: %+v %v", personal, err)
	}
}
func TestConcurrentMakeupsUseOnlyOneCard(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("makeup-test"))
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0); INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES('2020-01-01',5,1,10,2)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.accounts SET created_at=clock_timestamp()-interval '60 days' WHERE id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	cards := []ReceiptItem{issueFixture(t, ctx, s, owner, itemInput("makeup")), issueFixture(t, ctx, s, owner, itemInput("makeup"))}
	day := business.LearningDay(time.Now()).AddDate(0, 0, -1).Format(time.DateOnly)
	tokens := make([]string, 2)
	for i, card := range cards {
		preview, err := s.MakeupPreview(ctx, owner, card.ID, day)
		if err != nil || preview.Token == nil {
			t.Fatal(err)
		}
		tokens[i] = *preview.Token
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := range cards {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := s.Makeup(ctx, owner, uuid.New(), cards[i].ID, day, tokens[i])
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		var domain *DomainError
		if err == nil {
			success++
		} else if !errors.As(err, &domain) || domain.Code != "day_already_checked_in" {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatal("concurrent makeup settled twice")
	}
	var count, points, xp int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.user_items WHERE owner_id=$1 AND activated_at IS NOT NULL),points,experience FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&count, &points, &xp); err != nil || count != 1 || points != 5 || xp != 0 {
		t.Fatalf("wrong concurrent settlement %d %d %d %v", count, points, xp, err)
	}
}
