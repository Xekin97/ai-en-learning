package entitlement

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/dbgen"
	"wordweave/internal/identity"
)

var ErrForbidden = errors.New("generation is not available for this actor")

type Model struct {
	ID          string
	Name        string
	Description *string
}

type Quota struct {
	Kind        string
	Limit       *int
	Remaining   *int
	WindowHours int
	RefreshesAt *time.Time
}

type Options struct {
	Models           []Model
	MeaningLanguages []string
	Scenarios        []string
	Lengths          []string
	MaxEntries       int
	CanGenerate      bool
	Reason           *string
	Quota            Quota
}

type Service struct {
	app *dbgen.Queries
	ai  *dbgen.Queries
}

func NewService(appPool, aiPool *pgxpool.Pool) *Service {
	return &Service{app: dbgen.New(appPool), ai: dbgen.New(aiPool)}
}

func (s *Service) Options(ctx context.Context, actor identity.Actor) (Options, error) {
	groupCode := actor.GroupCode
	if actor.IsVisitor() {
		groupCode = "visitor"
	}
	if actor.IsAdmin() || groupCode == "" {
		return Options{}, ErrForbidden
	}
	group, err := s.app.GetEntitlementGroup(ctx, groupCode)
	if err != nil {
		return Options{}, fmt.Errorf("read entitlement group: %w", err)
	}
	modelRows, err := s.app.ListGroupModels(ctx, groupCode)
	if err != nil {
		return Options{}, fmt.Errorf("list group models: %w", err)
	}
	lengths, err := s.app.ListGroupLengths(ctx, groupCode)
	if err != nil {
		return Options{}, fmt.Errorf("list group lengths: %w", err)
	}
	credentialConfigured, err := s.ai.HasOpenRouterCredential(ctx)
	if err != nil {
		return Options{}, fmt.Errorf("read credential status: %w", err)
	}

	models := make([]Model, 0, len(modelRows))
	for _, row := range modelRows {
		var description *string
		if row.Description.Valid {
			value := row.Description.String
			description = &value
		}
		models = append(models, Model{ID: row.ID.String(), Name: row.DisplayName, Description: description})
	}

	quota, active, err := s.quota(ctx, actor, group.RollingQuotaLimit)
	if err != nil {
		return Options{}, err
	}
	var reason *string
	setReason := func(value string) {
		if reason == nil {
			reason = &value
		}
	}
	if !credentialConfigured {
		setReason("credential_missing")
	}
	if len(models) == 0 {
		setReason("no_models")
	}
	if len(lengths) == 0 {
		setReason("no_lengths")
	}
	if quota.Kind == "limited" && quota.Limit != nil && *quota.Limit == 0 {
		setReason("quota_disabled")
	} else if quota.Kind == "limited" && quota.Remaining != nil && *quota.Remaining == 0 {
		setReason("quota_exhausted")
	}
	if active {
		setReason("generation_in_progress")
	}

	return Options{
		Models: models, MeaningLanguages: []string{"zh", "en", "ja"},
		Scenarios: []string{"discussion", "story", "business", "news"},
		Lengths:   lengths, MaxEntries: int(group.MaxEntriesPerRun),
		CanGenerate: reason == nil, Reason: reason, Quota: quota,
	}, nil
}

func (s *Service) quota(ctx context.Context, actor identity.Actor, limitValue pgtype.Int4) (Quota, bool, error) {
	if !limitValue.Valid {
		active, err := s.active(ctx, actor)
		return Quota{Kind: "unlimited", WindowHours: 24}, active, err
	}
	limit := int(limitValue.Int32)
	used := 0
	var oldestUnix int64
	var active bool
	var err error
	if actor.IsVisitor() {
		usage, usageErr := s.app.CountVisitorRollingUsage(ctx, uuid.NullUUID{UUID: actor.ID, Valid: true})
		if usageErr != nil {
			return Quota{}, false, fmt.Errorf("read visitor quota usage: %w", usageErr)
		}
		used, oldestUnix = int(usage.Used), usage.OldestChargeUnix
		active, err = s.app.HasActiveVisitorGeneration(ctx, uuid.NullUUID{UUID: actor.ID, Valid: true})
	} else {
		account, accountErr := s.app.FindAccountByID(ctx, actor.ID)
		if accountErr != nil {
			return Quota{}, false, fmt.Errorf("read quota account: %w", accountErr)
		}
		usage, usageErr := s.app.CountAccountRollingUsage(ctx, dbgen.CountAccountRollingUsageParams{QuotaResetAt: account.QuotaResetAt, AccountID: uuid.NullUUID{UUID: actor.ID, Valid: true}})
		if usageErr != nil {
			return Quota{}, false, fmt.Errorf("read account quota usage: %w", usageErr)
		}
		used, oldestUnix = int(usage.Used), usage.OldestChargeUnix
		active, err = s.app.HasActiveAccountGeneration(ctx, uuid.NullUUID{UUID: actor.ID, Valid: true})
	}
	if err != nil {
		return Quota{}, false, fmt.Errorf("read active generation: %w", err)
	}
	remaining := limit - used
	if remaining < 0 {
		remaining = 0
	}
	var refreshesAt *time.Time
	if limit > 0 && used > 0 && oldestUnix > 0 {
		value := time.Unix(oldestUnix, 0).Add(24 * time.Hour)
		refreshesAt = &value
	}
	return Quota{Kind: "limited", Limit: &limit, Remaining: &remaining, WindowHours: 24, RefreshesAt: refreshesAt}, active, nil
}

func (s *Service) active(ctx context.Context, actor identity.Actor) (bool, error) {
	if actor.IsVisitor() {
		return s.app.HasActiveVisitorGeneration(ctx, uuid.NullUUID{UUID: actor.ID, Valid: true})
	}
	return s.app.HasActiveAccountGeneration(ctx, uuid.NullUUID{UUID: actor.ID, Valid: true})
}
