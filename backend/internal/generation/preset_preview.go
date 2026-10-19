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
	"wordweave/internal/capacity"
	"wordweave/internal/entitlement"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

type PreviewRun struct {
	Run
	PresetID, VersionID uuid.UUID
	ConfigHash          []byte
	Mode                string
}
type previewCapability struct {
	Run   uuid.UUID
	Nonce string
}

type PreviewStatusView struct {
	PreviewRunID        uuid.UUID
	Status              string
	DraftVersion        uuid.UUID
	PreviewContentMode  string
	FinalContentVersion *int
	Result              *ai.ValidatedBatch
	ContentOutcome      *string
	CompletionNotice    *string
	Usage               UsageSummary
}

func (s *Service) PreviewRegistry() *Registry { return s.previewRegistry }
func (s *Service) StartPreview(ctx context.Context, actor identity.Actor, id, version uuid.UUID) (PreviewRun, error) {
	return s.startPreview(ctx, actor, id, version, "")
}
func (s *Service) StartPreviewMode(ctx context.Context, actor identity.Actor, id, version uuid.UUID, mode string) (PreviewRun, error) {
	return s.startPreview(ctx, actor, id, version, mode)
}
func (s *Service) startPreview(ctx context.Context, actor identity.Actor, id, version uuid.UUID, mode string) (result PreviewRun, resultErr error) {
	var preflight *capacity.Lease
	if s.capacity != nil {
		var err error
		preflight, err = s.capacity.TryAcquire(capacity.Preflight, "")
		if err != nil {
			return result, ErrGenerationBusy
		}
		defer preflight.Release()
	}
	preflightContext, cancelPreflight := context.WithTimeout(ctx, generationPreflightTimeout)
	defer cancelPreflight()
	ctx = preflightContext
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
	if mode == "" {
		mode = v.PreviewContentMode
	}
	if mode != v.PreviewContentMode {
		return result, &business.RevisionConflict{Current: business.Revision(s.capabilityKey, "configuration", c.Revision)}
	}
	reviewEnabled := mode == "enhanced"
	repairLimit := 0
	if reviewEnabled {
		repairLimit = 1
	}
	in := PresetInput{Title: v.Title, Configuration: v.Input, PreviewContentMode: v.PreviewContentMode}
	if _, _, err = s.validatePreset(ctx, tx, &in); err != nil {
		return result, err
	}
	var provider string
	if err = tx.QueryRow(ctx, `SELECT m.provider_model_id FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id WHERE m.id=$1 AND m.enabled AND m.retired_at IS NULL AND p.retired_at IS NULL`, v.Input.ModelID).Scan(&provider); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return result, ErrPresetModelUnavailable
		}
		return result, err
	}
	minimum, _ := minimumWords(v.Input.Length)
	spec := ai.GenerationSpec{ModelID: v.Input.ModelID.String(), ProviderModelID: provider, MeaningLanguage: v.Input.MeaningLanguage, Scenario: v.Input.Scenario, LengthCode: v.Input.Length, MinimumWords: minimum, Entries: v.Input.Entries, PromptVersion: ai.PromptVersion}
	if err = s.credentials.BindSpec(ctx, &spec); err != nil {
		if errors.Is(err, ai.ErrCredentialMissing) {
			return result, ErrPresetCredentialMissing
		}
		var customError *ai.CustomParameterError
		if errors.As(err, &customError) {
			return result, ErrGenerationConfigurationInvalid
		}
		return result, err
	}
	requestParametersSnapshot, err := ai.RequestParametersSnapshot(spec)
	if err != nil {
		return result, ErrGenerationConfigurationInvalid
	}
	var capacityLease *capacity.Lease
	if s.capacity != nil {
		capacityLease, err = s.capacity.TryAcquire(capacity.Preview, spec.ConnectionCapacityKey())
		if err != nil {
			return result, ErrGenerationBusy
		}
		defer func() {
			if resultErr != nil && capacityLease != nil {
				capacityLease.Release()
			}
		}()
	}
	var runID uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO wordweave.preset_preview_runs(preset_id,version_id,requested_by,model_id,model_name_snapshot,provider_model_snapshot,config_hash,started_at,content_policy_version,configuration_revision_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,pipeline_version_snapshot,model_request_parameters_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,$12,$13) RETURNING id`, id, version, actor.ID, v.Input.ModelID, v.Configuration.Model.Name, provider, v.Hash, c.Now, c.Revision, reviewEnabled, repairLimit, entitlement.PipelineVersion, requestParametersSnapshot).Scan(&runID)
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
		if s.capacity != nil && capacityLease != nil {
			s.capacity.ReleaseUnknown(capacityLease, capacityPendingKey(runID, true))
			capacityLease = nil
		}
		return result, err
	}
	spec.RunID = runID.String()
	result = PreviewRun{Run: Run{ID: runID, Token: token, Spec: spec, Snapshot: RunSnapshot{ConfigurationRevision: business.Revision(s.capabilityKey, "configuration", c.Revision), ContentService: entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: reviewEnabled, ContentRepairLimit: repairLimit}, NativeCorrectionPolicy: entitlement.SystemNativePolicy()}, capacity: capacityLease}, PresetID: id, VersionID: version, ConfigHash: v.Hash, Mode: mode}
	s.previewRegistry.Register(runID, actor, token)
	return result, nil
}
func (s *Service) CompletePreview(ctx context.Context, run PreviewRun, batch ai.ValidatedBatch) (UsageSummary, error) {
	outcome := OutcomeBasic
	version := 1
	if run.Snapshot.ContentService.ContentReviewEnabled {
		outcome = OutcomeReviewPassed
		version = 2
	}
	return s.CompletePreviewPipeline(ctx, run, PipelineResult{Version: version, Batch: batch, Outcome: outcome})
}
func (s *Service) CompletePreviewPipeline(ctx context.Context, run PreviewRun, pipeline PipelineResult) (UsageSummary, error) {
	if err := ai.ValidateSnapshot(pipeline.Batch); err != nil {
		return UsageSummary{}, err
	}
	if !validPipelineForService(run.Snapshot.ContentService, pipeline) {
		return UsageSummary{}, ErrInvalidInput
	}
	payload, err := json.Marshal(pipeline.Batch)
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
	if err = validateContentOutcome(ctx, tx, run.ID, true, pipeline); err != nil {
		return UsageSummary{}, err
	}
	tag, err := tx.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET status='valid',completed_at=$2,content_outcome=$5,final_content_version=$6,content_stop_reason=$7,failure_category=NULL WHERE id=$1 AND version_id=$3 AND config_hash=$4 AND status='active'`, run.ID, c.Now, run.VersionID, run.ConfigHash, pipeline.Outcome, pipeline.Version, pipeline.StopReason)
	if err != nil {
		return UsageSummary{}, err
	}
	if tag.RowsAffected() != 1 {
		return UsageSummary{}, ErrTerminalRace
	}
	var preview uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO wordweave.preset_previews(preset_id,run_id,config_hash,validated_payload,validated_at,validator_version) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, run.PresetID, run.ID, run.ConfigHash, payload, c.Now, pipeline.Batch.ValidatorVersion).Scan(&preview)
	if err != nil {
		return UsageSummary{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.preset_versions SET preview_id=$2 WHERE id=$1 AND preview_id IS NULL AND config_hash=$3 AND preview_content_mode=$4`, run.VersionID, preview, run.ConfigHash, run.Mode)
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
	contentOutcome := "cancelled"
	if desired == "failed" {
		reason = &category
		contentOutcome = "failed"
	}
	tag, err := tx.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET status=$2,completed_at=$3,failure_category=$4,content_outcome=CASE WHEN content_policy_version=1 THEN $5 END,final_content_version=NULL,content_stop_reason=NULL WHERE id=$1 AND status='active'`, id, desired, c.Now, reason, contentOutcome)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		// A confirmed terminal row wins. The following read returns it; database
		// errors are propagated instead of being converted into a fake failure.
	}
	var status string
	if err = tx.QueryRow(ctx, `SELECT status FROM wordweave.preset_preview_runs WHERE id=$1`, id).Scan(&status); err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	s.previewRegistry.SetStatus(id, status)
	s.resolveSettlementUnknown(id, true)
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
	if err != nil {
		return "pending", errors.Join(ErrSettlementUnconfirmed, err)
	}
	if err == nil && cancel != nil {
		cancel()
	}
	return status, err
}

func (s *Service) ReadPreviewStatus(ctx context.Context, actor identity.Actor, id uuid.UUID, token string) (PreviewStatusView, error) {
	out := PreviewStatusView{PreviewRunID: id}
	var capability previewCapability
	if !actor.IsAdmin() || security.NewCursorSigner(s.capabilityKey).Decode("preset-preview:"+actor.ID.String(), token, &capability) != nil || capability.Run != id || capability.Nonce == "" {
		return out, ErrRunNotFound
	}
	tx, err := s.app.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	var completed *time.Time
	err = tx.QueryRow(ctx, `SELECT r.status,r.version_id,CASE WHEN r.content_review_enabled_snapshot THEN 'enhanced' ELSE 'basic' END,r.final_content_version,r.content_outcome,r.completed_at
		FROM wordweave.preset_preview_runs r
		WHERE r.id=$1 AND r.requested_by=$2 AND r.content_policy_version=1`, id, actor.ID).Scan(
		&out.Status, &out.DraftVersion, &out.PreviewContentMode, &out.FinalContentVersion, &out.ContentOutcome, &completed)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrRunNotFound
	}
	if err != nil {
		return out, err
	}
	if completed != nil && time.Now().After(completed.Add(TerminalTokenRetention)) {
		return out, ErrRunExpired
	}
	if out.ContentOutcome != nil && *out.ContentOutcome == OutcomeServiceIncomplete {
		notice := "content_review_incomplete"
		out.CompletionNotice = &notice
	}
	if out.Status == "valid" {
		var payload []byte
		err = tx.QueryRow(ctx, `SELECT p.validated_payload FROM wordweave.preset_previews p
			JOIN wordweave.preset_preview_runs r ON r.id=p.run_id
			WHERE r.id=$1 AND r.status='valid'`, id).Scan(&payload)
		if err == nil {
			var batch ai.ValidatedBatch
			if json.Unmarshal(payload, &batch) == nil && ai.ValidateSnapshot(batch) == nil {
				out.Result = &batch
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return out, err
		}
	}
	out.Usage, err = readUsage(ctx, tx, id)
	if err != nil {
		return out, err
	}
	return out, tx.Commit(ctx)
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
		tag, err := tx.Exec(ctx, `WITH active AS(SELECT id FROM wordweave.preset_preview_runs WHERE status='active' ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED) UPDATE wordweave.preset_preview_runs r SET status='failed',completed_at=$1,failure_category=$2,content_outcome=CASE WHEN r.content_policy_version=1 THEN 'failed' END,final_content_version=NULL,content_stop_reason=NULL FROM active a WHERE r.id=a.id`, c.Now, reason)
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
