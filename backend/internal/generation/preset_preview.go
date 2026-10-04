package generation

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

type PreviewRun struct {
	Run
	PresetID, VersionID uuid.UUID
	ConfigHash          []byte
}
type previewCapability struct {
	Run   uuid.UUID
	Nonce string
}

func (s *Service) PreviewRegistry() *Registry { return s.previewRegistry }
func (s *Service) StartPreview(ctx context.Context, actor identity.Actor, id, version uuid.UUID) (PreviewRun, error) {
	var result PreviewRun
	if !actor.IsAdmin() {
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
	var adminID uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE id=$1 AND role='admin' FOR KEY SHARE`, actor.ID).Scan(&adminID); err != nil {
		return result, err
	}
	var draft uuid.UUID
	err = tx.QueryRow(ctx, `SELECT draft_version_id FROM wordweave.presets WHERE id=$1`, id).Scan(&draft)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, ErrPresetUnavailable
	}
	if err != nil {
		return result, err
	}
	if draft != version {
		return result, &business.RevisionConflict{Current: business.Revision(s.capabilityKey, "configuration", c.Revision)}
	}
	v, err := readPresetVersion(ctx, tx, draft)
	if err != nil {
		return result, err
	}
	if !v.Enabled {
		return result, ErrPresetModelUnavailable
	}
	in := PresetInput{v.Title, v.Input}
	if _, _, err = s.validatePreset(ctx, tx, &in); err != nil {
		return result, err
	}
	var provider string
	if err = tx.QueryRow(ctx, `SELECT provider_model_id FROM wordweave.ai_models WHERE id=$1`, v.Input.ModelID).Scan(&provider); err != nil {
		return result, err
	}
	minimum, _ := minimumWords(v.Input.Length)
	spec := ai.GenerationSpec{ModelID: v.Input.ModelID.String(), ProviderModelID: provider, MeaningLanguage: v.Input.MeaningLanguage, Scenario: v.Input.Scenario, LengthCode: v.Input.Length, MinimumWords: minimum, Entries: v.Input.Entries, PromptVersion: ai.PromptVersion}
	if err = s.credentials.BindSpec(ctx, &spec); err != nil {
		if errors.Is(err, ai.ErrCredentialMissing) {
			return result, ErrPresetCredentialMissing
		}
		return result, err
	}
	var runID uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO wordweave.preset_preview_runs(preset_id,version_id,requested_by,model_id,model_name_snapshot,provider_model_snapshot,config_hash,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, id, version, actor.ID, v.Input.ModelID, v.Configuration.Model.Name, provider, v.Hash, c.Now).Scan(&runID)
	if err != nil {
		return result, err
	}
	nonce, err := security.RandomToken()
	if err != nil {
		return result, err
	}
	token, err := security.NewCursorSigner(s.capabilityKey).Encode("preset-preview:"+actor.ID.String(), previewCapability{runID, nonce})
	if err != nil {
		return result, err
	}
	if err = tx.Commit(ctx); err != nil {
		return result, err
	}
	spec.RunID = runID.String()
	result = PreviewRun{Run: Run{runID, token, spec}, PresetID: id, VersionID: version, ConfigHash: v.Hash}
	s.previewRegistry.Register(runID, actor, token)
	return result, nil
}
func (s *Service) CompletePreview(ctx context.Context, run PreviewRun, batch ai.ValidatedBatch) (UsageSummary, error) {
	if err := ai.ValidateSnapshot(batch); err != nil {
		return UsageSummary{}, err
	}
	payload, err := json.Marshal(batch)
	if err != nil {
		return UsageSummary{}, err
	}
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return UsageSummary{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return UsageSummary{}, err
	}
	// Publishing takes the exclusive configuration lock. A completed preview can
	// fill an empty association but can never replace a published sample in place.
	var presetID uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM wordweave.presets WHERE id=$1 FOR UPDATE`, run.PresetID).Scan(&presetID); err != nil {
		return UsageSummary{}, err
	}
	tag, err := tx.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET status='valid',completed_at=$2 WHERE id=$1 AND version_id=$3 AND config_hash=$4 AND status='active'`, run.ID, c.Now, run.VersionID, run.ConfigHash)
	if err != nil {
		return UsageSummary{}, err
	}
	if tag.RowsAffected() != 1 {
		return UsageSummary{}, ErrTerminalRace
	}
	var preview uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO wordweave.preset_previews(preset_id,run_id,config_hash,validated_payload,validated_at,validator_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, run.PresetID, run.ID, run.ConfigHash, payload, c.Now, batch.ValidatorVersion).Scan(&preview)
	if err != nil {
		return UsageSummary{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.preset_versions SET preview_id=$2 WHERE id=$1 AND preview_id IS NULL AND config_hash=$3`, run.VersionID, preview, run.ConfigHash)
	if err != nil {
		return UsageSummary{}, err
	}
	u, err := readUsage(ctx, tx, run.ID)
	if err != nil {
		return u, err
	}
	if err = tx.Commit(ctx); err != nil {
		return u, err
	}
	s.previewRegistry.SetStatus(run.ID, "valid")
	return u, nil
}
func (s *Service) SettlePreview(ctx context.Context, id uuid.UUID, desired, category string) (string, error) {
	if desired != "failed" && desired != "cancelled" {
		return "", ErrInvalidInput
	}
	tx, err := s.app.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return "", err
	}
	var reason *string
	if desired == "failed" {
		reason = &category
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET status=$2,completed_at=$3,failure_category=$4 WHERE id=$1 AND status='active'`, id, desired, c.Now, reason)
	if err != nil {
		return "", err
	}
	var status string
	if err = tx.QueryRow(ctx, `SELECT status FROM wordweave.preset_preview_runs WHERE id=$1`, id).Scan(&status); err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	s.previewRegistry.SetStatus(id, status)
	return status, nil
}
func (s *Service) CancelPreview(ctx context.Context, actor identity.Actor, id uuid.UUID, token string) (string, error) {
	var cap previewCapability
	if !actor.IsAdmin() || security.NewCursorSigner(s.capabilityKey).Decode("preset-preview:"+actor.ID.String(), token, &cap) != nil || cap.Run != id || cap.Nonce == "" {
		return "", ErrRunNotFound
	}
	var status string
	var end *time.Time
	err := s.app.QueryRow(ctx, `SELECT status,completed_at FROM wordweave.preset_preview_runs WHERE id=$1 AND requested_by=$2`, id, actor.ID).Scan(&status, &end)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrRunNotFound
	}
	if err != nil {
		return "", err
	}
	if end != nil && time.Now().After(end.Add(TerminalTokenRetention)) {
		return "", ErrRunNotFound
	}
	if status != "active" {
		return status, nil
	}
	_, cancel, _ := s.previewRegistry.Authenticate(id, actor, token)
	status, err = s.SettlePreview(ctx, id, "cancelled", "")
	if err == nil && cancel != nil {
		cancel()
	}
	return status, err
}

// SettleActivePreviews is used only during singleton startup/shutdown recovery;
// there are no user charges or learning facts to refund or create.
func SettleActivePreviews(ctx context.Context, pool *pgxpool.Pool, reason string) (int64, error) {
	var total int64
	for {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return total, err
		}
		c, err := business.LockConfiguration(ctx, tx, false)
		if err != nil {
			tx.Rollback(ctx)
			return total, err
		}
		tag, err := tx.Exec(ctx, `WITH active AS(SELECT id FROM wordweave.preset_preview_runs WHERE status='active' ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED) UPDATE wordweave.preset_preview_runs r SET status='failed',completed_at=$1,failure_category=$2 FROM active a WHERE r.id=a.id`, c.Now, reason)
		if err != nil {
			tx.Rollback(ctx)
			return total, err
		}
		if err = tx.Commit(ctx); err != nil {
			return total, err
		}
		total += tag.RowsAffected()
		if tag.RowsAffected() == 0 {
			return total, nil
		}
	}
}
