package generation

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/entitlement"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

type AdminGenerationModel struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
}
type AdminPreviewAvailability struct {
	CanPreview bool    `json:"can_preview"`
	Reason     *string `json:"reason"`
}
type AdminGenerationOptions struct {
	Models            []AdminGenerationModel   `json:"models"`
	MeaningLanguages  []string                 `json:"meaning_languages"`
	Scenarios         []string                 `json:"scenarios"`
	Lengths           []string                 `json:"lengths"`
	VocabularyVersion string                   `json:"vocabulary_version"`
	Revision          string                   `json:"revision"`
	Availability      AdminPreviewAvailability `json:"availability"`
}

func (s *Service) AdminGenerationOptions(ctx context.Context) (AdminGenerationOptions, error) {
	result := AdminGenerationOptions{Models: []AdminGenerationModel{}, MeaningLanguages: []string{"zh", "en", "ja"}, Scenarios: []string{"discussion", "story", "business", "news"}, Lengths: []string{"short", "medium", "long", "xlong"}}
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	var configured, available bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.ai_providers WHERE credential_configured),EXISTS(SELECT 1 FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id WHERE m.enabled AND m.retired_at IS NULL AND p.credential_configured)`).Scan(&configured, &available)
	if err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, `SELECT id,display_name,description FROM wordweave.ai_models WHERE enabled AND retired_at IS NULL ORDER BY created_at,id`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var m AdminGenerationModel
		if err = rows.Scan(&m.ID, &m.Name, &m.Description); err != nil {
			rows.Close()
			return result, err
		}
		result.Models = append(result.Models, m)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return result, err
	}
	snapshot, err := s.queries.WithTx(tx).GetVocabularySnapshot(ctx)
	if err != nil {
		return result, err
	}
	result.VocabularyVersion = "sha256:" + snapshot.Sha256
	result.Revision = business.Revision(s.capabilityKey, "configuration", c.Revision)
	reason := ""
	if !configured {
		reason = "credential_missing"
	} else if len(result.Models) == 0 {
		reason = "no_models"
	} else if !available {
		reason = "credential_missing"
	}
	result.Availability.CanPreview = reason == ""
	if reason != "" {
		result.Availability.Reason = &reason
	}
	return result, nil
}

type PresetCursor struct {
	At       time.Time `json:"at"`
	ID       uuid.UUID `json:"id"`
	Revision string    `json:"revision,omitempty"`
}

func (s *Service) AdminPresets(ctx context.Context, cursor *PresetCursor, limit int) ([]AdminPreset, string, bool, error) {
	result := []AdminPreset{}
	if limit < 1 || limit > 100 {
		return result, "", false, ErrInvalidInput
	}
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return result, "", false, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, "", false, err
	}
	revision := business.Revision(s.capabilityKey, "configuration", c.Revision)
	var at *time.Time
	var id *uuid.UUID
	if cursor != nil {
		if cursor.Revision != revision {
			return result, revision, false, &business.RevisionConflict{Current: revision}
		}
		at = &cursor.At
		id = &cursor.ID
	}
	rows, err := tx.Query(ctx, `SELECT id FROM wordweave.presets WHERE $1::timestamptz IS NULL OR updated_at<$1 OR (updated_at=$1 AND id>$2) ORDER BY updated_at DESC,id LIMIT $3`, at, id, limit+1)
	if err != nil {
		return result, revision, false, err
	}
	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return result, revision, false, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return result, revision, false, err
	}
	more := len(ids) > limit
	if more {
		ids = ids[:limit]
	}
	for _, id := range ids {
		p, e := s.adminPreset(ctx, tx, id)
		if e != nil {
			return result, revision, false, e
		}
		result = append(result, p)
	}
	return result, revision, more, nil
}
func (s *Service) publicPreset(ctx context.Context, tx pgx.Tx, id uuid.UUID) (PublicPreset, error) {
	var vid uuid.UUID
	err := tx.QueryRow(ctx, `SELECT published_version_id FROM wordweave.presets WHERE id=$1 AND listed`, id).Scan(&vid)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicPreset{}, ErrPresetUnavailable
	}
	if err != nil {
		return PublicPreset{}, err
	}
	v, err := readPresetVersion(ctx, tx, vid)
	if err != nil {
		return PublicPreset{}, err
	}
	if v.Payload == nil {
		return PublicPreset{}, ErrPreviewRequired
	}
	result := PublicPreset{ID: id, Title: v.Title, PublishedVersion: vid, VersionCreatedAt: v.CreatedAt, Configuration: v.Configuration, Sample: UserResult(*v.Payload)}
	var credential bool
	if err = tx.QueryRow(ctx, `SELECT p.credential_configured FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id WHERE m.id=$1`, v.Input.ModelID).Scan(&credential); err != nil {
		return PublicPreset{}, err
	}
	reason := ""
	if !v.Enabled {
		reason = "model_unavailable"
	} else if !credential {
		reason = "credential_missing"
	} else {
		in := PresetInput{v.Title, v.Input}
		_, _, err = s.validatePreset(ctx, tx, &in)
		if errors.Is(err, ErrInvalidInput) || errors.Is(err, ErrPresetModelUnavailable) {
			reason = "configuration_invalid"
		} else if err != nil {
			return result, err
		}
	}
	result.Availability.CanGenerate = reason == ""
	if reason != "" {
		result.Availability.Reason = &reason
	}
	return result, nil
}
func (s *Service) PublicPresets(ctx context.Context, language string, cursor *PresetCursor, limit int) ([]PublicPreset, bool, error) {
	result := []PublicPreset{}
	if limit < 1 || limit > 100 || (language != "" && !validMeaningLanguage(language)) {
		return result, false, ErrInvalidInput
	}
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return result, false, err
	}
	defer tx.Rollback(ctx)
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return result, false, err
	}
	var at *time.Time
	var id *uuid.UUID
	if cursor != nil {
		at = &cursor.At
		id = &cursor.ID
	}
	rows, err := tx.Query(ctx, publicPresetPageSQL, language, at, id, limit+1)
	if err != nil {
		return result, false, err
	}
	ids := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return result, false, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return result, false, err
	}
	more := len(ids) > limit
	if more {
		ids = ids[:limit]
	}
	for _, id := range ids {
		p, e := s.publicPreset(ctx, tx, id)
		if e != nil {
			return result, false, e
		}
		result = append(result, p)
	}
	return result, more, nil
}

type PresetDetail struct {
	Preset      PublicPreset
	Quota       entitlement.Quota
	Extra       entitlement.ExtraQuota
	CanStart    bool
	BlockReason *string
}

func (s *Service) PresetDetail(ctx context.Context, actor identity.Actor, id uuid.UUID) (PresetDetail, error) {
	var result PresetDetail
	if actor.IsAdmin() {
		return result, ErrForbidden
	}
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	if _, _, err = lockActor(ctx, tx, actor); err != nil {
		return result, err
	}
	result.Preset, err = s.publicPreset(ctx, tx, id)
	if err != nil {
		return result, err
	}
	p, err := entitlement.Resolve(ctx, tx, actor, c.Now)
	if err != nil {
		return result, err
	}
	result.Quota, err = entitlement.Usage(ctx, tx, actor, p, c.Now)
	if err != nil {
		return result, err
	}
	result.Extra, err = entitlement.Extra(ctx, tx, actor, c.Now)
	if err != nil {
		return result, err
	}
	reason := ""
	if result.Preset.Availability.Reason != nil {
		reason = *result.Preset.Availability.Reason
	} else if result.Quota.Remaining != nil && *result.Quota.Remaining == 0 && result.Extra.Remaining == 0 {
		reason = "quota_exhausted"
		if *result.Quota.Limit == 0 {
			reason = "quota_disabled"
		}
	} else {
		var active bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.generation_runs WHERE call_status='active' AND (account_id=$1 OR visitor_id=$1))`, actor.ID).Scan(&active)
		if err != nil {
			return result, err
		}
		if active {
			reason = "generation_in_progress"
		}
	}
	result.CanStart = reason == ""
	if reason != "" {
		result.BlockReason = &reason
	}
	return result, nil
}

const publicPresetPageSQL = `SELECT p.id FROM wordweave.presets p JOIN wordweave.preset_versions v ON v.id=p.published_version_id WHERE p.listed AND ($1='' OR v.meaning_language=$1) AND ($2::timestamptz IS NULL OR v.created_at<$2 OR (v.created_at=$2 AND p.id>$3)) ORDER BY v.created_at DESC,p.id LIMIT $4`
