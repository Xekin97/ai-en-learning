package portability

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/platform/business"
)

type Category string

type Principal struct {
	ID        uuid.UUID
	SessionID uuid.UUID
}

const (
	Models Category = "models"
	Plans  Category = "plans"
	Items  Category = "items"
	Growth Category = "growth"
)

func ParseCategory(value string) (Category, bool) {
	switch Category(value) {
	case Models, Plans, Items, Growth:
		return Category(value), true
	default:
		return "", false
	}
}

type Source struct {
	ExportedAt *time.Time `json:"exported_at,omitempty"`
	Revision   *string    `json:"revision,omitempty"`
}

type Reference struct {
	Kind  string  `json:"kind"`
	ID    string  `json:"id"`
	Label *string `json:"label,omitempty"`
}

type File struct {
	Format         string      `json:"format"`
	Version        int         `json:"version"`
	Category       Category    `json:"category"`
	CredentialMode string      `json:"credential_mode"`
	Source         *Source     `json:"source,omitempty"`
	References     []Reference `json:"references,omitempty"`
	Data           Data        `json:"data"`
	rawDigest      [32]byte
	hasRawDigest   bool
	generatedNames map[string]bool
	rewardCountSet map[string]bool
}

type Data struct {
	Connections       []Connection             `json:"connections,omitempty"`
	PlanRows          []Plan                   `json:"plans,omitempty"`
	ItemRows          []Item                   `json:"items,omitempty"`
	MasteryExperience business.Amount          `json:"mastery_experience,omitempty"`
	Checkin           *Checkin                 `json:"checkin,omitempty"`
	Levels            []Level                  `json:"levels,omitempty"`
	Achievements      map[string][]Achievement `json:"achievements,omitempty"`
}

// MarshalJSON preserves required empty collections and numeric zero while
// emitting only the selected category schema.
func (d Data) MarshalJSON() ([]byte, error) {
	switch {
	case d.Connections != nil:
		return json.Marshal(struct {
			Connections []Connection `json:"connections"`
		}{d.Connections})
	case d.PlanRows != nil:
		return json.Marshal(struct {
			Plans []Plan `json:"plans"`
		}{d.PlanRows})
	case d.ItemRows != nil:
		return json.Marshal(struct {
			Items []Item `json:"items"`
		}{d.ItemRows})
	case d.Checkin != nil || d.Levels != nil || d.Achievements != nil:
		return json.Marshal(struct {
			MasteryExperience business.Amount          `json:"mastery_experience"`
			Checkin           *Checkin                 `json:"checkin"`
			Levels            []Level                  `json:"levels"`
			Achievements      map[string][]Achievement `json:"achievements"`
		}{d.MasteryExperience, d.Checkin, d.Levels, d.Achievements})
	default:
		return []byte(`{}`), nil
	}
}

type Connection struct {
	ID       uuid.UUID `json:"id"`
	Protocol string    `json:"protocol"`
	BaseURL  string    `json:"base_url"`
	Name     *string   `json:"name,omitempty"`
	APIKey   *string   `json:"api_key,omitempty"`
	Models   []Model   `json:"models"`
}

type Model struct {
	ID               uuid.UUID       `json:"id"`
	ProviderModelID  string          `json:"provider_model_id"`
	DisplayName      *string         `json:"display_name,omitempty"`
	Description      *string         `json:"description,omitempty"`
	MaxOutputTokens  *int            `json:"max_output_tokens,omitempty"`
	OutputMode       string          `json:"output_mode"`
	Enabled          bool            `json:"enabled"`
	CustomParameters json.RawMessage `json:"custom_parameters"`
}

type Plan struct {
	Code                 string      `json:"code"`
	Priority             int         `json:"priority"`
	Rolling24hLimit      *int        `json:"rolling_24h_limit"`
	MaxEntries           int         `json:"max_entries"`
	AllowedLengths       []string    `json:"allowed_lengths"`
	ModelIDs             []uuid.UUID `json:"model_ids"`
	ContentReviewEnabled bool        `json:"content_review_enabled"`
	ContentRepairLimit   int         `json:"content_repair_limit"`
}

type Bilingual struct {
	ZH *string `json:"zh_CN,omitempty"`
	EN *string `json:"en_US,omitempty"`
}

type ItemEffect struct {
	Kind             string           `json:"kind"`
	ExtraCount       *int             `json:"extra_count,omitempty"`
	ModelIDs         []uuid.UUID      `json:"model_ids,omitempty"`
	TrialSeconds     *int64           `json:"trial_seconds,omitempty"`
	RetirementPoints *business.Amount `json:"retirement_points,omitempty"`
	TargetPlanCode   *string          `json:"target_plan_code,omitempty"`
}

type Item struct {
	ID                   uuid.UUID       `json:"id"`
	Kind                 string          `json:"kind"`
	Name                 Bilingual       `json:"name"`
	Description          Bilingual       `json:"description"`
	ExchangePrice        business.Amount `json:"exchange_price"`
	ActivationTTLSeconds int64           `json:"activation_ttl_seconds"`
	Listed               bool            `json:"listed"`
	Effect               ItemEffect      `json:"effect"`
}

type CheckinValues struct {
	BasePoints       business.Amount `json:"base_points"`
	StepPoints       business.Amount `json:"step_points"`
	CapPoints        business.Amount `json:"cap_points"`
	NormalExperience business.Amount `json:"normal_experience"`
}

type Checkin struct {
	Current CheckinValues  `json:"current"`
	Pending *CheckinValues `json:"pending,omitempty"`
}

type Reward struct {
	Points           business.Amount `json:"points"`
	Experience       business.Amount `json:"experience,omitempty"`
	ItemDefinitionID *uuid.UUID      `json:"item_definition_id,omitempty"`
	ItemCount        int             `json:"item_count,omitempty"`
}

type Level struct {
	SourceID      *uuid.UUID      `json:"source_id,omitempty"`
	LevelNumber   int             `json:"level_number"`
	MinExperience business.Amount `json:"min_experience"`
	RewardEnabled bool            `json:"reward_enabled"`
	Reward        Reward          `json:"reward"`
}

type Achievement struct {
	ID          uuid.UUID  `json:"id"`
	Kind        string     `json:"kind"`
	Threshold   int64      `json:"threshold"`
	Enabled     bool       `json:"enabled"`
	Name        Bilingual  `json:"name"`
	Title       Bilingual  `json:"title"`
	Description *Bilingual `json:"description,omitempty"`
	Reward      Reward     `json:"reward"`
}

// MarshalJSON keeps experience present even when it is zero. Achievement
// reward experience is required, while level rewards do not admit that key.
func (a Achievement) MarshalJSON() ([]byte, error) {
	type achievementReward struct {
		Points           business.Amount `json:"points"`
		Experience       business.Amount `json:"experience"`
		ItemDefinitionID *uuid.UUID      `json:"item_definition_id,omitempty"`
		ItemCount        int             `json:"item_count,omitempty"`
	}
	return json.Marshal(struct {
		ID          uuid.UUID         `json:"id"`
		Kind        string            `json:"kind"`
		Threshold   int64             `json:"threshold"`
		Enabled     bool              `json:"enabled"`
		Name        Bilingual         `json:"name"`
		Title       Bilingual         `json:"title"`
		Description *Bilingual        `json:"description,omitempty"`
		Reward      achievementReward `json:"reward"`
	}{a.ID, a.Kind, a.Threshold, a.Enabled, a.Name, a.Title, a.Description, achievementReward{a.Reward.Points, a.Reward.Experience, a.Reward.ItemDefinitionID, a.Reward.ItemCount}})
}

type Counts struct {
	Added     int `json:"added"`
	Updated   int `json:"updated"`
	Removed   int `json:"removed"`
	Unchanged int `json:"unchanged"`
}

type FieldChange struct {
	Field  string `json:"field"`
	Before any    `json:"before"`
	After  any    `json:"after"`
}

type Change struct {
	Action           string        `json:"action"`
	Kind             string        `json:"kind"`
	Identity         string        `json:"identity"`
	Label            string        `json:"label"`
	Fields           []FieldChange `json:"fields"`
	CredentialAction *string       `json:"credential_action"`
}

type TargetRef struct {
	Kind     string `json:"kind"`
	Identity string `json:"identity"`
	Label    string `json:"label"`
}
type Blocker struct {
	Code           string    `json:"code"`
	SourceCategory string    `json:"source_category"`
	SourceKind     string    `json:"source_kind"`
	SourceIdentity *string   `json:"source_identity"`
	SourceLabel    string    `json:"source_label"`
	Target         TargetRef `json:"target"`
	Field          string    `json:"field"`
}

type ItemRef struct {
	Kind     string `json:"kind"`
	Identity string `json:"identity"`
}

type Notice struct {
	Code    string   `json:"code"`
	ItemRef *ItemRef `json:"item_ref"`
	Field   *string  `json:"field"`
}

type Effects struct {
	BaseUsers              int     `json:"base_users"`
	ActiveTrialUsers       int     `json:"active_trial_users"`
	ModelCardInstances     int     `json:"model_card_instances"`
	AchievedAwards         int     `json:"achieved_awards"`
	ClaimedAwards          int     `json:"claimed_awards"`
	MayChangeEffectivePlan bool    `json:"may_change_effective_plan"`
	MayDowngrade           bool    `json:"may_downgrade"`
	UsageReset             bool    `json:"usage_reset"`
	TrialDatesChanged      bool    `json:"trial_dates_changed"`
	HistoryPreserved       bool    `json:"history_preserved"`
	InFlightPolicy         string  `json:"in_flight_policy"`
	CheckinSource          *string `json:"checkin_source"`
	TargetLearningDay      *string `json:"target_learning_day"`
	CheckinEffectiveDay    *string `json:"checkin_effective_day"`
	MasteryApplies         *string `json:"mastery_applies"`
}

type Preview struct {
	Category         Category   `json:"category"`
	SchemaVersion    int        `json:"schema_version"`
	CanCommit        bool       `json:"can_commit"`
	OperationID      *uuid.UUID `json:"operation_id"`
	PreviewToken     *string    `json:"preview_token"`
	BaselineRevision string     `json:"baseline_revision"`
	CreatedAt        time.Time  `json:"created_at"`
	CommitNotAfter   *time.Time `json:"commit_not_after"`
	RetainUntil      *time.Time `json:"retain_until"`
	Counts           Counts     `json:"counts"`
	Changes          []Change   `json:"changes"`
	Blockers         []Blocker  `json:"blockers"`
	Effects          Effects    `json:"effects"`
	Warnings         []Notice   `json:"warnings"`
	DefaultsApplied  []Notice   `json:"defaults_applied"`
}

type Result struct {
	OperationID      uuid.UUID `json:"operation_id"`
	Category         Category  `json:"category"`
	Status           string    `json:"status"`
	ReasonCode       *string   `json:"reason_code"`
	BaselineRevision string    `json:"baseline_revision"`
	ResultRevision   string    `json:"result_revision"`
	CurrentRevision  string    `json:"current_revision"`
	Superseded       bool      `json:"superseded"`
	Counts           Counts    `json:"counts"`
	EffectiveDay     *string   `json:"effective_day"`
	ResolvedAt       time.Time `json:"resolved_at"`
	CommitNotAfter   time.Time `json:"commit_not_after"`
	RetainUntil      time.Time `json:"retain_until"`
}

type Current struct {
	Category      Category  `json:"category"`
	Revision      string    `json:"revision"`
	ReadAt        time.Time `json:"read_at"`
	Configuration Data      `json:"configuration"`
}

type FieldError struct{ Field, Code string }
type ValidationError struct{ Fields []FieldError }

func (e *ValidationError) Error() string { return "configuration validation failed" }
func (e *ValidationError) Add(field, code string) {
	e.Fields = append(e.Fields, FieldError{field, code})
}
