//go:build integration

package growth

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func ptrText(v string) *string { return &v }
func levelChange(n int64, xp business.Amount) LevelChange {
	return LevelChange{ClientKey: uuid.New(), Value: LevelInput{Number: n, Minimum: xp, Enabled: n > 1, Reward: RewardInput{}}}
}
func saveLevelsFixture(t *testing.T, ctx context.Context, s *Service, in LevelChanges) LevelSaved {
	t.Helper()
	preview, err := s.PreviewLevels(ctx, "test:session", in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.SaveLevels(ctx, "test:session", LevelSave{in, preview.Token, true})
	if err != nil {
		t.Fatal(err)
	}
	return out
}
func TestLevelBulkThresholdShiftAndUnknownCommit(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("growth-key"))
	initial, err := s.Levels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	changes := LevelChanges{Expected: initial.Revision, Changes: []LevelChange{levelChange(1, 0), levelChange(2, 100), levelChange(3, 200)}}
	first := saveLevelsFixture(t, ctx, s, changes)
	for i, row := range first.Rows {
		if row.ClientKey != changes.Changes[i].ClientKey || row.ID != first.Configuration.Items[i].ID {
			t.Fatal("saved rows not bound to stable client keys")
		}
	}
	owner := testdb.Learner(t, ctx, pool)
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.growth_balances(owner_id,experience) VALUES($1,150)`, owner); err != nil {
		t.Fatal(err)
	}
	shifted := LevelChanges{Expected: first.Configuration.Revision, Changes: []LevelChange{
		{ClientKey: uuid.New(), ID: &first.Configuration.Items[1].ID, Value: LevelInput{Number: 2, Minimum: 200, Enabled: true}},
		{ClientKey: uuid.New(), ID: &first.Configuration.Items[2].ID, Value: LevelInput{Number: 3, Minimum: 300, Enabled: true}},
	}}
	preview, err := s.PreviewLevels(ctx, "test:session", shifted)
	if err != nil {
		t.Fatal(err)
	}
	if !preview.MayDowngrade || preview.Affected != 1 {
		t.Fatalf("wrong impact: %+v", preview)
	}
	// Progress changes after preview do not invalidate confirmation.
	if _, err = pool.Exec(ctx, `UPDATE wordweave.growth_balances SET experience=400 WHERE owner_id=$1`, owner); err != nil {
		t.Fatal(err)
	}
	saved, err := s.SaveLevels(ctx, "test:session", LevelSave{shifted, preview.Token, true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Configuration.Items[1].Minimum != 200 || saved.Configuration.Items[2].Minimum != 300 {
		t.Fatalf("threshold shift failed: %+v", saved)
	}
	_, err = s.SaveLevels(ctx, "test:session", LevelSave{shifted, preview.Token, true})
	var conflict *business.RevisionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("lost-response replay wrote twice: %v", err)
	}
	var revision int64
	if err = pool.QueryRow(ctx, `SELECT revision FROM wordweave.growth_settings`).Scan(&revision); err != nil || revision != 3 {
		t.Fatalf("global revision advanced wrong number: %d %v", revision, err)
	}
	invalid := LevelChanges{Expected: saved.Configuration.Revision, Changes: []LevelChange{{ClientKey: uuid.New(), ID: &saved.Configuration.Items[2].ID, Value: LevelInput{Number: 3, Minimum: 200, Enabled: true}}}}
	_, err = s.PreviewLevels(ctx, "test:session", invalid)
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("hidden-row collision accepted: %v", err)
	}
	found := false
	for _, f := range validation.Fields {
		if f.Field == "/changes/0/value/min_experience" && f.Code == "duplicate_threshold" {
			found = true
		}
	}
	if !found {
		t.Fatalf("wrong error indexes: %+v", validation)
	}
	after, err := s.Levels(ctx)
	if err != nil || !reflect.DeepEqual(after, saved.Configuration) {
		t.Fatalf("rejected group modified configuration: %v", err)
	}
}

func TestSettingsAtomicPendingAndConcurrentEditors(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("growth-key"))
	actor := testdb.Learner(t, ctx, pool)
	before, err := s.GetSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if before.StartedAt != nil || before.Current != nil || before.Pending != nil {
		t.Fatal("invented operating defaults")
	}
	input := SettingsInput{Mastery: 7, CheckinValues: CheckinValues{Base: 10, Step: 2, Cap: 20, Experience: 3}, Expected: before.Revision}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.SaveSettings(ctx, actor, input); errs <- err }()
	}
	wg.Wait()
	close(errs)
	successes, conflicts := 0, 0
	for err := range errs {
		var conflict *business.RevisionConflict
		if err == nil {
			successes++
		} else if errors.As(err, &conflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("same revision saved twice")
	}
	current, err := s.GetSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if current.Mastery != 7 || current.Current != nil || current.Pending == nil || current.StartedAt != nil {
		t.Fatalf("incorrect effective-day semantics: %+v", current)
	}
	day, err := time.Parse("2006-01-02", current.LearningDay)
	if err != nil {
		t.Fatal(err)
	}
	if current.Pending.EffectiveDay != day.AddDate(0, 0, 1).Format("2006-01-02") {
		t.Fatal("pending is not tomorrow learning day")
	}
	input.Expected = current.Revision
	input.Mastery = 99
	input.Cap = 1
	if _, err = s.SaveSettings(ctx, actor, input); err == nil {
		t.Fatal("invalid cap accepted")
	}
	after, err := s.GetSettings(ctx)
	if err != nil || !reflect.DeepEqual(current, after) {
		t.Fatal("partially saved invalid five-value command")
	}
}

func achievementChange(threshold int64) AchievementChange {
	return AchievementChange{ClientKey: uuid.New(), Value: AchievementFields{Threshold: threshold, Enabled: true, Name: business.Bilingual{EN: ptrText("Reader")}, Title: business.Bilingual{EN: ptrText("Bookworm")}, Description: business.Bilingual{}, Reward: AchievementReward{RewardInput: RewardInput{Points: 5}, Experience: 3}}}
}
func TestAchievementBulkDescriptionAndRollback(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("growth-key"))
	owner := testdb.Learner(t, ctx, pool)
	initial, err := s.Achievements(ctx, "saved_passages")
	if err != nil {
		t.Fatal(err)
	}
	input := AchievementChanges{Kind: "saved_passages", Expected: initial.Revision, Changes: []AchievementChange{achievementChange(1), achievementChange(2)}}
	input.Changes[0].Value.Description = business.Bilingual{ZH: ptrText("  保留换行\n<说明>  "), EN: nil}
	saved, err := s.SaveAchievements(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if *saved.Configuration.Items[0].Description.ZH != "  保留换行\n<说明>  " || saved.Configuration.Items[0].Description.EN != nil {
		t.Fatal("description normalized or translated unexpectedly")
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.achievement_awards(owner_id,tier_id,achieved_at,title_en_snapshot) VALUES($1,$2,clock_timestamp(),'Original title')`, owner, saved.Configuration.Items[0].ID); err != nil {
		t.Fatal(err)
	}
	input.Expected = saved.Configuration.Revision
	for i := range input.Changes {
		input.Changes[i].ID = &saved.Configuration.Items[i].ID
		input.Changes[i].Value.Threshold = int64(i + 2)
	}
	input.Changes[0].Value.Description = business.Bilingual{ZH: ptrText(" \n ")}
	input.Changes[0].Value.Title.EN = ptrText("New title")
	second, err := s.SaveAchievements(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if second.Configuration.Items[0].Description.ZH != nil || second.Configuration.Items[0].ID != saved.Configuration.Items[0].ID {
		t.Fatal("description clear changed row identity")
	}
	var title string
	if err = pool.QueryRow(ctx, `SELECT title_en_snapshot FROM wordweave.achievement_awards WHERE owner_id=$1`, owner).Scan(&title); err != nil || title != "Original title" {
		t.Fatal("configuration rewrote earned title")
	}
	input.Expected = second.Configuration.Revision
	input.Changes[0].Value.Threshold = 3
	_, err = s.SaveAchievements(ctx, input)
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("duplicate accepted: %v", err)
	}
	after, err := s.Achievements(ctx, input.Kind)
	if err != nil || !reflect.DeepEqual(after, second.Configuration) {
		t.Fatal("rejected bulk modified data")
	}
	input.Changes[0].Value.Threshold = 4
	input.Kind = "mastered_words"
	_, err = s.SaveAchievements(ctx, input)
	if !errors.As(err, &validation) {
		t.Fatalf("cross-kind row accepted: %v", err)
	}
}

func TestLevelConfirmationBindsFullNormalizedChanges(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("growth-key"))
	before, err := s.Levels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	input := LevelChanges{Expected: before.Revision, Changes: []LevelChange{levelChange(1, 0), levelChange(2, 100)}}
	preview, err := s.PreviewLevels(ctx, "actor:session", input)
	if err != nil {
		t.Fatal(err)
	}
	altered := input
	altered.Changes = append([]LevelChange(nil), input.Changes...)
	altered.Changes[1].Value.Reward.Points = 42
	if _, err = s.SaveLevels(ctx, "actor:session", LevelSave{altered, preview.Token, true}); !errors.Is(err, ErrImpactChanged) {
		t.Fatalf("altered reward accepted: %v", err)
	}
	// Row reordering preserves the same normalized confirmation intent.
	input.Changes[0], input.Changes[1] = input.Changes[1], input.Changes[0]
	out, err := s.SaveLevels(ctx, "actor:session", LevelSave{input, preview.Token, true})
	if err != nil {
		t.Fatal(err)
	}
	if out.Rows[0].ClientKey != input.Changes[0].ClientKey || out.Rows[0].ID != out.Configuration.Items[1].ID {
		t.Fatal("row mapping uses sorted indexes")
	}
}

func TestM002DeferredConfigurationFailureRollsBackAllWrites(t *testing.T) {
	pool, ctx := testdb.Open(t)
	s := NewService(pool, []byte("deferred-failure-key"))
	actor := testdb.Learner(t, ctx, pool)
	before, err := s.GetSettings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `CREATE FUNCTION wordweave.test_reject_config_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected deferred configuration failure'; END $$; CREATE CONSTRAINT TRIGGER test_reject_config_commit AFTER UPDATE ON wordweave.growth_settings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.revision<>OLD.revision) EXECUTE FUNCTION wordweave.test_reject_config_commit()`); err != nil {
		t.Fatal(err)
	}
	input := SettingsInput{Mastery: 7, CheckinValues: CheckinValues{Base: 10, Step: 2, Cap: 20, Experience: 3}, Expected: before.Revision}
	if _, err = s.SaveSettings(ctx, actor, input); err == nil {
		t.Fatal("deferred failure not raised")
	}
	after, err := s.GetSettings(ctx)
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("deferred failure retained part of five-value form")
	}
	levels, err := s.Levels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	changes := LevelChanges{Expected: levels.Revision, Changes: []LevelChange{levelChange(1, 0), levelChange(2, 100), levelChange(3, 200)}}
	preview, err := s.PreviewLevels(ctx, "deferred-failure-session", changes)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveLevels(ctx, "deferred-failure-session", LevelSave{changes, preview.Token, true}); err == nil {
		t.Fatal("deferred level failure not raised")
	}
	current, err := s.Levels(ctx)
	if err != nil || !reflect.DeepEqual(levels, current) {
		t.Fatal("deferred failure retained partial rows or advanced revision")
	}
}
