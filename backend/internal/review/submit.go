package review

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/growth"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

type WordAnswer struct {
	QuestionID string `json:"question_id"`
	Answer     string `json:"answer"`
}
type PassageAnswer struct {
	BlankID string `json:"blank_id"`
	Answer  string `json:"answer"`
}
type SubmitInput struct {
	ExpectedRevision string          `json:"expected_revision"`
	Words            []WordAnswer    `json:"words"`
	Passage          []PassageAnswer `json:"passage"`
}
type Receipt struct {
	ID          uuid.UUID `json:"attempt_id"`
	BatchID     uuid.UUID `json:"batch_id"`
	Revision    string    `json:"revision"`
	SubmittedAt time.Time `json:"submitted_at"`
	Successful  bool      `json:"successful"`
	HasAnswer   *bool     `json:"has_answer"`
}
type WordComparison struct {
	QuestionID string `json:"question_id"`
	Input      string `json:"input"`
	Correct    string `json:"correct"`
	Result     string `json:"result"`
}
type Comparison struct {
	Words           []WordComparison `json:"words"`
	PassageSegments []any            `json:"passage_segments"`
}
type SubmitResult struct {
	Outcome    string        `json:"outcome"`
	Receipt    Receipt       `json:"receipt"`
	Session    Session       `json:"session"`
	Comparison *Comparison   `json:"comparison,omitempty"`
	Growth     *growth.Delta `json:"growth,omitempty"`
}
type AttemptResult struct {
	State   string        `json:"state"`
	Attempt *DraftAttempt `json:"attempt,omitempty"`
	Receipt *Receipt      `json:"receipt,omitempty"`
	Session *Session      `json:"session,omitempty"`
}
type RestartResult struct {
	Attempt DraftAttempt `json:"attempt"`
	Session Session      `json:"session"`
	Reused  bool         `json:"-"`
}

func (s *Service) receipt(f attemptFact) Receipt {
	return Receipt{ID: f.ID, BatchID: f.BatchID, Revision: s.attemptRevision(f.ID, f.Revision), SubmittedAt: *f.SubmittedAt, Successful: *f.Successful, HasAnswer: f.HasAnswer}
}

func (s *Service) GetAttempt(ctx context.Context, actor identity.Actor, id uuid.UUID) (AttemptResult, error) {
	result := AttemptResult{}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	if err = business.LockLearner(ctx, tx, actor.ID); err != nil {
		return result, err
	}
	f, err := s.readFact(ctx, tx, actor.ID, id)
	if err != nil {
		return result, err
	}
	result.State = f.State
	if f.State == "draft" {
		if f.SessionState != "in_progress" {
			return result, ErrReplaced
		}
		set, err := s.questions(ctx, tx, actor, f, c.Now)
		if err != nil {
			return result, err
		}
		result.Attempt = &set.Draft
	} else {
		session, err := s.readSession(ctx, tx, actor.ID, f.SessionID)
		if err != nil {
			return result, err
		}
		result.Session = &session
		if f.State == "submitted" {
			receipt := s.receipt(f)
			result.Receipt = &receipt
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return AttemptResult{}, err
	}
	return result, nil
}

func compareAnswer(input, expected string) (string, string) {
	input = strings.TrimSpace(input)
	if input == "" {
		return input, "unanswered"
	}
	if answerEqual(input, expected) {
		return input, "correct"
	}
	return input, "incorrect"
}

func judge(set questionSet, input SubmitInput) (Comparison, bool, bool, bool, error) {
	comparison := Comparison{Words: make([]WordComparison, 0, len(set.Draft.Words)), PassageSegments: make([]any, 0, len(set.Draft.Passage.Segments))}
	words := make(map[string]string, len(input.Words))
	passage := make(map[string]string, len(input.Passage))
	for _, answer := range input.Words {
		if _, ok := set.WordAnswers[answer.QuestionID]; !ok {
			return comparison, false, false, false, ErrValidation
		}
		if _, duplicate := words[answer.QuestionID]; duplicate {
			return comparison, false, false, false, ErrValidation
		}
		words[answer.QuestionID] = answer.Answer
	}
	for _, answer := range input.Passage {
		if _, ok := set.PassageAnswers[answer.BlankID]; !ok {
			return comparison, false, false, false, ErrValidation
		}
		if _, duplicate := passage[answer.BlankID]; duplicate {
			return comparison, false, false, false, ErrValidation
		}
		passage[answer.BlankID] = answer.Answer
	}
	successful, hasAnswer, hasUnanswered := true, false, false
	mark := func(result string) {
		successful = successful && result == "correct"
		hasAnswer = hasAnswer || result != "unanswered"
		hasUnanswered = hasUnanswered || result == "unanswered"
	}
	for _, word := range set.Draft.Words {
		expected := set.WordAnswers[word.QuestionID]
		value, result := compareAnswer(words[word.QuestionID], expected)
		mark(result)
		comparison.Words = append(comparison.Words, WordComparison{QuestionID: word.QuestionID, Input: value, Correct: expected, Result: result})
	}
	for _, segment := range set.Draft.Passage.Segments {
		if segment.Kind == "text" {
			comparison.PassageSegments = append(comparison.PassageSegments, struct {
				Kind string `json:"kind"`
				Text string `json:"text"`
			}{"text", segment.Text})
			continue
		}
		expected := set.PassageAnswers[segment.BlankID]
		value, result := compareAnswer(passage[segment.BlankID], expected)
		mark(result)
		comparison.PassageSegments = append(comparison.PassageSegments, struct {
			Kind    string `json:"kind"`
			BlankID string `json:"blank_id"`
			Input   string `json:"input"`
			Correct string `json:"correct"`
			Result  string `json:"result"`
		}{"answer", segment.BlankID, value, expected, result})
	}
	return comparison, successful && hasAnswer, hasAnswer, hasUnanswered, nil
}

func (s *Service) Submit(ctx context.Context, actor identity.Actor, id uuid.UUID, token string, input SubmitInput) (SubmitResult, error) {
	var result SubmitResult
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	if err = business.LockLearner(ctx, tx, actor.ID); err != nil {
		return result, err
	}
	f, err := s.lockFact(ctx, tx, actor.ID, id)
	if err != nil {
		return result, err
	}
	if f.SessionState == "abandoned" {
		return result, ErrReplaced
	}
	if f.State == "submitted" {
		result.Outcome = "already_submitted"
		result.Receipt = s.receipt(f)
		result.Session, err = s.readSession(ctx, tx, actor.ID, f.SessionID)
		if err != nil {
			return result, err
		}
		if err = tx.Commit(ctx); err != nil {
			return SubmitResult{}, err
		}
		return result, nil
	}
	if f.State != "draft" || f.SessionState != "in_progress" || !business.MatchRevision(s.key, "review-attempt:"+id.String(), f.Revision, input.ExpectedRevision) {
		return result, ErrConflict
	}
	var capability attemptToken
	if err = s.signer.Decode(s.tokenScope(actor, id), token, &capability); err != nil || capability.Expires <= c.Now.Unix() {
		return result, ErrAttemptExpired
	}
	set, err := s.questions(ctx, tx, actor, f, c.Now)
	if err != nil {
		return result, err
	}
	comparison, successful, hasAnswer, hasUnanswered, err := judge(set, input)
	if err != nil {
		return result, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.review_attempts SET state='submitted',revision=revision+1,submitted_at=$2,successful=$3,has_answer=$4,has_unanswered=$5 WHERE id=$1 AND state='draft'`, id, c.Now, successful, hasAnswer, hasUnanswered); err != nil {
		return result, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.review_session_batches SET first_submitted_at=coalesce(first_submitted_at,$3),progress_status='completed' WHERE session_id=$1 AND batch_id=$2`, f.SessionID, f.BatchID, c.Now); err != nil {
		return result, err
	}
	delta, err := growth.RecordReview(ctx, tx, actor.ID, f.BatchID, f.EventID, successful, hasAnswer, c)
	if err != nil {
		return result, err
	}
	if growth.Enabled(c) {
		outcome := "unsuccessful"
		if successful {
			outcome = "successful"
		} else if !hasAnswer {
			outcome = "empty"
		}
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,started_at,learning_day,owner_id,event_outcome,source_kind,reference_key) VALUES($1,'review_submitted',$2,$3,$4,$5,$6,'account',$7)`, "review-submit:"+id.String(), c.Now, f.StartedAt, business.LearningDay(c.Now), actor.ID, outcome, id); err != nil {
			return result, err
		}
		if f.StartedAt != nil && !f.StartedAt.Before(*c.ActivatedAt) {
			success := 0
			if successful {
				success = 1
			}
			if _, err = tx.Exec(ctx, `UPDATE wordweave.review_cohort_daily SET submitted_count=submitted_count+1,successful_count=successful_count+$2,updated_at=$3 WHERE start_day=$1`, business.LearningDay(*f.StartedAt), success, c.Now); err != nil {
				return result, err
			}
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.review_sessions SET status='completed',completed_at=$2 WHERE id=$1 AND status='in_progress'
  AND NOT EXISTS(SELECT 1 FROM wordweave.review_session_batches WHERE session_id=$1 AND progress_status='pending')
  AND NOT EXISTS(SELECT 1 FROM wordweave.review_attempts WHERE session_id=$1 AND state='draft')`, f.SessionID, c.Now); err != nil {
		return result, err
	}
	f, err = s.readFact(ctx, tx, actor.ID, id)
	if err != nil {
		return result, err
	}
	result = SubmitResult{Outcome: "submitted", Receipt: s.receipt(f), Comparison: &comparison, Growth: &delta}
	result.Session, err = s.readSession(ctx, tx, actor.ID, f.SessionID)
	if err != nil {
		return result, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SubmitResult{}, err
	}
	return result, nil
}

func (s *Service) Restart(ctx context.Context, actor identity.Actor, id uuid.UUID, expected string) (RestartResult, error) {
	var result RestartResult
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	if err = business.LockLearner(ctx, tx, actor.ID); err != nil {
		return result, err
	}
	f, err := s.lockFact(ctx, tx, actor.ID, id)
	if err != nil {
		return result, err
	}
	if f.SessionState == "abandoned" {
		return result, ErrReplaced
	}
	checkRevision := f.Revision
	if f.State == "restarted" {
		checkRevision--
	}
	if !business.MatchRevision(s.key, "review-attempt:"+id.String(), checkRevision, expected) {
		return result, ErrConflict
	}
	var successor uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM wordweave.review_attempts WHERE session_id=$1 AND batch_id=$2 AND attempt_no=$3 AND state='draft'`, f.SessionID, f.BatchID, f.Number+1).Scan(&successor)
	if err == nil {
		next, readErr := s.readFact(ctx, tx, actor.ID, successor)
		if readErr != nil {
			return result, readErr
		}
		set, readErr := s.questions(ctx, tx, actor, next, c.Now)
		if readErr != nil {
			return result, readErr
		}
		result.Attempt = set.Draft
		result.Reused = true
	} else {
		if !errors.Is(err, pgx.ErrNoRows) {
			return result, err
		}
		if f.State == "restarted" {
			return result, ErrConflict
		}
		var later bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.review_attempts WHERE session_id=$1 AND id<>$2 AND ((started_at,id)>($3,$2) OR state='draft'))`, f.SessionID, f.ID, f.StartedAt).Scan(&later); err != nil {
			return result, err
		}
		if later {
			return result, ErrConflict
		}
		if f.SessionState == "completed" {
			var mode string
			var batch *uuid.UUID
			if err = tx.QueryRow(ctx, `SELECT mode,single_batch_id FROM wordweave.review_sessions WHERE id=$1`, f.SessionID).Scan(&mode, &batch); err != nil {
				return result, err
			}
			input := CreateInput{Mode: "range"}
			if mode == "single" {
				input.Mode = "single_batch"
				input.BatchID = *batch
			}
			if _, found, readErr := findExistingSession(ctx, tx, actor.ID, input); readErr != nil {
				return result, readErr
			} else if found {
				return result, ErrSessionConflict
			}
			if _, err = tx.Exec(ctx, `UPDATE wordweave.review_sessions SET status='in_progress',completed_at=NULL WHERE id=$1`, f.SessionID); err != nil {
				return result, err
			}
		}
		if f.State == "draft" {
			if _, err = tx.Exec(ctx, `UPDATE wordweave.review_attempts SET state='restarted',revision=revision+1 WHERE id=$1`, f.ID); err != nil {
				return result, err
			}
		}
		next, readErr := s.newDraft(ctx, tx, actor.ID, f.SessionID, f.BatchID, c)
		if readErr != nil {
			return result, readErr
		}
		set, readErr := s.questions(ctx, tx, actor, next, c.Now)
		if readErr != nil {
			return result, readErr
		}
		result.Attempt = set.Draft
	}
	result.Session, err = s.readSession(ctx, tx, actor.ID, f.SessionID)
	if err != nil {
		return result, err
	}
	if err = tx.Commit(ctx); err != nil {
		return RestartResult{}, err
	}
	return result, nil
}
