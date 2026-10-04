package review

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

type Slot struct {
	Kind  string `json:"kind"`
	Count int    `json:"count,omitempty"`
	Text  string `json:"text,omitempty"`
}
type HintSegment struct {
	Kind string `json:"kind"`
	Text string `json:"text,omitempty"`
}
type DraftSegment struct {
	Kind     string `json:"kind"`
	Text     string `json:"text,omitempty"`
	BlankID  string `json:"blank_id,omitempty"`
	GroupKey string `json:"group_key,omitempty"`
}
type DraftWord struct {
	QuestionID   string `json:"question_id"`
	EntryMeaning string `json:"entry_meaning"`
	Slots        []Slot `json:"slots"`
	Hint         struct {
		Segments []HintSegment `json:"segments"`
	} `json:"hint"`
}
type DraftAttempt struct {
	ID             uuid.UUID   `json:"attempt_id"`
	SessionID      uuid.UUID   `json:"session_id"`
	BatchID        uuid.UUID   `json:"batch_id"`
	Revision       string      `json:"revision"`
	Token          string      `json:"attempt_token"`
	TokenExpiresAt time.Time   `json:"token_expires_at"`
	Words          []DraftWord `json:"words"`
	Passage        struct {
		Segments []DraftSegment `json:"segments"`
	} `json:"passage"`
	Reused bool `json:"-"`
}
type attemptFact struct {
	ID, SessionID, BatchID, EventID      uuid.UUID
	Number                               int
	Revision                             int64
	State, SessionState                  string
	StartedAt, SubmittedAt               *time.Time
	Successful, HasAnswer, HasUnanswered *bool
}
type attemptToken struct {
	Expires int64 `json:"expires"`
}
type questionSet struct {
	Draft                       DraftAttempt
	WordAnswers, PassageAnswers map[string]string
}

func (s *Service) attemptRevision(id uuid.UUID, revision int64) string {
	return business.Revision(s.key, "review-attempt:"+id.String(), revision)
}
func (s *Service) opaqueID(domain string, attempt, id uuid.UUID) string {
	encoded := base64.RawURLEncoding.EncodeToString(security.Digest(s.key, "review-"+domain+"-v2", attempt.String()+":"+id.String())[:16])
	if domain == "group" {
		return "grp_" + encoded
	}
	return encoded
}
func (s *Service) tokenScope(actor identity.Actor, id uuid.UUID) string {
	return "review-token:" + actor.ID.String() + ":" + actor.SessionID.String() + ":" + id.String()
}

func letterSlots(entry string) []Slot {
	result := make([]Slot, 0)
	for _, r := range entry {
		kind := "separator"
		if unicode.IsLetter(r) {
			kind = "letters"
		}
		if len(result) == 0 || result[len(result)-1].Kind != kind {
			result = append(result, Slot{Kind: kind})
		}
		last := &result[len(result)-1]
		if kind == "letters" {
			last.Count++
		} else {
			last.Text += string(r)
		}
	}
	return result
}

func (s *Service) readFact(ctx context.Context, q reader, owner, id uuid.UUID) (attemptFact, error) {
	var f attemptFact
	err := q.QueryRow(ctx, `SELECT a.id,a.session_id,a.batch_id,a.growth_event_id,a.attempt_no,a.revision,a.state,s.status,a.started_at,a.submitted_at,a.successful,a.has_answer,a.has_unanswered FROM wordweave.review_attempts a JOIN wordweave.review_sessions s ON s.id=a.session_id WHERE a.owner_id=$1 AND a.id=$2`, owner, id).Scan(&f.ID, &f.SessionID, &f.BatchID, &f.EventID, &f.Number, &f.Revision, &f.State, &f.SessionState, &f.StartedAt, &f.SubmittedAt, &f.Successful, &f.HasAnswer, &f.HasUnanswered)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}
func (s *Service) lockFact(ctx context.Context, tx pgx.Tx, owner, id uuid.UUID) (attemptFact, error) {
	f, err := s.readFact(ctx, tx, owner, id)
	if err != nil {
		return f, err
	}
	if _, err = tx.Exec(ctx, `SELECT id FROM wordweave.review_sessions WHERE id=$1 AND owner_id=$2 FOR UPDATE`, f.SessionID, owner); err != nil {
		return f, err
	}
	if _, err = tx.Exec(ctx, `SELECT id FROM wordweave.review_attempts WHERE id=$1 AND owner_id=$2 FOR UPDATE`, id, owner); err != nil {
		return f, err
	}
	return s.readFact(ctx, tx, owner, id)
}

func (s *Service) questions(ctx context.Context, q reader, actor identity.Actor, f attemptFact, now time.Time) (questionSet, error) {
	result := questionSet{Draft: DraftAttempt{ID: f.ID, SessionID: f.SessionID, BatchID: f.BatchID, Revision: s.attemptRevision(f.ID, f.Revision), Words: make([]DraftWord, 0)}, WordAnswers: make(map[string]string), PassageAnswers: make(map[string]string)}
	result.Draft.TokenExpiresAt = now.Add(s.ttl)
	token, err := s.signer.Encode(s.tokenScope(actor, f.ID), attemptToken{Expires: result.Draft.TokenExpiresAt.Unix()})
	if err != nil {
		return result, err
	}
	result.Draft.Token = token
	rows, err := q.Query(ctx, `SELECT t.id,t.source_entry_snapshot,t.entry_meaning,t.hint_phrase,
  (SELECT jsonb_agg(jsonb_build_object('start',h.start_offset,'end',h.end_offset,'surface',h.surface) ORDER BY h.occurrence_order) FROM wordweave.hint_occurrences h WHERE h.target_id=t.id)
  FROM wordweave.review_session_targets o JOIN wordweave.batch_targets t ON t.id=o.target_id
  WHERE o.session_id=$1 AND o.batch_id=$2 ORDER BY o.target_order`, f.SessionID, f.BatchID)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var target uuid.UUID
		var entry, meaning, phrase string
		var raw []byte
		if err = rows.Scan(&target, &entry, &meaning, &phrase, &raw); err != nil {
			rows.Close()
			return result, err
		}
		var occurrences []struct {
			Start   int    `json:"start"`
			End     int    `json:"end"`
			Surface string `json:"surface"`
		}
		if err = json.Unmarshal(raw, &occurrences); err != nil {
			rows.Close()
			return result, err
		}
		spans := make([]hintSpan, 0, len(occurrences))
		runes := []rune(phrase)
		for _, o := range occurrences {
			if o.Start < 0 || o.End <= o.Start || o.End > len(runes) || string(runes[o.Start:o.End]) != o.Surface {
				rows.Close()
				return result, ErrConflict
			}
			spans = append(spans, hintSpan{start: o.Start, end: o.End})
		}
		segments, err := blankSegments(phrase, spans, 0, "")
		if err != nil {
			rows.Close()
			return result, err
		}
		word := DraftWord{QuestionID: s.opaqueID("question", f.ID, target), EntryMeaning: meaning, Slots: letterSlots(entry)}
		word.Hint.Segments = make([]HintSegment, 0, len(segments))
		for _, segment := range segments {
			word.Hint.Segments = append(word.Hint.Segments, HintSegment{Kind: segment.Kind, Text: segment.Text})
		}
		result.Draft.Words = append(result.Draft.Words, word)
		result.WordAnswers[word.QuestionID] = entry
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return result, err
	}
	rows.Close()
	if len(result.Draft.Words) == 0 {
		return result, ErrNotFound
	}
	var passage string
	if err = q.QueryRow(ctx, `SELECT passage FROM wordweave.learning_batches WHERE id=$1 AND owner_id=$2`, f.BatchID, actor.ID).Scan(&passage); err != nil {
		return result, err
	}
	rows, err = q.Query(ctx, `SELECT id,target_id,surface,start_offset,end_offset FROM wordweave.passage_occurrences WHERE batch_id=$1 AND owner_id=$2 ORDER BY start_offset,end_offset`, f.BatchID, actor.ID)
	if err != nil {
		return result, err
	}
	occurrences := make([]passageOccurrence, 0)
	for rows.Next() {
		var id uuid.UUID
		var o passageOccurrence
		if err = rows.Scan(&id, &o.targetID, &o.surface, &o.start, &o.end); err != nil {
			rows.Close()
			return result, err
		}
		o.blankID = s.opaqueID("blank", f.ID, id)
		o.groupKey = s.opaqueID("group", f.ID, o.targetID)
		occurrences = append(occurrences, o)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return result, err
	}
	rows.Close()
	segments, answers, err := buildPassageSegments(passage, occurrences)
	if err != nil {
		return result, err
	}
	result.PassageAnswers = answers
	result.Draft.Passage.Segments = make([]DraftSegment, 0, len(segments))
	for _, segment := range segments {
		result.Draft.Passage.Segments = append(result.Draft.Passage.Segments, DraftSegment{Kind: segment.Kind, Text: segment.Text, BlankID: segment.BlankID, GroupKey: segment.GroupKey})
	}
	return result, nil
}

func (s *Service) newDraft(ctx context.Context, tx pgx.Tx, owner, session, batch uuid.UUID, c business.Configuration) (attemptFact, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `INSERT INTO wordweave.review_attempts(owner_id,session_id,batch_id,attempt_no,origin,started_at,state)
  SELECT $1,$2,$3,coalesce(max(attempt_no),0)+1,'m002',$4,'draft' FROM wordweave.review_attempts WHERE session_id=$2 AND batch_id=$3 RETURNING id`, owner, session, batch, c.Now).Scan(&id)
	if err != nil {
		return attemptFact{}, err
	}
	if c.ActivatedAt != nil && !c.Now.Before(*c.ActivatedAt) {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,started_at,learning_day,owner_id,source_kind,reference_key) VALUES($1,'review_started',$2,$2,$3,$4,'account',$5)`, "review-start:"+id.String(), c.Now, business.LearningDay(c.Now), owner, id); err != nil {
			return attemptFact{}, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.review_cohort_daily(start_day,started_count,updated_at) VALUES($1,1,$2) ON CONFLICT(start_day) DO UPDATE SET started_count=wordweave.review_cohort_daily.started_count+1,updated_at=excluded.updated_at`, business.LearningDay(c.Now), c.Now); err != nil {
			return attemptFact{}, err
		}
	}
	return s.readFact(ctx, tx, owner, id)
}

func (s *Service) StartAttempt(ctx context.Context, actor identity.Actor, id uuid.UUID) (DraftAttempt, error) {
	if !actor.IsLearner() {
		return DraftAttempt{}, ErrNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return DraftAttempt{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return DraftAttempt{}, err
	}
	if err = business.LockLearner(ctx, tx, actor.ID); err != nil {
		return DraftAttempt{}, err
	}
	session, err := s.readSession(ctx, tx, actor.ID, id)
	if err != nil {
		return DraftAttempt{}, err
	}
	if session.Status == "abandoned" {
		return DraftAttempt{}, ErrReplaced
	}
	if session.Status != "active" || session.CurrentBatch == nil {
		return DraftAttempt{}, ErrConflict
	}
	var f attemptFact
	reused := session.CurrentAttempt != nil
	if reused {
		f, err = s.readFact(ctx, tx, actor.ID, session.CurrentAttempt.ID)
	} else {
		f, err = s.newDraft(ctx, tx, actor.ID, id, session.CurrentBatch.ID, c)
	}
	if err != nil {
		return DraftAttempt{}, err
	}
	questions, err := s.questions(ctx, tx, actor, f, c.Now)
	if err != nil {
		return DraftAttempt{}, err
	}
	questions.Draft.Reused = reused
	if err = tx.Commit(ctx); err != nil {
		return DraftAttempt{}, err
	}
	return questions.Draft, nil
}
