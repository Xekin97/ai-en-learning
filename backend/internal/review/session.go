package review

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

func (s *Service) ActiveRange(ctx context.Context, owner uuid.UUID) (*Session, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT id FROM wordweave.review_sessions WHERE owner_id=$1 AND mode='range' AND status='in_progress'`, owner).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	result, err := s.GetSession(ctx, owner, id)
	return &result, err
}
func (s *Service) GetSession(ctx context.Context, owner, id uuid.UUID) (Session, error) {
	return s.readSession(ctx, s.pool, owner, id)
}

// Relationships, latest submissions, and current draft are read in one statement
// snapshot. A retry draft retains the batch's previous submitted progress.
func (s *Service) readSession(ctx context.Context, q reader, owner, id uuid.UUID) (Session, error) {
	var result Session
	var raw []byte
	var fingerprint string
	var draftRevision *int64
	err := q.QueryRow(ctx, `WITH membership AS (
  SELECT b.*,r.successful,r.has_unanswered FROM wordweave.review_session_batches b
  LEFT JOIN LATERAL(SELECT successful,has_unanswered FROM wordweave.review_attempts a WHERE a.session_id=b.session_id AND a.batch_id=b.batch_id AND a.state='submitted' ORDER BY a.attempt_no DESC LIMIT 1) r ON true WHERE b.session_id=$2
 ), progress AS (
  SELECT count(*) AS total,count(*) FILTER(WHERE progress_status='completed') AS completed,
   count(*) FILTER(WHERE successful) AS successful,count(*) FILTER(WHERE NOT successful) AS unsuccessful,
   count(*) FILTER(WHERE has_unanswered) AS skipped FROM membership
 ), draft AS (SELECT * FROM wordweave.review_attempts WHERE session_id=$2 AND state='draft'), current_batch AS (
  SELECT b.id,b.saved_at,b.scenario FROM membership m JOIN wordweave.learning_batches b ON b.id=m.batch_id
  WHERE EXISTS(SELECT 1 FROM draft d WHERE d.batch_id=b.id) OR (NOT EXISTS(SELECT 1 FROM draft) AND m.progress_status='pending')
  ORDER BY m.batch_order LIMIT 1
 ) SELECT jsonb_build_object('session_id',s.id,'mode',CASE s.mode WHEN 'single' THEN 'single_batch' ELSE 'range' END,
  'status',CASE s.status WHEN 'in_progress' THEN 'active' ELSE s.status END,
  'date_range',CASE WHEN s.mode='range' THEN jsonb_build_object('start_date',s.range_start_date,'end_date',s.range_end_date,'timezone',s.timezone_name) END,
  'progress',jsonb_build_object('total_batches',p.total,'completed_batches',p.completed,'successful_batches',p.successful,'unsuccessful_batches',p.unsuccessful,'skipped_batches',p.skipped),
  'current_batch',CASE WHEN s.status='in_progress' THEN (SELECT jsonb_build_object('batch_id',id,'saved_at',saved_at,'scenario',scenario) FROM current_batch) END,
  'current_attempt',CASE WHEN s.status='in_progress' THEN (SELECT jsonb_build_object('attempt_id',id,'revision','','state','draft') FROM draft) END),
  md5(jsonb_build_array(s.mode,s.status,s.range_start_date,s.range_end_date,s.timezone_name,
   (SELECT jsonb_agg(jsonb_build_array(batch_id,batch_order,progress_status,first_submitted_at) ORDER BY batch_order) FROM membership),
   (SELECT jsonb_agg(jsonb_build_array(id,revision,state) ORDER BY id) FROM wordweave.review_attempts WHERE session_id=$2))::text),
  (SELECT revision FROM draft)
 FROM wordweave.review_sessions s CROSS JOIN progress p WHERE s.owner_id=$1 AND s.id=$2 AND p.total>0`, owner, id).Scan(&raw, &fingerprint, &draftRevision)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, ErrNotFound
	}
	if err != nil {
		return result, err
	}
	if err = json.Unmarshal(raw, &result); err != nil {
		return result, err
	}
	result.Revision, err = s.signer.Encode("review-session:"+owner.String()+":"+id.String(), fingerprint)
	if result.CurrentAttempt != nil && draftRevision != nil {
		result.CurrentAttempt.Revision = s.attemptRevision(result.CurrentAttempt.ID, *draftRevision)
	}
	return result, err
}

func (s *Service) Replace(ctx context.Context, owner, id uuid.UUID, expected string, confirmed bool, input CreateInput) (Session, error) {
	if !confirmed || input.Mode != "range" || validateCreate(input) != nil {
		return Session{}, ErrValidation
	}
	var supplied string
	scope := "review-session:" + owner.String() + ":" + id.String()
	if err := s.signer.Decode(scope, expected, &supplied); err != nil {
		return Session{}, ErrValidation
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
	var mode, status string
	err = tx.QueryRow(ctx, `SELECT mode,status FROM wordweave.review_sessions WHERE id=$1 AND owner_id=$2 FOR UPDATE`, id, owner).Scan(&mode, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, err
	}
	if mode != "range" {
		return Session{}, ErrValidation
	}
	if status != "in_progress" {
		return Session{}, ErrReplaced
	}
	current, err := s.readSession(ctx, tx, owner, id)
	if err != nil {
		return Session{}, err
	}
	if expected != current.Revision {
		return Session{}, &business.RevisionConflict{Current: current.Revision}
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.review_attempts SET state='restarted',revision=revision+1 WHERE session_id=$1 AND state='draft'`, id); err != nil {
		return Session{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.review_sessions SET status='abandoned',completed_at=NULL WHERE id=$1`, id); err != nil {
		return Session{}, err
	}
	newID, err := s.createSession(ctx, tx, owner, input)
	if err != nil {
		return Session{}, err
	}
	result, err := s.readSession(ctx, tx, owner, newID)
	if err != nil {
		return Session{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Session{}, err
	}
	return result, nil
}
