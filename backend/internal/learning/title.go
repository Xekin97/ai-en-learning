package learning

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type TitleResult struct {
	BatchID  uuid.UUID `json:"batch_id"`
	Title    string    `json:"title"`
	Revision string    `json:"title_revision"`
}

func (service *Service) SetTitle(ctx context.Context, ownerID, batchID uuid.UUID, title, expected string) (TitleResult, error) {
	title = strings.TrimSpace(title)
	if title == "" || expected == "" || !utf8.ValidString(title) {
		return TitleResult{}, ErrValidation
	}
	tx, err := service.pool.Begin(ctx)
	if err != nil {
		return TitleResult{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return TitleResult{}, err
	}
	if err = business.LockLearner(ctx, tx, ownerID); err != nil {
		if errors.Is(err, business.ErrNotFound) {
			err = ErrNotFound
		}
		return TitleResult{}, err
	}
	var current string
	var revision int64
	var maximum int
	err = tx.QueryRow(ctx, `SELECT b.title,b.title_revision,greatest(200,(SELECT char_length(string_agg(source_entry_snapshot,' · ' ORDER BY input_order)) FROM wordweave.batch_targets WHERE batch_id=b.id)) FROM wordweave.learning_batches b WHERE b.owner_id=$1 AND b.id=$2 FOR UPDATE`, ownerID, batchID).Scan(&current, &revision, &maximum)
	if errors.Is(err, pgx.ErrNoRows) {
		return TitleResult{}, ErrNotFound
	}
	if err != nil {
		return TitleResult{}, err
	}
	scope := "batch-title:" + batchID.String()
	if !business.MatchRevision(service.capabilityKey, scope, revision, expected) {
		return TitleResult{}, &business.RevisionConflict{Current: business.Revision(service.capabilityKey, scope, revision)}
	}
	if utf8.RuneCountInString(title) > maximum {
		return TitleResult{}, ErrValidation
	}
	if title != current {
		if err = tx.QueryRow(ctx, `UPDATE wordweave.learning_batches SET title=$3,title_revision=title_revision+1 WHERE owner_id=$1 AND id=$2 RETURNING title_revision`, ownerID, batchID, title).Scan(&revision); err != nil {
			return TitleResult{}, err
		}
	}
	result := TitleResult{BatchID: batchID, Title: title, Revision: business.Revision(service.capabilityKey, scope, revision)}
	if err = tx.Commit(ctx); err != nil {
		return TitleResult{}, err
	}
	return result, nil
}
