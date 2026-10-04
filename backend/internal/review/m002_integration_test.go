//go:build integration

package review

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/identity"
	"wordweave/internal/testdb"
)

func fixture(t *testing.T) (*Service, *pgxpool.Pool, context.Context, identity.Actor, uuid.UUID) {
	t.Helper()
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	batch := testdb.Batch(t, ctx, pool, owner)
	return NewService(pool, []byte("persistent-test-capability-key"), 2*time.Hour), pool, ctx, identity.Actor{Kind: "account", Role: "learner", ID: owner, SessionID: uuid.New()}, batch
}
func correct(d DraftAttempt) SubmitInput {
	input := SubmitInput{ExpectedRevision: d.Revision, Words: []WordAnswer{{QuestionID: d.Words[0].QuestionID, Answer: " LEARN "}}, Passage: []PassageAnswer{}}
	surfaces := []string{"Learning", "learned"}
	index := 0
	for _, segment := range d.Passage.Segments {
		if segment.Kind == "blank" {
			input.Passage = append(input.Passage, PassageAnswer{BlankID: segment.BlankID, Answer: surfaces[index]})
			index++
		}
	}
	return input
}

func TestM002ReviewSubmissionRestartAndNoHistoricalAnswers(t *testing.T) {
	s, pool, ctx, actor, batch := fixture(t)
	session, err := s.Create(ctx, actor.ID, CreateInput{Mode: "single_batch", BatchID: batch})
	if err != nil {
		t.Fatal(err)
	}
	draft, err := s.StartAttempt(ctx, actor, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.Words) != 1 || draft.Words[0].Slots[0].Count != 5 {
		t.Fatal("incorrect letter slots")
	}
	fresh := NewService(pool, s.key, s.ttl)
	restored, err := fresh.GetAttempt(ctx, actor, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(restored.Attempt.Words, draft.Words) || !reflect.DeepEqual(restored.Attempt.Passage, draft.Passage) {
		t.Fatal("question mappings changed on process restart")
	}
	wrong := correct(draft)
	wrong.Words[0].Answer = "lear"
	wrong.Passage = wrong.Passage[:1]
	submitted, err := s.Submit(ctx, actor, draft.ID, draft.Token, wrong)
	if err != nil {
		t.Fatal(err)
	}
	if submitted.Receipt.Successful || !*submitted.Receipt.HasAnswer || submitted.Session.Progress.Skipped != 1 || submitted.Comparison == nil {
		t.Fatalf("partial submission: %+v", submitted)
	}
	duplicate, err := s.Submit(ctx, actor, draft.ID, draft.Token, correct(draft))
	if err != nil {
		t.Fatal(err)
	}
	if duplicate.Outcome != "already_submitted" || duplicate.Comparison != nil || duplicate.Growth != nil {
		t.Fatal("duplicate revealed answers or issued rewards")
	}
	read, err := s.GetAttempt(ctx, actor, draft.ID)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(read)
	for _, forbidden := range []string{"comparison", "correct", "learned", "Learning", "entry_meaning"} {
		if bytesContains(raw, forbidden) {
			t.Fatalf("historical read leaked %s", forbidden)
		}
	}
	redo, err := s.Restart(ctx, actor, draft.ID, submitted.Receipt.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if redo.Session.Progress.Completed != 1 || redo.Session.Progress.Skipped != 1 {
		t.Fatal("redo erased previous progress")
	}
	repeated, err := s.Restart(ctx, actor, draft.ID, submitted.Receipt.Revision)
	if err != nil || repeated.Attempt.ID != redo.Attempt.ID || !repeated.Reused {
		t.Fatalf("restart replay: %v", err)
	}
	success, err := s.Submit(ctx, actor, redo.Attempt.ID, redo.Attempt.Token, correct(redo.Attempt))
	if err != nil {
		t.Fatal(err)
	}
	if success.Session.Progress.Total != 1 || success.Session.Progress.Completed != 1 || success.Session.Progress.Successful != 1 || success.Session.Progress.Unsuccessful != 0 || success.Session.Progress.Skipped != 0 {
		t.Fatalf("latest-attempt progress: %+v", success.Session.Progress)
	}
	var attempts int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.review_attempts WHERE session_id=$1 AND state='submitted'`, session.ID).Scan(&attempts); err != nil || attempts != 2 {
		t.Fatal("minimal cumulative facts lost")
	}
}

func bytesContains(raw []byte, value string) bool {
	var text = string(raw)
	for i := 0; i+len(value) <= len(text); i++ {
		if text[i:i+len(value)] == value {
			return true
		}
	}
	return false
}

func TestM002ReviewTokenExpiryDoesNotDiscardDraftAndEmptyIsNotActive(t *testing.T) {
	s, pool, ctx, actor, batch := fixture(t)
	session, err := s.Create(ctx, actor.ID, CreateInput{Mode: "single_batch", BatchID: batch})
	if err != nil {
		t.Fatal(err)
	}
	draft, err := s.StartAttempt(ctx, actor, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	expired, _ := s.signer.Encode(s.tokenScope(actor, draft.ID), attemptToken{Expires: time.Now().Add(-time.Hour).Unix()})
	if _, err = s.Submit(ctx, actor, draft.ID, expired, correct(draft)); !errors.Is(err, ErrAttemptExpired) {
		t.Fatalf("expired token: %v", err)
	}
	renewed, err := s.GetAttempt(ctx, actor, draft.ID)
	if err != nil || renewed.Attempt.ID != draft.ID {
		t.Fatal("expired token discarded draft")
	}
	empty, err := s.Submit(ctx, actor, draft.ID, renewed.Attempt.Token, SubmitInput{ExpectedRevision: draft.Revision, Words: []WordAnswer{}, Passage: []PassageAnswer{}})
	if err != nil {
		t.Fatal(err)
	}
	if *empty.Receipt.HasAnswer || empty.Receipt.Successful || empty.Session.Status != "completed" {
		t.Fatal("empty final submission misclassified")
	}
	var learning *time.Time
	if err = pool.QueryRow(ctx, `SELECT last_learning_at FROM wordweave.accounts WHERE id=$1`, actor.ID).Scan(&learning); err != nil || learning != nil {
		t.Fatal("empty submission counted as learning")
	}
	other := actor
	other.ID = testdb.Learner(t, ctx, pool)
	if _, err = s.GetAttempt(ctx, other, draft.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other account read: %v", err)
	}
}

func TestM002RangeReplacementRollsBackEmptyAndRejectsOldPage(t *testing.T) {
	s, _, ctx, actor, _ := fixture(t)
	day := time.Now().UTC().Format(time.DateOnly)
	input := CreateInput{Mode: "range", StartDate: day, EndDate: day, Timezone: "UTC"}
	session, err := s.Create(ctx, actor.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	draft, err := s.StartAttempt(ctx, actor, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	current, err := s.GetSession(ctx, actor.ID, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	missing := CreateInput{Mode: "range", StartDate: "2000-01-01", EndDate: "2000-01-02", Timezone: "UTC"}
	if _, err = s.Replace(ctx, actor.ID, session.ID, current.Revision, true, missing); !errors.Is(err, ErrEmpty) {
		t.Fatalf("empty replacement: %v", err)
	}
	still, err := s.GetAttempt(ctx, actor, draft.ID)
	if err != nil || still.State != "draft" {
		t.Fatal("rejected replacement invalidated draft")
	}
	replacement, err := s.Replace(ctx, actor.ID, session.ID, current.Revision, true, input)
	if err != nil {
		t.Fatal(err)
	}
	if replacement.ID == session.ID {
		t.Fatal("range was not replaced")
	}
	if _, err = s.Submit(ctx, actor, draft.ID, draft.Token, correct(draft)); !errors.Is(err, ErrReplaced) {
		t.Fatalf("old page submit: %v", err)
	}
	if _, err = s.Restart(ctx, actor, draft.ID, draft.Revision); !errors.Is(err, ErrReplaced) {
		t.Fatalf("old page restart: %v", err)
	}
}

func TestM002MasteryIsUniqueAcrossRedoAndBatchDeletion(t *testing.T) {
	s, pool, ctx, actor, batch := fixture(t)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '1 hour',mastery_experience=7 WHERE singleton`); err != nil {
		t.Fatal(err)
	}
	session, err := s.Create(ctx, actor.ID, CreateInput{Mode: "single_batch", BatchID: batch})
	if err != nil {
		t.Fatal(err)
	}
	draft, err := s.StartAttempt(ctx, actor, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	success, err := s.Submit(ctx, actor, draft.ID, draft.Token, correct(draft))
	if err != nil {
		t.Fatal(err)
	}
	if success.Growth.NewMasteries != 1 || success.Growth.Experience != 7 {
		t.Fatalf("first mastery: %+v", success.Growth)
	}
	redo, err := s.Restart(ctx, actor, draft.ID, success.Receipt.Revision)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.Submit(ctx, actor, redo.Attempt.ID, redo.Attempt.Token, correct(redo.Attempt))
	if err != nil {
		t.Fatal(err)
	}
	if second.Growth.NewMasteries != 0 || second.Growth.Experience != 0 {
		t.Fatal("repeat mastery paid again")
	}
	if _, err = pool.Exec(ctx, `DELETE FROM wordweave.learning_batches WHERE id=$1`, batch); err != nil {
		t.Fatal(err)
	}
	var count, xp, successes int
	if err = pool.QueryRow(ctx, `SELECT g.mastered_total,g.successful_review_total,b.experience FROM wordweave.user_growth g JOIN wordweave.growth_balances b USING(owner_id) WHERE owner_id=$1`, actor.ID).Scan(&count, &successes, &xp); err != nil {
		t.Fatal(err)
	}
	if count != 1 || successes != 2 || xp != 7 {
		t.Fatal("batch deletion rolled back growth")
	}
}

func TestM002FourBatchSummaryKeepsLatestAttemptAndFirstProgress(t *testing.T) {
	s, pool, ctx, actor, _ := fixture(t)
	for i := 0; i < 3; i++ {
		testdb.Batch(t, ctx, pool, actor.ID)
	}
	day := time.Now().UTC().Format(time.DateOnly)
	session, err := s.Create(ctx, actor.ID, CreateInput{Mode: "range", StartDate: day, EndDate: day, Timezone: "UTC"})
	if err != nil {
		t.Fatal(err)
	}
	var last DraftAttempt
	var receipt Receipt
	for i := 0; i < 3; i++ {
		d, err := s.StartAttempt(ctx, actor, session.ID)
		if err != nil {
			t.Fatal(err)
		}
		input := correct(d)
		if i == 1 {
			input.Words[0].Answer = "wrong"
		}
		if i == 2 {
			input = SubmitInput{ExpectedRevision: d.Revision}
		}
		result, err := s.Submit(ctx, actor, d.ID, d.Token, input)
		if err != nil {
			t.Fatal(err)
		}
		last = d
		receipt = result.Receipt
	}
	assert := func(success, unsuccessful, skipped int) {
		t.Helper()
		current, err := s.GetSession(ctx, actor.ID, session.ID)
		if err != nil {
			t.Fatal(err)
		}
		p := current.Progress
		if p.Total != 4 || p.Completed != 3 || p.Successful != success || p.Unsuccessful != unsuccessful || p.Skipped != skipped {
			t.Fatalf("inconsistent four-batch summary: %+v", p)
		}
	}
	assert(1, 2, 1)
	redo, err := s.Restart(ctx, actor, last.ID, receipt.Revision)
	if err != nil {
		t.Fatal(err)
	}
	assert(1, 2, 1)
	if _, err = s.Submit(ctx, actor, redo.Attempt.ID, redo.Attempt.Token, correct(redo.Attempt)); err != nil {
		t.Fatal(err)
	}
	// Same timestamp cannot cause the original empty submission to win.
	if _, err = pool.Exec(ctx, `UPDATE wordweave.review_attempts SET submitted_at=clock_timestamp() WHERE session_id=$1 AND state='submitted'`, session.ID); err != nil {
		t.Fatal(err)
	}
	assert(2, 1, 0)
	var progress int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.review_session_batches WHERE session_id=$1 AND first_submitted_at IS NOT NULL`, session.ID).Scan(&progress); err != nil || progress != 3 {
		t.Fatal("redo rewrote first-completion progress")
	}
}
func TestM002RangeReplacementFailureRollsBackAndSubmitInvalidatesVersion(t *testing.T) {
	s, pool, ctx, actor, _ := fixture(t)
	testdb.Batch(t, ctx, pool, actor.ID)
	day := time.Now().UTC().Format(time.DateOnly)
	in := CreateInput{Mode: "range", StartDate: day, EndDate: day, Timezone: "UTC"}
	session, err := s.Create(ctx, actor.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	draft, err := s.StartAttempt(ctx, actor, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	before, err := s.GetSession(ctx, actor.ID, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `CREATE FUNCTION wordweave.test_fail_new_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected session failure'; END $$; CREATE TRIGGER test_fail_new_session BEFORE INSERT ON wordweave.review_sessions FOR EACH ROW EXECUTE FUNCTION wordweave.test_fail_new_session()`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Replace(ctx, actor.ID, session.ID, before.Revision, true, in); err == nil {
		t.Fatal("injected replacement unexpectedly succeeded")
	}
	after, err := s.GetSession(ctx, actor.ID, session.ID)
	if err != nil || before.Revision != after.Revision || after.Status != "active" {
		t.Fatal("failed replacement partially closed old range")
	}
	if _, err = pool.Exec(ctx, `DROP TRIGGER test_fail_new_session ON wordweave.review_sessions; DROP FUNCTION wordweave.test_fail_new_session()`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Submit(ctx, actor, draft.ID, draft.Token, correct(draft)); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Replace(ctx, actor.ID, session.ID, before.Revision, true, in); err == nil {
		t.Fatal("replacement ignored intervening submission")
	}
}
