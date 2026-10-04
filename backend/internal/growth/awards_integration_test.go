//go:build integration

package growth

import (
	"errors"
	"github.com/google/uuid"
	"testing"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func TestAchievementClaimCreditsWholeBundleOnlyOnce(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("growth-test"))
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp(); INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0),(2,100,true,50); INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES('2020-01-01',1,1,5,1)`); err != nil {
		t.Fatal(err)
	}
	var model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Reward model','test/reward',true) RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	input := itemInput("model_trial")
	input.Effect.Models = []uuid.UUID{model}
	input.Effect.Seconds = 3600
	input.Effect.Retirement = 10
	d, _, err := s.SaveDefinition(ctx, owner, uuid.Nil, "", input)
	if err != nil {
		t.Fatal(err)
	}
	config, err := s.Achievements(ctx, "saved_passages")
	if err != nil {
		t.Fatal(err)
	}
	row := achievementChange(1)
	row.Value.Reward = AchievementReward{RewardInput: RewardInput{Points: 20, ItemID: &d.ID, Count: 2}, Experience: 120}
	row.Value.Description = business.Bilingual{ZH: ptrText("仅中文说明"), EN: nil}
	saved, err := s.SaveAchievements(ctx, AchievementChanges{Kind: "saved_passages", Expected: config.Revision, Changes: []AchievementChange{row}})
	if err != nil {
		t.Fatal(err)
	}
	tier := saved.Rows[0].ID
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.user_growth(owner_id,saved_total) VALUES($1,1)`, owner); err != nil {
		t.Fatal(err)
	}
	personal, _, err := s.PersonalAchievements(ctx, owner, "en-US", "", nil, 20)
	if err != nil {
		t.Fatal(err)
	}
	if personal[0].State != "claimable" || personal[0].Description == nil || *personal[0].Description != "仅中文说明" {
		t.Fatalf("qualification/description mismatch: %+v", personal)
	}
	var points, xp int64
	if err = pool.QueryRow(ctx, `SELECT points,experience FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&points, &xp); err != nil || points != 0 || xp != 0 {
		t.Fatal("qualification automatically credited reward")
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false WHERE id=$1`, model); err != nil {
		t.Fatal(err)
	}
	_, err = s.Claim(ctx, owner, uuid.New(), tier, true, "en-US")
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "reward_unavailable" {
		t.Fatalf("unavailable bundle claimed: %v", err)
	}
	if err = pool.QueryRow(ctx, `SELECT points,experience FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&points, &xp); err != nil || points != 0 || xp != 0 {
		t.Fatal("blocked reward partially paid")
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=true WHERE id=$1`, model); err != nil {
		t.Fatal(err)
	}
	claimed, err := s.Claim(ctx, owner, uuid.New(), tier, true, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if claimed.Receipt.PointsDelta != 20 || claimed.Receipt.ExperienceDelta != 120 || len(claimed.Receipt.Items) != 2 || claimed.Growth.Level != 2 || claimed.Growth.Pending != 1 {
		t.Fatalf("whole bundle/next qualification failed: %+v", claimed)
	}
	// A new key must not add a second reward or recursively claim the level.
	repeat, err := s.Claim(ctx, owner, uuid.New(), tier, true, "en-US")
	if err != nil || repeat.Receipt.ID != claimed.Receipt.ID || repeat.Growth.Points != 20 {
		t.Fatalf("duplicate reward: %+v %v", repeat, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.achievement_tiers SET points=999,title_en='Changed title',description_zh=NULL,description_en='<plain text>' WHERE id=$1`, tier); err != nil {
		t.Fatal(err)
	}
	personal, _, err = s.PersonalAchievements(ctx, owner, "en-US", "", nil, 20)
	if err != nil {
		t.Fatal(err)
	}
	if personal[0].Reward.Points != 20 || personal[0].Title != "Bookworm" || personal[0].Description == nil || *personal[0].Description != "<plain text>" {
		t.Fatalf("claimed snapshot/current description confused: %+v", personal)
	}
}

func TestLevelDowngradeBlocksUnclaimedButKeepsClaimedReceipt(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("growth-test"))
	owner := testdb.Learner(t, ctx, pool)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp(); INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0),(2,100,true,10),(3,200,true,20)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,experience) VALUES($1,250)`, owner); err != nil {
		t.Fatal(err)
	}
	awards, _, err := s.PersonalLevelAwards(ctx, owner, "en-US", nil, 20)
	if err != nil || len(awards) != 2 || awards[1].State != "claimable" {
		t.Fatalf("cross-level qualification: %+v %v", awards, err)
	}
	first, err := s.Claim(ctx, owner, uuid.New(), awards[0].ID, false, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_levels SET min_experience=300 WHERE level_no=3`); err != nil {
		t.Fatal(err)
	}
	_, err = s.Claim(ctx, owner, uuid.New(), awards[1].ID, false, "en-US")
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "level_required" {
		t.Fatalf("downgraded level claimed: %v", err)
	}
	current, _, err := s.PersonalLevelAwards(ctx, owner, "en-US", nil, 20)
	if err != nil || current[1].AchievedAt == nil || current[1].State != "blocked" {
		t.Fatal("downgrade deleted qualification")
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_levels SET min_experience=150 WHERE level_no=3`); err != nil {
		t.Fatal(err)
	}
	restored, err := s.Claim(ctx, owner, uuid.New(), awards[1].ID, false, "en-US")
	if err != nil || restored.Growth.Points != 30 {
		t.Fatalf("restored qualification failed: %+v %v", restored, err)
	}
	repeat, err := s.Claim(ctx, owner, uuid.New(), awards[0].ID, false, "en-US")
	if err != nil || repeat.Receipt.ID != first.Receipt.ID || repeat.Receipt.PointsAfter != 10 || repeat.Growth.Points != 30 {
		t.Fatal("retry rewrote historic receipt with current balance")
	}
}
