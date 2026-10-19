package portability

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type entity struct {
	Kind, ID, Label string
	Value           any
	Credential      bool
}

func (s *Service) Preview(ctx context.Context, principal Principal, category Category, file File) (Preview, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Preview{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Preview{}, err
	}
	if err = s.requireAdmin(ctx, tx, principal, false); err != nil {
		return Preview{}, err
	}
	current, err := s.readCategory(ctx, tx, category)
	if err != nil {
		return Preview{}, err
	}
	blockers, err := s.blockers(ctx, tx, category, current, file.Data)
	if err != nil {
		return Preview{}, err
	}
	effects, impact, err := s.effects(ctx, tx, category, current, file.Data, c.Now)
	if err != nil {
		return Preview{}, err
	}
	changes, counts := diffEntities(entities(category, current, false), entities(category, file.Data, file.CredentialMode == "included"))
	warnings, defaults := notices(category, file, changes, effects)
	created := c.Now.UTC()
	p := Preview{Category: category, SchemaVersion: 1, CanCommit: len(blockers) == 0, BaselineRevision: business.Revision(s.key, "configuration", c.Revision), CreatedAt: created, Counts: counts, Changes: changes, Blockers: blockers, Effects: effects, Warnings: warnings, DefaultsApplied: defaults}
	if p.CanCommit {
		op := uuid.New()
		commit := created.Add(5 * time.Minute)
		retain := commit.Add(24 * time.Hour)
		fp := base64.RawURLEncoding.EncodeToString(s.fingerprint(principal.ID, category, file))
		t := ticket{Actor: principal.ID, OperationID: op, Category: category, Fingerprint: fp, Baseline: c.Revision, Impact: impact, CreatedAt: created, CommitNotAfter: commit, RetainUntil: retain}
		if effects.TargetLearningDay != nil {
			t.LearningDay = *effects.TargetLearningDay
		}
		token, e := s.signTicket(t)
		if e != nil {
			return Preview{}, e
		}
		p.OperationID = &op
		p.PreviewToken = &token
		p.CommitNotAfter = &commit
		p.RetainUntil = &retain
	}
	return p, nil
}

func entities(category Category, d Data, credential bool) []entity {
	out := []entity{}
	switch category {
	case Models:
		for _, c := range d.Connections {
			cc := c
			cc.APIKey = nil
			cc.Models = nil
			out = append(out, entity{"connection", c.ID.String(), value(c.Name), cc, credential})
			for _, m := range c.Models {
				out = append(out, entity{"model", m.ID.String(), value(m.DisplayName), m, false})
			}
		}
	case Plans:
		for _, p := range d.PlanRows {
			out = append(out, entity{"plan", p.Code, p.Code, p, false})
		}
	case Items:
		for _, x := range d.ItemRows {
			out = append(out, entity{"item", x.ID.String(), safeLabel(x.Name, x.ID.String()), x, false})
		}
	case Growth:
		if d.Checkin != nil {
			intent := d.Checkin.Current
			if d.Checkin.Pending != nil {
				intent = *d.Checkin.Pending
			}
			out = append(out, entity{"checkin", "current-intent", "check-in", intent, false})
		}
		out = append(out, entity{"mastery", "mastery", "mastery", d.MasteryExperience, false})
		for _, l := range d.Levels {
			l.SourceID = nil
			out = append(out, entity{"level", fmt.Sprintf("level:%d", l.LevelNumber), fmt.Sprintf("Level %d", l.LevelNumber), l, false})
		}
		for _, k := range []string{"checkin_streak", "review_streak", "mastered_words", "saved_passages"} {
			for _, a := range d.Achievements[k] {
				out = append(out, entity{"achievement", a.ID.String(), safeLabel(a.Name, a.ID.String()), a, false})
			}
		}
	}
	return out
}
func safeLabel(x Bilingual, fallback string) string {
	if x.ZH != nil {
		return *x.ZH
	}
	if x.EN != nil {
		return *x.EN
	}
	return fallback
}
func diffEntities(before, after []entity) ([]Change, Counts) {
	bm := map[string]entity{}
	am := map[string]entity{}
	for _, x := range before {
		bm[x.Kind+":"+x.ID] = x
	}
	for _, x := range after {
		am[x.Kind+":"+x.ID] = x
	}
	out := []Change{}
	counts := Counts{}
	keys := map[string]bool{}
	for k := range bm {
		keys[k] = true
	}
	for k := range am {
		keys[k] = true
	}
	for k := range keys {
		b, bok := bm[k]
		a, aok := am[k]
		x := a
		if !aok {
			x = b
		}
		action := "unchanged"
		switch {
		case !bok:
			action = "added"
			counts.Added++
		case !aok:
			action = "removed"
			counts.Removed++
		case !mapsEqual(safeFieldValues(x.Kind, b.Value), safeFieldValues(x.Kind, a.Value)) || a.Credential:
			action = "updated"
			counts.Updated++
		default:
			counts.Unchanged++
		}
		fields := exactFields(x.Kind, b.Value, a.Value, bok, aok)
		var ca *string
		if x.Kind == "connection" {
			v := "none"
			if a.Credential {
				v = "replace_from_package"
			}
			ca = &v
		}
		out = append(out, Change{Action: action, Kind: x.Kind, Identity: x.ID, Label: x.Label, Fields: fields, CredentialAction: ca})
	}
	order := map[string]int{"removed": 0, "added": 1, "updated": 2, "unchanged": 3}
	sort.Slice(out, func(i, j int) bool {
		if order[out[i].Action] != order[out[j].Action] {
			return order[out[i].Action] < order[out[j].Action]
		}
		return out[i].Kind+out[i].Identity < out[j].Kind+out[j].Identity
	})
	return out, counts
}
func safeFieldValues(kind string, v any) map[string]any {
	out := map[string]any{}
	switch x := v.(type) {
	case Connection:
		out["/protocol"], out["/base_url"], out["/name"] = x.Protocol, x.BaseURL, x.Name
	case Model:
		out["/provider_model_id"], out["/display_name"], out["/description"] = x.ProviderModelID, x.DisplayName, x.Description
		out["/max_output_tokens"], out["/output_mode"], out["/enabled"], out["/custom_parameters"] = x.MaxOutputTokens, x.OutputMode, x.Enabled, x.CustomParameters
	case Plan:
		out["/priority"], out["/rolling_24h_limit"], out["/max_entries"] = x.Priority, x.Rolling24hLimit, x.MaxEntries
		out["/allowed_lengths"], out["/model_ids"] = x.AllowedLengths, x.ModelIDs
		out["/content_review_enabled"], out["/content_repair_limit"] = x.ContentReviewEnabled, x.ContentRepairLimit
	case Item:
		out["/kind"], out["/name"], out["/description"] = x.Kind, x.Name, x.Description
		out["/exchange_price"], out["/activation_ttl_seconds"], out["/listed"], out["/effect"] = x.ExchangePrice, x.ActivationTTLSeconds, x.Listed, x.Effect
	case CheckinValues:
		out["/base_points"], out["/step_points"], out["/cap_points"], out["/normal_experience"] = x.BasePoints, x.StepPoints, x.CapPoints, x.NormalExperience
	case business.Amount:
		out["/mastery_experience"] = x
	case Level:
		out["/min_experience"], out["/reward_enabled"], out["/reward"] = x.MinExperience, x.RewardEnabled, x.Reward
	case Achievement:
		out["/threshold"], out["/enabled"], out["/name"], out["/title"] = x.Threshold, x.Enabled, x.Name, x.Title
		out["/description"], out["/reward"] = x.Description, x.Reward
	}
	return out
}

func mapsEqual(a, b map[string]any) bool {
	left, _ := json.Marshal(a)
	right, _ := json.Marshal(b)
	return string(left) == string(right)
}

func exactFields(kind string, before, after any, hasBefore, hasAfter bool) []FieldChange {
	bm, am := safeFieldValues(kind, before), safeFieldValues(kind, after)
	keys := map[string]bool{}
	for key := range bm {
		keys[key] = true
	}
	for key := range am {
		keys[key] = true
	}
	ordered := make([]string, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	sort.Strings(ordered)
	out := make([]FieldChange, 0, len(ordered))
	for _, key := range ordered {
		var b, a any
		if hasBefore {
			b = bm[key]
		}
		if hasAfter {
			a = am[key]
		}
		lb, _ := json.Marshal(b)
		la, _ := json.Marshal(a)
		if !hasBefore || !hasAfter || string(lb) != string(la) {
			out = append(out, FieldChange{Field: key, Before: b, After: a})
		}
	}
	return out
}

func (s *Service) blockers(ctx context.Context, tx pgx.Tx, category Category, current, incoming Data) ([]Blocker, error) {
	out := []Blocker{}
	add := func(code, sourceCat, sourceKind string, sourceID *string, targetKind, targetID, label, field string) {
		out = append(out, Blocker{Code: code, SourceCategory: sourceCat, SourceKind: sourceKind, SourceIdentity: sourceID, SourceLabel: "", Target: TargetRef{Kind: targetKind, Identity: targetID, Label: label}, Field: field})
	}
	switch category {
	case Models:
		newModels, newProviders := map[uuid.UUID]bool{}, map[uuid.UUID]bool{}
		for _, c := range incoming.Connections {
			newProviders[c.ID] = true
			var retired *time.Time
			err := tx.QueryRow(ctx, `SELECT retired_at FROM wordweave.ai_providers WHERE id=$1`, c.ID).Scan(&retired)
			if err == nil && retired != nil {
				id := c.ID.String()
				add("identity_conflict", "models", "connection", &id, "connection", id, value(c.Name), "/id")
			}
			for _, m := range c.Models {
				newModels[m.ID] = true
				var provider uuid.UUID
				var retiredM *time.Time
				err := tx.QueryRow(ctx, `SELECT provider_id,retired_at FROM wordweave.ai_models WHERE id=$1`, m.ID).Scan(&provider, &retiredM)
				if err == nil && (provider != c.ID || retiredM != nil) {
					id := m.ID.String()
					add("identity_conflict", "models", "model", &id, "model", id, value(m.DisplayName), "/id")
				}
			}
		}
		for _, c := range current.Connections {
			for _, m := range c.Models {
				if newModels[m.ID] {
					continue
				}
				sources := []struct{ q, cat, kind string }{{`SELECT group_code FROM wordweave.group_models WHERE model_id=$1 LIMIT 1`, "plans", "plan"}, {`SELECT p.id::text FROM wordweave.presets p JOIN wordweave.preset_versions v ON v.id IN(p.draft_version_id,p.published_version_id) WHERE v.model_id=$1 LIMIT 1`, "presets", "preset"}, {`SELECT definition_id::text FROM wordweave.item_definition_models WHERE model_id=$1 LIMIT 1`, "items", "item"}}
				for _, src := range sources {
					var id string
					if err := tx.QueryRow(ctx, src.q, m.ID).Scan(&id); err == nil {
						add("active_reference", src.cat, src.kind, &id, "model", m.ID.String(), value(m.DisplayName), "/id")
					} else if !errors.Is(err, pgx.ErrNoRows) {
						return nil, err
					}
				}
			}
		}
	case Plans:
		for _, p := range incoming.PlanRows {
			for _, id := range p.ModelIDs {
				var ok bool
				if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.ai_models WHERE id=$1 AND retired_at IS NULL)`, id).Scan(&ok); err != nil {
					return nil, err
				}
				if !ok {
					x := p.Code
					add("missing_reference", "plans", "plan", &x, "model", id.String(), id.String(), "/model_ids")
				}
			}
		}
	case Items:
		newIDs := map[uuid.UUID]bool{}
		for _, x := range incoming.ItemRows {
			newIDs[x.ID] = true
			var kind string
			err := tx.QueryRow(ctx, `SELECT kind FROM wordweave.item_definitions WHERE id=$1`, x.ID).Scan(&kind)
			if err == nil && kind != x.Kind {
				id := x.ID.String()
				add("identity_conflict", "items", "item", &id, "item", id, safeLabel(x.Name, id), "/kind")
			}
			for _, mid := range x.Effect.ModelIDs {
				var ok bool
				if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id WHERE m.id=$1 AND m.retired_at IS NULL AND p.retired_at IS NULL)`, mid).Scan(&ok); err != nil {
					return nil, err
				}
				if !ok {
					id := x.ID.String()
					add("missing_reference", "items", "item", &id, "model", mid.String(), mid.String(), "/effect/model_ids")
				}
			}
		}
		for _, x := range current.ItemRows {
			if newIDs[x.ID] {
				continue
			}
			var issued bool
			if err := tx.QueryRow(ctx, `SELECT ever_issued FROM wordweave.item_definitions WHERE id=$1`, x.ID).Scan(&issued); err != nil {
				return nil, err
			}
			id := x.ID.String()
			if issued {
				add("ever_issued", "target_history", "item", nil, "item", id, safeLabel(x.Name, id), "/id")
			}
			var ref string
			err := tx.QueryRow(ctx, `SELECT 'growth' FROM wordweave.growth_levels WHERE item_definition_id=$1 UNION ALL SELECT 'growth' FROM wordweave.achievement_tiers WHERE item_definition_id=$1 LIMIT 1`, x.ID).Scan(&ref)
			if err == nil {
				add("active_reference", "growth", "reward", &ref, "item", id, safeLabel(x.Name, id), "/id")
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
		}
	case Growth:
		incomingAchievementIDs := map[uuid.UUID]bool{}
		for _, rows := range incoming.Achievements {
			for _, a := range rows {
				incomingAchievementIDs[a.ID] = true
			}
		}
		for _, l := range incoming.Levels {
			if l.Reward.ItemDefinitionID != nil {
				if err := s.rewardItemBlock(ctx, tx, *l.Reward.ItemDefinitionID, fmt.Sprintf("level:%d", l.LevelNumber), add); err != nil {
					return nil, err
				}
			}
		}
		for kind, rows := range incoming.Achievements {
			for _, a := range rows {
				if a.Reward.ItemDefinitionID != nil {
					if err := s.rewardItemBlock(ctx, tx, *a.Reward.ItemDefinitionID, a.ID.String(), add); err != nil {
						return nil, err
					}
				}
				var existing uuid.UUID
				err := tx.QueryRow(ctx, `SELECT id FROM wordweave.achievement_tiers WHERE kind=$1 AND threshold=$2 AND id<>$3 LIMIT 1`, kind, a.Threshold, a.ID).Scan(&existing)
				if err == nil && !incomingAchievementIDs[existing] {
					id := existing.String()
					add("identity_conflict", "growth", "achievement", &id, "achievement", a.ID.String(), safeLabel(a.Name, a.ID.String()), "/threshold")
				} else if !errors.Is(err, pgx.ErrNoRows) {
					return nil, err
				}
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Code+out[i].Target.Identity < out[j].Code+out[j].Target.Identity })
	return out, nil
}
func (s *Service) rewardItemBlock(ctx context.Context, tx pgx.Tx, id uuid.UUID, source string, add func(string, string, string, *string, string, string, string, string)) error {
	var ok bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.item_definitions d WHERE d.id=$1 AND (d.kind<>'model_trial' OR EXISTS(SELECT 1 FROM wordweave.item_definition_models dm JOIN wordweave.ai_models m ON m.id=dm.model_id WHERE dm.definition_id=d.id AND m.enabled AND m.retired_at IS NULL)))`, id).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		add("reward_unavailable", "growth", "reward", &source, "item", id.String(), id.String(), "/reward/item_definition_id")
	}
	return nil
}

func (s *Service) effects(ctx context.Context, tx pgx.Tx, cat Category, current, incoming Data, now time.Time) (Effects, string, error) {
	e := Effects{HistoryPreserved: true, InFlightPolicy: "accepted_snapshot"}
	switch cat {
	case Plans:
		e.MayChangeEffectivePlan = true
	case Growth:
		source := "current"
		if incoming.Checkin != nil && incoming.Checkin.Pending != nil {
			source = "pending"
		}
		e.CheckinSource = &source
		day := business.LearningDay(now).AddDate(0, 0, 1).Format("2006-01-02")
		e.TargetLearningDay = &day
		e.CheckinEffectiveDay = &day
		mastery := "new_events"
		e.MasteryApplies = &mastery
		e.MayDowngrade = true
	}
	impact, err := s.impactProjection(ctx, tx, cat, now, &e)
	if err != nil {
		return e, "", err
	}
	_ = current
	return e, impact, nil
}

func (s *Service) impactProjection(ctx context.Context, tx pgx.Tx, cat Category, now time.Time, effects *Effects) (string, error) {
	var query string
	var args []any
	switch cat {
	case Models:
		query = `SELECT kind,identity,state,metric FROM (
	 SELECT 'group_model' kind,group_code||':'||model_id::text identity,jsonb_build_array(group_code,model_id)::text state,0 metric FROM wordweave.group_models
	 UNION ALL SELECT 'preset_model',p.id::text||':'||v.id::text,jsonb_build_array(p.id,v.id,v.model_id)::text,0 FROM wordweave.presets p JOIN wordweave.preset_versions v ON v.id IN(p.draft_version_id,p.published_version_id)
	 UNION ALL SELECT 'item_model',definition_id::text||':'||model_id::text,jsonb_build_array(definition_id,model_id)::text,0 FROM wordweave.item_definition_models
	 UNION ALL SELECT 'model_card',id::text,jsonb_build_array(owner_id,definition_id,issued_at,activation_deadline,activated_at,ended_at,refunded_at)::text,0 FROM wordweave.user_items WHERE kind_snapshot='model_trial'
	 UNION ALL SELECT 'card_model',item_id::text||':'||model_id::text,jsonb_build_array(owner_id,item_id,model_id)::text,0 FROM wordweave.user_item_models
	 UNION ALL SELECT 'model_contribution',id::text,jsonb_build_array(owner_id,item_id,model_id,starts_at,ends_at,revoked_at)::text,0 FROM wordweave.model_time_contributions
	) impact ORDER BY kind,identity,state`
	case Plans:
		query = `SELECT kind,identity,state,metric FROM (
	 SELECT 'account' kind,id::text identity,jsonb_build_array(group_code,status)::text state,0 metric FROM wordweave.accounts WHERE role='learner'
	 UNION ALL SELECT 'active_trial',id::text,jsonb_build_array(owner_id,target_plan_code,started_at,ends_at,closed_at,close_reason)::text,0 FROM wordweave.plan_trials WHERE closed_at IS NULL AND ends_at>$1
	) impact ORDER BY kind,identity,state`
		args = []any{now}
	case Items:
		query = `SELECT kind,identity,state,metric FROM (
	 SELECT 'definition' kind,id::text identity,jsonb_build_array(kind,ever_issued,listed)::text state,0 metric FROM wordweave.item_definitions
	 UNION ALL SELECT 'inventory',id::text,jsonb_build_array(definition_id,owner_id,issued_at,activation_deadline,activated_at,ended_at,used_target_day,refunded_at)::text,0 FROM wordweave.user_items
	 UNION ALL SELECT 'level_reward',id::text,jsonb_build_array(item_definition_id,retired_at)::text,0 FROM wordweave.growth_levels WHERE item_definition_id IS NOT NULL
	 UNION ALL SELECT 'achievement_reward',id::text,jsonb_build_array(item_definition_id,retired_at)::text,0 FROM wordweave.achievement_tiers WHERE item_definition_id IS NOT NULL
	) impact ORDER BY kind,identity,state`
	case Growth:
		query = `SELECT kind,identity,state,metric FROM (
	 SELECT 'level' kind,id::text identity,jsonb_build_array(level_no,min_experience,retired_at)::text state,0 metric FROM wordweave.growth_levels
	 UNION ALL SELECT 'tier',id::text,jsonb_build_array(kind,threshold,retired_at)::text,0 FROM wordweave.achievement_tiers
	 UNION ALL SELECT 'level_award',owner_id::text||':'||level_id::text,jsonb_build_array(achieved_at,claimed_at,settlement_id)::text,(claimed_at IS NOT NULL)::int FROM wordweave.level_awards
	 UNION ALL SELECT 'achievement_award',owner_id::text||':'||tier_id::text,jsonb_build_array(achieved_at,claimed_at,settlement_id)::text,(claimed_at IS NOT NULL)::int FROM wordweave.achievement_awards
	 UNION ALL SELECT 'user_growth',owner_id::text,jsonb_build_array(mastered_total,saved_total,successful_review_total,highest_checkin_streak,highest_review_streak,config_revision_seen)::text,0 FROM wordweave.user_growth
	 UNION ALL SELECT 'growth_balance',owner_id::text,jsonb_build_array(points,experience,revision)::text,0 FROM wordweave.growth_balances
	 UNION ALL SELECT 'reward_item',d.id::text,jsonb_build_array(d.kind,d.listed,EXISTS(SELECT 1 FROM wordweave.item_definition_models dm JOIN wordweave.ai_models m ON m.id=dm.model_id JOIN wordweave.ai_providers p ON p.id=m.provider_id WHERE dm.definition_id=d.id AND m.enabled AND m.retired_at IS NULL AND p.retired_at IS NULL))::text,0 FROM wordweave.item_definitions d
	) impact ORDER BY kind,identity,state`
	default:
		query = `SELECT ''::text kind,''::text identity,''::text state,0 metric WHERE false`
	}
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte("config-portability/v1/impact\x00"))
	mac.Write([]byte(cat))
	mac.Write([]byte{0})
	write := func(value string) {
		var size [8]byte
		binary.BigEndian.PutUint64(size[:], uint64(len(value)))
		mac.Write(size[:])
		mac.Write([]byte(value))
	}
	for rows.Next() {
		var kind, identity, state string
		var metric int
		if err = rows.Scan(&kind, &identity, &state, &metric); err != nil {
			return "", err
		}
		write(kind)
		write(identity)
		write(state)
		switch kind {
		case "account":
			effects.BaseUsers++
		case "active_trial":
			effects.ActiveTrialUsers++
		case "model_card":
			effects.ModelCardInstances++
		case "level_award", "achievement_award":
			effects.AchievedAwards++
			effects.ClaimedAwards += metric
		}
	}
	if err = rows.Err(); err != nil {
		return "", err
	}
	public, _ := json.Marshal(effects)
	write(string(public))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func notices(cat Category, file File, changes []Change, e Effects) ([]Notice, []Notice) {
	d := file.Data
	warnings := []Notice{}
	defaults := []Notice{}
	ptr := func(s string) *string { return &s }
	addDefault := func(code, kind, identity, field string) {
		defaults = append(defaults, Notice{code, &ItemRef{kind, identity}, ptr(field)})
	}
	addLanguage := func(kind, identity, base string, value Bilingual) {
		if value.ZH == nil && value.EN != nil {
			warnings = append(warnings, Notice{"language_fallback", &ItemRef{kind, identity}, ptr(base + "/zh_CN")})
		}
		if value.EN == nil && value.ZH != nil {
			warnings = append(warnings, Notice{"language_fallback", &ItemRef{kind, identity}, ptr(base + "/en_US")})
		}
	}
	if cat == Models {
		for _, connection := range d.Connections {
			cid := connection.ID.String()
			if file.generatedNames["connection:"+cid] {
				addDefault("name_generated", "connection", cid, "/name")
			}
			for _, model := range connection.Models {
				mid := model.ID.String()
				if file.generatedNames["model:"+mid] {
					addDefault("name_generated", "model", mid, "/display_name")
				}
				if model.Description == nil {
					addDefault("optional_value_cleared", "model", mid, "/description")
				}
				if model.MaxOutputTokens == nil {
					addDefault("optional_value_cleared", "model", mid, "/max_output_tokens")
				}
			}
		}
	}
	if cat == Plans {
		for _, p := range d.PlanRows {
			ref := &ItemRef{"plan", p.Code}
			if len(p.ModelIDs) == 0 {
				warnings = append(warnings, Notice{"plan_no_models", ref, ptr("/model_ids")})
			}
			if len(p.AllowedLengths) == 0 {
				warnings = append(warnings, Notice{"plan_no_lengths", ref, ptr("/allowed_lengths")})
			}
		}
		if e.MayChangeEffectivePlan {
			warnings = append(warnings, Notice{"effective_plan_may_change", nil, nil})
		}
	}
	if cat == Items {
		if len(d.ItemRows) == 0 {
			warnings = append(warnings, Notice{"category_cleared", nil, nil})
		}
		for _, item := range d.ItemRows {
			id := item.ID.String()
			for _, field := range []struct {
				name  string
				value *string
			}{{"/name/zh_CN", item.Name.ZH}, {"/name/en_US", item.Name.EN}, {"/description/zh_CN", item.Description.ZH}, {"/description/en_US", item.Description.EN}} {
				if field.value == nil {
					addDefault("optional_value_cleared", "item", id, field.name)
				}
			}
			addLanguage("item", id, "/name", item.Name)
			addLanguage("item", id, "/description", item.Description)
		}
	}
	if cat == Growth {
		if e.MayDowngrade {
			warnings = append(warnings, Notice{"level_may_downgrade", nil, nil})
		}
		if d.Checkin != nil && d.Checkin.Pending == nil {
			defaults = append(defaults, Notice{"checkin_current_selected", &ItemRef{"checkin", "current-intent"}, ptr("/pending")})
		}
		for _, level := range d.Levels {
			id := fmt.Sprintf("level:%d", level.LevelNumber)
			if level.Reward.ItemDefinitionID == nil {
				addDefault("optional_value_cleared", "level", id, "/reward/item_definition_id")
				if !file.rewardCountSet[id] {
					addDefault("reward_quantity_zero", "level", id, "/reward/item_count")
				}
			}
		}
		for _, kind := range []string{"checkin_streak", "review_streak", "mastered_words", "saved_passages"} {
			for _, achievement := range d.Achievements[kind] {
				id := achievement.ID.String()
				for _, field := range []struct {
					name  string
					value *string
				}{{"/name/zh_CN", achievement.Name.ZH}, {"/name/en_US", achievement.Name.EN}, {"/title/zh_CN", achievement.Title.ZH}, {"/title/en_US", achievement.Title.EN}} {
					if field.value == nil {
						addDefault("optional_value_cleared", "achievement", id, field.name)
					}
				}
				description := Bilingual{}
				if achievement.Description != nil {
					description = *achievement.Description
				}
				if description.ZH == nil {
					addDefault("optional_value_cleared", "achievement", id, "/description/zh_CN")
				}
				if description.EN == nil {
					addDefault("optional_value_cleared", "achievement", id, "/description/en_US")
				}
				addLanguage("achievement", id, "/name", achievement.Name)
				addLanguage("achievement", id, "/title", achievement.Title)
				addLanguage("achievement", id, "/description", description)
				if achievement.Reward.ItemDefinitionID == nil {
					addDefault("optional_value_cleared", "achievement", id, "/reward/item_definition_id")
					if !file.rewardCountSet["achievement:"+id] {
						addDefault("reward_quantity_zero", "achievement", id, "/reward/item_count")
					}
				}
			}
		}
	}
	_ = changes
	noticeKey := func(n Notice) string {
		id := ""
		if n.ItemRef != nil {
			id = n.ItemRef.Kind + ":" + n.ItemRef.Identity
		}
		field := ""
		if n.Field != nil {
			field = *n.Field
		}
		return n.Code + "\x00" + id + "\x00" + field
	}
	sort.Slice(warnings, func(i, j int) bool { return noticeKey(warnings[i]) < noticeKey(warnings[j]) })
	sort.Slice(defaults, func(i, j int) bool { return noticeKey(defaults[i]) < noticeKey(defaults[j]) })
	return warnings, defaults
}
