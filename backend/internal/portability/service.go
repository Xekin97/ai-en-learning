package portability

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
)

var (
	ErrConflict         = errors.New("operation conflict")
	ErrUnknown          = errors.New("operation outcome unknown")
	ErrExpired          = errors.New("operation result expired")
	ErrToken            = errors.New("recovery token invalid")
	ErrForbidden        = errors.New("administrator authorization expired")
	ErrSourceIncomplete = errors.New("source configuration incomplete")
)

const maxPreviewTokenBytes = 16 << 10

type Service struct {
	pool        *pgxpool.Pool
	credentials *ai.CredentialStore
	key         []byte
	now         func() time.Time
}

func New(pool *pgxpool.Pool, credentials *ai.CredentialStore, key []byte) *Service {
	return &Service{pool: pool, credentials: credentials, key: append([]byte(nil), key...), now: time.Now}
}

func (s *Service) Current(ctx context.Context, principal Principal, category Category) (Current, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Current{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Current{}, err
	}
	if err = s.requireAdmin(ctx, tx, principal, false); err != nil {
		return Current{}, err
	}
	data, err := s.readCategory(ctx, tx, category)
	if err != nil {
		return Current{}, err
	}
	return Current{Category: category, Revision: business.Revision(s.key, "configuration", c.Revision), ReadAt: c.Now.UTC(), Configuration: data}, nil
}

func (s *Service) Export(ctx context.Context, category Category, principal Principal, includeCredentials bool) (File, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return File{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return File{}, err
	}
	if err = s.requireAdmin(ctx, tx, principal, false); err != nil {
		return File{}, err
	}
	data, err := s.readCategory(ctx, tx, category)
	if err != nil {
		return File{}, err
	}
	mode := "none"
	if includeCredentials {
		if category != Models {
			return File{}, validation("/include_credentials", "out_of_range")
		}
		mode = "included"
		for i := range data.Connections {
			key, e := s.credentials.ConnectionKey(ctx, data.Connections[i].ID)
			if e != nil || strings.TrimSpace(key) == "" {
				return File{}, ErrCredentialsRequired
			}
			data.Connections[i].APIKey = &key
		}
	}
	rev := business.Revision(s.key, "configuration", c.Revision)
	at := c.Now.UTC()
	file := File{Format: "wordweave-config", Version: 1, Category: category, CredentialMode: mode, Source: &Source{ExportedAt: &at, Revision: &rev}, References: referencesFor(data, category), Data: data}
	validated, err := validateFile(file, includeCredentials)
	if err != nil {
		return File{}, ErrSourceIncomplete
	}
	return validated, nil
}

func (s *Service) readCategory(ctx context.Context, tx pgx.Tx, category Category) (Data, error) {
	switch category {
	case Models:
		return readModels(ctx, tx)
	case Plans:
		return readPlans(ctx, tx)
	case Items:
		return readItems(ctx, tx)
	case Growth:
		return readGrowth(ctx, tx)
	default:
		return Data{}, validation("/category", "category_mismatch")
	}
}

func readModels(ctx context.Context, tx pgx.Tx) (Data, error) {
	rows, err := tx.Query(ctx, `SELECT id,name,protocol,base_url FROM wordweave.ai_providers WHERE retired_at IS NULL ORDER BY id`)
	if err != nil {
		return Data{}, err
	}
	out := Data{Connections: []Connection{}}
	for rows.Next() {
		var c Connection
		if err = rows.Scan(&c.ID, &c.Name, &c.Protocol, &c.BaseURL); err != nil {
			return Data{}, err
		}
		c.Models = []Model{}
		out.Connections = append(out.Connections, c)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return Data{}, err
	}
	rows.Close()
	for i := range out.Connections {
		mr, e := tx.Query(ctx, `SELECT id,provider_model_id,display_name,description,max_output_tokens,output_mode,enabled,custom_parameters FROM wordweave.ai_models WHERE provider_id=$1 AND retired_at IS NULL ORDER BY id`, out.Connections[i].ID)
		if e != nil {
			return Data{}, e
		}
		for mr.Next() {
			var m Model
			if e = mr.Scan(&m.ID, &m.ProviderModelID, &m.DisplayName, &m.Description, &m.MaxOutputTokens, &m.OutputMode, &m.Enabled, &m.CustomParameters); e != nil {
				mr.Close()
				return Data{}, e
			}
			out.Connections[i].Models = append(out.Connections[i].Models, m)
		}
		e = mr.Err()
		mr.Close()
		if e != nil {
			return Data{}, e
		}
	}
	return out, nil
}

func readPlans(ctx context.Context, tx pgx.Tx) (Data, error) {
	out := Data{PlanRows: []Plan{}}
	for _, pair := range [][2]string{{"visitor", "visitor"}, {"basic", "registered"}, {"pro", "pro"}, {"plus", "plus"}} {
		var p Plan
		p.Code = pair[0]
		if err := tx.QueryRow(ctx, `SELECT priority,rolling_quota_limit,max_entries_per_run,content_review_enabled,content_repair_limit FROM wordweave.entitlement_groups WHERE code=$1`, pair[1]).Scan(&p.Priority, &p.Rolling24hLimit, &p.MaxEntries, &p.ContentReviewEnabled, &p.ContentRepairLimit); err != nil {
			return Data{}, err
		}
		p.AllowedLengths = []string{}
		r, err := tx.Query(ctx, `SELECT length_code FROM wordweave.group_lengths WHERE group_code=$1 ORDER BY length_code`, pair[1])
		if err != nil {
			return Data{}, err
		}
		for r.Next() {
			var x string
			if err = r.Scan(&x); err != nil {
				r.Close()
				return Data{}, err
			}
			p.AllowedLengths = append(p.AllowedLengths, x)
		}
		r.Close()
		p.ModelIDs = []uuid.UUID{}
		r, err = tx.Query(ctx, `SELECT gm.model_id FROM wordweave.group_models gm JOIN wordweave.ai_models m ON m.id=gm.model_id WHERE gm.group_code=$1 AND m.retired_at IS NULL ORDER BY gm.model_id`, pair[1])
		if err != nil {
			return Data{}, err
		}
		for r.Next() {
			var x uuid.UUID
			if err = r.Scan(&x); err != nil {
				r.Close()
				return Data{}, err
			}
			p.ModelIDs = append(p.ModelIDs, x)
		}
		r.Close()
		out.PlanRows = append(out.PlanRows, p)
	}
	return out, nil
}

func readItems(ctx context.Context, tx pgx.Tx) (Data, error) {
	rows, err := tx.Query(ctx, `SELECT id,kind,name_zh,name_en,description_zh,description_en,exchange_price,activation_ttl_seconds,listed,extra_count,trial_seconds,target_plan_code,retirement_points FROM wordweave.item_definitions ORDER BY id`)
	if err != nil {
		return Data{}, err
	}
	out := Data{ItemRows: []Item{}}
	for rows.Next() {
		var x Item
		var target *string
		if err = rows.Scan(&x.ID, &x.Kind, &x.Name.ZH, &x.Name.EN, &x.Description.ZH, &x.Description.EN, &x.ExchangePrice, &x.ActivationTTLSeconds, &x.Listed, &x.Effect.ExtraCount, &x.Effect.TrialSeconds, &target, &x.Effect.RetirementPoints); err != nil {
			rows.Close()
			return Data{}, err
		}
		x.Effect.Kind = x.Kind
		if target != nil {
			p := *target
			if p == "registered" {
				p = "basic"
			}
			x.Effect.TargetPlanCode = &p
		}
		out.ItemRows = append(out.ItemRows, x)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return Data{}, err
	}
	rows.Close()
	for i := range out.ItemRows {
		if out.ItemRows[i].Kind != "model_trial" {
			continue
		}
		out.ItemRows[i].Effect.ModelIDs = []uuid.UUID{}
		mr, e := tx.Query(ctx, `SELECT model_id FROM wordweave.item_definition_models WHERE definition_id=$1 ORDER BY model_id`, out.ItemRows[i].ID)
		if e != nil {
			return Data{}, e
		}
		for mr.Next() {
			var id uuid.UUID
			if e = mr.Scan(&id); e != nil {
				mr.Close()
				return Data{}, e
			}
			out.ItemRows[i].Effect.ModelIDs = append(out.ItemRows[i].Effect.ModelIDs, id)
		}
		if e = mr.Err(); e != nil {
			mr.Close()
			return Data{}, e
		}
		mr.Close()
	}
	return out, nil
}

func readGrowth(ctx context.Context, tx pgx.Tx) (Data, error) {
	out := Data{Levels: []Level{}, Achievements: map[string][]Achievement{"checkin_streak": {}, "review_streak": {}, "mastered_words": {}, "saved_passages": {}}}
	var now time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp(),mastery_experience FROM wordweave.growth_settings WHERE singleton`).Scan(&now, &out.MasteryExperience); err != nil {
		return Data{}, err
	}
	day := business.LearningDay(now)
	var cur CheckinValues
	if err := tx.QueryRow(ctx, `SELECT base_points,step_points,cap_points,normal_experience FROM wordweave.checkin_rules WHERE effective_day<=$1 ORDER BY effective_day DESC LIMIT 1`, day).Scan(&cur.BasePoints, &cur.StepPoints, &cur.CapPoints, &cur.NormalExperience); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Data{}, ErrSourceIncomplete
		}
		return Data{}, err
	}
	out.Checkin = &Checkin{Current: cur}
	var pending CheckinValues
	err := tx.QueryRow(ctx, `SELECT base_points,step_points,cap_points,normal_experience FROM wordweave.checkin_rules WHERE effective_day>$1 ORDER BY effective_day LIMIT 1`, day).Scan(&pending.BasePoints, &pending.StepPoints, &pending.CapPoints, &pending.NormalExperience)
	if err == nil {
		out.Checkin.Pending = &pending
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Data{}, err
	}
	lr, err := tx.Query(ctx, `SELECT id,level_no,min_experience,reward_enabled,points,item_definition_id,item_count FROM wordweave.growth_levels WHERE retired_at IS NULL ORDER BY level_no`)
	if err != nil {
		return Data{}, err
	}
	for lr.Next() {
		var id uuid.UUID
		var l Level
		if err = lr.Scan(&id, &l.LevelNumber, &l.MinExperience, &l.RewardEnabled, &l.Reward.Points, &l.Reward.ItemDefinitionID, &l.Reward.ItemCount); err != nil {
			lr.Close()
			return Data{}, err
		}
		l.SourceID = &id
		out.Levels = append(out.Levels, l)
	}
	lr.Close()
	ar, err := tx.Query(ctx, `SELECT id,kind,threshold,enabled,name_zh,name_en,title_zh,title_en,description_zh,description_en,points,experience,item_definition_id,item_count FROM wordweave.achievement_tiers WHERE retired_at IS NULL ORDER BY kind,threshold,id`)
	if err != nil {
		return Data{}, err
	}
	defer ar.Close()
	for ar.Next() {
		var a Achievement
		var d Bilingual
		if err = ar.Scan(&a.ID, &a.Kind, &a.Threshold, &a.Enabled, &a.Name.ZH, &a.Name.EN, &a.Title.ZH, &a.Title.EN, &d.ZH, &d.EN, &a.Reward.Points, &a.Reward.Experience, &a.Reward.ItemDefinitionID, &a.Reward.ItemCount); err != nil {
			return Data{}, err
		}
		a.Description = &d
		out.Achievements[a.Kind] = append(out.Achievements[a.Kind], a)
	}
	return out, ar.Err()
}

func referencesFor(data Data, category Category) []Reference {
	m := map[string]Reference{}
	add := func(k, id string) { m[k+":"+id] = Reference{Kind: k, ID: id} }
	switch category {
	case Plans:
		for _, p := range data.PlanRows {
			for _, id := range p.ModelIDs {
				add("model", id.String())
			}
		}
	case Items:
		for _, x := range data.ItemRows {
			for _, id := range x.Effect.ModelIDs {
				add("model", id.String())
			}
			if x.Effect.TargetPlanCode != nil {
				add("plan", *x.Effect.TargetPlanCode)
			}
		}
	case Growth:
		for _, l := range data.Levels {
			if l.Reward.ItemDefinitionID != nil {
				add("item", l.Reward.ItemDefinitionID.String())
			}
		}
		for _, rows := range data.Achievements {
			for _, a := range rows {
				if a.Reward.ItemDefinitionID != nil {
					add("item", a.Reward.ItemDefinitionID.String())
				}
			}
		}
	}
	out := make([]Reference, 0, len(m))
	for _, x := range m {
		out = append(out, x)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Kind+out[i].ID < out[j].Kind+out[j].ID })
	return out
}

type ticket struct {
	Actor, OperationID                     uuid.UUID
	Category                               Category
	Fingerprint                            string
	Baseline                               int64
	Impact                                 string
	CreatedAt, CommitNotAfter, RetainUntil time.Time
	LearningDay                            string
}

func (s *Service) signTicket(t ticket) (string, error) {
	b, err := json.Marshal(t)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte("config-portability/v1/token\x00"))
	mac.Write(b)
	token := base64.RawURLEncoding.EncodeToString(b) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if len(token) > maxPreviewTokenBytes {
		return "", ErrToken
	}
	return token, nil
}
func (s *Service) parseTicket(token string) (ticket, error) {
	var t ticket
	if len(token) == 0 || len(token) > maxPreviewTokenBytes {
		return t, ErrToken
	}
	left, right, ok := strings.Cut(token, ".")
	if !ok {
		return t, ErrToken
	}
	b, e := base64.RawURLEncoding.DecodeString(left)
	if e != nil {
		return t, ErrToken
	}
	sig, e := base64.RawURLEncoding.DecodeString(right)
	if e != nil {
		return t, ErrToken
	}
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte("config-portability/v1/token\x00"))
	mac.Write(b)
	if !hmac.Equal(sig, mac.Sum(nil)) || json.Unmarshal(b, &t) != nil {
		return t, ErrToken
	}
	return t, nil
}
func (s *Service) fingerprint(actor uuid.UUID, category Category, file File) []byte {
	b, _ := json.Marshal(file)
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte("config-portability/v1/input\x00"))
	mac.Write([]byte(actor.String()))
	mac.Write([]byte{0})
	mac.Write([]byte(category))
	mac.Write([]byte{0})
	mac.Write(b)
	if file.hasRawDigest {
		mac.Write([]byte("\x00raw-file-sha256\x00"))
		mac.Write(file.rawDigest[:])
	}
	return mac.Sum(nil)
}
func hashAny(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return base64.RawURLEncoding.EncodeToString(h[:])
}
func revisionNumber(token string, key []byte, current int64) (int64, error) {
	if !business.MatchRevision(key, "configuration", current, token) {
		return 0, errors.New("revision changed")
	}
	return current, nil
}
func dbPlan(code string) string {
	if code == "basic" {
		return "registered"
	}
	return code
}
func stringAmount(x business.Amount) string { return strconv.FormatInt(int64(x), 10) }
