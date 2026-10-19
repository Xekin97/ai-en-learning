//go:build integration

package growth

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/testdb"
)

func TestGrowthRetirementPreservesHistoryAndRestoresIdentity(t *testing.T) {
	pool, ctx := testdb.Open(t)
	service := NewService(pool, []byte("growth-retirement-test"))
	historicalOwner := testdb.Learner(t, ctx, pool)
	freshOwner := testdb.Learner(t, ctx, pool)

	var levelTwo, levelThree, tierOne, tierTwo uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(2,100,true,10) RETURNING id`).Scan(&levelTwo); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(3,200,true,20) RETURNING id`).Scan(&levelThree); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.achievement_tiers(kind,threshold,enabled,name_en,title_en,points,experience) VALUES('saved_passages',1,true,'One save','First save',30,0) RETURNING id`).Scan(&tierOne); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.achievement_tiers(kind,threshold,enabled,name_en,title_en,points,experience) VALUES('saved_passages',2,true,'Two saves','Second save',40,0) RETURNING id`).Scan(&tierTwo); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,experience) VALUES($1,300),($2,300)`, historicalOwner, freshOwner); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.user_growth(owner_id,saved_total) VALUES($1,3),($2,3)`, historicalOwner, freshOwner); err != nil {
		t.Fatal(err)
	}

	levels, _, err := service.PersonalLevelAwards(ctx, historicalOwner, "en-US", nil, 20)
	if err != nil || len(levels) != 2 {
		t.Fatalf("initial level qualification failed: %+v %v", levels, err)
	}
	achievements, _, err := service.PersonalAchievements(ctx, historicalOwner, "en-US", "saved_passages", nil, 20)
	if err != nil || len(achievements) != 2 {
		t.Fatalf("initial achievement qualification failed: %+v %v", achievements, err)
	}
	claimedLevel, err := service.Claim(ctx, historicalOwner, uuid.New(), levelTwo, false, "en-US")
	if err != nil {
		t.Fatal(err)
	}
	claimedTier, err := service.Claim(ctx, historicalOwner, uuid.New(), tierOne, true, "en-US")
	if err != nil {
		t.Fatal(err)
	}

	if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_levels SET retired_at=clock_timestamp(),reward_enabled=false,points=0,item_definition_id=NULL,item_count=0 WHERE id=ANY($1::uuid[])`, []uuid.UUID{levelTwo, levelThree}); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.achievement_tiers SET retired_at=clock_timestamp(),enabled=false,points=0,experience=0,item_definition_id=NULL,item_count=0 WHERE id=ANY($1::uuid[])`, []uuid.UUID{tierOne, tierTwo}); err != nil {
		t.Fatal(err)
	}

	currentLevels, err := service.Levels(ctx)
	if err != nil || len(currentLevels.Items) != 1 || currentLevels.Items[0].Number != 1 {
		t.Fatalf("retired levels leaked into current configuration: %+v %v", currentLevels, err)
	}
	currentTiers, err := service.Achievements(ctx, "saved_passages")
	if err != nil || len(currentTiers.Items) != 0 {
		t.Fatalf("retired tiers leaked into current configuration: %+v %v", currentTiers, err)
	}
	_, err = service.PreviewLevels(ctx, "retired-edit", LevelChanges{Expected: currentLevels.Revision, Changes: []LevelChange{{
		ClientKey: uuid.New(), ID: &levelTwo, Value: LevelInput{Number: 2, Minimum: 100, Enabled: true},
	}}})
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("ordinary level edit accepted a retired identity: %v", err)
	}
	retiredTierChange := achievementChange(1)
	retiredTierChange.ID = &tierOne
	_, err = service.SaveAchievements(ctx, AchievementChanges{Kind: "saved_passages", Expected: currentTiers.Revision, Changes: []AchievementChange{retiredTierChange}})
	if !errors.As(err, &validation) {
		t.Fatalf("ordinary achievement edit accepted a retired identity: %v", err)
	}

	historicalLevels, _, err := service.PersonalLevelAwards(ctx, historicalOwner, "en-US", nil, 20)
	if err != nil || len(historicalLevels) != 2 || historicalLevels[0].State != "claimed" || historicalLevels[0].Reward.Points != 10 || historicalLevels[1].State != "blocked" || historicalLevels[1].Block == nil || *historicalLevels[1].Block != "tier_disabled" {
		t.Fatalf("retired level history was not preserved: %+v %v", historicalLevels, err)
	}
	historicalTiers, _, err := service.PersonalAchievements(ctx, historicalOwner, "en-US", "saved_passages", nil, 20)
	if err != nil || len(historicalTiers) != 2 || historicalTiers[0].State != "claimed" || historicalTiers[0].Reward.Points != 30 || historicalTiers[1].State != "blocked" || historicalTiers[1].Block == nil || *historicalTiers[1].Block != "tier_disabled" {
		t.Fatalf("retired achievement history was not preserved: %+v %v", historicalTiers, err)
	}
	retriedLevel, err := service.Claim(ctx, historicalOwner, uuid.New(), levelTwo, false, "en-US")
	if err != nil || retriedLevel.Receipt.ID != claimedLevel.Receipt.ID {
		t.Fatalf("claimed retired level did not return its historical receipt: %+v %v", retriedLevel, err)
	}
	retriedTier, err := service.Claim(ctx, historicalOwner, uuid.New(), tierOne, true, "en-US")
	if err != nil || retriedTier.Receipt.ID != claimedTier.Receipt.ID {
		t.Fatalf("claimed retired achievement did not return its historical receipt: %+v %v", retriedTier, err)
	}
	_, err = service.Claim(ctx, historicalOwner, uuid.New(), levelThree, false, "en-US")
	var domain *DomainError
	if !errors.As(err, &domain) || domain.Code != "tier_disabled" {
		t.Fatalf("unclaimed retired level was claimable: %v", err)
	}
	_, err = service.Claim(ctx, historicalOwner, uuid.New(), tierTwo, true, "en-US")
	if !errors.As(err, &domain) || domain.Code != "tier_disabled" {
		t.Fatalf("unclaimed retired achievement was claimable: %v", err)
	}

	freshLevels, _, err := service.PersonalLevelAwards(ctx, freshOwner, "en-US", nil, 20)
	if err != nil || len(freshLevels) != 0 {
		t.Fatalf("retired levels newly achieved or exposed: %+v %v", freshLevels, err)
	}
	freshTiers, _, err := service.PersonalAchievements(ctx, freshOwner, "en-US", "saved_passages", nil, 20)
	if err != nil || len(freshTiers) != 0 {
		t.Fatalf("retired achievements newly achieved or exposed: %+v %v", freshTiers, err)
	}
	var freshAwardCount int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.level_awards WHERE owner_id=$1)+(SELECT count(*) FROM wordweave.achievement_awards WHERE owner_id=$1)`, freshOwner).Scan(&freshAwardCount); err != nil || freshAwardCount != 0 {
		t.Fatalf("recompute created retired awards: %d %v", freshAwardCount, err)
	}

	if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_levels SET retired_at=NULL,reward_enabled=true,points=CASE level_no WHEN 2 THEN 10 ELSE 20 END WHERE id=ANY($1::uuid[])`, []uuid.UUID{levelTwo, levelThree}); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.achievement_tiers SET retired_at=NULL,enabled=true,points=CASE threshold WHEN 1 THEN 30 ELSE 40 END WHERE id=ANY($1::uuid[])`, []uuid.UUID{tierOne, tierTwo}); err != nil {
		t.Fatal(err)
	}

	restoredLevels, _, err := service.PersonalLevelAwards(ctx, historicalOwner, "en-US", nil, 20)
	if err != nil || len(restoredLevels) != 2 || restoredLevels[0].State != "claimed" || restoredLevels[1].State != "claimable" {
		t.Fatalf("same-identity level restoration changed award history: %+v %v", restoredLevels, err)
	}
	restoredTiers, _, err := service.PersonalAchievements(ctx, historicalOwner, "en-US", "saved_passages", nil, 20)
	if err != nil || len(restoredTiers) != 2 || restoredTiers[0].State != "claimed" || restoredTiers[1].State != "claimable" {
		t.Fatalf("same-identity tier restoration changed award history: %+v %v", restoredTiers, err)
	}
	var duplicateCount int
	if err = pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM wordweave.level_awards WHERE owner_id=$1 AND level_id=ANY($2::uuid[]))+
		(SELECT count(*) FROM wordweave.achievement_awards WHERE owner_id=$1 AND tier_id=ANY($3::uuid[]))`,
		historicalOwner, []uuid.UUID{levelTwo, levelThree}, []uuid.UUID{tierOne, tierTwo}).Scan(&duplicateCount); err != nil || duplicateCount != 4 {
		t.Fatalf("same identities were reissued: %d %v", duplicateCount, err)
	}

	freshLevels, _, err = service.PersonalLevelAwards(ctx, freshOwner, "en-US", nil, 20)
	if err != nil || len(freshLevels) != 2 {
		t.Fatalf("restored levels did not become current: %+v %v", freshLevels, err)
	}
	freshTiers, _, err = service.PersonalAchievements(ctx, freshOwner, "en-US", "saved_passages", nil, 20)
	if err != nil || len(freshTiers) != 2 {
		t.Fatalf("restored achievements did not become current: %+v %v", freshTiers, err)
	}
}
