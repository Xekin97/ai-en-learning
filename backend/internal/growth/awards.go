package growth

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type RewardItem struct {
	DefinitionID uuid.UUID `json:"definition_id"`
	Name         string    `json:"name"`
	Kind         string    `json:"kind"`
	Count        int64     `json:"count"`
}
type Reward struct {
	Points     business.Amount `json:"points"`
	Experience business.Amount `json:"experience"`
	Item       *RewardItem     `json:"item"`
}
type rewardSnapshot struct {
	Points       business.Amount    `json:"points"`
	Experience   business.Amount    `json:"experience"`
	DefinitionID *uuid.UUID         `json:"definition_id"`
	Name         business.Bilingual `json:"name"`
	Kind         string             `json:"kind"`
	Count        int64              `json:"count"`
}

func local(value business.Bilingual, locale string) string {
	if p := value.Localized(locale); p != nil {
		return *p
	}
	return ""
}
func (r rewardSnapshot) project(locale string) Reward {
	out := Reward{Points: r.Points, Experience: r.Experience}
	if r.DefinitionID != nil {
		out.Item = &RewardItem{*r.DefinitionID, local(r.Name, locale), r.Kind, r.Count}
	}
	return out
}
func rewardFor(ctx context.Context, tx pgx.Tx, input RewardInput, xp business.Amount, locale string) (Reward, rewardSnapshot, bool, error) {
	snapshot := rewardSnapshot{Points: input.Points, Experience: xp, DefinitionID: input.ItemID, Count: input.Count}
	if input.ItemID == nil {
		return snapshot.project(locale), snapshot, true, nil
	}
	d, err := readDefinition(ctx, tx, *input.ItemID)
	if err != nil {
		return Reward{}, snapshot, false, err
	}
	snapshot.Name = d.Name
	snapshot.Kind = d.Kind
	available, err := definitionAvailable(ctx, tx, d)
	return snapshot.project(locale), snapshot, available, err
}
func claimedReward(ctx context.Context, tx pgx.Tx, owner, settlement uuid.UUID, locale string) (Reward, error) {
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT config_snapshot->'reward' FROM wordweave.growth_settlements WHERE owner_id=$1 AND id=$2`, owner, settlement).Scan(&raw); err != nil {
		return Reward{}, err
	}
	var snapshot rewardSnapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return Reward{}, err
	}
	return snapshot.project(locale), nil
}

type AwardStatus struct {
	State        string     `json:"state"`
	Block        *string    `json:"block_reason"`
	AchievedAt   *time.Time `json:"achieved_at"`
	ClaimedAt    *time.Time `json:"claimed_at"`
	Reward       Reward     `json:"reward"`
	SettlementID *uuid.UUID `json:"settlement_id"`
}
type LevelAward struct {
	ID      uuid.UUID       `json:"id"`
	LevelID uuid.UUID       `json:"level_id"`
	Number  int64           `json:"level_number"`
	Minimum business.Amount `json:"min_experience"`
	AwardStatus
}
type Achievement struct {
	ID          uuid.UUID `json:"id"`
	TierID      uuid.UUID `json:"tier_id"`
	Kind        string    `json:"kind"`
	Name        string    `json:"name"`
	Title       string    `json:"title"`
	Description *string   `json:"description"`
	Threshold   int64     `json:"threshold"`
	Progress    int64     `json:"progress"`
	AwardStatus
}
type AwardCursor struct {
	Kind  string    `json:"kind"`
	Order int64     `json:"order"`
	ID    uuid.UUID `json:"id"`
}

func blockStatus(achieved, claimed *time.Time, enabled, levelSatisfied, available bool) (string, *string) {
	if claimed != nil {
		return "claimed", nil
	}
	if achieved == nil {
		return "unachieved", nil
	}
	var reason string
	switch {
	case !enabled:
		reason = "tier_disabled"
	case !levelSatisfied:
		reason = "level_required"
	case !available:
		reason = "reward_unavailable"
	default:
		return "claimable", nil
	}
	return "blocked", &reason
}
func readLevelAwards(ctx context.Context, tx pgx.Tx, owner uuid.UUID, locale string) ([]LevelAward, error) {
	type row struct {
		LevelAward
		enabled bool
		points  business.Amount
		item    *uuid.UUID
		count   int64
		xp      business.Amount
	}
	rows, err := tx.Query(ctx, `SELECT l.id,l.level_no,l.min_experience,l.reward_enabled,l.points,l.item_definition_id,l.item_count,a.achieved_at,a.claimed_at,a.settlement_id,b.experience
 FROM wordweave.growth_levels l LEFT JOIN wordweave.level_awards a ON a.level_id=l.id AND a.owner_id=$1 JOIN wordweave.growth_balances b ON b.owner_id=$1 WHERE l.level_no>1 ORDER BY l.level_no,l.id`, owner)
	if err != nil {
		return nil, err
	}
	raw := make([]row, 0)
	for rows.Next() {
		var r row
		if err = rows.Scan(&r.ID, &r.Number, &r.Minimum, &r.enabled, &r.points, &r.item, &r.count, &r.AchievedAt, &r.ClaimedAt, &r.SettlementID, &r.xp); err != nil {
			rows.Close()
			return nil, err
		}
		r.LevelID = r.ID
		raw = append(raw, r)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	out := make([]LevelAward, 0, len(raw))
	for _, r := range raw {
		var available bool
		r.Reward, _, available, err = rewardFor(ctx, tx, RewardInput{r.points, r.item, r.count}, 0, locale)
		if err != nil {
			return nil, err
		}
		r.State, r.Block = blockStatus(r.AchievedAt, r.ClaimedAt, r.enabled, r.xp >= r.Minimum, available)
		if r.SettlementID != nil {
			r.Reward, err = claimedReward(ctx, tx, owner, *r.SettlementID, locale)
			if err != nil {
				return nil, err
			}
		}
		out = append(out, r.LevelAward)
	}
	return out, nil
}
func readPersonalAchievements(ctx context.Context, tx pgx.Tx, owner uuid.UUID, locale, kind string) ([]Achievement, error) {
	type row struct {
		Achievement
		enabled                  bool
		name, title, description business.Bilingual
		points, xp               business.Amount
		item                     *uuid.UUID
		count                    int64
	}
	rows, err := tx.Query(ctx, `SELECT t.id,t.kind,t.threshold,t.enabled,t.name_zh,t.name_en,
 CASE WHEN a.achieved_at IS NULL THEN t.title_zh ELSE a.title_zh_snapshot END,CASE WHEN a.achieved_at IS NULL THEN t.title_en ELSE a.title_en_snapshot END,t.description_zh,t.description_en,t.points,t.experience,t.item_definition_id,t.item_count,a.achieved_at,a.claimed_at,a.settlement_id,
 CASE t.kind WHEN 'checkin_streak' THEN g.highest_checkin_streak WHEN 'review_streak' THEN g.highest_review_streak WHEN 'mastered_words' THEN g.mastered_total ELSE g.saved_total END
 FROM wordweave.achievement_tiers t LEFT JOIN wordweave.achievement_awards a ON a.tier_id=t.id AND a.owner_id=$1 JOIN wordweave.user_growth g ON g.owner_id=$1 WHERE ($2='' OR t.kind=$2)
 ORDER BY CASE t.kind WHEN 'checkin_streak' THEN 1 WHEN 'review_streak' THEN 2 WHEN 'mastered_words' THEN 3 ELSE 4 END,t.threshold,t.id`, owner, kind)
	if err != nil {
		return nil, err
	}
	raw := make([]row, 0)
	for rows.Next() {
		var r row
		if err = rows.Scan(&r.ID, &r.Kind, &r.Threshold, &r.enabled, &r.name.ZH, &r.name.EN, &r.title.ZH, &r.title.EN, &r.description.ZH, &r.description.EN, &r.points, &r.xp, &r.item, &r.count, &r.AchievedAt, &r.ClaimedAt, &r.SettlementID, &r.Progress); err != nil {
			rows.Close()
			return nil, err
		}
		r.TierID = r.ID
		raw = append(raw, r)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	out := make([]Achievement, 0, len(raw))
	for _, r := range raw {
		r.Name = local(r.name, locale)
		r.Title = local(r.title, locale)
		r.Description = r.description.Localized(locale)
		var available bool
		r.Reward, _, available, err = rewardFor(ctx, tx, RewardInput{r.points, r.item, r.count}, r.xp, locale)
		if err != nil {
			return nil, err
		}
		r.State, r.Block = blockStatus(r.AchievedAt, r.ClaimedAt, r.enabled, true, available)
		if r.SettlementID != nil {
			r.Reward, err = claimedReward(ctx, tx, owner, *r.SettlementID, locale)
			if err != nil {
				return nil, err
			}
		}
		out = append(out, r.Achievement)
	}
	return out, nil
}
func kindOrder(kind string) int {
	switch kind {
	case "checkin_streak":
		return 1
	case "review_streak":
		return 2
	case "mastered_words":
		return 3
	case "saved_passages":
		return 4
	}
	return 0
}
func afterAward(cursor *AwardCursor, kind string, order int64, id uuid.UUID) bool {
	if cursor == nil {
		return true
	}
	if kindOrder(kind) != kindOrder(cursor.Kind) {
		return kindOrder(kind) > kindOrder(cursor.Kind)
	}
	return order > cursor.Order || (order == cursor.Order && id.String() > cursor.ID.String())
}
func (s *Service) learnerTransaction(ctx context.Context, owner uuid.UUID) (pgx.Tx, business.Configuration, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, business.Configuration{}, err
	}
	c, err := business.LockConfiguration(ctx, tx, false)
	if err == nil {
		err = business.LockLearner(ctx, tx, owner)
	}
	if err == nil && !Enabled(c) {
		err = reject("temporarily_unavailable", 503)
	}
	if err == nil {
		err = Recompute(ctx, tx, owner, c)
	}
	if err != nil {
		tx.Rollback(ctx)
		return nil, c, err
	}
	return tx, c, nil
}
func (s *Service) PersonalLevelAwards(ctx context.Context, owner uuid.UUID, locale string, cursor *AwardCursor, limit int) ([]LevelAward, bool, error) {
	if limit < 1 || limit > 100 {
		return nil, false, &ValidationError{[]FieldError{{"/limit", "out_of_range"}}}
	}
	tx, _, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)
	all, err := readLevelAwards(ctx, tx, owner, locale)
	if err != nil {
		return nil, false, err
	}
	out := make([]LevelAward, 0, limit+1)
	for _, r := range all {
		if afterAward(cursor, "", r.Number, r.ID) {
			out = append(out, r)
			if len(out) > limit {
				break
			}
		}
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return out, more, nil
}
func (s *Service) PersonalAchievements(ctx context.Context, owner uuid.UUID, locale, kind string, cursor *AwardCursor, limit int) ([]Achievement, bool, error) {
	if limit < 1 || limit > 100 || kind != "" && !validAchievementKind(kind) {
		return nil, false, &ValidationError{[]FieldError{{"/filter", "out_of_range"}}}
	}
	tx, _, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback(ctx)
	all, err := readPersonalAchievements(ctx, tx, owner, locale, kind)
	if err != nil {
		return nil, false, err
	}
	out := make([]Achievement, 0, limit+1)
	for _, r := range all {
		if afterAward(cursor, r.Kind, r.Threshold, r.ID) {
			out = append(out, r)
			if len(out) > limit {
				break
			}
		}
	}
	more := len(out) > limit
	if more {
		out = out[:limit]
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	return out, more, nil
}

type CompactGrowth struct {
	Points     business.Amount `json:"points"`
	Experience business.Amount `json:"experience"`
	Level      int64           `json:"level_number"`
	Pending    int             `json:"pending_reward_count"`
}
type ClaimResult struct {
	Receipt Receipt       `json:"receipt"`
	Growth  CompactGrowth `json:"growth"`
}

func readCompactGrowth(ctx context.Context, tx pgx.Tx, owner uuid.UUID, locale string) (CompactGrowth, error) {
	var g CompactGrowth
	if err := tx.QueryRow(ctx, `SELECT b.points,b.experience,coalesce((SELECT max(level_no) FROM wordweave.growth_levels WHERE min_experience<=b.experience),0) FROM wordweave.growth_balances b WHERE owner_id=$1`, owner).Scan(&g.Points, &g.Experience, &g.Level); err != nil {
		return g, err
	}
	levels, err := readLevelAwards(ctx, tx, owner, locale)
	if err != nil {
		return g, err
	}
	achievements, err := readPersonalAchievements(ctx, tx, owner, locale, "")
	if err != nil {
		return g, err
	}
	for _, a := range levels {
		if a.State == "claimable" {
			g.Pending++
		}
	}
	for _, a := range achievements {
		if a.State == "claimable" {
			g.Pending++
		}
	}
	return g, nil
}
func (s *Service) Claim(ctx context.Context, owner, key, id uuid.UUID, achievement bool, locale string) (ClaimResult, error) {
	if key == uuid.Nil {
		return ClaimResult{}, &ValidationError{[]FieldError{{"/idempotency_key", "required"}}}
	}
	tx, c, err := s.learnerTransaction(ctx, owner)
	if err != nil {
		return ClaimResult{}, err
	}
	defer tx.Rollback(ctx)
	var status AwardStatus
	found := false
	var input RewardInput
	var xp business.Amount
	if achievement {
		all, err := readPersonalAchievements(ctx, tx, owner, locale, "")
		if err != nil {
			return ClaimResult{}, err
		}
		for _, a := range all {
			if a.ID == id {
				status = a.AwardStatus
				found = true
				break
			}
		}
		if found {
			err = tx.QueryRow(ctx, `SELECT points,experience,item_definition_id,item_count FROM wordweave.achievement_tiers WHERE id=$1`, id).Scan(&input.Points, &xp, &input.ItemID, &input.Count)
		}
	} else {
		all, err := readLevelAwards(ctx, tx, owner, locale)
		if err != nil {
			return ClaimResult{}, err
		}
		for _, a := range all {
			if a.ID == id {
				status = a.AwardStatus
				found = true
				break
			}
		}
		if found {
			err = tx.QueryRow(ctx, `SELECT points,item_definition_id,item_count FROM wordweave.growth_levels WHERE id=$1`, id).Scan(&input.Points, &input.ItemID, &input.Count)
		}
	}
	if err != nil {
		return ClaimResult{}, err
	}
	if !found {
		return ClaimResult{}, ErrNotFound
	}
	result := ClaimResult{}
	if status.SettlementID != nil {
		result.Receipt, err = readReceipt(ctx, tx, owner, *status.SettlementID)
	} else {
		if status.State == "unachieved" {
			return result, reject("reward_not_achieved", 422)
		}
		if status.Block != nil {
			return result, reject(*status.Block, 422)
		}
		kind := "level_reward"
		if achievement {
			kind = "achievement_reward"
		}
		settlement, _, err := intent(ctx, tx, owner, kind, id.String(), struct{ ID uuid.UUID }{id}, c.Now)
		if err != nil {
			return result, err
		}
		_, snapshot, available, err := rewardFor(ctx, tx, input, xp, locale)
		if err != nil {
			return result, err
		}
		if !available {
			return result, reject("reward_unavailable", 422)
		}
		if err = credit(ctx, tx, owner, settlement, "reward", int64(input.Points), int64(xp)); err != nil {
			return result, err
		}
		if input.ItemID != nil {
			d, err := readDefinition(ctx, tx, *input.ItemID)
			if err != nil {
				return result, err
			}
			if err = issueItems(ctx, tx, owner, settlement, d, input.Count, c.Now); err != nil {
				return result, err
			}
		}
		if achievement {
			_, err = tx.Exec(ctx, `UPDATE wordweave.achievement_awards SET claimed_at=$3,settlement_id=$4 WHERE owner_id=$1 AND tier_id=$2 AND claimed_at IS NULL`, owner, id, c.Now, settlement)
		} else {
			_, err = tx.Exec(ctx, `UPDATE wordweave.level_awards SET claimed_at=$3,settlement_id=$4 WHERE owner_id=$1 AND level_id=$2 AND claimed_at IS NULL`, owner, id, c.Now, settlement)
		}
		if err != nil {
			return result, err
		}
		result.Receipt, err = finishReceipt(ctx, tx, owner, settlement, map[string]any{"reward": snapshot})
		if err != nil {
			return result, err
		}
		if err = Recompute(ctx, tx, owner, c); err != nil {
			return result, err
		}
	}
	if err != nil {
		return result, err
	}
	result.Growth, err = readCompactGrowth(ctx, tx, owner, locale)
	if err != nil {
		return result, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ClaimResult{}, err
	}
	return result, nil
}
