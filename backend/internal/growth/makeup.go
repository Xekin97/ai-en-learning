package growth

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type MakeupDifference struct {
	Day        string          `json:"day"`
	Before     business.Amount `json:"before_points"`
	After      business.Amount `json:"after_points"`
	Difference business.Amount `json:"difference"`
}
type MakeupPreview struct {
	Can        bool               `json:"can_use"`
	Reason     *string            `json:"reason"`
	Points     business.Amount    `json:"points_added"`
	Days       []MakeupDifference `json:"affected_days"`
	Experience business.Amount    `json:"experience_added"`
	Token      *string            `json:"confirmation_token"`
}
type MakeupDayResult struct {
	Day    string          `json:"day"`
	Points business.Amount `json:"points_added"`
}
type MakeupCheckin struct {
	Current int `json:"current_streak"`
	Highest int `json:"highest_streak"`
}
type MakeupResult struct {
	Receipt Receipt           `json:"receipt"`
	Days    []MakeupDayResult `json:"affected_days"`
	Checkin MakeupCheckin     `json:"checkin"`
}
type makeupDay struct {
	Day             time.Time
	Rule            uuid.UUID
	Base, Step, Cap int64
	Paid            int64
	Streak          int
	New             bool
}
type makeupState struct {
	Preview MakeupPreview
	rows    []makeupDay
	binding string
}

func (s *Service) makeup(ctx context.Context, tx pgx.Tx, owner, item uuid.UUID, target time.Time, c business.Configuration) (makeupState, error) {
	out := makeupState{Preview: MakeupPreview{Days: make([]MakeupDifference, 0)}}
	r, err := loadOwned(ctx, tx, owner, item, "en-US", c)
	if err != nil {
		return out, err
	}
	refuse := func(reason string) (makeupState, error) { out.Preview.Reason = &reason; return out, nil }
	if r.Kind != "makeup" {
		return refuse("configuration_invalid")
	}
	if r.UseBlock != nil {
		return refuse(*r.UseBlock)
	}
	today := business.LearningDay(c.Now)
	began, err := learningStart(ctx, tx, owner, c)
	if err != nil {
		return out, err
	}
	if target.Before(today.AddDate(0, 0, -30)) || !target.Before(today) || target.Before(began) {
		return refuse("invalid_target_day")
	}
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day=$2)`, owner, target).Scan(&exists); err != nil {
		return out, err
	}
	if exists {
		return refuse("day_already_checked_in")
	}
	var previous int
	if err = tx.QueryRow(ctx, `WITH RECURSIVE previous(day) AS (
 SELECT $2::date-1 WHERE EXISTS(SELECT 1 FROM wordweave.user_checkins WHERE owner_id=$1 AND learning_day=$2::date-1)
 UNION ALL SELECT p.day-1 FROM previous p JOIN wordweave.user_checkins c ON c.owner_id=$1 AND c.learning_day=p.day-1) SELECT count(*) FROM previous`, owner, target).Scan(&previous); err != nil {
		return out, err
	}
	first := makeupDay{Day: target, Streak: previous + 1, New: true}
	err = tx.QueryRow(ctx, `SELECT id,base_points,step_points,cap_points FROM wordweave.checkin_rules WHERE effective_day<=$1 ORDER BY effective_day DESC LIMIT 1`, target).Scan(&first.Rule, &first.Base, &first.Step, &first.Cap)
	if errors.Is(err, pgx.ErrNoRows) {
		return refuse("configuration_invalid")
	}
	if err != nil {
		return out, err
	}
	out.rows = []makeupDay{first}
	rows, err := tx.Query(ctx, `SELECT d.learning_day,d.rule_id,r.base_points,r.step_points,r.cap_points,d.points_paid FROM wordweave.user_checkins d JOIN wordweave.checkin_rules r ON r.id=d.rule_id WHERE d.owner_id=$1 AND d.learning_day>$2 AND d.learning_day<=$3 ORDER BY d.learning_day`, owner, target, today)
	if err != nil {
		return out, err
	}
	expected := target.AddDate(0, 0, 1)
	for rows.Next() {
		var row makeupDay
		if err = rows.Scan(&row.Day, &row.Rule, &row.Base, &row.Step, &row.Cap, &row.Paid); err != nil {
			rows.Close()
			return out, err
		}
		if !row.Day.Equal(expected) {
			break
		}
		row.Streak = previous + len(out.rows) + 1
		out.rows = append(out.rows, row)
		expected = expected.AddDate(0, 0, 1)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	for _, row := range out.rows {
		points, err := CheckinPoints(row.Base, row.Step, row.Cap, row.Streak)
		if err != nil {
			return out, err
		}
		after := max(points, row.Paid)
		difference := after - row.Paid
		if int64(out.Preview.Points) > math.MaxInt64-difference {
			return out, reject("configuration_invalid", 422)
		}
		out.Preview.Points += business.Amount(difference)
		out.Preview.Days = append(out.Preview.Days, MakeupDifference{row.Day.Format(time.DateOnly), business.Amount(row.Paid), business.Amount(after), business.Amount(difference)})
	}
	digest, err := fingerprint(struct {
		Revision string
		Item     uuid.UUID
		Deadline time.Time
		Today    time.Time
		Days     []makeupDay
	}{s.revision(c), item, r.Deadline, today, out.rows})
	if err != nil {
		return out, err
	}
	out.binding = hex.EncodeToString(digest)
	out.Preview.Can = true
	return out, nil
}
func (s *Service) MakeupPreview(ctx context.Context, owner, item uuid.UUID, day string) (MakeupPreview, error) {
	target, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return MakeupPreview{}, &ValidationError{[]FieldError{{"/learning_day", "invalid"}}}
	}
	tx, c, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return MakeupPreview{}, err
	}
	defer tx.Rollback(ctx)
	state, err := s.makeup(ctx, tx, owner, item, target, c)
	if err != nil {
		return MakeupPreview{}, err
	}
	if state.Preview.Can {
		token, err := s.signer.Encode("makeup", benefitToken{owner, item, state.binding, c.Now.Add(5 * time.Minute)})
		if err != nil {
			return MakeupPreview{}, err
		}
		state.Preview.Token = &token
	}
	if err = tx.Commit(ctx); err != nil {
		return MakeupPreview{}, err
	}
	return state.Preview, nil
}
func (s *Service) Makeup(ctx context.Context, owner, key, item uuid.UUID, day, tokenString string) (MakeupResult, error) {
	target, err := time.Parse(time.DateOnly, day)
	if err != nil || key == uuid.Nil {
		return MakeupResult{}, &ValidationError{[]FieldError{{"/learning_day", "invalid"}}}
	}
	tx, c, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return MakeupResult{}, err
	}
	defer tx.Rollback(ctx)
	result := MakeupResult{Days: make([]MakeupDayResult, 0)}
	settlement, old, err := intent(ctx, tx, owner, "makeup", item.String(), struct {
		Item uuid.UUID
		Day  string
	}{item, day}, c.Now)
	if err != nil {
		return result, err
	}
	if old != nil {
		result.Receipt = *old
		var raw []byte
		if err = tx.QueryRow(ctx, `SELECT config_snapshot->'affected_days' FROM wordweave.growth_settlements WHERE owner_id=$1 AND id=$2`, owner, settlement).Scan(&raw); err != nil {
			return result, err
		}
		if err = json.Unmarshal(raw, &result.Days); err != nil {
			return result, err
		}
	} else {
		state, err := s.makeup(ctx, tx, owner, item, target, c)
		if err != nil {
			return result, err
		}
		if !state.Preview.Can {
			if state.Preview.Reason != nil {
				return result, reject(*state.Preview.Reason, 422)
			}
			return result, ErrPreviewStale
		}
		var token benefitToken
		if err = s.signer.Decode("makeup", tokenString, &token); err != nil || token.Owner != owner || token.Item != item || token.Binding != state.binding || !token.Expires.After(c.Now) {
			return result, ErrPreviewStale
		}
		for i, row := range state.rows {
			difference := state.Preview.Days[i]
			if row.New {
				_, err = tx.Exec(ctx, `INSERT INTO wordweave.user_checkins(owner_id,learning_day,kind,rule_id,streak_at_last_settlement,points_paid,normal_experience_paid,created_at) VALUES($1,$2,'makeup',$3,$4,$5,0,$6)`, owner, row.Day, row.Rule, row.Streak, int64(difference.After), c.Now)
			} else {
				_, err = tx.Exec(ctx, `UPDATE wordweave.user_checkins SET streak_at_last_settlement=$3,points_paid=$4 WHERE owner_id=$1 AND learning_day=$2`, owner, row.Day, row.Streak, int64(difference.After))
			}
			if err != nil {
				return result, err
			}
			if difference.Difference > 0 {
				if err = credit(ctx, tx, owner, settlement, difference.Day, int64(difference.Difference), 0); err != nil {
					return result, err
				}
			}
			result.Days = append(result.Days, MakeupDayResult{difference.Day, difference.Difference})
		}
		if _, err = tx.Exec(ctx, `UPDATE wordweave.user_items SET activated_at=$3,ended_at=$3,used_target_day=$4 WHERE owner_id=$1 AND id=$2`, owner, item, c.Now, target); err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, `UPDATE wordweave.user_growth SET highest_checkin_streak=greatest(highest_checkin_streak,$2) WHERE owner_id=$1`, owner, state.rows[len(state.rows)-1].Streak); err != nil {
			return result, err
		}
		if err = Recompute(ctx, tx, owner, c); err != nil {
			return result, err
		}
		result.Receipt, err = finishReceipt(ctx, tx, owner, settlement, map[string]any{"affected_days": result.Days})
		if err != nil {
			return result, err
		}
	}
	result.Checkin.Current, err = checkinStreak(ctx, tx, owner, business.LearningDay(c.Now))
	if err != nil {
		return result, err
	}
	if err = tx.QueryRow(ctx, `SELECT highest_checkin_streak FROM wordweave.user_growth WHERE owner_id=$1`, owner).Scan(&result.Checkin.Highest); err != nil {
		return result, err
	}
	if err = tx.Commit(ctx); err != nil {
		return MakeupResult{}, err
	}
	return result, nil
}
