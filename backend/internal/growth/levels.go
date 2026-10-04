package growth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type LevelInput struct {
	Number  int64           `json:"level_number"`
	Minimum business.Amount `json:"min_experience"`
	Enabled bool            `json:"reward_enabled"`
	Reward  RewardInput     `json:"reward"`
}
type LevelConfig struct {
	ID uuid.UUID `json:"id"`
	LevelInput
}
type LevelChange struct {
	ClientKey uuid.UUID  `json:"client_key"`
	ID        *uuid.UUID `json:"id" nullable:"true"`
	Value     LevelInput `json:"value"`
}
type LevelChanges struct {
	Expected string        `json:"expected_revision"`
	Changes  []LevelChange `json:"changes"`
}
type LevelSave struct {
	LevelChanges
	Token     string `json:"confirmation_token"`
	Confirmed bool   `json:"confirmed"`
}
type LevelConfiguration struct {
	Items    []LevelConfig `json:"items"`
	Revision string        `json:"revision"`
}
type SavedRow struct {
	ClientKey uuid.UUID `json:"client_key"`
	ID        uuid.UUID `json:"id"`
}
type LevelSaved struct {
	Configuration LevelConfiguration `json:"configuration"`
	Rows          []SavedRow         `json:"saved_rows"`
}
type LevelImpact struct {
	MayDowngrade bool      `json:"may_downgrade"`
	Affected     int       `json:"affected_users"`
	Latest       bool      `json:"rewards_use_latest_config"`
	Token        string    `json:"confirmation_token"`
	Expires      time.Time `json:"expires_at"`
	Revision     string    `json:"revision"`
}
type levelToken struct {
	Subject  string    `json:"subject"`
	Digest   string    `json:"digest"`
	Revision string    `json:"revision"`
	Expires  time.Time `json:"expires"`
}

func readLevels(ctx context.Context, tx pgx.Tx) ([]LevelConfig, error) {
	rows, err := tx.Query(ctx, `SELECT id,level_no,min_experience,reward_enabled,points,item_definition_id,item_count FROM wordweave.growth_levels ORDER BY level_no`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]LevelConfig, 0)
	for rows.Next() {
		var row LevelConfig
		if err = rows.Scan(&row.ID, &row.Number, &row.Minimum, &row.Enabled, &row.Reward.Points, &row.Reward.ItemID, &row.Reward.Count); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
func (s *Service) Levels(ctx context.Context) (LevelConfiguration, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return LevelConfiguration{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return LevelConfiguration{}, err
	}
	rows, err := readLevels(ctx, tx)
	return LevelConfiguration{rows, s.revision(c)}, err
}

func mergeLevels(ctx context.Context, tx pgx.Tx, existing []LevelConfig, changes []LevelChange) ([]LevelConfig, []SavedRow, error) {
	v := &ValidationError{}
	if len(changes) == 0 {
		v.Add("/changes", "required")
	}
	out := append([]LevelConfig(nil), existing...)
	byID := map[uuid.UUID]int{}
	for i, row := range out {
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
		if change.Value.Number < 1 || change.Value.Number > 2147483647 {
			v.Add(path+"/value/level_number", "out_of_range")
		}
		if change.Value.Minimum < 0 {
			v.Add(path+"/value/min_experience", "out_of_range")
		}
		if err := validateReward(ctx, tx, change.Value.Reward, path+"/value/reward", v); err != nil {
			return nil, nil, err
		}
		id := uuid.New()
		position := len(out)
		if change.ID != nil {
			id = *change.ID
			var ok bool
			position, ok = byID[id]
			if !ok {
				v.Add(path+"/id", "invalid_reference")
				continue
			}
			if existing[position].Number != change.Value.Number {
				v.Add(path+"/value/level_number", "immutable_field")
			}
		}
		row := LevelConfig{id, change.Value}
		if position == len(out) {
			out = append(out, row)
		} else {
			out[position] = row
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
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	thresholdRows := map[business.Amount][]LevelConfig{}
	for i, row := range out {
		path := "/changes"
		if index, ok := changed[row.ID]; ok {
			path = fmt.Sprintf("/changes/%d/value", index)
		}
		if row.Number != int64(i+1) {
			v.Add(path+"/level_number", "out_of_range")
		}
		thresholdRows[row.Minimum] = append(thresholdRows[row.Minimum], row)
		if i == 0 && (row.Minimum != 0 || row.Enabled || row.Reward.Points != 0 || row.Reward.ItemID != nil || row.Reward.Count != 0) {
			v.Add(path, "out_of_range")
		}
		if i > 0 && row.Minimum < out[i-1].Minimum {
			if index, ok := changed[row.ID]; ok {
				v.Add(fmt.Sprintf("/changes/%d/value/min_experience", index), "non_increasing_threshold")
			}
			if index, ok := changed[out[i-1].ID]; ok {
				v.Add(fmt.Sprintf("/changes/%d/value/min_experience", index), "non_increasing_threshold")
			}
		}
	}
	for _, rows := range thresholdRows {
		if len(rows) > 1 {
			for _, row := range rows {
				if i, ok := changed[row.ID]; ok {
					v.Add(fmt.Sprintf("/changes/%d/value/min_experience", i), "duplicate_threshold")
				}
			}
		}
	}
	if err := v.Result(); err != nil {
		return nil, nil, err
	}
	return out, saved, nil
}

func levelsDigest(in LevelChanges) (string, error) {
	copy := in
	copy.Changes = append([]LevelChange(nil), in.Changes...)
	sort.Slice(copy.Changes, func(i, j int) bool { return copy.Changes[i].ClientKey.String() < copy.Changes[j].ClientKey.String() })
	raw, err := json.Marshal(copy)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
func currentLevel(rows []LevelConfig, xp business.Amount) int64 {
	var n int64
	for _, row := range rows {
		if row.Minimum > xp {
			break
		}
		n = row.Number
	}
	return n
}

func (s *Service) PreviewLevels(ctx context.Context, subject string, in LevelChanges) (LevelImpact, error) {
	// A repeatable-read snapshot protects configuration consistency without
	// holding the singleton lock while scanning user experience.
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return LevelImpact{}, err
	}
	defer tx.Rollback(ctx)
	var c business.Configuration
	if err = tx.QueryRow(ctx, `SELECT revision,clock_timestamp() FROM wordweave.growth_settings WHERE singleton`).Scan(&c.Revision, &c.Now); err != nil {
		return LevelImpact{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return LevelImpact{}, err
	}
	old, err := readLevels(ctx, tx)
	if err != nil {
		return LevelImpact{}, err
	}
	merged, _, err := mergeLevels(ctx, tx, old, in.Changes)
	if err != nil {
		return LevelImpact{}, err
	}
	impact := LevelImpact{Latest: true, Revision: s.revision(c)}
	rows, err := tx.Query(ctx, `SELECT coalesce(b.experience,0) FROM wordweave.accounts a LEFT JOIN wordweave.growth_balances b ON b.owner_id=a.id WHERE a.role='learner'`)
	if err != nil {
		return impact, err
	}
	for rows.Next() {
		var xp business.Amount
		if err = rows.Scan(&xp); err != nil {
			rows.Close()
			return impact, err
		}
		previous, next := currentLevel(old, xp), currentLevel(merged, xp)
		if previous != next {
			impact.Affected++
		}
		if next < previous {
			impact.MayDowngrade = true
		}
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return impact, err
	}
	if err = tx.Commit(ctx); err != nil {
		return impact, err
	}
	if err = s.pool.QueryRow(ctx, `SELECT revision,clock_timestamp() FROM wordweave.growth_settings WHERE singleton`).Scan(&c.Revision, &c.Now); err != nil {
		return impact, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return impact, err
	}
	digest, err := levelsDigest(in)
	if err != nil {
		return impact, err
	}
	impact.Expires = c.Now.Add(5 * time.Minute)
	impact.Token, err = s.signer.Encode("level-impact", levelToken{subject, digest, impact.Revision, impact.Expires})
	return impact, err
}

func (s *Service) SaveLevels(ctx context.Context, subject string, in LevelSave) (LevelSaved, error) {
	if !in.Confirmed {
		return LevelSaved{}, &ValidationError{[]FieldError{{"/confirmed", "required"}}}
	}
	var token levelToken
	if err := s.signer.Decode("level-impact", in.Token, &token); err != nil {
		return LevelSaved{}, ErrPreviewStale
	}
	digest, err := levelsDigest(in.LevelChanges)
	if err != nil {
		return LevelSaved{}, err
	}
	if token.Subject != subject || token.Digest != digest || token.Revision != in.Expected {
		return LevelSaved{}, ErrImpactChanged
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return LevelSaved{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return LevelSaved{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return LevelSaved{}, err
	}
	if !token.Expires.After(c.Now) {
		return LevelSaved{}, ErrPreviewStale
	}
	old, err := readLevels(ctx, tx)
	if err != nil {
		return LevelSaved{}, err
	}
	merged, saved, err := mergeLevels(ctx, tx, old, in.Changes)
	if err != nil {
		return LevelSaved{}, err
	}
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS wordweave.growth_levels_min_experience_unique DEFERRED`); err != nil {
		return LevelSaved{}, err
	}
	for i, change := range in.Changes {
		r := change.Value
		if change.ID == nil {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.growth_levels(id,level_no,min_experience,reward_enabled,points,item_definition_id,item_count) VALUES($1,$2,$3,$4,$5,$6,$7)`, saved[i].ID, r.Number, int64(r.Minimum), r.Enabled, int64(r.Reward.Points), r.Reward.ItemID, r.Reward.Count)
		} else {
			_, err = tx.Exec(ctx, `UPDATE wordweave.growth_levels SET min_experience=$2,reward_enabled=$3,points=$4,item_definition_id=$5,item_count=$6,revision=revision+1 WHERE id=$1`, *change.ID, int64(r.Minimum), r.Enabled, int64(r.Reward.Points), r.Reward.ItemID, r.Reward.Count)
		}
		if err != nil {
			return LevelSaved{}, err
		}
	}
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS wordweave.growth_levels_min_experience_unique IMMEDIATE`); err != nil {
		return LevelSaved{}, err
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return LevelSaved{}, err
	}
	result := LevelSaved{LevelConfiguration{merged, s.revision(c)}, saved}
	if err = tx.Commit(ctx); err != nil {
		return LevelSaved{}, err
	}
	return result, nil
}
