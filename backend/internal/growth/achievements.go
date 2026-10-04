package growth

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type AchievementReward struct {
	RewardInput
	Experience business.Amount `json:"experience"`
}
type AchievementFields struct {
	Threshold   int64              `json:"threshold"`
	Enabled     bool               `json:"enabled"`
	Name        business.Bilingual `json:"name"`
	Title       business.Bilingual `json:"title"`
	Description business.Bilingual `json:"description"`
	Reward      AchievementReward  `json:"reward"`
}
type AchievementConfig struct {
	ID   uuid.UUID `json:"id"`
	Kind string    `json:"kind"`
	AchievementFields
}
type AchievementChange struct {
	ClientKey uuid.UUID         `json:"client_key"`
	ID        *uuid.UUID        `json:"id" nullable:"true"`
	Value     AchievementFields `json:"value"`
}
type AchievementChanges struct {
	Kind     string              `json:"kind"`
	Expected string              `json:"expected_revision"`
	Changes  []AchievementChange `json:"changes"`
}
type AchievementConfiguration struct {
	Kind     string              `json:"kind"`
	Items    []AchievementConfig `json:"items"`
	Revision string              `json:"revision"`
}
type AchievementSaved struct {
	Configuration AchievementConfiguration `json:"configuration"`
	Rows          []SavedRow               `json:"saved_rows"`
}

func validAchievementKind(kind string) bool {
	switch kind {
	case "checkin_streak", "review_streak", "mastered_words", "saved_passages":
		return true
	}
	return false
}

func readAchievements(ctx context.Context, tx pgx.Tx, kind string) ([]AchievementConfig, error) {
	rows, err := tx.Query(ctx, `SELECT id,kind,threshold,enabled,name_zh,name_en,title_zh,title_en,description_zh,description_en,points,experience,item_definition_id,item_count FROM wordweave.achievement_tiers WHERE kind=$1 ORDER BY threshold,id`, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AchievementConfig, 0)
	for rows.Next() {
		var r AchievementConfig
		if err = rows.Scan(&r.ID, &r.Kind, &r.Threshold, &r.Enabled, &r.Name.ZH, &r.Name.EN, &r.Title.ZH, &r.Title.EN, &r.Description.ZH, &r.Description.EN, &r.Reward.Points, &r.Reward.Experience, &r.Reward.ItemID, &r.Reward.Count); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (s *Service) Achievements(ctx context.Context, kind string) (AchievementConfiguration, error) {
	if !validAchievementKind(kind) {
		return AchievementConfiguration{}, &ValidationError{[]FieldError{{"/kind", "out_of_range"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AchievementConfiguration{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return AchievementConfiguration{}, err
	}
	rows, err := readAchievements(ctx, tx, kind)
	return AchievementConfiguration{kind, rows, s.revision(c)}, err
}

func normalizeBilingual(value business.Bilingual, optional bool, max int, path string, v *ValidationError) business.Bilingual {
	for _, slot := range []struct {
		key   string
		value **string
	}{{"zh_CN", &value.ZH}, {"en_US", &value.EN}} {
		normalized, err := business.NormalizeText(*slot.value, !optional, max, false)
		if err != nil {
			v.Add(path+"/"+slot.key, "too_long")
		} else {
			*slot.value = normalized
		}
	}
	if !optional && value.ZH == nil && value.EN == nil {
		v.Add(path, "required")
	}
	return value
}
func mergeAchievements(ctx context.Context, tx pgx.Tx, kind string, old []AchievementConfig, changes []AchievementChange) ([]AchievementConfig, []SavedRow, error) {
	v := &ValidationError{}
	if len(changes) == 0 {
		v.Add("/changes", "required")
	}
	merged := append([]AchievementConfig(nil), old...)
	byID := map[uuid.UUID]int{}
	for i, row := range old {
		byID[row.ID] = i
	}
	keys := map[uuid.UUID][]int{}
	ids := map[uuid.UUID][]int{}
	changed := map[uuid.UUID]int{}
	saved := make([]SavedRow, len(changes))
	for i, change := range changes {
		path := fmt.Sprintf("/changes/%d", i)
		keys[change.ClientKey] = append(keys[change.ClientKey], i)
		if change.ClientKey == uuid.Nil {
			v.Add(path+"/client_key", "required")
		}
		if change.ID != nil {
			ids[*change.ID] = append(ids[*change.ID], i)
		}
		r := change.Value
		r.Name = normalizeBilingual(r.Name, false, 200, path+"/value/name", v)
		r.Title = normalizeBilingual(r.Title, false, 200, path+"/value/title", v)
		r.Description = normalizeBilingual(r.Description, true, 2000, path+"/value/description", v)
		if r.Threshold < 1 || r.Threshold > 9007199254740991 {
			v.Add(path+"/value/threshold", "out_of_range")
		}
		if r.Reward.Experience < 0 {
			v.Add(path+"/value/reward/experience", "out_of_range")
		}
		if err := validateReward(ctx, tx, r.Reward.RewardInput, path+"/value/reward", v); err != nil {
			return nil, nil, err
		}
		id := uuid.New()
		position := len(merged)
		if change.ID != nil {
			id = *change.ID
			var ok bool
			position, ok = byID[id]
			if !ok {
				v.Add(path+"/id", "invalid_reference")
				continue
			}
		}
		row := AchievementConfig{id, kind, r}
		if position == len(merged) {
			merged = append(merged, row)
		} else {
			merged[position] = row
		}
		changed[id] = i
		saved[i] = SavedRow{change.ClientKey, id}
	}
	for _, indices := range keys {
		if len(indices) > 1 {
			for _, i := range indices {
				v.Add(fmt.Sprintf("/changes/%d/client_key", i), "duplicate_client_key")
			}
		}
	}
	for _, indices := range ids {
		if len(indices) > 1 {
			for _, i := range indices {
				v.Add(fmt.Sprintf("/changes/%d/id", i), "duplicate_id")
			}
		}
	}
	thresholds := map[int64][]uuid.UUID{}
	for _, row := range merged {
		thresholds[row.Threshold] = append(thresholds[row.Threshold], row.ID)
	}
	for _, ids := range thresholds {
		if len(ids) > 1 {
			for _, id := range ids {
				if index, ok := changed[id]; ok {
					v.Add(fmt.Sprintf("/changes/%d/value/threshold", index), "duplicate_threshold")
				}
			}
		}
	}
	if err := v.Result(); err != nil {
		return nil, nil, err
	}
	sort.Slice(merged, func(i, j int) bool {
		if merged[i].Threshold == merged[j].Threshold {
			return merged[i].ID.String() < merged[j].ID.String()
		}
		return merged[i].Threshold < merged[j].Threshold
	})
	return merged, saved, nil
}
func (s *Service) SaveAchievements(ctx context.Context, in AchievementChanges) (AchievementSaved, error) {
	if !validAchievementKind(in.Kind) {
		return AchievementSaved{}, &ValidationError{[]FieldError{{"/kind", "out_of_range"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AchievementSaved{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return AchievementSaved{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return AchievementSaved{}, err
	}
	old, err := readAchievements(ctx, tx, in.Kind)
	if err != nil {
		return AchievementSaved{}, err
	}
	merged, saved, err := mergeAchievements(ctx, tx, in.Kind, old, in.Changes)
	if err != nil {
		return AchievementSaved{}, err
	}
	byID := map[uuid.UUID]AchievementConfig{}
	for _, row := range merged {
		byID[row.ID] = row
	}
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS wordweave.achievement_tiers_kind_threshold_unique DEFERRED`); err != nil {
		return AchievementSaved{}, err
	}
	for i, change := range in.Changes {
		r := byID[saved[i].ID]
		if change.ID == nil {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.achievement_tiers(id,kind,threshold,enabled,name_zh,name_en,title_zh,title_en,description_zh,description_en,points,experience,item_definition_id,item_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, r.ID, r.Kind, r.Threshold, r.Enabled, r.Name.ZH, r.Name.EN, r.Title.ZH, r.Title.EN, r.Description.ZH, r.Description.EN, int64(r.Reward.Points), int64(r.Reward.Experience), r.Reward.ItemID, r.Reward.Count)
		} else {
			_, err = tx.Exec(ctx, `UPDATE wordweave.achievement_tiers SET threshold=$2,enabled=$3,name_zh=$4,name_en=$5,title_zh=$6,title_en=$7,description_zh=$8,description_en=$9,points=$10,experience=$11,item_definition_id=$12,item_count=$13,revision=revision+1 WHERE id=$1`, r.ID, r.Threshold, r.Enabled, r.Name.ZH, r.Name.EN, r.Title.ZH, r.Title.EN, r.Description.ZH, r.Description.EN, int64(r.Reward.Points), int64(r.Reward.Experience), r.Reward.ItemID, r.Reward.Count)
		}
		if err != nil {
			return AchievementSaved{}, err
		}
	}
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS wordweave.achievement_tiers_kind_threshold_unique IMMEDIATE`); err != nil {
		return AchievementSaved{}, err
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return AchievementSaved{}, err
	}
	result := AchievementSaved{AchievementConfiguration{in.Kind, merged, s.revision(c)}, saved}
	if err = tx.Commit(ctx); err != nil {
		return AchievementSaved{}, err
	}
	return result, nil
}
