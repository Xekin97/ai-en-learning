package review

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"
	_ "time/tzdata"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

var (
	ErrNotFound        = errors.New("review resource not found")
	ErrValidation      = errors.New("review validation failed")
	ErrConflict        = errors.New("review state conflict")
	ErrEmpty           = errors.New("review selection is empty")
	ErrAttemptExpired  = errors.New("review token expired")
	ErrIncorrectAction = errors.New("review action does not match current item")
	ErrReplaced        = errors.New("review session replaced")
	ErrSessionConflict = errors.New("another review session is active")
)

type Service struct {
	pool   *pgxpool.Pool
	key    []byte
	ttl    time.Duration
	signer security.CursorSigner
}

func NewService(pool *pgxpool.Pool, key []byte, ttl time.Duration) *Service {
	return &Service{pool: pool, key: append([]byte(nil), key...), ttl: ttl, signer: security.NewCursorSigner(key)}
}
func (s *Service) PurgeAttempts(now time.Time) {} // Draft facts do not expire with tokens.
type Preview struct{ BatchCount, EntryCount int }
type DateRange struct {
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Timezone  string `json:"timezone"`
}
type Progress struct {
	Completed    int `json:"completed_batches"`
	Total        int `json:"total_batches"`
	Successful   int `json:"successful_batches"`
	Unsuccessful int `json:"unsuccessful_batches"`
	Skipped      int `json:"skipped_batches"`
}
type BatchProjection struct {
	ID       uuid.UUID `json:"batch_id"`
	SavedAt  time.Time `json:"saved_at"`
	Scenario string    `json:"scenario"`
}
type Summary struct{ Total, Successful, Unsuccessful, Skipped int }
type CurrentAttempt struct {
	ID       uuid.UUID `json:"attempt_id"`
	Revision string    `json:"revision"`
	State    string    `json:"state"`
}
type Session struct {
	ID             uuid.UUID        `json:"session_id"`
	Mode           string           `json:"mode"`
	Status         string           `json:"status"`
	DateRange      *DateRange       `json:"date_range"`
	Progress       Progress         `json:"progress"`
	CurrentBatch   *BatchProjection `json:"current_batch"`
	CurrentAttempt *CurrentAttempt  `json:"current_attempt"`
	Reused         bool             `json:"-"`
	Revision       string           `json:"-"`
	Summary        *Summary         `json:"-"`
}
type CreateInput struct {
	Mode, StartDate, EndDate, Timezone string
	BatchID                            uuid.UUID
}
type reader interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func validateCreate(input CreateInput) error {
	if input.Mode == "range" {
		_, _, err := validateRange(input.StartDate, input.EndDate, input.Timezone)
		if err != nil || input.BatchID != uuid.Nil {
			return ErrValidation
		}
		return nil
	}
	if input.Mode != "single_batch" || input.BatchID == uuid.Nil || input.StartDate != "" || input.EndDate != "" || input.Timezone != "" {
		return ErrValidation
	}
	return nil
}
func (s *Service) Create(ctx context.Context, owner uuid.UUID, input CreateInput) (Session, error) {
	if err := validateCreate(input); err != nil {
		return Session{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return Session{}, err
	}
	if err = business.LockLearner(ctx, tx, owner); err != nil {
		return Session{}, err
	}
	id, reused, err := findExistingSession(ctx, tx, owner, input)
	if err != nil {
		return Session{}, err
	}
	if !reused {
		id, err = s.createSession(ctx, tx, owner, input)
		if err != nil {
			return Session{}, err
		}
	}
	result, err := s.readSession(ctx, tx, owner, id)
	if err != nil {
		return Session{}, err
	}
	result.Reused = reused
	if err = tx.Commit(ctx); err != nil {
		return Session{}, err
	}
	return result, nil
}
func (s *Service) createSession(ctx context.Context, tx pgx.Tx, ownerID uuid.UUID, input CreateInput) (uuid.UUID, error) {
	var batches []BatchProjection
	var rangeStart, rangeEnd pgtype.Date
	var timezone pgtype.Text
	var mode string
	var singleBatch any
	if input.Mode == "range" {
		start, end, validationErr := validateRange(input.StartDate, input.EndDate, input.Timezone)
		if validationErr != nil {
			return uuid.Nil, ErrValidation
		}
		rangeStart, rangeEnd = pgtype.Date{Time: start, Valid: true}, pgtype.Date{Time: end, Valid: true}
		timezone = pgtype.Text{String: input.Timezone, Valid: true}
		mode = "range"
		singleBatch = nil
		rows, queryErr := tx.Query(ctx, `
			SELECT id,saved_at,scenario FROM wordweave.learning_batches
			WHERE owner_id=$1 AND participates_in_range_review
			  AND (saved_at AT TIME ZONE $4)::date BETWEEN $2 AND $3`, ownerID, start, end, input.Timezone)
		if queryErr != nil {
			return uuid.Nil, queryErr
		}
		for rows.Next() {
			var batch BatchProjection
			if err := rows.Scan(&batch.ID, &batch.SavedAt, &batch.Scenario); err != nil {
				rows.Close()
				return uuid.Nil, err
			}
			batches = append(batches, batch)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return uuid.Nil, err
		}
		rows.Close()
	} else {
		mode = "single"
		singleBatch = input.BatchID
		var batch BatchProjection
		if err := tx.QueryRow(ctx, `
			SELECT id,saved_at,scenario FROM wordweave.learning_batches WHERE id=$1 AND owner_id=$2`, input.BatchID, ownerID).Scan(&batch.ID, &batch.SavedAt, &batch.Scenario); err != nil {
			return uuid.Nil, ErrNotFound
		}
		batches = []BatchProjection{batch}
	}
	if len(batches) == 0 {
		return uuid.Nil, ErrEmpty
	}
	if err := secureShuffle(batches); err != nil {
		return uuid.Nil, err
	}
	var sessionID uuid.UUID
	err := tx.QueryRow(ctx, `
		INSERT INTO wordweave.review_sessions(
			owner_id,mode,single_batch_id,range_start_date,range_end_date,timezone_name
		) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, ownerID, mode, singleBatch, rangeStart, rangeEnd, timezone).Scan(&sessionID)
	if err != nil {
		return uuid.Nil, err
	}

	for batchOrder, batch := range batches {
		if _, err := tx.Exec(ctx, `
			INSERT INTO wordweave.review_session_batches(owner_id,session_id,batch_id,batch_order)
			VALUES ($1,$2,$3,$4)`, ownerID, sessionID, batch.ID, batchOrder); err != nil {
			return uuid.Nil, err
		}
		targetRows, err := tx.Query(ctx, `SELECT id FROM wordweave.batch_targets WHERE batch_id=$1`, batch.ID)
		if err != nil {
			return uuid.Nil, err
		}
		var targets []uuid.UUID
		for targetRows.Next() {
			var targetID uuid.UUID
			if err := targetRows.Scan(&targetID); err != nil {
				targetRows.Close()
				return uuid.Nil, err
			}
			targets = append(targets, targetID)
		}
		if err := targetRows.Err(); err != nil {
			targetRows.Close()
			return uuid.Nil, err
		}
		targetRows.Close()
		if err := secureShuffle(targets); err != nil {
			return uuid.Nil, err
		}
		for targetOrder, targetID := range targets {
			if _, err := tx.Exec(ctx, `
				INSERT INTO wordweave.review_session_targets(session_id,batch_id,target_id,target_order)
				VALUES ($1,$2,$3,$4)`, sessionID, batch.ID, targetID, targetOrder); err != nil {
				return uuid.Nil, err
			}
		}
	}
	return sessionID, nil
}
func (service *Service) Preview(ctx context.Context, ownerID uuid.UUID, startDate, endDate, timezone string) (Preview, error) {
	start, end, err := validateRange(startDate, endDate, timezone)
	if err != nil {
		return Preview{}, ErrValidation
	}
	var preview Preview
	err = service.pool.QueryRow(ctx, `
		SELECT count(DISTINCT batch.id), count(target.id)
		FROM wordweave.learning_batches batch
		LEFT JOIN wordweave.batch_targets target ON target.batch_id=batch.id
		WHERE batch.owner_id=$1 AND batch.participates_in_range_review
		  AND (batch.saved_at AT TIME ZONE $4)::date BETWEEN $2 AND $3`,
		ownerID, start, end, timezone).Scan(&preview.BatchCount, &preview.EntryCount)
	if err != nil {
		return Preview{}, fmt.Errorf("preview review range: %w", err)
	}
	return preview, nil
}

func validateRange(startRaw, endRaw, timezone string) (time.Time, time.Time, error) {
	if timezone == "" {
		return time.Time{}, time.Time{}, ErrValidation
	}
	if _, err := time.LoadLocation(timezone); err != nil {
		return time.Time{}, time.Time{}, ErrValidation
	}
	start, err := time.Parse("2006-01-02", startRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := time.Parse("2006-01-02", endRaw)
	if err != nil || end.Before(start) {
		return time.Time{}, time.Time{}, ErrValidation
	}
	return start, end, nil
}

func findExistingSession(ctx context.Context, tx pgx.Tx, ownerID uuid.UUID, input CreateInput) (uuid.UUID, bool, error) {
	var sessionID uuid.UUID
	var err error
	if input.Mode == "range" {
		err = tx.QueryRow(ctx, `
			SELECT id FROM wordweave.review_sessions
			WHERE owner_id=$1 AND mode='range' AND status='in_progress' FOR UPDATE`, ownerID).Scan(&sessionID)
	} else if input.BatchID != uuid.Nil {
		err = tx.QueryRow(ctx, `
			SELECT id FROM wordweave.review_sessions
			WHERE owner_id=$1 AND mode='single' AND single_batch_id=$2 AND status='in_progress' FOR UPDATE`, ownerID, input.BatchID).Scan(&sessionID)
	} else {
		return uuid.Nil, false, nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	return sessionID, err == nil, err
}

func secureShuffle[S ~[]E, E any](values S) error {
	for index := len(values) - 1; index > 0; index-- {
		random, err := rand.Int(rand.Reader, big.NewInt(int64(index+1)))
		if err != nil {
			return err
		}
		other := int(random.Int64())
		values[index], values[other] = values[other], values[index]
	}
	return nil
}
