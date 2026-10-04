package admin

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"math"
	"wordweave/internal/platform/business"
)

var ErrDuplicatePriority = errors.New("duplicate priority")

type GroupModel struct {
	ID          uuid.UUID
	DisplayName string
	Enabled     bool
}
type Group struct {
	Code            string
	Priority        int
	Rolling24hLimit *int
	MaxEntries      int
	AllowedLengths  []string
	Models          []GroupModel
	Revision        string
}
type GroupInput struct {
	Expected string      `json:"expected_revision"`
	Priority int         `json:"priority"`
	Limit    *int        `json:"rolling_24h_limit" nullable:"true"`
	Maximum  int         `json:"max_entries"`
	Lengths  []string    `json:"allowed_lengths"`
	Models   []uuid.UUID `json:"model_ids"`
}
type GroupImpact struct {
	Base               int    `json:"base_users"`
	Trials             int    `json:"active_trial_users"`
	PriorityChanged    bool   `json:"priority_changed"`
	MayChangeEffective bool   `json:"may_change_effective_plan"`
	LosesModels        bool   `json:"loses_all_models"`
	Revision           string `json:"revision"`
}
type Priority struct {
	Code  string `json:"code"`
	Value int    `json:"priority"`
}
type PrioritiesInput struct {
	Expected   string     `json:"expected_revision"`
	Priorities []Priority `json:"priorities"`
}
type PriorityImpact struct {
	Base     int    `json:"affected_base_users"`
	Trials   int    `json:"affected_trial_users"`
	Revision string `json:"revision"`
}

func readGroup(ctx context.Context, tx pgx.Tx, code string) (Group, error) {
	dbCode, ok := databaseGroupCode(code)
	if !ok {
		return Group{}, ErrNotFound
	}
	g := Group{Code: code, AllowedLengths: make([]string, 0), Models: make([]GroupModel, 0)}
	err := tx.QueryRow(ctx, `SELECT priority,rolling_quota_limit,max_entries_per_run FROM wordweave.entitlement_groups WHERE code=$1`, dbCode).Scan(&g.Priority, &g.Rolling24hLimit, &g.MaxEntries)
	if errors.Is(err, pgx.ErrNoRows) {
		return g, ErrNotFound
	}
	if err != nil {
		return g, err
	}
	rows, err := tx.Query(ctx, `SELECT length_code FROM wordweave.group_lengths WHERE group_code=$1 ORDER BY CASE length_code WHEN 'short' THEN 1 WHEN 'medium' THEN 2 WHEN 'long' THEN 3 ELSE 4 END`, dbCode)
	if err != nil {
		return g, err
	}
	for rows.Next() {
		var length string
		if err = rows.Scan(&length); err != nil {
			rows.Close()
			return g, err
		}
		g.AllowedLengths = append(g.AllowedLengths, length)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return g, err
	}
	rows, err = tx.Query(ctx, `SELECT m.id,m.display_name,m.enabled FROM wordweave.group_models gm JOIN wordweave.ai_models m ON m.id=gm.model_id WHERE gm.group_code=$1 ORDER BY lower(m.display_name),m.id`, dbCode)
	if err != nil {
		return g, err
	}
	defer rows.Close()
	for rows.Next() {
		var model GroupModel
		if err = rows.Scan(&model.ID, &model.DisplayName, &model.Enabled); err != nil {
			return g, err
		}
		g.Models = append(g.Models, model)
	}
	return g, rows.Err()
}
func readGroups(ctx context.Context, tx pgx.Tx) ([]Group, error) {
	out := make([]Group, 0, 4)
	for _, code := range []string{"visitor", "basic", "pro", "plus"} {
		g, err := readGroup(ctx, tx, code)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, nil
}
func (s *Service) GetGroup(ctx context.Context, code string) (Group, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Group{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Group{}, err
	}
	g, err := readGroup(ctx, tx, code)
	g.Revision = s.revision(c)
	return g, err
}
func (s *Service) ListGroups(ctx context.Context) ([]Group, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return nil, "", err
	}
	groups, err := readGroups(ctx, tx)
	return groups, s.revision(c), err
}
func validateGroup(ctx context.Context, tx pgx.Tx, code string, in GroupInput) (GroupInput, error) {
	if in.Maximum < 1 || in.Maximum > math.MaxInt32 || in.Priority < 0 || in.Priority > math.MaxInt32 || in.Limit != nil && (*in.Limit < 0 || *in.Limit > math.MaxInt32) || hasDuplicateUUIDs(in.Models) {
		return in, ErrValidation
	}
	seen := map[string]bool{}
	for _, length := range in.Lengths {
		switch length {
		case "short", "medium", "long", "xlong":
			seen[length] = true
		default:
			return in, ErrValidation
		}
	}
	in.Lengths = make([]string, 0, len(seen))
	for _, length := range []string{"short", "medium", "long", "xlong"} {
		if seen[length] {
			in.Lengths = append(in.Lengths, length)
		}
	}
	for _, id := range in.Models {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.ai_models WHERE id=$1 AND retired_at IS NULL)`, id).Scan(&exists); err != nil {
			return in, err
		}
		if !exists {
			return in, ErrValidation
		}
	}
	dbCode, ok := databaseGroupCode(code)
	if !ok {
		return in, ErrNotFound
	}
	var duplicate bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.entitlement_groups WHERE code<>$1 AND priority=$2)`, dbCode, in.Priority).Scan(&duplicate); err != nil {
		return in, err
	}
	if duplicate {
		return in, ErrDuplicatePriority
	}
	return in, nil
}
func (s *Service) GroupImpact(ctx context.Context, code string, in GroupInput) (GroupImpact, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return GroupImpact{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return GroupImpact{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return GroupImpact{}, err
	}
	in, err = validateGroup(ctx, tx, code, in)
	if err != nil {
		return GroupImpact{}, err
	}
	old, err := readGroup(ctx, tx, code)
	if err != nil {
		return GroupImpact{}, err
	}
	dbCode, _ := databaseGroupCode(code)
	out := GroupImpact{PriorityChanged: old.Priority != in.Priority, Revision: s.revision(c)}
	if err = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.accounts WHERE group_code=$1),(SELECT count(*) FROM wordweave.plan_trials WHERE target_plan_code=$1 AND closed_at IS NULL AND ends_at>$2),NOT EXISTS(SELECT 1 FROM wordweave.ai_models WHERE id=ANY($3::uuid[]) AND enabled AND retired_at IS NULL)`, dbCode, c.Now, in.Models).Scan(&out.Base, &out.Trials, &out.LosesModels); err != nil {
		return out, err
	}
	if out.PriorityChanged {
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.accounts a JOIN wordweave.entitlement_groups b ON b.code=a.group_code JOIN wordweave.plan_trials t ON t.owner_id=a.id AND t.closed_at IS NULL AND t.ends_at>$3 JOIN wordweave.entitlement_groups p ON p.code=t.target_plan_code WHERE (p.priority>b.priority) <> ((CASE WHEN p.code=$1 THEN $2 ELSE p.priority END)>(CASE WHEN b.code=$1 THEN $2 ELSE b.priority END)))`, dbCode, in.Priority, c.Now).Scan(&out.MayChangeEffective)
	}
	return out, err
}
func (s *Service) PutGroup(ctx context.Context, code string, in GroupInput) (Group, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Group{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Group{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return Group{}, err
	}
	in, err = validateGroup(ctx, tx, code, in)
	if err != nil {
		return Group{}, err
	}
	dbCode, _ := databaseGroupCode(code)
	tag, err := tx.Exec(ctx, `UPDATE wordweave.entitlement_groups SET priority=$2,rolling_quota_limit=$3,max_entries_per_run=$4 WHERE code=$1`, dbCode, in.Priority, in.Limit, in.Maximum)
	if err != nil {
		return Group{}, err
	}
	if tag.RowsAffected() != 1 {
		return Group{}, ErrNotFound
	}
	if _, err = tx.Exec(ctx, `DELETE FROM wordweave.group_lengths WHERE group_code=$1`, dbCode); err != nil {
		return Group{}, err
	}
	for _, length := range in.Lengths {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.group_lengths(group_code,length_code) VALUES($1,$2)`, dbCode, length); err != nil {
			return Group{}, err
		}
	}
	if _, err = tx.Exec(ctx, `DELETE FROM wordweave.group_models WHERE group_code=$1`, dbCode); err != nil {
		return Group{}, err
	}
	for _, model := range in.Models {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES($1,$2)`, dbCode, model); err != nil {
			return Group{}, err
		}
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return Group{}, err
	}
	group, err := readGroup(ctx, tx, code)
	if err != nil {
		return Group{}, err
	}
	group.Revision = s.revision(c)
	if err = tx.Commit(ctx); err != nil {
		return Group{}, err
	}
	return group, nil
}
func validatePriorities(in PrioritiesInput) error {
	if len(in.Priorities) != 4 {
		return ErrValidation
	}
	codes := map[string]bool{}
	values := map[int]bool{}
	for _, row := range in.Priorities {
		_, valid := databaseGroupCode(row.Code)
		if !valid || codes[row.Code] || row.Value < 0 || row.Value > math.MaxInt32 {
			return ErrValidation
		}
		if values[row.Value] {
			return ErrDuplicatePriority
		}
		codes[row.Code] = true
		values[row.Value] = true
	}
	return nil
}
func (s *Service) PriorityImpact(ctx context.Context, in PrioritiesInput) (PriorityImpact, error) {
	if err := validatePriorities(in); err != nil {
		return PriorityImpact{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PriorityImpact{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return PriorityImpact{}, err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return PriorityImpact{}, err
	}
	changed := make([]string, 0)
	for _, row := range in.Priorities {
		g, err := readGroup(ctx, tx, row.Code)
		if err != nil {
			return PriorityImpact{}, err
		}
		if g.Priority != row.Value {
			code, _ := databaseGroupCode(row.Code)
			changed = append(changed, code)
		}
	}
	out := PriorityImpact{Revision: s.revision(c)}
	err = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.accounts WHERE group_code=ANY($1::text[])),(SELECT count(*) FROM wordweave.plan_trials WHERE target_plan_code=ANY($1::text[]) AND closed_at IS NULL AND ends_at>$2)`, changed, c.Now).Scan(&out.Base, &out.Trials)
	return out, err
}
func (s *Service) SavePriorities(ctx context.Context, in PrioritiesInput) ([]Group, string, error) {
	if err := validatePriorities(in); err != nil {
		return nil, "", err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return nil, "", err
	}
	if err = s.requireRevision(c, in.Expected); err != nil {
		return nil, "", err
	}
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS wordweave.entitlement_groups_priority_unique DEFERRED`); err != nil {
		return nil, "", err
	}
	for _, row := range in.Priorities {
		code, _ := databaseGroupCode(row.Code)
		if _, err = tx.Exec(ctx, `UPDATE wordweave.entitlement_groups SET priority=$2 WHERE code=$1`, code, row.Value); err != nil {
			return nil, "", err
		}
	}
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS wordweave.entitlement_groups_priority_unique IMMEDIATE`); err != nil {
		return nil, "", err
	}
	c.Revision, err = business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return nil, "", err
	}
	groups, err := readGroups(ctx, tx)
	if err != nil {
		return nil, "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, "", err
	}
	return groups, s.revision(c), nil
}
