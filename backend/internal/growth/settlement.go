// Package growth settles learning rewards inside the originating business
// transaction. Callers hold configuration then account locks before entry.
package growth

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type Delta struct {
	NewMasteries int             `json:"new_masteries"`
	Experience   business.Amount `json:"experience_added"`
	Points       business.Amount `json:"points_added"`
}

func Enabled(c business.Configuration) bool {
	return c.ActivatedAt != nil && !c.Now.Before(*c.ActivatedAt)
}

func Ensure(ctx context.Context, tx pgx.Tx, owner uuid.UUID) error {
	for _, table := range []string{"growth_balances", "user_growth"} {
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.`+pgx.Identifier{table}.Sanitize()+`(owner_id) VALUES($1) ON CONFLICT DO NOTHING`, owner); err != nil {
			return err
		}
	}
	return nil
}

// CheckinPoints avoids intermediate overflow even when the capped answer fits.
func CheckinPoints(base, step, cap int64, streak int) (int64, error) {
	if base < 0 || step < 0 || cap < base || streak < 1 {
		return 0, errors.New("invalid checkin rule")
	}
	result := new(big.Int).Mul(big.NewInt(int64(streak-1)), big.NewInt(step))
	result.Add(result, big.NewInt(base))
	if result.Cmp(big.NewInt(cap)) > 0 {
		return cap, nil
	}
	return result.Int64(), nil
}

func createSettlement(ctx context.Context, tx pgx.Tx, owner uuid.UUID, kind, source string) (uuid.UUID, bool, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `INSERT INTO wordweave.growth_settlements(owner_id,kind,source_key,config_snapshot) VALUES($1,$2,$3,'{}') ON CONFLICT(owner_id,kind,source_key) DO NOTHING RETURNING id`, owner, kind, source).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return id, err == nil, err
}

func credit(ctx context.Context, tx pgx.Tx, owner, settlement uuid.UUID, component string, points, experience int64) error {
	if points < 0 || experience < 0 {
		return errors.New("reward must be nonnegative")
	}
	var balance, xp int64
	err := tx.QueryRow(ctx, `UPDATE wordweave.growth_balances SET points=points+$2,experience=experience+$3,revision=revision+1 WHERE owner_id=$1 RETURNING points,experience`, owner, points, experience).Scan(&balance, &xp)
	if err != nil {
		return err
	}
	for _, row := range []struct {
		currency     string
		delta, after int64
	}{{"points", points, balance}, {"experience", experience, xp}} {
		if row.delta == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.growth_ledger(owner_id,settlement_id,component_key,currency,delta,balance_after) VALUES($1,$2,$3,$4,$5,$6)`, owner, settlement, component, row.currency, row.delta, row.after); err != nil {
			return err
		}
	}
	return nil
}

func snapshot(ctx context.Context, tx pgx.Tx, owner, settlement uuid.UUID, points, experience int64) error {
	var balance, xp int64
	if err := tx.QueryRow(ctx, `SELECT points,experience FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&balance, &xp); err != nil {
		return err
	}
	payload, err := json.Marshal(struct {
		Points          business.Amount `json:"points"`
		Experience      business.Amount `json:"experience"`
		PointsAfter     business.Amount `json:"points_after"`
		ExperienceAfter business.Amount `json:"experience_after"`
	}{business.Amount(points), business.Amount(experience), business.Amount(balance), business.Amount(xp)})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.growth_settlements SET config_snapshot=$2 WHERE id=$1`, settlement, payload)
	return err
}

func Recompute(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration) error {
	if !Enabled(c) {
		return nil
	}
	if err := Ensure(ctx, tx, owner); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.level_awards(owner_id,level_id,achieved_at)
  SELECT $1,l.id,$2 FROM wordweave.growth_levels l JOIN wordweave.growth_balances b ON b.owner_id=$1
  WHERE l.level_no>1 AND b.experience>=l.min_experience ON CONFLICT DO NOTHING`, owner, c.Now); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.achievement_awards(owner_id,tier_id,achieved_at,title_zh_snapshot,title_en_snapshot)
  SELECT $1,t.id,$2,t.title_zh,t.title_en FROM wordweave.achievement_tiers t JOIN wordweave.user_growth g ON g.owner_id=$1
  WHERE CASE t.kind WHEN 'checkin_streak' THEN g.highest_checkin_streak WHEN 'review_streak' THEN g.highest_review_streak WHEN 'mastered_words' THEN g.mastered_total WHEN 'saved_passages' THEN g.saved_total END>=t.threshold ON CONFLICT DO NOTHING`, owner, c.Now); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE wordweave.user_growth SET config_revision_seen=$2 WHERE owner_id=$1`, owner, c.Revision)
	return err
}

func learnAt(ctx context.Context, tx pgx.Tx, owner uuid.UUID, at time.Time) error {
	_, err := tx.Exec(ctx, `UPDATE wordweave.accounts SET last_learning_at=greatest(last_learning_at,$2) WHERE id=$1`, owner, at)
	return err
}

func normalCheckin(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration) (Delta, error) {
	var result Delta
	day := business.LearningDay(c.Now)
	var already bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day=$2)`, owner, day).Scan(&already); err != nil {
		return result, err
	}
	if already {
		return result, nil
	}
	var rule uuid.UUID
	var base, step, cap, xp int64
	err := tx.QueryRow(ctx, `SELECT id,base_points,step_points,cap_points,normal_experience FROM wordweave.checkin_rules WHERE effective_day<=$1 ORDER BY effective_day DESC LIMIT 1`, day).Scan(&rule, &base, &step, &cap, &xp)
	if err != nil {
		return result, err
	}
	var streak int
	if err := tx.QueryRow(ctx, `WITH RECURSIVE previous(day) AS (
  SELECT $2::date-1 WHERE EXISTS(SELECT 1 FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day=$2::date-1)
  UNION ALL SELECT p.day-1 FROM previous p JOIN wordweave.user_checkins c ON c.owner_id=$1 AND c.learning_day=p.day-1)
  SELECT count(*)+1 FROM previous`, owner, day).Scan(&streak); err != nil {
		return result, err
	}
	points, err := CheckinPoints(base, step, cap, streak)
	if err != nil {
		return result, err
	}
	settlement, created, err := createSettlement(ctx, tx, owner, "checkin", day.Format(time.DateOnly))
	if err != nil {
		return result, err
	}
	if !created {
		return result, errors.New("checkin settlement exists without daily fact")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.user_checkins(owner_id,learning_day,kind,rule_id,streak_at_last_settlement,points_paid,normal_experience_paid,created_at) VALUES($1,$2,'normal',$3,$4,$5,$6,$7)`, owner, day, rule, streak, points, xp, c.Now); err != nil {
		return result, err
	}
	if err := credit(ctx, tx, owner, settlement, "checkin", points, xp); err != nil {
		return result, err
	}
	if err := snapshot(ctx, tx, owner, settlement, points, xp); err != nil {
		return result, err
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.user_growth SET highest_checkin_streak=greatest(highest_checkin_streak,$2) WHERE owner_id=$1`, owner, streak); err != nil {
		return result, err
	}
	result.Points = business.Amount(points)
	result.Experience = business.Amount(xp)
	return result, nil
}

func RecordGeneration(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration) (Delta, error) {
	var result Delta
	if owner == uuid.Nil {
		return result, nil
	}
	if err := learnAt(ctx, tx, owner, c.Now); err != nil {
		return result, err
	}
	if !Enabled(c) {
		return result, nil
	}
	if err := Ensure(ctx, tx, owner); err != nil {
		return result, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.user_learning_days(owner_id,learning_day,active,valid_generations) VALUES($1,$2,true,1) ON CONFLICT(owner_id,learning_day) DO UPDATE SET active=true,valid_generations=wordweave.user_learning_days.valid_generations+1`, owner, business.LearningDay(c.Now)); err != nil {
		return result, err
	}
	result, err := normalCheckin(ctx, tx, owner, c)
	if err != nil {
		return result, err
	}
	return result, Recompute(ctx, tx, owner, c)
}

func RecordSaved(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration, claimedGenerationAt *time.Time) error {
	if !Enabled(c) {
		return nil
	}
	if err := Ensure(ctx, tx, owner); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.user_growth SET saved_total=saved_total+1 WHERE owner_id=$1`, owner); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.user_learning_days(owner_id,learning_day,saved_count) VALUES($1,$2,1) ON CONFLICT(owner_id,learning_day) DO UPDATE SET saved_count=wordweave.user_learning_days.saved_count+1`, owner, business.LearningDay(c.Now)); err != nil {
		return err
	}
	if claimedGenerationAt != nil && !claimedGenerationAt.Before(*c.ActivatedAt) && business.LearningDay(*claimedGenerationAt).Equal(business.LearningDay(c.Now)) {
		if err := learnAt(ctx, tx, owner, *claimedGenerationAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE wordweave.user_learning_days SET active=true WHERE owner_id=$1 AND learning_day=$2`, owner, business.LearningDay(c.Now)); err != nil {
			return err
		}
		if _, err := normalCheckin(ctx, tx, owner, c); err != nil {
			return err
		}
	}
	return Recompute(ctx, tx, owner, c)
}

func RecordReview(ctx context.Context, tx pgx.Tx, owner, batch, event uuid.UUID, successful, hasAnswer bool, c business.Configuration) (Delta, error) {
	var result Delta
	if hasAnswer {
		if err := learnAt(ctx, tx, owner, c.Now); err != nil {
			return result, err
		}
	}
	if !Enabled(c) {
		return result, nil
	}
	if err := Ensure(ctx, tx, owner); err != nil {
		return result, err
	}
	successes := 0
	if successful {
		successes = 1
	}
	day := business.LearningDay(c.Now)
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.user_learning_days(owner_id,learning_day,active,review_success,review_submissions,successful_reviews) VALUES($1,$2,$3,$4,1,$5)
  ON CONFLICT(owner_id,learning_day) DO UPDATE SET active=wordweave.user_learning_days.active OR excluded.active,review_success=wordweave.user_learning_days.review_success OR excluded.review_success,review_submissions=wordweave.user_learning_days.review_submissions+1,successful_reviews=wordweave.user_learning_days.successful_reviews+excluded.successful_reviews`, owner, day, hasAnswer, successful, successes); err != nil {
		return result, err
	}
	if successful {
		settlement, created, err := createSettlement(ctx, tx, owner, "mastery", event.String())
		if err != nil {
			return result, err
		}
		if !created {
			return result, errors.New("duplicate review settlement")
		}
		if err = tx.QueryRow(ctx, `WITH inserted AS (
   INSERT INTO wordweave.user_masteries(owner_id,lexeme_id,mastered_at,settlement_id)
   SELECT $1,v.lexeme_id,$3,$4 FROM wordweave.batch_targets t JOIN wordweave.vocabulary_entries v ON v.id=t.vocabulary_entry_id WHERE t.owner_id=$1 AND t.batch_id=$2
   ON CONFLICT DO NOTHING RETURNING lexeme_id) SELECT count(*) FROM inserted`, owner, batch, c.Now, settlement).Scan(&result.NewMasteries); err != nil {
			return result, err
		}
		xp := new(big.Int).Mul(big.NewInt(int64(result.NewMasteries)), big.NewInt(c.MasteryExperience))
		if !xp.IsInt64() {
			return result, errors.New("mastery experience overflow")
		}
		result.Experience = business.Amount(xp.Int64())
		if err = credit(ctx, tx, owner, settlement, "mastery", 0, xp.Int64()); err != nil {
			return result, err
		}
		if err = snapshot(ctx, tx, owner, settlement, 0, xp.Int64()); err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, `WITH RECURSIVE previous(day) AS (
   SELECT $2::date WHERE EXISTS(SELECT 1 FROM wordweave.user_learning_days WHERE owner_id=$1 AND learning_day=$2 AND review_success)
   UNION ALL SELECT p.day-1 FROM previous p JOIN wordweave.user_learning_days d ON d.owner_id=$1 AND d.learning_day=p.day-1 AND d.review_success)
   UPDATE wordweave.user_growth SET mastered_total=mastered_total+$3,successful_review_total=successful_review_total+1,highest_review_streak=greatest(highest_review_streak,(SELECT count(*) FROM previous)) WHERE owner_id=$1`, owner, day, result.NewMasteries); err != nil {
			return result, err
		}
	}
	return result, Recompute(ctx, tx, owner, c)
}
