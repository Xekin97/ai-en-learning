package generation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/ai"
	"wordweave/internal/capacity"
	"wordweave/internal/dbgen"
	"wordweave/internal/entitlement"
	"wordweave/internal/generationtrace"
	"wordweave/internal/growth"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

var (
	ErrInvalidInput                   = errors.New("invalid generation input")
	ErrGenerationInProgress           = errors.New("generation already in progress")
	ErrQuotaExhausted                 = errors.New("generation quota exhausted")
	ErrGenerationUnavailable          = errors.New("generation is unavailable")
	ErrGenerationConfigurationInvalid = errors.New("generation configuration is invalid")
	ErrForbidden                      = errors.New("generation is forbidden")
	ErrTerminalRace                   = errors.New("generation terminal state already decided")
	ErrSettlementUnconfirmed          = errors.New("generation settlement is unconfirmed")
	ErrGenerationBusy                 = capacity.ErrBusy
)

const generationPreflightTimeout = 2 * time.Second

type Input struct {
	ModelID         string
	MeaningLanguage string
	Scenario        string
	Length          string
	Entries         []string
}

type Run struct {
	ID       uuid.UUID
	Token    string
	Spec     ai.GenerationSpec
	Snapshot RunSnapshot
	capacity *capacity.Lease
}

func (r *Run) ReleaseCapacity() {
	if r != nil && r.capacity != nil {
		r.capacity.Release()
	}
}

type RunSnapshot struct {
	ConfigurationRevision  string                     `json:"configuration_revision"`
	EffectivePlan          EffectivePlanSnapshot      `json:"effective_plan"`
	ContentService         entitlement.ContentService `json:"content_service"`
	NativeCorrectionPolicy entitlement.NativePolicy   `json:"native_correction_policy"`
}
type EffectivePlanSnapshot struct {
	Code   string `json:"code"`
	Origin string `json:"origin"`
}

type CancelOutcome struct {
	Status        string
	QuotaRefunded bool
}

type Service struct {
	app             *pgxpool.Pool
	queries         *dbgen.Queries
	credentials     *ai.CredentialStore
	provider        ai.Provider
	validator       ai.Validator
	registry        *Registry
	previewRegistry *Registry
	capabilityKey   []byte
	draftTTL        time.Duration
	capacity        *capacity.Gate
}

func NewService(app *pgxpool.Pool, credentials *ai.CredentialStore, provider ai.Provider, capabilityKey []byte, draftTTL time.Duration, validator ai.Validator) *Service {
	return &Service{
		app: app, queries: dbgen.New(app), credentials: credentials, provider: provider,
		validator: validator, registry: NewRegistry(capabilityKey), previewRegistry: NewRegistry(capabilityKey),
		capabilityKey: append([]byte(nil), capabilityKey...), draftTTL: draftTTL,
	}
}

func (service *Service) SetCapacityGate(gate *capacity.Gate) { service.capacity = gate }
func (service *Service) BeginDrain() {
	if service.capacity != nil {
		service.capacity.SetDraining(true)
	}
}
func (service *Service) WaitDrain(ctx context.Context) error {
	if service.capacity == nil {
		return nil
	}
	return service.capacity.WaitIdle(ctx)
}
func (service *Service) CapacityRetryAfterSeconds() int {
	if service.capacity == nil {
		return 1
	}
	return service.capacity.RetryAfterSeconds()
}
func capacityPendingKey(id uuid.UUID, preview bool) string {
	prefix := "generation:"
	if preview {
		prefix = "preview:"
	}
	return prefix + id.String()
}

func (service *Service) MarkSettlementUnknown(id uuid.UUID, preview bool) {
	if service.capacity != nil {
		service.capacity.MarkUnknown(capacityPendingKey(id, preview))
	}
}

func (service *Service) resolveSettlementUnknown(id uuid.UUID, preview bool) {
	if service.capacity == nil {
		return
	}
	service.capacity.ResolvePending(capacityPendingKey(id, preview))
	service.capacity.SetSettlementHealthy(true)
}

func (service *Service) Provider() ai.Provider   { return service.provider }
func (service *Service) Validator() ai.Validator { return service.validator }
func (service *Service) Registry() *Registry     { return service.registry }

func (service *Service) Start(ctx context.Context, actor identity.Actor, input Input) (Run, error) {
	return service.start(ctx, actor, input, uuid.Nil, uuid.Nil)
}
func (service *Service) StartPreset(ctx context.Context, actor identity.Actor, id, version uuid.UUID) (Run, error) {
	if id == uuid.Nil || version == uuid.Nil {
		return Run{}, ErrInvalidInput
	}
	return service.start(ctx, actor, Input{}, id, version)
}
func (service *Service) start(ctx context.Context, actor identity.Actor, input Input, presetID, versionID uuid.UUID) (_ Run, resultErr error) {
	var preflight *capacity.Lease
	if service.capacity != nil {
		var err error
		preflight, err = service.capacity.TryAcquire(capacity.Preflight, "")
		if err != nil {
			return Run{}, ErrGenerationBusy
		}
		defer preflight.Release()
	}
	preflightContext, cancelPreflight := context.WithTimeout(ctx, generationPreflightTimeout)
	defer cancelPreflight()
	ctx = preflightContext
	trace := generationtrace.From(ctx)
	trace.Begin(generationtrace.Preflight)
	defer func() { finishTrace(ctx, generationtrace.Preflight, resultErr) }()
	check := func(name string) { trace.Check(generationtrace.Preflight, name, -1) }
	check("input")
	if actor.IsAdmin() {
		return Run{}, ErrForbidden
	}
	check("transaction_begin")
	tx, err := service.app.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Run{}, fmt.Errorf("begin generation preflight: %w", err)
	}
	defer func() {
		err := tx.Rollback(ctx)
		if !errors.Is(err, pgx.ErrTxClosed) {
			reason := "rolled_back"
			if err != nil {
				reason = "rollback_unknown"
			}
			trace.Note(generationtrace.Preflight, "transaction_rollback", generationtrace.Why(reason))
		}
	}()

	configuration, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Run{}, err
	}
	isPreset := presetID != uuid.Nil
	var presetVersion *uuid.UUID
	entryKind := "normal"
	if isPreset {
		var published uuid.UUID
		err = tx.QueryRow(ctx, `SELECT published_version_id FROM wordweave.presets WHERE id=$1 AND listed`, presetID).Scan(&published)
		if errors.Is(err, pgx.ErrNoRows) {
			return Run{}, ErrPresetUnavailable
		}
		if err != nil {
			return Run{}, err
		}
		if published != versionID {
			return Run{}, ErrPresetChanged
		}
		v, err := readPresetVersion(ctx, tx, published)
		if err != nil {
			return Run{}, err
		}
		if !v.Enabled || v.Payload == nil {
			return Run{}, ErrPresetInvalidReference
		}
		input = Input{ModelID: v.Input.ModelID.String(), MeaningLanguage: v.Input.MeaningLanguage, Scenario: v.Input.Scenario, Length: v.Input.Length, Entries: v.Input.Entries}
		presetVersion = &published
		entryKind = "preset"
	}
	modelID, err := uuid.Parse(input.ModelID)
	if err != nil || !validMeaningLanguage(input.MeaningLanguage) || !validScenario(input.Scenario) {
		return Run{}, ErrInvalidInput
	}
	minimumWords, ok := minimumWords(input.Length)
	if !ok || len(input.Entries) == 0 || hasDuplicate(input.Entries) {
		return Run{}, ErrInvalidInput
	}
	check("actor_lock")
	_, _, err = lockActor(ctx, tx, actor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Run{}, ErrForbidden
		}
		return Run{}, err
	}
	check("group_policy")
	plan, err := entitlement.Resolve(ctx, tx, actor, configuration.Now)
	if err != nil {
		return Run{}, err
	}
	groupCode, quotaLimit, maxEntries := plan.Code, plan.Limit, plan.MaxEntries
	snapshot := RunSnapshot{
		ConfigurationRevision:  business.Revision(service.capabilityKey, "configuration", configuration.Revision),
		EffectivePlan:          EffectivePlanSnapshot{Code: plan.Code, Origin: plan.Origin},
		ContentService:         entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: plan.ContentReviewEnabled, ContentRepairLimit: plan.ContentRepairLimit},
		NativeCorrectionPolicy: entitlement.SystemNativePolicy(),
	}
	if snapshot.EffectivePlan.Code == "registered" {
		snapshot.EffectivePlan.Code = "basic"
	}

	if !isPreset && len(input.Entries) > maxEntries {
		return Run{}, ErrInvalidInput
	}
	check("model_assignment")
	var modelName, providerModelID string
	if err := tx.QueryRow(ctx, `
		SELECT model.display_name, model.provider_model_id
		FROM wordweave.ai_models model
		JOIN wordweave.ai_providers provider ON provider.id=model.provider_id
		WHERE model.id=$1 AND model.enabled AND model.retired_at IS NULL AND provider.retired_at IS NULL AND ($6 OR
 EXISTS(SELECT 1 FROM wordweave.group_models assignment WHERE assignment.model_id=model.id AND assignment.group_code=$2) OR
 ($5 AND EXISTS(SELECT 1 FROM wordweave.model_time_contributions c WHERE c.owner_id=$3 AND c.model_id=model.id AND c.revoked_at IS NULL AND c.starts_at<=$4 AND c.ends_at>$4)))`, modelID, groupCode, actor.ID, configuration.Now, actor.IsLearner(), isPreset).Scan(&modelName, &providerModelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Run{}, ErrInvalidInput
		}
		return Run{}, fmt.Errorf("authorize generation model: %w", err)
	}
	check("credentials")
	spec := ai.GenerationSpec{ModelID: modelID.String(), ProviderModelID: providerModelID, MeaningLanguage: input.MeaningLanguage, Scenario: input.Scenario, LengthCode: input.Length, MinimumWords: minimumWords, Entries: append([]string(nil), input.Entries...), PromptVersion: ai.PromptVersion}
	if err = service.credentials.BindSpec(ctx, &spec); err != nil {
		if errors.Is(err, ai.ErrCredentialMissing) {
			return Run{}, ErrGenerationUnavailable
		}
		var customError *ai.CustomParameterError
		if errors.As(err, &customError) {
			return Run{}, ErrGenerationConfigurationInvalid
		}
		return Run{}, err
	}
	requestParametersSnapshot, err := ai.RequestParametersSnapshot(spec)
	if err != nil {
		return Run{}, ErrGenerationConfigurationInvalid
	}
	check("length_assignment")
	var allowedLength bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM wordweave.group_lengths WHERE group_code=$1 AND length_code=$2
	)`, groupCode, input.Length).Scan(&allowedLength); err != nil {
		return Run{}, fmt.Errorf("authorize generation length: %w", err)
	}
	if !isPreset && !allowedLength {
		return Run{}, ErrInvalidInput
	}
	check("vocabulary")
	resolved, err := service.queries.WithTx(tx).ResolveVocabularyEntries(ctx, input.Entries)
	if err != nil {
		return Run{}, fmt.Errorf("resolve generation vocabulary: %w", err)
	}
	if len(resolved) != len(input.Entries) {
		return Run{}, ErrInvalidInput
	}

	accountID := uuid.NullUUID{}
	visitorID := uuid.NullUUID{}
	creditedAccountID := uuid.NullUUID{}
	if actor.IsVisitor() {
		visitorID = uuid.NullUUID{UUID: actor.ID, Valid: true}
	} else {
		accountID = uuid.NullUUID{UUID: actor.ID, Valid: true}
		creditedAccountID = accountID
	}
	check("quota")
	// Keep the existing quota rejection precedence while holding the actor lock;
	// the later source reservation cannot race another request for this owner.
	if plan.Limit != nil {
		usage, e := entitlement.Usage(ctx, tx, actor, plan, configuration.Now)
		if e != nil {
			return Run{}, e
		}
		if usage.Remaining != nil && *usage.Remaining == 0 {
			extra, e := entitlement.Extra(ctx, tx, actor, configuration.Now)
			if e != nil {
				return Run{}, e
			}
			if extra.Remaining == 0 {
				return Run{}, ErrQuotaExhausted
			}
		}
	}
	check("reserve")
	var capacityLease *capacity.Lease
	if service.capacity != nil {
		capacityLease, err = service.capacity.TryAcquire(capacity.Generation, spec.ConnectionCapacityKey())
		if err != nil {
			return Run{}, ErrGenerationBusy
		}
		defer func() {
			if resultErr != nil && capacityLease != nil {
				capacityLease.Release()
			}
		}()
	}
	var runID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO wordweave.generation_runs(
			account_id, visitor_id, credited_account_id, group_code_snapshot,
			model_id, model_display_name_snapshot, provider_model_id_snapshot,
			meaning_language, scenario, length_code, minimum_words_snapshot,
			quota_limit_snapshot, max_entries_snapshot,entry_kind,preset_version_id,started_at,
			content_policy_version,configuration_revision_snapshot,content_review_enabled_snapshot,
			content_repair_limit_snapshot,pipeline_version_snapshot,plan_origin_snapshot,
			model_request_parameters_snapshot
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1,$17,$18,$19,$20,$21,$22)
		RETURNING id`, accountID, visitorID, creditedAccountID, groupCode,
		modelID, modelName, providerModelID, input.MeaningLanguage, input.Scenario,
		input.Length, minimumWords, quotaLimit, maxEntries, entryKind, presetVersion, configuration.Now,
		configuration.Revision, plan.ContentReviewEnabled, plan.ContentRepairLimit, entitlement.PipelineVersion, plan.Origin, requestParametersSnapshot).Scan(&runID)
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return Run{}, ErrGenerationInProgress
		}
		return Run{}, fmt.Errorf("reserve generation run: %w", err)
	}
	if err = entitlement.Reserve(ctx, tx, actor, plan, runID, configuration.Now); err != nil {
		if errors.Is(err, entitlement.ErrQuotaExhausted) {
			return Run{}, ErrQuotaExhausted
		}
		return Run{}, err
	}
	check("entries")
	for index, entry := range resolved {
		if _, err := tx.Exec(ctx, `
			INSERT INTO wordweave.generation_run_entries(run_id, vocabulary_entry_id, input_order, source_entry_snapshot)
			VALUES ($1,$2,$3,$4)`, runID, entry.ID, index, entry.Entry); err != nil {
			return Run{}, fmt.Errorf("store generation entry: %w", err)
		}
	}
	if growth.Enabled(configuration) {
		source := "visitor"
		var owner any
		if actor.IsLearner() {
			source = "account"
			owner = actor.ID
		}
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,started_at,learning_day,owner_id,source_kind,reference_key) VALUES($1,'generation_started',$2,$2,$3,$4,$5,$6)`, "generation-start:"+runID.String(), configuration.Now, business.LearningDay(configuration.Now), owner, source, runID); err != nil {
			return Run{}, err
		}
	}
	check("token")
	token, err := NewRunToken(service.capabilityKey, runID, actor)
	if err != nil {
		return Run{}, err
	}
	check("transaction_commit")
	if err := tx.Commit(ctx); err != nil {
		if service.capacity != nil && capacityLease != nil {
			service.capacity.ReleaseUnknown(capacityLease, capacityPendingKey(runID, false))
			capacityLease = nil
		}
		trace.PreflightCommitUnknown(runID.String())
		trace.Note(generationtrace.Preflight, "transaction_commit", generationtrace.Why("transaction_unknown"))
		return Run{}, fmt.Errorf("commit generation preflight: %w", err)
	}
	spec.RunID = runID.String()
	trace.BindRun(runID.String(), modelID.String())
	service.registry.Register(runID, actor, token)
	service.registry.AttachTrace(runID, trace)
	if capture := trace.Capture(); capture != nil {
		capture.EffectiveSpec(generationtrace.EffectiveSpec{RunID: spec.RunID, ModelID: spec.ModelID, ProviderModelID: spec.ProviderModelID, MeaningLanguage: spec.MeaningLanguage, Scenario: spec.Scenario, LengthCode: spec.LengthCode, MinimumWords: spec.MinimumWords, Entries: spec.Entries, PromptVersion: spec.PromptVersion})
	}
	return Run{ID: runID, Token: token, Spec: spec, Snapshot: snapshot, capacity: capacityLease}, nil
}

func (service *Service) CompleteValid(ctx context.Context, run Run, batch ai.ValidatedBatch) (resultErr error) {
	outcome := OutcomeBasic
	version := 1
	if run.Snapshot.ContentService.ContentReviewEnabled {
		outcome = OutcomeReviewPassed
		version = 2
	}
	return service.CompletePipeline(ctx, run, PipelineResult{Version: version, Batch: batch, Outcome: outcome})
}

func (service *Service) CompletePipeline(ctx context.Context, run Run, pipeline PipelineResult) (resultErr error) {
	trace := generationtrace.From(ctx)
	trace.Begin(generationtrace.DraftCommit)
	defer func() { finishTrace(ctx, generationtrace.DraftCommit, resultErr) }()
	check := func(name string) { trace.Check(generationtrace.DraftCommit, name, -1) }
	check("snapshot")
	if err := ai.ValidateSnapshot(pipeline.Batch); err != nil {
		return fmt.Errorf("invalid validated generation draft: %w", err)
	}
	if !validPipelineForService(run.Snapshot.ContentService, pipeline) {
		return errors.New("invalid generation pipeline result")
	}
	check("draft_encode")
	payload, err := json.Marshal(pipeline.Batch)
	if err != nil {
		return fmt.Errorf("encode validated generation draft: %w", err)
	}
	check("transaction_begin")
	tx, err := service.app.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		err := tx.Rollback(ctx)
		if !errors.Is(err, pgx.ErrTxClosed) {
			reason := "rolled_back"
			if err != nil {
				reason = "rollback_unknown"
			}
			trace.Note(generationtrace.DraftCommit, "transaction_rollback", generationtrace.Why(reason))
		}
	}()
	check("cas")
	configuration, actor, err := lockRunSubject(ctx, tx, run.ID)
	if err != nil {
		return err
	}
	check("usage_facts")
	if err = validateContentOutcome(ctx, tx, run.ID, false, pipeline); err != nil {
		return err
	}

	check("cas")
	result, err := tx.Exec(ctx, `
		UPDATE wordweave.generation_runs
		SET call_status='valid', quota_charged=true, counts_toward_cumulative=true,
			completed_at=$2, failure_code=NULL,content_outcome=CASE WHEN content_policy_version=1 THEN $3::text END,
			final_content_version=CASE WHEN content_policy_version=1 THEN $4::smallint END,content_stop_reason=CASE WHEN content_policy_version=1 THEN $5::text END
		WHERE id=$1 AND call_status='active'`, run.ID, configuration.Now, pipeline.Outcome, pipeline.Version, pipeline.StopReason)
	if err != nil {
		return fmt.Errorf("settle valid generation: %w", err)
	}
	if result.RowsAffected() != 1 {
		return ErrTerminalRace
	}
	if err = settleCharge(ctx, tx, run.ID, false, configuration.Now); err != nil {
		return err
	}
	if actor.IsLearner() {
		if _, err = growth.RecordGeneration(ctx, tx, actor.ID, configuration); err != nil {
			return err
		}
	}
	if err = recordGenerationTerminal(ctx, tx, run.ID, actor, "valid", configuration); err != nil {
		return err
	}

	check("draft_insert")
	if _, err := tx.Exec(ctx, `
		INSERT INTO wordweave.generation_drafts(run_id, access_token_hash, payload, expires_at)
		VALUES ($1,$2,$3,clock_timestamp()+$4::interval)`, run.ID,
		security.Digest(service.capabilityKey, "generation-token-v1", run.Token), payload, intervalLiteral(service.draftTTL)); err != nil {
		return fmt.Errorf("store validated generation draft: %w", err)
	}
	check("transaction_commit")
	if err := tx.Commit(ctx); err != nil {
		trace.Note(generationtrace.DraftCommit, "transaction_commit", generationtrace.Why("transaction_unknown"))
		return err
	}
	service.registry.SetStatus(run.ID, "valid")
	return nil
}

func validPipelineOutcome(outcome string, reason *string) bool {
	switch outcome {
	case OutcomeBasic, OutcomeReviewPassed, OutcomeRepairedPassed, OutcomeLimitFinalized:
		return reason == nil
	case OutcomeServiceIncomplete:
		if reason == nil {
			return false
		}
		switch *reason {
		case "content_timeout", "content_rate_limited", "content_transport_error", "content_protocol_error", "content_review_invalid", "fixed_edit_native_invalid", "repair_native_invalid":
			return true
		}
	}
	return false
}

func validPipelineForService(service entitlement.ContentService, pipeline PipelineResult) bool {
	if !validPipelineOutcome(pipeline.Outcome, pipeline.StopReason) {
		return false
	}
	if !service.ContentReviewEnabled {
		return service.ContentRepairLimit == 0 && pipeline.Version == 1 && pipeline.Outcome == OutcomeBasic
	}
	if service.ContentRepairLimit < 1 || service.ContentRepairLimit > 99 || pipeline.Version < 1 || pipeline.Version > service.ContentRepairLimit+2 || pipeline.Outcome == OutcomeBasic {
		return false
	}
	switch pipeline.Outcome {
	case OutcomeReviewPassed:
		return pipeline.Version == 2
	case OutcomeRepairedPassed:
		return pipeline.Version >= 3
	case OutcomeLimitFinalized:
		return pipeline.Version == service.ContentRepairLimit+2
	case OutcomeServiceIncomplete:
		return true
	default:
		return false
	}
}

func (service *Service) CompleteFailure(ctx context.Context, runID uuid.UUID, status, failureCode string) error {
	if status != "provider_failed" && status != "server_failed" && status != "stream_failed" && status != "validation_failed" {
		return errors.New("invalid generation failure status")
	}
	if err := SettleTerminal(ctx, service.app, runID, status, failureCode); err != nil {
		return err
	}

	service.registry.SetStatus(runID, "failed")
	return nil
}

func (service *Service) Cancel(ctx context.Context, actor identity.Actor, runIDRaw, token string) (outcomeResult CancelOutcome, resultErr error) {
	runID, err := uuid.Parse(runIDRaw)
	if err != nil {
		return CancelOutcome{}, ErrRunNotFound
	}
	_, cancel, err := service.registry.Authenticate(runID, actor, token)
	if err != nil {
		return CancelOutcome{}, ErrRunNotFound
	}
	trace := service.registry.Trace(runID)
	ctx = generationtrace.With(ctx, trace)
	trace.Begin(generationtrace.Settlement)
	defer func() {
		outcome := outcomeResult.Status
		if resultErr != nil {
			outcome = "pending"
		}
		trace.Settled(outcome, outcomeResult.QuotaRefunded)
		finishTrace(ctx, generationtrace.Settlement, resultErr)
	}()
	trace.Check(generationtrace.Settlement, "cas", -1)
	err = SettleTerminal(ctx, service.app, runID, "user_cancelled", "")
	if err == nil {
		service.registry.SetStatus(runID, "cancelled")
		service.resolveSettlementUnknown(runID, false)
		if cancel != nil {
			cancel()
		}
		return CancelOutcome{Status: "cancelled", QuotaRefunded: false}, nil
	}
	trace.Note(generationtrace.Settlement, "confirm", generationtrace.Why("transaction_unknown"))
	writeErr := err
	if writeErr != nil {
		slog.WarnContext(ctx, "ai_generation_cancel_unconfirmed", "run_id", runID.String(), "stage", "cancel_settlement", "reason", "write_not_confirmed")
	}
	// A write acknowledgement can disappear after cancellation committed.
	// Confirm on a fresh, bounded context even if the cancel HTTP request has
	// gone away; otherwise the already-cancelled run may keep its upstream alive.
	confirmContext, cancelConfirm := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancelConfirm()
	var status string
	readErr := service.app.QueryRow(confirmContext, `SELECT call_status FROM wordweave.generation_runs WHERE id=$1`, runID).Scan(&status)
	if errors.Is(readErr, pgx.ErrNoRows) {
		return CancelOutcome{}, ErrRunNotFound
	}
	if readErr != nil {
		return CancelOutcome{}, fmt.Errorf("%w: confirm generation cancellation: %w", ErrSettlementUnconfirmed, errors.Join(writeErr, readErr))
	}
	if status == "active" {
		// The write is not confirmed. Do not pretend to cancel or refund it,
		// and do not introduce an automatic cancellation retry.
		if writeErr != nil {
			return CancelOutcome{}, fmt.Errorf("%w: cancel generation: %w", ErrSettlementUnconfirmed, writeErr)
		}
		return CancelOutcome{}, ErrSettlementUnconfirmed
	}
	outcome := cancelProjection(status)
	service.registry.SetStatus(runID, outcome.Status)
	service.resolveSettlementUnknown(runID, false)
	if outcome.Status == "cancelled" && cancel != nil {
		cancel()
	}
	if writeErr != nil {
		slog.InfoContext(ctx, "ai_generation_cancel_recovered", "run_id", runID.String(), "stage", "cancel_settlement", "outcome", outcome.Status)
	}
	return outcome, nil
}

func (service *Service) Status(ctx context.Context, runID uuid.UUID) (string, error) {
	var status string
	if err := service.app.QueryRow(ctx, `SELECT call_status FROM wordweave.generation_runs WHERE id=$1`, runID).Scan(&status); err != nil {
		return "", err
	}
	return status, nil
}

func lockActor(ctx context.Context, tx pgx.Tx, actor identity.Actor) (string, time.Time, error) {
	if actor.IsVisitor() {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `SELECT id FROM wordweave.visitor_identities WHERE id=$1 FOR UPDATE`, actor.ID).Scan(&id)
		return "visitor", time.Time{}, err
	}
	var groupCode string
	var reset time.Time
	err := tx.QueryRow(ctx, `
		SELECT group_code, quota_reset_at FROM wordweave.accounts
		WHERE id=$1 AND role='learner' FOR UPDATE`, actor.ID).Scan(&groupCode, &reset)
	return groupCode, reset, err
}

func validMeaningLanguage(value string) bool { return value == "zh" || value == "en" || value == "ja" }
func validScenario(value string) bool {
	return value == "discussion" || value == "story" || value == "business" || value == "news"
}
func minimumWords(length string) (int, bool) {
	switch length {
	case "short":
		return 50, true
	case "medium":
		return 100, true
	case "long":
		return 200, true
	case "xlong":
		return 400, true
	default:
		return 0, false
	}
}

func hasDuplicate(values []string) bool {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			return true
		}
		seen[value] = struct{}{}
	}
	return false
}

func cancelProjection(status string) CancelOutcome {
	switch status {
	case "valid":
		return CancelOutcome{Status: "valid", QuotaRefunded: false}
	case "user_cancelled":
		return CancelOutcome{Status: "cancelled", QuotaRefunded: false}
	default:
		return CancelOutcome{Status: "failed", QuotaRefunded: true}
	}
}

func intervalLiteral(duration time.Duration) string {
	return fmt.Sprintf("%f seconds", duration.Seconds())
}
