package growth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type LevelView struct {
	ID      uuid.UUID       `json:"id"`
	Number  int64           `json:"number"`
	Name    string          `json:"name"`
	Minimum business.Amount `json:"min_experience"`
}
type NextLevelView struct {
	ID      uuid.UUID       `json:"id"`
	Number  int64           `json:"number"`
	Minimum business.Amount `json:"min_experience"`
	Reward  Reward          `json:"reward"`
}
type CheckinView struct {
	Signed     bool            `json:"signed_today"`
	Current    int             `json:"current_streak"`
	Highest    int             `json:"highest_streak"`
	Points     business.Amount `json:"today_points"`
	Experience business.Amount `json:"today_experience"`
}
type StreakView struct {
	Current int `json:"current"`
	Highest int `json:"highest"`
}
type Personal struct {
	Day          string          `json:"learning_day"`
	Started      time.Time       `json:"growth_started_at"`
	Points       business.Amount `json:"points"`
	Experience   business.Amount `json:"experience"`
	Level        LevelView       `json:"level"`
	Next         *NextLevelView  `json:"next_level"`
	Mastered     int64           `json:"mastered_total"`
	Saved        int64           `json:"saved_total"`
	Reviewed     int64           `json:"successful_review_total"`
	Checkin      CheckinView     `json:"checkin"`
	ReviewStreak StreakView      `json:"review_streak"`
	Pending      int             `json:"pending_reward_count"`
}

func checkinStreak(ctx context.Context, tx pgx.Tx, owner uuid.UUID, day time.Time) (int, error) {
	var streak int
	err := tx.QueryRow(ctx, `WITH RECURSIVE consecutive(day) AS (
 SELECT max(learning_day) FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day BETWEEN $2::date-1 AND $2
 UNION ALL SELECT c.day-1 FROM consecutive c JOIN wordweave.user_checkins d ON d.owner_id=$1 AND d.learning_day=c.day-1 WHERE c.day IS NOT NULL)
 SELECT count(day) FROM consecutive`, owner, day).Scan(&streak)
	return streak, err
}
func reviewStreak(ctx context.Context, tx pgx.Tx, owner uuid.UUID, day time.Time) (int, error) {
	var streak int
	err := tx.QueryRow(ctx, `WITH RECURSIVE consecutive(day) AS (
 SELECT max(learning_day) FROM wordweave.user_learning_days WHERE owner_id=$1 AND review_success AND learning_day BETWEEN $2::date-1 AND $2
 UNION ALL SELECT c.day-1 FROM consecutive c JOIN wordweave.user_learning_days d ON d.owner_id=$1 AND d.review_success AND d.learning_day=c.day-1 WHERE c.day IS NOT NULL)
 SELECT count(day) FROM consecutive`, owner, day).Scan(&streak)
	return streak, err
}
func (s *Service) Personal(ctx context.Context, owner uuid.UUID, locale string) (Personal, error) {
	tx, c, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return Personal{}, err
	}
	defer tx.Rollback(ctx)
	day := business.LearningDay(c.Now)
	out := Personal{Day: day.Format(time.DateOnly), Started: *c.ActivatedAt}
	compact, err := readCompactGrowth(ctx, tx, owner, locale)
	if err != nil {
		return out, err
	}
	out.Points = compact.Points
	out.Experience = compact.Experience
	out.Pending = compact.Pending
	levels, err := readLevels(ctx, tx)
	if err != nil {
		return out, err
	}
	if len(levels) == 0 || levels[0].Number != 1 {
		return out, reject("temporarily_unavailable", 503)
	}
	for _, l := range levels {
		if l.Minimum <= out.Experience {
			out.Level = LevelView{ID: l.ID, Number: l.Number, Minimum: l.Minimum}
		} else {
			reward, _, _, err := rewardFor(ctx, tx, l.Reward, 0, locale)
			if err != nil {
				return out, err
			}
			out.Next = &NextLevelView{l.ID, l.Number, l.Minimum, reward}
			break
		}
	}
	out.Level.Name = fmt.Sprintf("等级 %d", out.Level.Number)
	if locale == "en-US" {
		out.Level.Name = fmt.Sprintf("Level %d", out.Level.Number)
	}
	if err = tx.QueryRow(ctx, `SELECT mastered_total,saved_total,successful_review_total,highest_checkin_streak,highest_review_streak FROM wordweave.user_growth WHERE owner_id=$1`, owner).Scan(&out.Mastered, &out.Saved, &out.Reviewed, &out.Checkin.Highest, &out.ReviewStreak.Highest); err != nil {
		return out, err
	}
	out.Checkin.Current, err = checkinStreak(ctx, tx, owner, day)
	if err != nil {
		return out, err
	}
	out.ReviewStreak.Current, err = reviewStreak(ctx, tx, owner, day)
	if err != nil {
		return out, err
	}
	err = tx.QueryRow(ctx, `SELECT points_paid,normal_experience_paid FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day=$2`, owner, day).Scan(&out.Checkin.Points, &out.Checkin.Experience)
	if errors.Is(err, pgx.ErrNoRows) {
		var base, step, cap, xp int64
		if err = tx.QueryRow(ctx, `SELECT base_points,step_points,cap_points,normal_experience FROM wordweave.checkin_rules WHERE effective_day<=$1 ORDER BY effective_day DESC LIMIT 1`, day).Scan(&base, &step, &cap, &xp); errors.Is(err, pgx.ErrNoRows) {
			return out, reject("temporarily_unavailable", 503)
		} else if err != nil {
			return out, err
		}
		points, err := CheckinPoints(base, step, cap, out.Checkin.Current+1)
		if err != nil {
			return out, err
		}
		out.Checkin.Points = business.Amount(points)
		out.Checkin.Experience = business.Amount(xp)
	} else if err != nil {
		return out, err
	} else {
		out.Checkin.Signed = true
	}
	if err = tx.Commit(ctx); err != nil {
		return Personal{}, err
	}
	return out, nil
}

type CalendarDay struct {
	Day       string          `json:"day"`
	State     string          `json:"state"`
	Paid      business.Amount `json:"points_paid"`
	CanMakeup bool            `json:"can_makeup"`
}
type Calendar struct {
	Day      string        `json:"learning_day"`
	Earliest string        `json:"makeup_earliest_day"`
	Days     []CalendarDay `json:"days"`
}

func learningStart(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration) (time.Time, error) {
	var registered time.Time
	if err := tx.QueryRow(ctx, `SELECT created_at FROM wordweave.accounts WHERE id=$1`, owner).Scan(&registered); err != nil {
		return time.Time{}, err
	}
	start := business.LearningDay(registered)
	if c.ActivatedAt != nil {
		activated := business.LearningDay(*c.ActivatedAt)
		if activated.After(start) {
			start = activated
		}
	}
	return start, nil
}
func (s *Service) Calendar(ctx context.Context, owner uuid.UUID, startDate, endDate string) (Calendar, error) {
	start, err := time.Parse(time.DateOnly, startDate)
	if err != nil {
		return Calendar{}, &ValidationError{[]FieldError{{"/start_date", "invalid"}}}
	}
	end, err := time.Parse(time.DateOnly, endDate)
	if err != nil || end.Before(start) || end.Sub(start) > 92*24*time.Hour {
		return Calendar{}, &ValidationError{[]FieldError{{"/end_date", "out_of_range"}}}
	}
	tx, c, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return Calendar{}, err
	}
	defer tx.Rollback(ctx)
	today := business.LearningDay(c.Now)
	began, err := learningStart(ctx, tx, owner, c)
	if err != nil {
		return Calendar{}, err
	}
	earliest := today.AddDate(0, 0, -30)
	if began.After(earliest) {
		earliest = began
	}
	out := Calendar{Day: today.Format(time.DateOnly), Earliest: earliest.Format(time.DateOnly), Days: make([]CalendarDay, 0)}
	rows, err := tx.Query(ctx, `SELECT learning_day,kind,points_paid FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day BETWEEN $2 AND $3 ORDER BY learning_day`, owner, start, end)
	if err != nil {
		return out, err
	}
	signed := map[string]CalendarDay{}
	for rows.Next() {
		var d time.Time
		var row CalendarDay
		if err = rows.Scan(&d, &row.State, &row.Paid); err != nil {
			rows.Close()
			return out, err
		}
		row.Day = d.Format(time.DateOnly)
		signed[row.Day] = row
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		key := day.Format(time.DateOnly)
		row, ok := signed[key]
		if !ok {
			row.Day = key
			switch {
			case day.Before(began):
				row.State = "before_start"
			case day.After(today):
				row.State = "future"
			default:
				row.State = "missing"
				row.CanMakeup = !day.Before(earliest) && day.Before(today)
			}
		}
		out.Days = append(out.Days, row)
	}
	if err = tx.Commit(ctx); err != nil {
		return Calendar{}, err
	}
	return out, nil
}
