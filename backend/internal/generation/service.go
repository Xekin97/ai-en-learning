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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/ai"
	"wordweave/internal/dbgen"
	"wordweave/internal/generationtrace"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

var (
	ErrInvalidInput          = errors.New("invalid generation input")
	ErrGenerationInProgress  = errors.New("generation already in progress")
	ErrQuotaExhausted        = errors.New("generation quota exhausted")
	ErrGenerationUnavailable = errors.New("generation is unavailable")
	ErrForbidden             = errors.New("generation is forbidden")
	ErrTerminalRace          = errors.New("generation terminal state already decided")
)

type Input struct {
	ModelID         string
	MeaningLanguage string
	Scenario        string
	Length          string
	Entries         []string
}

type Run struct {
	ID    uuid.UUID
	Token string
	Spec  ai.GenerationSpec
}

type CancelOutcome struct {
	Status        string
	QuotaRefunded bool
}

type Service struct {
	app           *pgxpool.Pool
	queries       *dbgen.Queries
	credentials   *ai.CredentialStore
	provider      ai.Provider
	validator     ai.Validator
	registry      *Registry
	capabilityKey []byte
	draftTTL      time.Duration
}

func NewService(app *pgxpool.Pool, credentials *ai.CredentialStore, provider ai.Provider, capabilityKey []byte, draftTTL time.Duration, validator ai.Validator) *Service {
	return &Service{
		app: app, queries: dbgen.New(app), credentials: credentials, provider: provider,
		validator: validator, registry: NewRegistry(capabilityKey),
		capabilityKey: append([]byte(nil), capabilityKey...), draftTTL: draftTTL,
	}
}

func (service *Service) Provider() ai.Provider   { return service.provider }
func (service *Service) Validator() ai.Validator { return service.validator }
func (service *Service) Registry() *Registry     { return service.registry }

func (service *Service) Start(ctx context.Context, actor identity.Actor, input Input) (_ Run, resultErr error) {
	trace := generationtrace.From(ctx)
	trace.Begin(generationtrace.Preflight)
	defer func() { finishTrace(ctx, generationtrace.Preflight, resultErr) }()
	check := func(name string) { trace.Check(generationtrace.Preflight, name, -1) }
	check("input")
	if actor.IsAdmin() {
		return Run{}, ErrForbidden
	}
	modelID, err := uuid.Parse(input.ModelID)
	if err != nil || !validMeaningLanguage(input.MeaningLanguage) || !validScenario(input.Scenario) {
		return Run{}, ErrInvalidInput
	}
	minimumWords, ok := minimumWords(input.Length)
	if !ok || len(input.Entries) == 0 || hasDuplicate(input.Entries) {
		return Run{}, ErrInvalidInput
	}
	check("credentials")
	if _, err := service.credentials.Get(ctx); err != nil {
		if errors.Is(err, ai.ErrCredentialMissing) {
			return Run{}, ErrGenerationUnavailable
		}
		return Run{}, fmt.Errorf("check generation credential: %w", err)
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

	check("actor_lock")
	groupCode, quotaResetAt, err := lockActor(ctx, tx, actor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Run{}, ErrForbidden
		}
		return Run{}, err
	}
	check("group_policy")
	var quotaLimit pgtype.Int4
	var maxEntries int
	if err := tx.QueryRow(ctx, `
		SELECT rolling_quota_limit, max_entries_per_run
		FROM wordweave.entitlement_groups WHERE code=$1`, groupCode).Scan(&quotaLimit, &maxEntries); err != nil {
		return Run{}, fmt.Errorf("read generation group policy: %w", err)
	}
	if len(input.Entries) > maxEntries {
		return Run{}, ErrInvalidInput
	}
	check("model_assignment")
	var modelName, providerModelID string
	if err := tx.QueryRow(ctx, `
		SELECT model.display_name, model.provider_model_id
		FROM wordweave.ai_models model
		JOIN wordweave.group_models assignment ON assignment.model_id=model.id
		WHERE model.id=$1 AND assignment.group_code=$2 AND model.enabled`, modelID, groupCode).Scan(&modelName, &providerModelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Run{}, ErrInvalidInput
		}
		return Run{}, fmt.Errorf("authorize generation model: %w", err)
	}
	check("length_assignment")
	var allowedLength bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM wordweave.group_lengths WHERE group_code=$1 AND length_code=$2
	)`, groupCode, input.Length).Scan(&allowedLength); err != nil {
		return Run{}, fmt.Errorf("authorize generation length: %w", err)
	}
	if !allowedLength {
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
	check("quota")
	if quotaLimit.Valid {
		if quotaLimit.Int32 == 0 {
			return Run{}, ErrGenerationUnavailable
		}
		used, err := countQuota(ctx, tx, actor, quotaResetAt)
		if err != nil {
			return Run{}, err
		}
		if used >= int(quotaLimit.Int32) {
			return Run{}, ErrQuotaExhausted
		}
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
	check("reserve")
	var runID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO wordweave.generation_runs(
			account_id, visitor_id, credited_account_id, group_code_snapshot,
			model_id, model_display_name_snapshot, provider_model_id_snapshot,
			meaning_language, scenario, length_code, minimum_words_snapshot,
			quota_limit_snapshot, max_entries_snapshot
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id`, accountID, visitorID, creditedAccountID, groupCode,
		modelID, modelName, providerModelID, input.MeaningLanguage, input.Scenario,
		input.Length, minimumWords, quotaLimit, maxEntries).Scan(&runID)
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return Run{}, ErrGenerationInProgress
		}
		return Run{}, fmt.Errorf("reserve generation run: %w", err)
	}
	check("entries")
	for index, entry := range resolved {
		if _, err := tx.Exec(ctx, `
			INSERT INTO wordweave.generation_run_entries(run_id, vocabulary_entry_id, input_order, source_entry_snapshot)
			VALUES ($1,$2,$3,$4)`, runID, entry.ID, index, entry.Entry); err != nil {
			return Run{}, fmt.Errorf("store generation entry: %w", err)
		}
	}
	check("token")
	token, err := NewRunToken(service.capabilityKey, runID, actor)
	if err != nil {
		return Run{}, err
	}
	check("transaction_commit")
	if err := tx.Commit(ctx); err != nil {
		trace.PreflightCommitUnknown(runID.String())
		trace.Note(generationtrace.Preflight, "transaction_commit", generationtrace.Why("transaction_unknown"))
		return Run{}, fmt.Errorf("commit generation preflight: %w", err)
	}
	spec := ai.GenerationSpec{
		RunID: runID.String(), ModelID: modelID.String(), ProviderModelID: providerModelID,
		MeaningLanguage: input.MeaningLanguage, Scenario: input.Scenario, LengthCode: input.Length,
		MinimumWords: minimumWords, Entries: append([]string(nil), input.Entries...), PromptVersion: ai.PromptVersion,
	}
	trace.BindRun(runID.String(), modelID.String())
	service.registry.Register(runID, actor, token)
	service.registry.AttachTrace(runID, trace)
	if capture := trace.Capture(); capture != nil {
		capture.EffectiveSpec(generationtrace.EffectiveSpec{RunID: spec.RunID, ModelID: spec.ModelID, ProviderModelID: spec.ProviderModelID, MeaningLanguage: spec.MeaningLanguage, Scenario: spec.Scenario, LengthCode: spec.LengthCode, MinimumWords: spec.MinimumWords, Entries: spec.Entries, PromptVersion: spec.PromptVersion})
	}
	return Run{ID: runID, Token: token, Spec: spec}, nil
}

func (service *Service) CompleteValid(ctx context.Context, run Run, batch ai.ValidatedBatch) (resultErr error) {
	trace := generationtrace.From(ctx)
	trace.Begin(generationtrace.DraftCommit)
	defer func() { finishTrace(ctx, generationtrace.DraftCommit, resultErr) }()
	check := func(name string) { trace.Check(generationtrace.DraftCommit, name, -1) }
	check("snapshot")
	if err := ai.ValidateSnapshot(batch); err != nil {
		return fmt.Errorf("invalid validated generation draft: %w", err)
	}
	check("draft_encode")
	payload, err := json.Marshal(batch)
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
	result, err := tx.Exec(ctx, `
		UPDATE wordweave.generation_runs
		SET call_status='valid', quota_charged=true, counts_toward_cumulative=true,
			completed_at=clock_timestamp(), failure_code=NULL
		WHERE id=$1 AND call_status='active'`, run.ID)
	if err != nil {
		return fmt.Errorf("settle valid generation: %w", err)
	}
	if result.RowsAffected() != 1 {
		return ErrTerminalRace
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

func (service *Service) CompleteFailure(ctx context.Context, runID uuid.UUID, status, failureCode string) error {
	if status != "provider_failed" && status != "server_failed" && status != "stream_failed" && status != "validation_failed" {
		return errors.New("invalid generation failure status")
	}
	result, err := service.app.Exec(ctx, `
		UPDATE wordweave.generation_runs
		SET call_status=$2, quota_charged=false, counts_toward_cumulative=false,
			completed_at=clock_timestamp(), failure_code=$3
		WHERE id=$1 AND call_status='active'`, runID, status, failureCode)
	if err != nil {
		return fmt.Errorf("settle failed generation: %w", err)
	}
	if result.RowsAffected() != 1 {
		return ErrTerminalRace
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
	result, err := service.app.Exec(ctx, `
		UPDATE wordweave.generation_runs
		SET call_status='user_cancelled', quota_charged=true, counts_toward_cumulative=true,
			completed_at=clock_timestamp(), failure_code=NULL
		WHERE id=$1 AND call_status='active'`, runID)
	if err == nil && result.RowsAffected() == 1 {
		service.registry.SetStatus(runID, "cancelled")
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
		return CancelOutcome{}, fmt.Errorf("confirm generation cancellation: %w", errors.Join(writeErr, readErr))
	}
	if status == "active" {
		// The write is not confirmed. Do not pretend to cancel or refund it,
		// and do not introduce an automatic cancellation retry.
		if writeErr != nil {
			return CancelOutcome{}, fmt.Errorf("cancel generation: %w", writeErr)
		}
		return CancelOutcome{}, errors.New("generation cancellation remains active")
	}
	outcome := cancelProjection(status)
	service.registry.SetStatus(runID, outcome.Status)
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

func countQuota(ctx context.Context, tx pgx.Tx, actor identity.Actor, reset time.Time) (int, error) {
	var used int
	if actor.IsVisitor() {
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM wordweave.generation_runs
			WHERE visitor_id=$1 AND quota_charged AND started_at >= clock_timestamp()-interval '24 hours'`, actor.ID).Scan(&used); err != nil {
			return 0, fmt.Errorf("count visitor generation quota: %w", err)
		}
		return used, nil
	}
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM wordweave.generation_runs
		WHERE account_id=$1 AND quota_charged
		AND started_at >= greatest(clock_timestamp()-interval '24 hours', $2)`, actor.ID, reset).Scan(&used); err != nil {
		return 0, fmt.Errorf("count account generation quota: %w", err)
	}
	return used, nil
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
