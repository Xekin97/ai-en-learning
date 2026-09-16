package learning

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/ai"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

var (
	ErrNotFound          = errors.New("learning resource not found")
	ErrCapabilityExpired = errors.New("learning capability expired")
	ErrConflict          = errors.New("learning state conflict")
	ErrValidation        = errors.New("learning validation failed")
	ErrForbidden         = errors.New("learning operation forbidden")
)

type Service struct {
	pool          *pgxpool.Pool
	registry      *generation.Registry
	capabilityKey []byte
	draftTTL      time.Duration
	claimTTL      time.Duration
}

func NewService(pool *pgxpool.Pool, registry *generation.Registry, capabilityKey []byte, draftTTL, claimTTL time.Duration) *Service {
	return &Service{
		pool: pool, registry: registry, capabilityKey: append([]byte(nil), capabilityKey...),
		draftTTL: draftTTL, claimTTL: claimTTL,
	}
}

type SavedBatch struct {
	ID      uuid.UUID
	SavedAt time.Time
}

func (service *Service) Save(ctx context.Context, actor identity.Actor, runIDRaw, token string) (SavedBatch, bool, error) {
	if !actor.IsLearner() {
		return SavedBatch{}, false, ErrForbidden
	}
	runID, err := uuid.Parse(runIDRaw)
	if err != nil {
		return SavedBatch{}, false, ErrNotFound
	}
	if !generation.VerifyRunToken(service.capabilityKey, runID, actor, token) {
		return SavedBatch{}, false, ErrNotFound
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return SavedBatch{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	disposition, err := lockOwnedValidRun(ctx, tx, runID, actor)
	if err != nil {
		return SavedBatch{}, false, err
	}
	if disposition == "saved" {
		existing, found, err := existingBatch(ctx, tx, actor.ID, runID)
		if err != nil {
			return SavedBatch{}, false, err
		}
		if !found { // A deleted batch must never be recreated by a save retry.
			return SavedBatch{}, false, ErrNotFound
		}
		return existing, true, nil
	}
	if disposition != "pending" {
		return SavedBatch{}, false, ErrNotFound
	}
	draft, snapshot, err := service.lockActorDraft(ctx, tx, runID, actor, token)
	if err != nil {
		return SavedBatch{}, false, err
	}
	batch, err := createBatch(ctx, tx, actor.ID, snapshot, draft.Payload)
	if err != nil {
		return SavedBatch{}, false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.generation_runs SET disposition='saved' WHERE id=$1 AND disposition='pending'`, runID); err != nil {
		return SavedBatch{}, false, fmt.Errorf("mark generation saved: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.generation_drafts WHERE run_id=$1`, runID); err != nil {
		return SavedBatch{}, false, fmt.Errorf("delete saved draft: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return SavedBatch{}, false, fmt.Errorf("commit saved batch: %w", err)
	}
	return batch, false, nil
}

func (service *Service) Discard(ctx context.Context, actor identity.Actor, runIDRaw, token string) error {
	if !actor.IsVisitor() && !actor.IsLearner() {
		return ErrForbidden
	}
	runID, err := uuid.Parse(runIDRaw)
	if err != nil {
		return ErrNotFound
	}
	if !generation.VerifyRunToken(service.capabilityKey, runID, actor, token) {
		return ErrNotFound
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	disposition, err := lockOwnedValidRun(ctx, tx, runID, actor)
	if err != nil {
		return err
	}
	if disposition != "pending" {
		return nil // Repeated discard or a save that already won: no mutation.
	}
	if _, _, err := service.lockActorDraft(ctx, tx, runID, actor, token); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.generation_runs SET disposition='abandoned' WHERE id=$1`, runID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.generation_drafts WHERE run_id=$1`, runID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	service.registry.SetStatus(runID, "abandoned")
	return nil
}

type Claim struct {
	Token     string
	ExpiresAt time.Time
}

func (service *Service) CreateClaim(ctx context.Context, actor identity.Actor, runIDRaw, generationToken string) (Claim, error) {
	if !actor.IsVisitor() {
		return Claim{}, ErrForbidden
	}
	runID, err := uuid.Parse(runIDRaw)
	if err != nil {
		return Claim{}, ErrNotFound
	}
	if !generation.VerifyRunToken(service.capabilityKey, runID, actor, generationToken) {
		return Claim{}, ErrNotFound
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Claim{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	disposition, err := lockOwnedValidRun(ctx, tx, runID, actor)
	if err != nil {
		return Claim{}, err
	}
	if disposition != "pending" {
		return Claim{}, ErrNotFound
	}
	if _, _, err := service.lockActorDraft(ctx, tx, runID, actor, generationToken); err != nil {
		return Claim{}, err
	}
	claimToken, err := security.RandomToken()
	if err != nil {
		return Claim{}, err
	}
	expiresAt := time.Now().Add(service.claimTTL)
	_, err = tx.Exec(ctx, `
		INSERT INTO wordweave.visitor_claims(run_id, visitor_id, token_hash, expires_at)
		VALUES ($1,$4,$2,$3)`, runID,
		security.Digest(service.capabilityKey, "visitor-claim-v1", claimToken), expiresAt, actor.ID)
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return Claim{}, ErrConflict
		}
		return Claim{}, fmt.Errorf("create visitor claim: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Claim{}, err
	}
	return Claim{Token: claimToken, ExpiresAt: expiresAt}, nil
}

func (service *Service) ConsumeClaim(ctx context.Context, actor identity.Actor, claimToken string) (uuid.UUID, bool, error) {
	if !actor.IsLearner() {
		return uuid.Nil, false, ErrForbidden
	}
	if claimToken == "" {
		return uuid.Nil, false, ErrNotFound
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return uuid.Nil, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var claimID, runID, visitorID uuid.UUID
	var status string
	var consumedAccountID, consumedBatchID uuid.NullUUID
	var expiresAt time.Time
	err = tx.QueryRow(ctx, `
		SELECT id, run_id, visitor_id, status, consumed_account_id, consumed_batch_id, expires_at
		FROM wordweave.visitor_claims WHERE token_hash=$1 FOR UPDATE`,
		security.Digest(service.capabilityKey, "visitor-claim-v1", claimToken),
	).Scan(&claimID, &runID, &visitorID, &status, &consumedAccountID, &consumedBatchID, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("lock visitor claim: %w", err)
	}
	if status == "consumed" {
		if !consumedAccountID.Valid || consumedAccountID.UUID != actor.ID || !consumedBatchID.Valid {
			return uuid.Nil, false, ErrNotFound
		}
		return consumedBatchID.UUID, true, nil
	}
	if time.Now().After(expiresAt) {
		return uuid.Nil, false, ErrCapabilityExpired
	}
	draft, snapshot, err := lockDraft(ctx, tx, runID, uuid.Nil, visitorID)
	if err != nil {
		return uuid.Nil, false, err
	}
	if !time.Now().Before(draft.ExpiresAt) {
		return uuid.Nil, false, ErrCapabilityExpired
	}
	batch, err := createBatch(ctx, tx, actor.ID, snapshot, draft.Payload)
	if err != nil {
		return uuid.Nil, false, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE wordweave.generation_runs
		SET credited_account_id=$2, disposition='saved'
		WHERE id=$1 AND disposition='pending'`, runID, actor.ID); err != nil {
		return uuid.Nil, false, fmt.Errorf("credit claimed generation: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE wordweave.visitor_claims
		SET status='consumed', consumed_account_id=$2, consumed_batch_id=$3, consumed_at=clock_timestamp()
		WHERE id=$1`, claimID, actor.ID, batch.ID); err != nil {
		return uuid.Nil, false, fmt.Errorf("consume visitor claim: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.generation_drafts WHERE run_id=$1`, runID); err != nil {
		return uuid.Nil, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, false, err
	}
	return batch.ID, false, nil
}

type Summary struct {
	GenerationCount                 int
	UniqueLearnedEntries            int
	ParticipatingBatches            int
	PausedBatches                   int
	SuccessfulReviewCount           int
	BatchesEverReviewedSuccessfully int
}

func (service *Service) Summary(ctx context.Context, ownerID uuid.UUID) (Summary, error) {
	var summary Summary
	err := service.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM wordweave.generation_runs WHERE credited_account_id=$1 AND counts_toward_cumulative),
			(SELECT count(DISTINCT target.vocabulary_entry_id) FROM wordweave.batch_targets target WHERE target.owner_id=$1),
			(SELECT count(*) FROM wordweave.learning_batches WHERE owner_id=$1 AND participates_in_range_review),
			(SELECT count(*) FROM wordweave.learning_batches WHERE owner_id=$1 AND NOT participates_in_range_review),
			(SELECT count(*) FROM wordweave.review_results result JOIN wordweave.learning_batches batch ON batch.id=result.batch_id WHERE result.owner_id=$1 AND result.successful),
			(SELECT count(DISTINCT result.batch_id) FROM wordweave.review_results result JOIN wordweave.learning_batches batch ON batch.id=result.batch_id WHERE result.owner_id=$1 AND result.successful)
	`, ownerID).Scan(
		&summary.GenerationCount, &summary.UniqueLearnedEntries, &summary.ParticipatingBatches,
		&summary.PausedBatches, &summary.SuccessfulReviewCount, &summary.BatchesEverReviewedSuccessfully,
	)
	if err != nil {
		return Summary{}, fmt.Errorf("read learning summary: %w", err)
	}
	return summary, nil
}

type BatchCursor struct {
	SavedAt time.Time `json:"saved_at"`
	ID      uuid.UUID `json:"id"`
}

type BatchSummary struct {
	ID                        uuid.UUID
	SavedAt                   time.Time
	PassagePreview            string
	Tags                      []string
	Entries                   []string
	ModelName                 string
	MeaningLanguage           string
	Scenario                  string
	Length                    string
	ParticipatesInRangeReview bool
	ResumeSessionID           *uuid.UUID
}

func (service *Service) ListBatches(ctx context.Context, ownerID uuid.UUID, entry *string, cursor *BatchCursor, limit int) ([]BatchSummary, bool, error) {
	if limit < 1 || limit > 100 {
		return nil, false, ErrValidation
	}
	var entryID *int64
	if entry != nil {
		var id int64
		if err := service.pool.QueryRow(ctx, `
			SELECT id FROM wordweave.vocabulary_entries
			WHERE snapshot_id=(SELECT id FROM wordweave.vocabulary_snapshots WHERE version='m001') AND entry=$1`, *entry).Scan(&id); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, false, ErrValidation
			}
			return nil, false, err
		}
		entryID = &id
	}
	var cursorTime time.Time
	var cursorID uuid.UUID
	if cursor != nil {
		cursorTime, cursorID = cursor.SavedAt, cursor.ID
	}
	rows, err := service.pool.Query(ctx, `
		SELECT batch.id, batch.saved_at, left(batch.passage, 180), batch.tags,
			array_agg(target.source_entry_snapshot ORDER BY target.input_order),
			batch.model_display_name_snapshot, batch.meaning_language, batch.scenario, batch.length_code,
			batch.participates_in_range_review,
			(SELECT session.id FROM wordweave.review_sessions session
			 WHERE session.owner_id=batch.owner_id AND session.mode='single'
			   AND session.single_batch_id=batch.id AND session.status='in_progress' LIMIT 1)
		FROM wordweave.learning_batches batch
		JOIN wordweave.batch_targets target ON target.batch_id=batch.id
		WHERE batch.owner_id=$1
		  AND ($2::bigint IS NULL OR EXISTS(
			SELECT 1 FROM wordweave.batch_targets filter_target
			WHERE filter_target.batch_id=batch.id AND filter_target.vocabulary_entry_id=$2
		  ))
		  AND ($3::timestamptz IS NULL OR (batch.saved_at,batch.id) > ($3,$4))
		GROUP BY batch.id
		ORDER BY batch.saved_at, batch.id
		LIMIT $5`, ownerID, entryID, nullableTime(cursorTime), nullableUUID(cursorID), limit+1)
	if err != nil {
		return nil, false, fmt.Errorf("list learning batches: %w", err)
	}
	defer rows.Close()
	items := make([]BatchSummary, 0, limit+1)
	for rows.Next() {
		var item BatchSummary
		var resume uuid.NullUUID
		if err := rows.Scan(
			&item.ID, &item.SavedAt, &item.PassagePreview, &item.Tags, &item.Entries,
			&item.ModelName, &item.MeaningLanguage, &item.Scenario, &item.Length,
			&item.ParticipatesInRangeReview, &resume,
		); err != nil {
			return nil, false, err
		}
		if resume.Valid {
			value := resume.UUID
			item.ResumeSessionID = &value
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	return items, hasMore, nil
}

type BatchDetail struct {
	BatchSummary
	Passage string
	Targets []TargetDetail
	Review  ReviewSummary
}

type TargetDetail struct {
	Entry        string
	EntryMeaning string
	HintPhrase   string
	HintBlanks   []ai.Span
	Occurrences  []ai.Occurrence
}

type ReviewSummary struct {
	CompletedCount  int
	SuccessfulCount int
	LastCompletedAt *time.Time
}

func (service *Service) BatchDetail(ctx context.Context, ownerID, batchID uuid.UUID) (BatchDetail, error) {
	var detail BatchDetail
	err := service.pool.QueryRow(ctx, `
		SELECT id, saved_at, model_display_name_snapshot, meaning_language, scenario,
			length_code, participates_in_range_review, passage, tags
		FROM wordweave.learning_batches WHERE id=$1 AND owner_id=$2`, batchID, ownerID).Scan(
		&detail.ID, &detail.SavedAt, &detail.ModelName, &detail.MeaningLanguage,
		&detail.Scenario, &detail.Length, &detail.ParticipatesInRangeReview,
		&detail.Passage, &detail.Tags,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return BatchDetail{}, ErrNotFound
	}
	if err != nil {
		return BatchDetail{}, err
	}
	rows, err := service.pool.Query(ctx, `
		SELECT id, source_entry_snapshot, entry_meaning, hint_phrase,
			hint_surface, hint_start, hint_end
		FROM wordweave.batch_targets WHERE batch_id=$1 ORDER BY input_order`, batchID)
	if err != nil {
		return BatchDetail{}, err
	}
	defer rows.Close()
	type targetWithID struct {
		id            uuid.UUID
		shadowSurface string
		shadowStart   int
		shadowEnd     int
		detail        TargetDetail
	}
	var targets []targetWithID
	for rows.Next() {
		var targetID uuid.UUID
		var target TargetDetail
		var shadowSurface string
		var shadowStart, shadowEnd int
		if err := rows.Scan(&targetID, &target.Entry, &target.EntryMeaning, &target.HintPhrase, &shadowSurface, &shadowStart, &shadowEnd); err != nil {
			return BatchDetail{}, err
		}
		targets = append(targets, targetWithID{
			id: targetID, shadowSurface: shadowSurface, shadowStart: shadowStart, shadowEnd: shadowEnd, detail: target,
		})
	}
	if err := rows.Err(); err != nil {
		return BatchDetail{}, err
	}
	rows.Close()
	for _, stored := range targets {
		target := stored.detail
		hintRows, err := service.pool.Query(ctx, `
			SELECT surface, start_offset, end_offset FROM wordweave.hint_occurrences
			WHERE target_id=$1 ORDER BY occurrence_order`, stored.id)
		if err != nil {
			return BatchDetail{}, err
		}
		var firstHint ai.Occurrence
		for hintRows.Next() {
			var occurrence ai.Occurrence
			if err := hintRows.Scan(&occurrence.Surface, &occurrence.Start, &occurrence.End); err != nil {
				hintRows.Close()
				return BatchDetail{}, err
			}
			if len(target.HintBlanks) == 0 {
				firstHint = occurrence
			}
			target.HintBlanks = append(target.HintBlanks, ai.Span{Start: occurrence.Start, End: occurrence.End})
		}
		if err := hintRows.Err(); err != nil {
			hintRows.Close()
			return BatchDetail{}, err
		}
		hintRows.Close()
		if len(target.HintBlanks) == 0 || firstHint.Surface != stored.shadowSurface || firstHint.Start != stored.shadowStart || firstHint.End != stored.shadowEnd {
			return BatchDetail{}, fmt.Errorf("batch target %s has incomplete hint occurrence data", stored.id)
		}
		occurrenceRows, err := service.pool.Query(ctx, `
			SELECT surface, start_offset, end_offset FROM wordweave.passage_occurrences
			WHERE target_id=$1 ORDER BY start_offset,end_offset`, stored.id)
		if err != nil {
			return BatchDetail{}, err
		}
		for occurrenceRows.Next() {
			var occurrence ai.Occurrence
			if err := occurrenceRows.Scan(&occurrence.Surface, &occurrence.Start, &occurrence.End); err != nil {
				occurrenceRows.Close()
				return BatchDetail{}, err
			}
			target.Occurrences = append(target.Occurrences, occurrence)
		}
		if err := occurrenceRows.Err(); err != nil {
			occurrenceRows.Close()
			return BatchDetail{}, err
		}
		occurrenceRows.Close()
		if len(target.Occurrences) == 0 {
			return BatchDetail{}, fmt.Errorf("batch target %s has no passage occurrence data", stored.id)
		}
		detail.Targets = append(detail.Targets, target)
		detail.Entries = append(detail.Entries, target.Entry)
	}
	var last pgtype.Timestamptz
	if err := service.pool.QueryRow(ctx, `
		SELECT count(*), count(*) FILTER (WHERE successful), max(completed_at)
		FROM wordweave.review_results WHERE batch_id=$1 AND owner_id=$2`, batchID, ownerID).Scan(
		&detail.Review.CompletedCount, &detail.Review.SuccessfulCount, &last,
	); err != nil {
		return BatchDetail{}, err
	}
	if last.Valid {
		value := last.Time
		detail.Review.LastCompletedAt = &value
	}
	return detail, nil
}

func (service *Service) SetRangeParticipation(ctx context.Context, ownerID, batchID uuid.UUID, value bool) error {
	result, err := service.pool.Exec(ctx, `
		UPDATE wordweave.learning_batches SET participates_in_range_review=$3
		WHERE id=$1 AND owner_id=$2`, batchID, ownerID, value)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrNotFound
	}
	return nil
}

func (service *Service) DeleteBatch(ctx context.Context, ownerID, batchID uuid.UUID) error {
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// USER-CLAIM-DELETE-001: an explicit owner deletion ends the associated
	// consumed claim's retry window. Remove it before the batch so the FK's
	// SET NULL cannot violate the consumed-state constraint. Lock the claim
	// first, as ConsumeClaim does; ownership is checked before either mutation.
	// Both deletions roll back together if any later statement fails.
	if _, err := tx.Exec(ctx, `
		DELETE FROM wordweave.visitor_claims claim
		USING wordweave.learning_batches batch
		WHERE claim.consumed_batch_id=batch.id AND claim.status='consumed'
		  AND claim.consumed_account_id=$2 AND batch.id=$1 AND batch.owner_id=$2`, batchID, ownerID); err != nil {
		return fmt.Errorf("delete batch claim: %w", err)
	}
	result, err := tx.Exec(ctx, `DELETE FROM wordweave.learning_batches WHERE id=$1 AND owner_id=$2`, batchID, ownerID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrNotFound
	}
	// A range session may become empty after cascading its batch relation.
	if _, err := tx.Exec(ctx, `
		DELETE FROM wordweave.review_sessions session
		WHERE session.owner_id=$1 AND NOT EXISTS(
			SELECT 1 FROM wordweave.review_session_batches relation WHERE relation.session_id=session.id
		)`, ownerID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type draftRow struct {
	TokenHash []byte
	Payload   []byte
	ExpiresAt time.Time
}

// Lock the durable run before inspecting its disposition or any draft. This
// serializes save/discard/claim decisions even across independent processes.
func lockOwnedValidRun(ctx context.Context, tx pgx.Tx, runID uuid.UUID, actor identity.Actor) (string, error) {
	var status, disposition string
	var completedAt *time.Time
	err := tx.QueryRow(ctx, `SELECT call_status,disposition,completed_at
		FROM wordweave.generation_runs WHERE id=$1
		AND (($2='account' AND account_id=$3) OR ($2='visitor' AND visitor_id=$3))
		FOR UPDATE`, runID, actor.Kind, actor.ID).Scan(&status, &disposition, &completedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if status != "valid" || completedAt == nil {
		return "", ErrNotFound
	}
	// Pending drafts use their own persisted expiry. Terminal retries use the
	// previous registry's one-hour retention, without retaining deleted payloads.
	if disposition != "pending" && !time.Now().Before(completedAt.Add(generation.TerminalTokenRetention)) {
		return "", ErrCapabilityExpired
	}
	return disposition, nil
}

func (service *Service) lockActorDraft(ctx context.Context, tx pgx.Tx, runID uuid.UUID, actor identity.Actor, token string) (draftRow, runSnapshot, error) {
	accountID, visitorID := uuid.Nil, uuid.Nil
	if actor.IsVisitor() {
		visitorID = actor.ID
	} else {
		accountID = actor.ID
	}
	draft, snapshot, err := lockDraft(ctx, tx, runID, accountID, visitorID)
	if err != nil {
		return draftRow{}, runSnapshot{}, err
	}
	if !security.EqualDigest(draft.TokenHash, security.Digest(service.capabilityKey, "generation-token-v1", token)) {
		return draftRow{}, runSnapshot{}, ErrNotFound
	}
	if !time.Now().Before(draft.ExpiresAt) {
		return draftRow{}, runSnapshot{}, ErrCapabilityExpired
	}
	return draft, snapshot, nil
}

type runSnapshot struct {
	RunID           uuid.UUID
	GroupCode       string
	ModelName       string
	ProviderModelID string
	MeaningLanguage string
	Scenario        string
	Length          string
}

func lockDraft(ctx context.Context, tx pgx.Tx, runID, accountID, visitorID uuid.UUID) (draftRow, runSnapshot, error) {
	var lockedID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM wordweave.generation_runs
		WHERE id=$1 AND ($2::uuid IS NULL OR account_id=$2) AND ($3::uuid IS NULL OR visitor_id=$3)
		FOR UPDATE`, runID, nullableUUID(accountID), nullableUUID(visitorID)).Scan(&lockedID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return draftRow{}, runSnapshot{}, ErrNotFound
		}
		return draftRow{}, runSnapshot{}, err
	}
	var draft draftRow
	var snapshot runSnapshot
	err := tx.QueryRow(ctx, `
		SELECT draft.access_token_hash, draft.payload, draft.expires_at,
			run.id, run.group_code_snapshot, run.model_display_name_snapshot,
			run.provider_model_id_snapshot, run.meaning_language, run.scenario, run.length_code
		FROM wordweave.generation_runs run
		JOIN wordweave.generation_drafts draft ON draft.run_id=run.id
		WHERE run.id=$1 AND run.call_status='valid' AND run.disposition='pending'
		  AND ($2::uuid IS NULL OR run.account_id=$2)
		  AND ($3::uuid IS NULL OR run.visitor_id=$3)
		FOR UPDATE OF draft`, runID, nullableUUID(accountID), nullableUUID(visitorID)).Scan(
		&draft.TokenHash, &draft.Payload, &draft.ExpiresAt,
		&snapshot.RunID, &snapshot.GroupCode, &snapshot.ModelName, &snapshot.ProviderModelID,
		&snapshot.MeaningLanguage, &snapshot.Scenario, &snapshot.Length,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return draftRow{}, runSnapshot{}, ErrNotFound
	}
	if err != nil {
		return draftRow{}, runSnapshot{}, err
	}
	return draft, snapshot, nil
}

func existingBatch(ctx context.Context, tx pgx.Tx, ownerID, runID uuid.UUID) (SavedBatch, bool, error) {
	var batch SavedBatch
	err := tx.QueryRow(ctx, `
		SELECT id,saved_at FROM wordweave.learning_batches
		WHERE owner_id=$1 AND generation_run_id=$2`, ownerID, runID).Scan(&batch.ID, &batch.SavedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedBatch{}, false, nil
	}
	return batch, err == nil, err
}

func createBatch(ctx context.Context, tx pgx.Tx, ownerID uuid.UUID, snapshot runSnapshot, rawPayload []byte) (SavedBatch, error) {
	payload, err := ai.DecodeSnapshot(rawPayload)
	if err != nil {
		return SavedBatch{}, fmt.Errorf("decode validated draft: %w", err)
	}
	var batch SavedBatch
	err = tx.QueryRow(ctx, `
		INSERT INTO wordweave.learning_batches(
			owner_id,generation_run_id,group_code_snapshot,model_display_name_snapshot,
			provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,
			expected_target_count,validator_version
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id,saved_at`, ownerID, snapshot.RunID, snapshot.GroupCode, snapshot.ModelName,
		snapshot.ProviderModelID, snapshot.MeaningLanguage, snapshot.Scenario, snapshot.Length,
		payload.Passage, payload.Tags, len(payload.Targets), payload.ValidatorVersion).Scan(&batch.ID, &batch.SavedAt)
	if err != nil {
		return SavedBatch{}, fmt.Errorf("insert learning batch: %w", err)
	}
	for index, target := range payload.Targets {
		if len(target.HintOccurrences) == 0 || len(target.PassageOccurrences) == 0 {
			return SavedBatch{}, fmt.Errorf("validated target %d has incomplete occurrence data", index)
		}
		var vocabularyID int64
		if err := tx.QueryRow(ctx, `
			SELECT vocabulary_entry_id FROM wordweave.generation_run_entries
			WHERE run_id=$1 AND input_order=$2 AND source_entry_snapshot=$3`, snapshot.RunID, index, target.Entry).Scan(&vocabularyID); err != nil {
			return SavedBatch{}, fmt.Errorf("resolve saved target vocabulary: %w", err)
		}
		var targetID uuid.UUID
		if err := tx.QueryRow(ctx, `
			INSERT INTO wordweave.batch_targets(
				owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,
				entry_meaning,hint_phrase,hint_surface,hint_start,hint_end
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			RETURNING id`, ownerID, batch.ID, vocabularyID, target.Entry, index,
			target.EntryMeaning, target.HintPhrase, target.HintOccurrences[0].Surface,
			target.HintOccurrences[0].Start, target.HintOccurrences[0].End).Scan(&targetID); err != nil {
			return SavedBatch{}, fmt.Errorf("insert batch target: %w", err)
		}
		for occurrenceIndex, occurrence := range target.HintOccurrences {
			if _, err := tx.Exec(ctx, `
				INSERT INTO wordweave.hint_occurrences(
					owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset
				) VALUES ($1,$2,$3,$4,$5,$6,$7)`, ownerID, batch.ID, targetID,
				occurrenceIndex, occurrence.Surface, occurrence.Start, occurrence.End); err != nil {
				return SavedBatch{}, fmt.Errorf("insert hint occurrence: %w", err)
			}
		}
		for occurrenceIndex, occurrence := range target.PassageOccurrences {
			if _, err := tx.Exec(ctx, `
				INSERT INTO wordweave.passage_occurrences(
					owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset
				) VALUES ($1,$2,$3,$4,$5,$6,$7)`, ownerID, batch.ID, targetID,
				occurrenceIndex, occurrence.Surface, occurrence.Start, occurrence.End); err != nil {
				return SavedBatch{}, fmt.Errorf("insert passage occurrence: %w", err)
			}
		}
	}
	return batch, nil
}

func nullableUUID(value uuid.UUID) any {
	if value == uuid.Nil {
		return nil
	}
	return value
}

func nullableTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value
}
