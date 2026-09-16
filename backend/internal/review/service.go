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
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/identity"
)

var (
	ErrNotFound        = errors.New("review resource not found")
	ErrValidation      = errors.New("review validation failed")
	ErrConflict        = errors.New("review state conflict")
	ErrEmpty           = errors.New("review selection is empty")
	ErrAttemptExpired  = errors.New("review attempt expired")
	ErrIncorrectAction = errors.New("review action does not match current item")
)

type Service struct {
	pool     *pgxpool.Pool
	attempts *AttemptRegistry
}

func NewService(pool *pgxpool.Pool, capabilityKey []byte, attemptTTL time.Duration) *Service {
	return &Service{pool: pool, attempts: NewAttemptRegistry(pool, capabilityKey, attemptTTL)}
}

func (service *Service) PurgeAttempts(now time.Time) { service.attempts.PurgeExpired(now) }

type Preview struct {
	BatchCount int
	EntryCount int
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

type DateRange struct {
	StartDate string
	EndDate   string
	Timezone  string
}

type Progress struct {
	Completed    int
	Total        int
	Successful   int
	Unsuccessful int
}

type BatchProjection struct {
	ID       uuid.UUID
	SavedAt  time.Time
	Scenario string
}

type Summary struct {
	Total        int
	Successful   int
	Unsuccessful int
	Skipped      int
}

type Session struct {
	ID           uuid.UUID
	Mode         string
	Status       string
	DateRange    *DateRange
	Progress     Progress
	CurrentBatch *BatchProjection
	Summary      *Summary
	Reused       bool
}

type CreateInput struct {
	Mode      string
	StartDate string
	EndDate   string
	Timezone  string
	BatchID   uuid.UUID
}

func (service *Service) ActiveRange(ctx context.Context, ownerID uuid.UUID) (*Session, error) {
	var sessionID uuid.UUID
	err := service.pool.QueryRow(ctx, `
		SELECT id FROM wordweave.review_sessions
		WHERE owner_id=$1 AND mode='range' AND status='in_progress'`, ownerID).Scan(&sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	session, err := service.GetSession(ctx, ownerID, sessionID)
	return &session, err
}

func (service *Service) Create(ctx context.Context, ownerID uuid.UUID, input CreateInput) (Session, error) {
	if input.Mode != "range" && input.Mode != "single_batch" {
		return Session{}, ErrValidation
	}
	if input.Mode == "range" {
		if _, _, err := validateRange(input.StartDate, input.EndDate, input.Timezone); err != nil || input.BatchID != uuid.Nil {
			return Session{}, ErrValidation
		}
	} else if input.BatchID == uuid.Nil || input.StartDate != "" || input.EndDate != "" || input.Timezone != "" {
		return Session{}, ErrValidation
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Session{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var locked uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE id=$1 AND role='learner' FOR UPDATE`, ownerID).Scan(&locked); err != nil {
		return Session{}, ErrNotFound
	}
	if existing, found, err := findExistingSession(ctx, tx, ownerID, input); err != nil {
		return Session{}, err
	} else if found {
		if err := tx.Commit(ctx); err != nil {
			return Session{}, err
		}
		session, err := service.GetSession(ctx, ownerID, existing)
		session.Reused = true
		return session, err
	}

	var batches []BatchProjection
	var rangeStart, rangeEnd pgtype.Date
	var timezone pgtype.Text
	var mode string
	var singleBatch any
	if input.Mode == "range" {
		start, end, validationErr := validateRange(input.StartDate, input.EndDate, input.Timezone)
		if validationErr != nil {
			return Session{}, ErrValidation
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
			return Session{}, queryErr
		}
		for rows.Next() {
			var batch BatchProjection
			if err := rows.Scan(&batch.ID, &batch.SavedAt, &batch.Scenario); err != nil {
				rows.Close()
				return Session{}, err
			}
			batches = append(batches, batch)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return Session{}, err
		}
		rows.Close()
	} else {
		mode = "single"
		singleBatch = input.BatchID
		var batch BatchProjection
		if err := tx.QueryRow(ctx, `
			SELECT id,saved_at,scenario FROM wordweave.learning_batches WHERE id=$1 AND owner_id=$2`, input.BatchID, ownerID).Scan(&batch.ID, &batch.SavedAt, &batch.Scenario); err != nil {
			return Session{}, ErrNotFound
		}
		batches = []BatchProjection{batch}
	}
	if len(batches) == 0 {
		return Session{}, ErrEmpty
	}
	if err := secureShuffle(batches); err != nil {
		return Session{}, err
	}
	var sessionID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO wordweave.review_sessions(
			owner_id,mode,single_batch_id,range_start_date,range_end_date,timezone_name
		) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, ownerID, mode, singleBatch, rangeStart, rangeEnd, timezone).Scan(&sessionID)
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			if existing, found, readErr := findExistingSession(ctx, tx, ownerID, input); readErr == nil && found {
				_ = tx.Commit(ctx)
				session, getErr := service.GetSession(ctx, ownerID, existing)
				session.Reused = true
				return session, getErr
			}
		}
		return Session{}, err
	}
	for batchOrder, batch := range batches {
		if _, err := tx.Exec(ctx, `
			INSERT INTO wordweave.review_session_batches(owner_id,session_id,batch_id,batch_order)
			VALUES ($1,$2,$3,$4)`, ownerID, sessionID, batch.ID, batchOrder); err != nil {
			return Session{}, err
		}
		targetRows, err := tx.Query(ctx, `SELECT id FROM wordweave.batch_targets WHERE batch_id=$1`, batch.ID)
		if err != nil {
			return Session{}, err
		}
		var targets []uuid.UUID
		for targetRows.Next() {
			var targetID uuid.UUID
			if err := targetRows.Scan(&targetID); err != nil {
				targetRows.Close()
				return Session{}, err
			}
			targets = append(targets, targetID)
		}
		if err := targetRows.Err(); err != nil {
			targetRows.Close()
			return Session{}, err
		}
		targetRows.Close()
		if err := secureShuffle(targets); err != nil {
			return Session{}, err
		}
		for targetOrder, targetID := range targets {
			if _, err := tx.Exec(ctx, `
				INSERT INTO wordweave.review_session_targets(session_id,batch_id,target_id,target_order)
				VALUES ($1,$2,$3,$4)`, sessionID, batch.ID, targetID, targetOrder); err != nil {
				return Session{}, err
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Session{}, err
	}
	session, err := service.GetSession(ctx, ownerID, sessionID)
	return session, err
}

func (service *Service) GetSession(ctx context.Context, ownerID, sessionID uuid.UUID) (Session, error) {
	var session Session
	var mode, dbStatus string
	var start, end pgtype.Date
	var timezone pgtype.Text
	err := service.pool.QueryRow(ctx, `
		SELECT mode,status,range_start_date,range_end_date,timezone_name
		FROM wordweave.review_sessions WHERE id=$1 AND owner_id=$2`, sessionID, ownerID).Scan(
		&mode, &dbStatus, &start, &end, &timezone)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, err
	}
	session.ID = sessionID
	if mode == "single" {
		session.Mode = "single_batch"
	} else {
		session.Mode = "range"
		session.DateRange = &DateRange{StartDate: start.Time.Format("2006-01-02"), EndDate: end.Time.Format("2006-01-02"), Timezone: timezone.String}
	}
	if err := service.pool.QueryRow(ctx, `
		SELECT count(relation.batch_id),
			count(result.batch_id),
			count(result.batch_id) FILTER (WHERE result.successful),
			count(result.batch_id) FILTER (WHERE NOT result.successful)
		FROM wordweave.review_session_batches relation
		LEFT JOIN wordweave.review_results result
		  ON result.session_id=relation.session_id AND result.batch_id=relation.batch_id
		WHERE relation.session_id=$1`, sessionID).Scan(
		&session.Progress.Total, &session.Progress.Completed,
		&session.Progress.Successful, &session.Progress.Unsuccessful,
	); err != nil {
		return Session{}, err
	}
	if dbStatus == "in_progress" {
		session.Status = "active"
		var current BatchProjection
		err := service.pool.QueryRow(ctx, `
			SELECT batch.id,batch.saved_at,batch.scenario
			FROM wordweave.review_session_batches relation
			JOIN wordweave.learning_batches batch ON batch.id=relation.batch_id
			LEFT JOIN wordweave.review_results result
			  ON result.session_id=relation.session_id AND result.batch_id=relation.batch_id
			WHERE relation.session_id=$1 AND result.id IS NULL
			ORDER BY relation.batch_order LIMIT 1`, sessionID).Scan(&current.ID, &current.SavedAt, &current.Scenario)
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, ErrConflict
		}
		if err != nil {
			return Session{}, err
		}
		session.CurrentBatch = &current
	} else {
		session.Status = "completed"
		var skipped int
		if err := service.pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.review_results WHERE session_id=$1 AND skip_count>0`, sessionID).Scan(&skipped); err != nil {
			return Session{}, err
		}
		session.Summary = &Summary{
			Total: session.Progress.Total, Successful: session.Progress.Successful,
			Unsuccessful: session.Progress.Unsuccessful, Skipped: skipped,
		}
	}
	return session, nil
}

func (service *Service) StartAttempt(ctx context.Context, actor identity.Actor, sessionID uuid.UUID) (AttemptView, error) {
	if !actor.IsLearner() {
		return AttemptView{}, ErrNotFound
	}
	session, err := service.GetSession(ctx, actor.ID, sessionID)
	if err != nil {
		return AttemptView{}, err
	}
	if session.Status != "active" || session.CurrentBatch == nil {
		return AttemptView{}, ErrConflict
	}
	return service.attempts.Start(ctx, actor, sessionID, session.CurrentBatch.ID)
}

func (service *Service) Act(ctx context.Context, actor identity.Actor, attemptID, token string, action Action) (Outcome, error) {
	return service.attempts.Act(ctx, actor, attemptID, token, action)
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
