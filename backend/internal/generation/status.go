package generation

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/ai"
	"wordweave/internal/entitlement"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

var ErrRunExpired = errors.New("generation capability expired")

type StatusView struct {
	RunID               uuid.UUID
	Status              string
	Snapshot            RunSnapshot
	FinalContentVersion *int
	Result              *ai.ValidatedBatch
	CanSave             bool
	QuotaRefunded       bool
	ContentOutcome      *string
	CompletionNotice    *string
}

func (s *Service) ReadStatus(ctx context.Context, actor identity.Actor, runID uuid.UUID, token string) (StatusView, error) {
	var out StatusView
	out.RunID = runID
	if !VerifyRunToken(s.capabilityKey, runID, actor, token) {
		return out, ErrRunNotFound
	}
	tx, err := s.app.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	var account, visitor *uuid.UUID
	var group, origin string
	var revision int64
	var review bool
	var limit int
	var completed *time.Time
	var disposition string
	var outcome *string
	var version *int
	err = tx.QueryRow(ctx, `SELECT account_id,visitor_id,call_status,group_code_snapshot,plan_origin_snapshot,
		configuration_revision_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,
		completed_at,disposition,content_outcome,final_content_version
		FROM wordweave.generation_runs WHERE id=$1 AND content_policy_version=1`, runID).Scan(
		&account, &visitor, &out.Status, &group, &origin, &revision, &review, &limit, &completed, &disposition, &outcome, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrRunNotFound
	}
	if err != nil {
		return out, err
	}
	if (actor.IsVisitor() && (visitor == nil || *visitor != actor.ID)) || (actor.IsLearner() && (account == nil || *account != actor.ID)) {
		return out, ErrRunNotFound
	}
	if completed != nil && time.Now().After(completed.Add(TerminalTokenRetention)) {
		return out, ErrRunExpired
	}
	apiGroup := group
	if apiGroup == "registered" {
		apiGroup = "basic"
	}
	out.Snapshot = RunSnapshot{
		ConfigurationRevision:  business.Revision(s.capabilityKey, "configuration", revision),
		EffectivePlan:          EffectivePlanSnapshot{Code: apiGroup, Origin: origin},
		ContentService:         entitlement.ContentService{NativeValidation: true, ContentReviewEnabled: review, ContentRepairLimit: limit},
		NativeCorrectionPolicy: entitlement.SystemNativePolicy(),
	}
	out.ContentOutcome, out.FinalContentVersion = outcome, version
	switch out.Status {
	case "user_cancelled":
		out.Status = "cancelled"
	case "provider_failed", "server_failed", "stream_failed", "validation_failed":
		out.Status = "failed"
	}
	if outcome != nil && *outcome == OutcomeServiceIncomplete {
		value := "content_review_incomplete"
		out.CompletionNotice = &value
	}
	var charge string
	if err = tx.QueryRow(ctx, `SELECT state FROM wordweave.generation_charges WHERE run_id=$1`, runID).Scan(&charge); err != nil {
		return out, err
	}
	out.QuotaRefunded = charge == "refunded"
	if out.Status == "valid" {
		var payload []byte
		var expires time.Time
		err = tx.QueryRow(ctx, `SELECT payload,expires_at FROM wordweave.generation_drafts WHERE run_id=$1`, runID).Scan(&payload, &expires)
		if err == nil && time.Now().Before(expires) {
			var batch ai.ValidatedBatch
			if json.Unmarshal(payload, &batch) == nil && ai.ValidateSnapshot(batch) == nil {
				out.Result, out.CanSave = &batch, disposition == "pending"
			}
		} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return out, err
		}
		if out.Result == nil && actor.IsLearner() && account != nil && *account == actor.ID {
			batch, found, readErr := readSavedStatusBatch(ctx, tx, actor.ID, runID)
			if readErr != nil {
				return out, readErr
			}
			if found {
				out.Result = &batch
				out.CanSave = false
			}
		}
	}
	return out, tx.Commit(ctx)
}

func readSavedStatusBatch(ctx context.Context, tx pgx.Tx, owner, run uuid.UUID) (ai.ValidatedBatch, bool, error) {
	var result ai.ValidatedBatch
	var batchID uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id,passage,tags,validator_version FROM wordweave.learning_batches WHERE owner_id=$1 AND generation_run_id=$2`, owner, run).Scan(&batchID, &result.Passage, &result.Tags, &result.ValidatorVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, false, nil
	}
	if err != nil {
		return result, false, err
	}
	result.WordCount = ai.CountWords(result.Passage)
	rows, err := tx.Query(ctx, `SELECT id,source_entry_snapshot,entry_meaning,hint_phrase FROM wordweave.batch_targets WHERE owner_id=$1 AND batch_id=$2 ORDER BY input_order`, owner, batchID)
	if err != nil {
		return result, false, err
	}
	type storedTarget struct {
		id     uuid.UUID
		target ai.ValidatedTarget
	}
	stored := []storedTarget{}
	for rows.Next() {
		var item storedTarget
		if err = rows.Scan(&item.id, &item.target.Entry, &item.target.EntryMeaning, &item.target.HintPhrase); err != nil {
			rows.Close()
			return result, false, err
		}
		stored = append(stored, item)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return result, false, err
	}
	for _, item := range stored {
		hints, err := tx.Query(ctx, `SELECT surface,start_offset,end_offset FROM wordweave.hint_occurrences WHERE owner_id=$1 AND batch_id=$2 AND target_id=$3 ORDER BY occurrence_order`, owner, batchID, item.id)
		if err != nil {
			return result, false, err
		}
		for hints.Next() {
			var occurrence ai.Occurrence
			if err = hints.Scan(&occurrence.Surface, &occurrence.Start, &occurrence.End); err != nil {
				hints.Close()
				return result, false, err
			}
			item.target.HintOccurrences = append(item.target.HintOccurrences, occurrence)
		}
		hints.Close()
		if err = hints.Err(); err != nil {
			return result, false, err
		}
		passage, err := tx.Query(ctx, `SELECT surface,start_offset,end_offset FROM wordweave.passage_occurrences WHERE owner_id=$1 AND batch_id=$2 AND target_id=$3 ORDER BY occurrence_order`, owner, batchID, item.id)
		if err != nil {
			return result, false, err
		}
		for passage.Next() {
			var occurrence ai.Occurrence
			if err = passage.Scan(&occurrence.Surface, &occurrence.Start, &occurrence.End); err != nil {
				passage.Close()
				return result, false, err
			}
			item.target.PassageOccurrences = append(item.target.PassageOccurrences, occurrence)
		}
		passage.Close()
		if err = passage.Err(); err != nil {
			return result, false, err
		}
		result.Targets = append(result.Targets, item.target)
	}
	if ai.ValidateSnapshot(result) != nil {
		return ai.ValidatedBatch{}, false, nil
	}
	return result, true, nil
}
