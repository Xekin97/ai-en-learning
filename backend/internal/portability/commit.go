package portability

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
)

func (s *Service) Commit(ctx context.Context, principal Principal, category Category, operation uuid.UUID, token string, file File) (Result, error) {
	t, err := s.parseTicket(token)
	if err != nil {
		return Result{}, err
	}
	if t.Actor != principal.ID || t.OperationID != operation || t.Category != category {
		return Result{}, ErrToken
	}
	fp := s.fingerprint(principal.ID, category, file)
	if base64.RawURLEncoding.EncodeToString(fp) != t.Fingerprint {
		return Result{}, ErrConflict
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Result{}, ErrUnknown
	}
	defer tx.Rollback(ctx)
	if err = setWriteTimeouts(ctx, tx); err != nil {
		return Result{}, err
	}
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Result{}, err
	}
	if err = s.requireAdmin(ctx, tx, principal, true); err != nil {
		return Result{}, err
	}
	if c.Now.UTC().After(t.RetainUntil) {
		return Result{}, ErrExpired
	}
	if result, found, e := s.readReceipt(ctx, tx, principal.ID, category, operation, fp, c.Revision); e != nil {
		return Result{}, e
	} else if found {
		return result, nil
	}
	reason := ""
	now := c.Now.UTC()
	if now.After(t.CommitNotAfter) {
		reason = "preview_expired"
	} else if c.Revision != t.Baseline {
		reason = "revision_changed"
	} else {
		current, e := s.readCategory(ctx, tx, category)
		if e != nil {
			return Result{}, e
		}
		blockers, e := s.blockers(ctx, tx, category, current, file.Data)
		if e != nil {
			return Result{}, e
		}
		_, impact, e := s.effects(ctx, tx, category, current, file.Data, c.Now)
		if e != nil {
			return Result{}, e
		}
		if len(blockers) > 0 {
			reason = "dependency_changed"
		} else if impact != t.Impact {
			reason = "impact_changed"
		} else if category == Growth && t.LearningDay != "" && business.LearningDay(c.Now).AddDate(0, 0, 1).Format("2006-01-02") != t.LearningDay {
			reason = "impact_changed"
		}
	}
	if reason != "" {
		result := s.notApplied(operation, category, c.Revision, t, reason, now)
		if err = s.insertReceipt(ctx, tx, principal.ID, fp, result, c.Revision); err != nil {
			return Result{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return Result{}, ErrUnknown
		}
		return result, nil
	}
	before, err := s.readCategory(ctx, tx, category)
	if err != nil {
		return Result{}, err
	}
	changes, counts := diffEntities(entities(category, before, false), entities(category, file.Data, file.CredentialMode == "included"))
	_ = changes
	if _, err = tx.Exec(ctx, `SET CONSTRAINTS ALL DEFERRED`); err != nil {
		return Result{}, err
	}
	if err = s.apply(ctx, tx, principal.ID, category, file.Data, c.Now); err != nil {
		return Result{}, err
	}
	newRevision, err := business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return Result{}, err
	}
	if newRevision != c.Revision+1 {
		return Result{}, errors.New("configuration revision did not advance exactly once")
	}
	result := Result{OperationID: operation, Category: category, Status: "applied", BaselineRevision: business.Revision(s.key, "configuration", c.Revision), ResultRevision: business.Revision(s.key, "configuration", newRevision), CurrentRevision: business.Revision(s.key, "configuration", newRevision), Counts: counts, ResolvedAt: now, CommitNotAfter: t.CommitNotAfter, RetainUntil: t.RetainUntil}
	if category == Growth && t.LearningDay != "" {
		day := t.LearningDay
		result.EffectiveDay = &day
	}
	if err = s.insertReceipt(ctx, tx, principal.ID, fp, result, c.Revision); err != nil {
		return Result{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Result{}, ErrUnknown
	}
	return result, nil
}

func (s *Service) Resolve(ctx context.Context, principal Principal, category Category, operation uuid.UUID, token string) (Result, error) {
	t, err := s.parseTicket(token)
	if err != nil {
		return Result{}, err
	}
	if t.Actor != principal.ID || t.OperationID != operation || t.Category != category {
		return Result{}, ErrToken
	}
	if s.now().UTC().After(t.RetainUntil) {
		return Result{}, ErrExpired
	}
	fp, err := base64.RawURLEncoding.DecodeString(t.Fingerprint)
	if err != nil || len(fp) != 32 {
		return Result{}, ErrToken
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Result{}, ErrUnknown
	}
	defer tx.Rollback(ctx)
	if err = setWriteTimeouts(ctx, tx); err != nil {
		return Result{}, ErrUnknown
	}
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Result{}, ErrUnknown
	}
	if err = s.requireAdmin(ctx, tx, principal, true); err != nil {
		return Result{}, err
	}
	if c.Now.UTC().After(t.RetainUntil) {
		return Result{}, ErrExpired
	}
	if result, found, e := s.readReceipt(ctx, tx, principal.ID, category, operation, fp, c.Revision); e != nil {
		return Result{}, e
	} else if found {
		return result, nil
	}
	now := c.Now.UTC()
	result := s.notApplied(operation, category, c.Revision, t, "resolved_before_commit", now)
	if err = s.insertReceipt(ctx, tx, principal.ID, fp, result, c.Revision); err != nil {
		return Result{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Result{}, ErrUnknown
	}
	return result, nil
}

func (s *Service) requireAdmin(ctx context.Context, tx pgx.Tx, principal Principal, write bool) error {
	if principal.ID == uuid.Nil || principal.SessionID == uuid.Nil {
		return ErrForbidden
	}
	lock := " FOR SHARE"
	if write {
		lock = " FOR UPDATE"
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT a.id FROM wordweave.accounts a JOIN wordweave.account_sessions s ON s.account_id=a.id WHERE a.id=$1 AND s.id=$2 AND a.role='admin' AND a.status='active' AND s.expires_at>clock_timestamp() AND s.created_at+interval '8 hours'>clock_timestamp() AND s.last_seen_at+interval '30 minutes'>clock_timestamp()`+lock, principal.ID, principal.SessionID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrForbidden
	}
	return err
}

func setWriteTimeouts(ctx context.Context, tx pgx.Tx) error {
	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout='2s'`); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `SET LOCAL statement_timeout='5s'`)
	return err
}
func (s *Service) notApplied(id uuid.UUID, cat Category, revision int64, t ticket, reason string, at time.Time) Result {
	r := business.Revision(s.key, "configuration", revision)
	return Result{OperationID: id, Category: cat, Status: "not_applied", ReasonCode: &reason, BaselineRevision: r, ResultRevision: r, CurrentRevision: r, Counts: Counts{}, ResolvedAt: at, CommitNotAfter: t.CommitNotAfter, RetainUntil: t.RetainUntil}
}
func (s *Service) insertReceipt(ctx context.Context, tx pgx.Tx, actor uuid.UUID, fp []byte, r Result, baseline int64) error {
	counts, _ := json.Marshal(r.Counts)
	var day *time.Time
	if r.EffectiveDay != nil {
		d, e := time.Parse("2006-01-02", *r.EffectiveDay)
		if e != nil {
			return e
		}
		day = &d
	}
	resultRevision := baseline
	if r.Status == "applied" {
		resultRevision++
	}
	_, err := tx.Exec(ctx, `INSERT INTO wordweave.config_import_receipts(operation_id,actor_id,category,request_fingerprint,status,baseline_revision,result_revision,effective_day,result_counts,reason_code,resolved_at,commit_not_after,retain_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, r.OperationID, actor, r.Category, fp, r.Status, baseline, resultRevision, day, counts, r.ReasonCode, r.ResolvedAt, r.CommitNotAfter, r.RetainUntil)
	return err
}
func (s *Service) readReceipt(ctx context.Context, tx pgx.Tx, actor uuid.UUID, cat Category, id uuid.UUID, fp []byte, current int64) (Result, bool, error) {
	var rowActor uuid.UUID
	var rowCat Category
	var stored []byte
	var status string
	var baseline, resultRev int64
	var day *time.Time
	var countsRaw []byte
	var reason *string
	var resolved, commit, retain time.Time
	err := tx.QueryRow(ctx, `SELECT actor_id,category,request_fingerprint,status,baseline_revision,result_revision,effective_day,result_counts,reason_code,resolved_at,commit_not_after,retain_until FROM wordweave.config_import_receipts WHERE operation_id=$1`, id).Scan(&rowActor, &rowCat, &stored, &status, &baseline, &resultRev, &day, &countsRaw, &reason, &resolved, &commit, &retain)
	if errors.Is(err, pgx.ErrNoRows) {
		return Result{}, false, nil
	}
	if err != nil {
		return Result{}, false, err
	}
	if rowActor != actor || rowCat != cat || !bytes.Equal(stored, fp) {
		return Result{}, false, ErrConflict
	}
	var counts Counts
	if json.Unmarshal(countsRaw, &counts) != nil {
		return Result{}, false, errors.New("invalid stored receipt")
	}
	r := Result{OperationID: id, Category: cat, Status: status, ReasonCode: reason, BaselineRevision: business.Revision(s.key, "configuration", baseline), ResultRevision: business.Revision(s.key, "configuration", resultRev), CurrentRevision: business.Revision(s.key, "configuration", current), Superseded: status == "applied" && current != resultRev, Counts: counts, ResolvedAt: resolved, CommitNotAfter: commit, RetainUntil: retain}
	if day != nil {
		x := day.Format("2006-01-02")
		r.EffectiveDay = &x
	}
	return r, true, nil
}

func (s *Service) apply(ctx context.Context, tx pgx.Tx, actor uuid.UUID, cat Category, d Data, now time.Time) error {
	switch cat {
	case Models:
		return s.applyModels(ctx, tx, actor, d, now)
	case Plans:
		return applyPlans(ctx, tx, d)
	case Items:
		return applyItems(ctx, tx, actor, d, now)
	case Growth:
		return applyGrowth(ctx, tx, actor, d, now)
	default:
		return validation("/category", "category_mismatch")
	}
}

func (s *Service) applyModels(ctx context.Context, tx pgx.Tx, actor uuid.UUID, d Data, now time.Time) error {
	providers := map[uuid.UUID]bool{}
	models := map[uuid.UUID]uuid.UUID{}
	for _, c := range d.Connections {
		providers[c.ID] = true
		for _, m := range c.Models {
			models[m.ID] = c.ID
		}
	}
	rows, err := tx.Query(ctx, `SELECT id FROM wordweave.ai_models WHERE retired_at IS NULL ORDER BY id`)
	if err != nil {
		return err
	}
	var retireModels []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		if _, ok := models[id]; !ok {
			retireModels = append(retireModels, id)
		}
	}
	rows.Close()
	if len(retireModels) > 0 {
		if _, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false,retired_at=$2,updated_at=$2 WHERE id=ANY($1)`, retireModels, now); err != nil {
			return err
		}
	}
	rows, err = tx.Query(ctx, `SELECT id FROM wordweave.ai_providers WHERE retired_at IS NULL ORDER BY id`)
	if err != nil {
		return err
	}
	var retireProviders []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		if !providers[id] {
			retireProviders = append(retireProviders, id)
		}
	}
	rows.Close()
	for _, id := range retireProviders {
		if _, err = tx.Exec(ctx, `SELECT wordweave.retire_provider_credential($1,$2,$3)`, id, now, actor); err != nil {
			return err
		}
	}
	// Vacate immediate partial unique indexes so provider model identifiers and
	// display names can be exchanged within one category transaction.
	for _, c := range d.Connections {
		for _, m := range c.Models {
			if _, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET provider_model_id='__cr313__'||id::text,display_name='__cr313__'||id::text WHERE id=$1 AND retired_at IS NULL`, m.ID); err != nil {
				return err
			}
		}
	}
	for _, c := range d.Connections {
		if c.APIKey == nil {
			return ErrCredentialsRequired
		}
		draft := ai.ConnectionDraft{Name: value(c.Name), Protocol: c.Protocol, BaseURL: c.BaseURL, APIKey: *c.APIKey}
		if err = s.credentials.ImportConnection(ctx, tx, actor, c.ID, draft); err != nil {
			return err
		}
		for _, m := range c.Models {
			name := value(m.DisplayName)
			description := m.Description
			tag, err := tx.Exec(ctx, `UPDATE wordweave.ai_models SET provider_id=$2,provider_model_id=$3,display_name=$4,description=$5,max_output_tokens=$6,output_mode=$7,enabled=$8,custom_parameters=$9,updated_at=$10 WHERE id=$1 AND retired_at IS NULL`, m.ID, c.ID, m.ProviderModelID, name, description, m.MaxOutputTokens, m.OutputMode, m.Enabled, m.CustomParameters, now)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				_, err = tx.Exec(ctx, `INSERT INTO wordweave.ai_models(id,provider_id,provider_model_id,display_name,description,max_output_tokens,output_mode,enabled,custom_parameters,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`, m.ID, c.ID, m.ProviderModelID, name, description, m.MaxOutputTokens, m.OutputMode, m.Enabled, m.CustomParameters, now)
				if err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func applyPlans(ctx context.Context, tx pgx.Tx, d Data) error {
	for _, p := range d.PlanRows {
		code := dbPlan(p.Code)
		if _, err := tx.Exec(ctx, `UPDATE wordweave.entitlement_groups SET priority=$2,rolling_quota_limit=$3,max_entries_per_run=$4,content_review_enabled=$5,content_repair_limit=$6,updated_at=clock_timestamp() WHERE code=$1`, code, p.Priority, p.Rolling24hLimit, p.MaxEntries, p.ContentReviewEnabled, p.ContentRepairLimit); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM wordweave.group_lengths WHERE group_code=$1`, code); err != nil {
			return err
		}
		for _, x := range p.AllowedLengths {
			if _, err := tx.Exec(ctx, `INSERT INTO wordweave.group_lengths(group_code,length_code) VALUES($1,$2)`, code, x); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM wordweave.group_models WHERE group_code=$1`, code); err != nil {
			return err
		}
		for _, id := range p.ModelIDs {
			if _, err := tx.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES($1,$2)`, code, id); err != nil {
				return err
			}
		}
	}
	return nil
}

func applyItems(ctx context.Context, tx pgx.Tx, actor uuid.UUID, d Data, now time.Time) error {
	ids := []uuid.UUID{}
	for _, x := range d.ItemRows {
		ids = append(ids, x.ID)
	}
	if len(ids) == 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM wordweave.item_definitions WHERE NOT ever_issued`); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(ctx, `DELETE FROM wordweave.item_definitions WHERE id<>ALL($1) AND NOT ever_issued`, ids); err != nil {
			return err
		}
	}
	for _, x := range d.ItemRows {
		var extra *int
		var trial *int64
		var target *string
		var retirement *business.Amount
		switch x.Kind {
		case "extra_credit":
			extra = x.Effect.ExtraCount
		case "model_trial":
			trial = x.Effect.TrialSeconds
			retirement = x.Effect.RetirementPoints
		case "plan_trial":
			trial = x.Effect.TrialSeconds
			t := dbPlan(*x.Effect.TargetPlanCode)
			target = &t
		}
		tag, err := tx.Exec(ctx, `UPDATE wordweave.item_definitions SET name_zh=$2,name_en=$3,description_zh=$4,description_en=$5,exchange_price=$6,activation_ttl_seconds=$7,listed=$8,extra_count=$9,trial_seconds=$10,target_plan_code=$11,retirement_points=$12,revision=revision+1,updated_at=$13,updated_by=$14 WHERE id=$1 AND kind=$15`, x.ID, x.Name.ZH, x.Name.EN, x.Description.ZH, x.Description.EN, x.ExchangePrice, x.ActivationTTLSeconds, x.Listed, extra, trial, target, retirement, now, actor, x.Kind)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.item_definitions(id,kind,name_zh,name_en,description_zh,description_en,exchange_price,activation_ttl_seconds,listed,extra_count,trial_seconds,target_plan_code,retirement_points,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, x.ID, x.Kind, x.Name.ZH, x.Name.EN, x.Description.ZH, x.Description.EN, x.ExchangePrice, x.ActivationTTLSeconds, x.Listed, extra, trial, target, retirement, actor)
			if err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, `DELETE FROM wordweave.item_definition_models WHERE definition_id=$1`, x.ID); err != nil {
			return err
		}
		for _, mid := range x.Effect.ModelIDs {
			if _, err = tx.Exec(ctx, `INSERT INTO wordweave.item_definition_models(definition_id,model_id) VALUES($1,$2)`, x.ID, mid); err != nil {
				return err
			}
		}
	}
	return nil
}

func applyGrowth(ctx context.Context, tx pgx.Tx, actor uuid.UUID, d Data, now time.Time) error {
	day := business.LearningDay(now).AddDate(0, 0, 1)
	source := d.Checkin.Current
	if d.Checkin.Pending != nil {
		source = *d.Checkin.Pending
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.checkin_rules WHERE effective_day>$1`, business.LearningDay(now)); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience,updated_by) VALUES($1,$2,$3,$4,$5,$6)`, day, source.BasePoints, source.StepPoints, source.CapPoints, source.NormalExperience, actor); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.growth_settings SET mastery_experience=$1 WHERE singleton`, d.MasteryExperience); err != nil {
		return err
	}
	levels := map[int]Level{}
	for _, x := range d.Levels {
		levels[x.LevelNumber] = x
	}
	rows, err := tx.Query(ctx, `SELECT level_no FROM wordweave.growth_levels ORDER BY level_no`)
	if err != nil {
		return err
	}
	var existing []int
	for rows.Next() {
		var n int
		if err = rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		existing = append(existing, n)
	}
	rows.Close()
	for _, n := range existing {
		if _, ok := levels[n]; !ok {
			if _, err = tx.Exec(ctx, `UPDATE wordweave.growth_levels SET retired_at=$2,reward_enabled=false,item_definition_id=NULL,item_count=0,revision=revision+1 WHERE level_no=$1 AND retired_at IS NULL`, n, now); err != nil {
				return err
			}
		}
	}
	for _, x := range d.Levels {
		tag, err := tx.Exec(ctx, `UPDATE wordweave.growth_levels SET min_experience=$2,reward_enabled=$3,points=$4,item_definition_id=$5,item_count=$6,retired_at=NULL,revision=revision+1 WHERE level_no=$1`, x.LevelNumber, x.MinExperience, x.RewardEnabled, x.Reward.Points, x.Reward.ItemDefinitionID, x.Reward.ItemCount)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points,item_definition_id,item_count) VALUES($1,$2,$3,$4,$5,$6)`, x.LevelNumber, x.MinExperience, x.RewardEnabled, x.Reward.Points, x.Reward.ItemDefinitionID, x.Reward.ItemCount)
			if err != nil {
				return err
			}
		}
	}
	achievements := map[uuid.UUID]Achievement{}
	for _, rows := range d.Achievements {
		for _, x := range rows {
			achievements[x.ID] = x
		}
	}
	rows, err = tx.Query(ctx, `SELECT id FROM wordweave.achievement_tiers ORDER BY id`)
	if err != nil {
		return err
	}
	var old []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		old = append(old, id)
	}
	rows.Close()
	for _, id := range old {
		if _, ok := achievements[id]; !ok {
			if _, err = tx.Exec(ctx, `UPDATE wordweave.achievement_tiers SET retired_at=$2,enabled=false,item_definition_id=NULL,item_count=0,revision=revision+1 WHERE id=$1 AND retired_at IS NULL`, id, now); err != nil {
				return err
			}
		}
	}
	for _, x := range achievements {
		var dz, de *string
		if x.Description != nil {
			dz, de = x.Description.ZH, x.Description.EN
		}
		tag, err := tx.Exec(ctx, `UPDATE wordweave.achievement_tiers SET threshold=$2,enabled=$3,name_zh=$4,name_en=$5,title_zh=$6,title_en=$7,description_zh=$8,description_en=$9,points=$10,experience=$11,item_definition_id=$12,item_count=$13,retired_at=NULL,revision=revision+1 WHERE id=$1 AND kind=$14`, x.ID, x.Threshold, x.Enabled, x.Name.ZH, x.Name.EN, x.Title.ZH, x.Title.EN, dz, de, x.Reward.Points, x.Reward.Experience, x.Reward.ItemDefinitionID, x.Reward.ItemCount, x.Kind)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			_, err = tx.Exec(ctx, `INSERT INTO wordweave.achievement_tiers(id,kind,threshold,enabled,name_zh,name_en,title_zh,title_en,description_zh,description_en,points,experience,item_definition_id,item_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, x.ID, x.Kind, x.Threshold, x.Enabled, x.Name.ZH, x.Name.EN, x.Title.ZH, x.Title.EN, dz, de, x.Reward.Points, x.Reward.Experience, x.Reward.ItemDefinitionID, x.Reward.ItemCount)
			if err != nil {
				return err
			}
		}
	}
	return nil
}

func receiptReason(err error) string {
	if err == nil {
		return ""
	}
	return strings.ToLower(fmt.Sprint(err))
}
