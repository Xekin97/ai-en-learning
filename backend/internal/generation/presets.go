package generation

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/ai"
	"wordweave/internal/dbgen"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

// Preset errors are distinct from ordinary user configuration/permission errors.
type PresetError string

func (e PresetError) Error() string { return string(e) }

const (
	ErrPresetUnavailable       PresetError = "preset_unavailable"
	ErrPresetChanged           PresetError = "preset_changed"
	ErrPreviewRequired         PresetError = "preview_required"
	ErrPresetModelUnavailable  PresetError = "model_unavailable"
	ErrPresetCredentialMissing PresetError = "credential_missing"
)

const ErrPresetInvalidReference PresetError = "preset_invalid_reference"

type PresetConfigurationInput struct {
	ModelID         uuid.UUID `json:"model_id"`
	Entries         []string  `json:"entries"`
	MeaningLanguage string    `json:"meaning_language"`
	Scenario        string    `json:"scenario"`
	Length          string    `json:"length"`
}
type PresetInput struct {
	Title         string                   `json:"title"`
	Configuration PresetConfigurationInput `json:"configuration"`
}
type PresetModel struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}
type PresetConfiguration struct {
	Model           PresetModel `json:"model"`
	Entries         []string    `json:"entries"`
	MeaningLanguage string      `json:"meaning_language"`
	Scenario        string      `json:"scenario"`
	Length          string      `json:"length"`
}

// Only the validated user-facing fields cross the HTTP boundary.
type PublicTarget struct {
	Entry        string          `json:"entry"`
	EntryMeaning string          `json:"entry_meaning"`
	HintPhrase   string          `json:"hint_phrase"`
	HintBlanks   []ai.Span       `json:"hint_blanks"`
	Occurrences  []ai.Occurrence `json:"occurrences"`
}
type PublicResult struct {
	Passage string         `json:"passage"`
	Tags    []string       `json:"tags"`
	Targets []PublicTarget `json:"targets"`
}

func UserResult(b ai.ValidatedBatch) PublicResult {
	p := PublicResult{b.Passage, append([]string{}, b.Tags...), make([]PublicTarget, 0, len(b.Targets))}
	for _, t := range b.Targets {
		spans := make([]ai.Span, 0, len(t.HintOccurrences))
		for _, h := range t.HintOccurrences {
			spans = append(spans, ai.Span{Start: h.Start, End: h.End})
		}
		p.Targets = append(p.Targets, PublicTarget{t.Entry, t.EntryMeaning, t.HintPhrase, spans, append([]ai.Occurrence{}, t.PassageOccurrences...)})
	}
	return p
}

type PresetAvailability struct {
	CanGenerate bool    `json:"can_generate"`
	Reason      *string `json:"reason"`
}
type PublicPreset struct {
	ID               uuid.UUID           `json:"id"`
	Title            string              `json:"title"`
	PublishedVersion uuid.UUID           `json:"published_version"`
	VersionCreatedAt time.Time           `json:"version_created_at"`
	Configuration    PresetConfiguration `json:"configuration"`
	Sample           PublicResult        `json:"sample"`
	Availability     PresetAvailability  `json:"availability"`
}
type PublishedPreset struct {
	Title            string              `json:"title"`
	Configuration    PresetConfiguration `json:"configuration"`
	Sample           PublicResult        `json:"sample"`
	VersionCreatedAt time.Time           `json:"version_created_at"`
}
type PresetPreview struct {
	RunID       uuid.UUID    `json:"preview_run_id"`
	CompletedAt time.Time    `json:"completed_at"`
	Result      PublicResult `json:"result"`
	Usage       UsageSummary `json:"usage"`
}
type AdminPreset struct {
	ID                    uuid.UUID           `json:"id"`
	DraftVersion          uuid.UUID           `json:"draft_version"`
	PublishedVersion      *uuid.UUID          `json:"published_version"`
	Listed                bool                `json:"listed"`
	Title                 string              `json:"title"`
	Configuration         PresetConfiguration `json:"configuration"`
	DraftState            string              `json:"draft_state"`
	HasUnpublishedChanges bool                `json:"has_unpublished_changes"`
	Preview               *PresetPreview      `json:"preview"`
	Published             *PublishedPreset    `json:"published"`
	UpdatedAt             time.Time           `json:"-"`
}
type presetVersion struct {
	ID, PresetID     uuid.UUID
	Number           int
	Title            string
	Input            PresetConfigurationInput
	Configuration    PresetConfiguration
	Hash             []byte
	CreatedAt        time.Time
	PreviewID        *uuid.UUID
	Payload          *ai.ValidatedBatch
	PreviewRun       *uuid.UUID
	PreviewCompleted *time.Time
	Enabled          bool
}

func readPresetVersion(ctx context.Context, tx pgx.Tx, id uuid.UUID) (presetVersion, error) {
	var v presetVersion
	var config, payload []byte
	err := tx.QueryRow(ctx, presetVersionSQL, id).Scan(&v.ID, &v.PresetID, &v.Number, &v.Title, &config, &v.Hash, &v.CreatedAt, &v.PreviewID, &v.Configuration.Model.Name, &v.Enabled, &payload, &v.PreviewRun, &v.PreviewCompleted)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrPresetUnavailable
	}
	if err != nil {
		return v, err
	}
	if err = json.Unmarshal(config, &v.Input); err != nil {
		return v, err
	}
	v.Configuration.Model.ID = v.Input.ModelID
	v.Configuration.Entries = v.Input.Entries
	v.Configuration.MeaningLanguage = v.Input.MeaningLanguage
	v.Configuration.Scenario = v.Input.Scenario
	v.Configuration.Length = v.Input.Length
	if len(payload) > 0 {
		v.Payload = &ai.ValidatedBatch{}
		if err = json.Unmarshal(payload, v.Payload); err != nil {
			return v, err
		}
	}
	return v, nil
}
func (s *Service) adminPreset(ctx context.Context, tx pgx.Tx, id uuid.UUID) (AdminPreset, error) {
	var p AdminPreset
	err := tx.QueryRow(ctx, `SELECT id,draft_version_id,published_version_id,listed,updated_at FROM wordweave.presets WHERE id=$1`, id).Scan(&p.ID, &p.DraftVersion, &p.PublishedVersion, &p.Listed, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrPresetUnavailable
	}
	if err != nil {
		return p, err
	}
	d, err := readPresetVersion(ctx, tx, p.DraftVersion)
	if err != nil {
		return p, err
	}
	p.Title = d.Title
	p.Configuration = d.Configuration
	p.DraftState = "needs_preview"
	p.HasUnpublishedChanges = p.PublishedVersion == nil || *p.PublishedVersion != p.DraftVersion
	if d.Payload != nil {
		u, err := readUsage(ctx, tx, *d.PreviewRun)
		if err != nil {
			return p, err
		}
		p.Preview = &PresetPreview{*d.PreviewRun, *d.PreviewCompleted, UserResult(*d.Payload), u}
		p.DraftState = "preview_ready"
	}
	if p.PublishedVersion != nil {
		v, err := readPresetVersion(ctx, tx, *p.PublishedVersion)
		if err != nil {
			return p, err
		}
		if v.Payload == nil {
			return p, errors.New("published preset without validated sample")
		}
		p.Published = &PublishedPreset{v.Title, v.Configuration, UserResult(*v.Payload), v.CreatedAt}
	}
	return p, nil
}
func (s *Service) AdminPreset(ctx context.Context, id uuid.UUID) (AdminPreset, string, error) {
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return AdminPreset{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return AdminPreset{}, "", err
	}
	p, err := s.adminPreset(ctx, tx, id)
	return p, business.Revision(s.capabilityKey, "configuration", c.Revision), err
}
func (s *Service) validatePreset(ctx context.Context, tx pgx.Tx, in *PresetInput) ([]dbgen.ResolveVocabularyEntriesRow, []byte, error) {
	in.Title = strings.TrimSpace(in.Title)
	if !utf8.ValidString(in.Title) || in.Title == "" || utf8.RuneCountInString(in.Title) > 200 || len(in.Configuration.Entries) == 0 || hasDuplicate(in.Configuration.Entries) || !validMeaningLanguage(in.Configuration.MeaningLanguage) || !validScenario(in.Configuration.Scenario) {
		return nil, nil, ErrInvalidInput
	}
	if _, ok := minimumWords(in.Configuration.Length); !ok {
		return nil, nil, ErrInvalidInput
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.ai_models WHERE id=$1 AND retired_at IS NULL)`, in.Configuration.ModelID).Scan(&exists); err != nil {
		return nil, nil, err
	}
	if !exists {
		return nil, nil, ErrPresetModelUnavailable
	}
	entries, err := s.queries.WithTx(tx).ResolveVocabularyEntries(ctx, in.Configuration.Entries)
	if err != nil {
		return nil, nil, err
	}
	if len(entries) != len(in.Configuration.Entries) {
		return nil, nil, ErrInvalidInput
	}
	raw, err := json.Marshal(in.Configuration)
	if err != nil {
		return nil, nil, err
	}
	h := sha256.Sum256(raw)
	return entries, h[:], nil
}
func (s *Service) requirePresetRevision(c business.Configuration, expected string) error {
	if !business.MatchRevision(s.capabilityKey, "configuration", c.Revision, expected) {
		return &business.RevisionConflict{Current: business.Revision(s.capabilityKey, "configuration", c.Revision)}
	}
	return nil
}

// Draft versions are immutable. Only the preview association may be filled in.
func (s *Service) SavePreset(ctx context.Context, actor identity.Actor, id uuid.UUID, in PresetInput, expected string) (AdminPreset, string, error) {
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return AdminPreset{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return AdminPreset{}, "", err
	}
	create := id == uuid.Nil
	if !create {
		if err = s.requirePresetRevision(c, expected); err != nil {
			return AdminPreset{}, "", err
		}
	}
	entries, hash, err := s.validatePreset(ctx, tx, &in)
	if err != nil {
		return AdminPreset{}, "", err
	}
	version := uuid.New()
	number := 1
	var preview *uuid.UUID
	if create {
		id = uuid.New()
		_, err = tx.Exec(ctx, `INSERT INTO wordweave.presets(id,draft_version_id,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$4)`, id, version, actor.ID, c.Now)
	} else {
		var oldID uuid.UUID
		err = tx.QueryRow(ctx, `SELECT draft_version_id FROM wordweave.presets WHERE id=$1 FOR UPDATE`, id).Scan(&oldID)
		if errors.Is(err, pgx.ErrNoRows) {
			return AdminPreset{}, "", ErrPresetUnavailable
		}
		if err != nil {
			return AdminPreset{}, "", err
		}
		old, e := readPresetVersion(ctx, tx, oldID)
		if e != nil {
			return AdminPreset{}, "", e
		}
		number = old.Number + 1
		if bytes.Equal(old.Hash, hash) {
			preview = old.PreviewID
		}
	}
	if err != nil {
		return AdminPreset{}, "", err
	}
	raw, err := json.Marshal(in.Configuration)
	if err != nil {
		return AdminPreset{}, "", err
	}
	_, err = tx.Exec(ctx, `INSERT INTO wordweave.preset_versions(id,preset_id,version_no,title,model_id,meaning_language,scenario,length_code,configuration,config_hash,preview_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, version, id, number, in.Title, in.Configuration.ModelID, in.Configuration.MeaningLanguage, in.Configuration.Scenario, in.Configuration.Length, raw, hash, preview, c.Now)
	if err != nil {
		return AdminPreset{}, "", err
	}
	for i, e := range entries {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.preset_version_entries(version_id,vocabulary_entry_id,input_order) VALUES($1,$2,$3)`, version, e.ID, i); err != nil {
			return AdminPreset{}, "", err
		}
	}
	if !create {
		_, err = tx.Exec(ctx, `UPDATE wordweave.presets SET draft_version_id=$2,revision=revision+1,updated_by=$3,updated_at=$4 WHERE id=$1`, id, version, actor.ID, c.Now)
		if err != nil {
			return AdminPreset{}, "", err
		}
	}
	return s.finishPreset(ctx, tx, id)
}
func (s *Service) finishPreset(ctx context.Context, tx pgx.Tx, id uuid.UUID) (AdminPreset, string, error) {
	rev, err := business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return AdminPreset{}, "", err
	}
	p, err := s.adminPreset(ctx, tx, id)
	if err != nil {
		return p, "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return AdminPreset{}, "", err
	}
	return p, business.Revision(s.capabilityKey, "configuration", rev), nil
}
func (s *Service) PublishPreset(ctx context.Context, actor identity.Actor, id, version uuid.UUID, expected string, publish bool) (AdminPreset, string, error) {
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return AdminPreset{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return AdminPreset{}, "", err
	}
	if err = s.requirePresetRevision(c, expected); err != nil {
		return AdminPreset{}, "", err
	}
	var current uuid.UUID
	err = tx.QueryRow(ctx, `SELECT draft_version_id FROM wordweave.presets WHERE id=$1 FOR UPDATE`, id).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminPreset{}, "", ErrPresetUnavailable
	}
	if err != nil {
		return AdminPreset{}, "", err
	}
	if publish {
		if current != version {
			return AdminPreset{}, "", &business.RevisionConflict{Current: business.Revision(s.capabilityKey, "configuration", c.Revision)}
		}
		v, err := readPresetVersion(ctx, tx, current)
		if err != nil {
			return AdminPreset{}, "", err
		}
		if !v.Enabled {
			return AdminPreset{}, "", ErrPresetInvalidReference
		}
		check := PresetInput{v.Title, v.Input}
		if _, _, e := s.validatePreset(ctx, tx, &check); e != nil {
			return AdminPreset{}, "", e
		}
		if v.Payload == nil {
			return AdminPreset{}, "", ErrPreviewRequired
		}
		_, err = tx.Exec(ctx, `UPDATE wordweave.presets SET published_version_id=draft_version_id,listed=true,updated_at=$2,updated_by=$3,revision=revision+1 WHERE id=$1`, id, c.Now, actor.ID)
		if err != nil {
			return AdminPreset{}, "", err
		}
	} else {
		if _, err = tx.Exec(ctx, `UPDATE wordweave.presets SET listed=false,updated_at=$2,updated_by=$3,revision=revision+1 WHERE id=$1`, id, c.Now, actor.ID); err != nil {
			return AdminPreset{}, "", err
		}
	}
	return s.finishPreset(ctx, tx, id)
}

const presetVersionSQL = `SELECT v.id,v.preset_id,v.version_no,v.title,v.configuration,v.config_hash,v.created_at,v.preview_id,m.display_name,m.enabled AND m.retired_at IS NULL,p.validated_payload,p.run_id,p.validated_at FROM wordweave.preset_versions v JOIN wordweave.ai_models m ON m.id=v.model_id LEFT JOIN wordweave.preset_previews p ON p.id=v.preview_id AND p.config_hash=v.config_hash AND EXISTS(SELECT 1 FROM wordweave.preset_preview_runs pr JOIN wordweave.preset_versions original ON original.id=pr.version_id WHERE pr.id=p.run_id AND pr.status='valid' AND original.configuration=v.configuration) WHERE v.id=$1`
