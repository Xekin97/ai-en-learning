-- Replace legacy summaries with answer-free attempt facts. No historical start
-- time, answer presence, mastery, or growth reward is inferred.
ALTER TABLE wordweave.review_sessions
  DROP CONSTRAINT review_sessions_status_valid,
  DROP CONSTRAINT review_sessions_completion_consistent,
  ADD CONSTRAINT review_sessions_status_valid CHECK(status IN ('in_progress','completed','abandoned')),
  ADD CONSTRAINT review_sessions_completion_consistent CHECK(
    (status='in_progress' AND completed_at IS NULL) OR
    (status='completed' AND completed_at IS NOT NULL) OR
    (status='abandoned' AND mode='range' AND completed_at IS NULL));

ALTER TABLE wordweave.review_session_batches
  ADD COLUMN first_submitted_at timestamptz,
  ADD COLUMN progress_status text NOT NULL DEFAULT 'pending',
  ADD CONSTRAINT review_session_batches_progress_valid CHECK(
    (progress_status='pending' AND first_submitted_at IS NULL) OR
    (progress_status='completed' AND first_submitted_at IS NOT NULL));

CREATE TABLE wordweave.review_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  session_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK(attempt_no>0),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  origin text NOT NULL CHECK(origin IN ('m001','m002')),
  started_at timestamptz,
  submitted_at timestamptz,
  state text NOT NULL CHECK(state IN ('draft','submitted','restarted')),
  successful boolean,
  has_answer boolean,
  has_unanswered boolean,
  UNIQUE(session_id,batch_id,attempt_no),
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,session_id) REFERENCES wordweave.review_sessions(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,batch_id) REFERENCES wordweave.learning_batches(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(session_id,batch_id) REFERENCES wordweave.review_session_batches(session_id,batch_id) ON DELETE CASCADE,
  CONSTRAINT review_attempts_facts_consistent CHECK(
    (state IN ('draft','restarted') AND origin='m002' AND started_at IS NOT NULL
      AND submitted_at IS NULL AND successful IS NULL AND has_answer IS NULL AND has_unanswered IS NULL) OR
    (state='submitted' AND origin='m002' AND started_at IS NOT NULL AND submitted_at IS NOT NULL
      AND successful IS NOT NULL AND has_answer IS NOT NULL AND has_unanswered IS NOT NULL
      AND (NOT successful OR (has_answer AND NOT has_unanswered))
      AND (has_answer OR (has_unanswered AND NOT successful))) OR
    (state='submitted' AND origin='m001' AND started_at IS NULL AND submitted_at IS NOT NULL
      AND successful IS NOT NULL AND has_answer IS NULL AND has_unanswered IS NOT NULL
      AND (NOT successful OR NOT has_unanswered)))
);
CREATE UNIQUE INDEX review_attempts_one_draft ON wordweave.review_attempts(session_id) WHERE state='draft';
CREATE INDEX review_attempts_library ON wordweave.review_attempts(owner_id,batch_id,submitted_at) WHERE state='submitted';
CREATE INDEX review_attempts_latest ON wordweave.review_attempts(session_id,batch_id,attempt_no DESC)
  INCLUDE(successful,has_unanswered) WHERE state='submitted';

INSERT INTO wordweave.review_attempts(id,owner_id,session_id,batch_id,attempt_no,origin,submitted_at,state,successful,has_unanswered)
 SELECT id,owner_id,session_id,batch_id,1,'m001',completed_at,'submitted',successful,skip_count>0
 FROM wordweave.review_results;
UPDATE wordweave.review_session_batches b SET first_submitted_at=r.completed_at,progress_status='completed'
 FROM wordweave.review_results r WHERE r.session_id=b.session_id AND r.batch_id=b.batch_id;
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM wordweave.review_results r FULL JOIN wordweave.review_attempts a ON a.id=r.id
    WHERE r.id IS NULL OR a.id IS NULL OR
      (r.owner_id,r.session_id,r.batch_id,r.completed_at,r.successful,r.skip_count>0)
      IS DISTINCT FROM (a.owner_id,a.session_id,a.batch_id,a.submitted_at,a.successful,a.has_unanswered)
  ) THEN RAISE EXCEPTION 'M002 legacy review fact migration mismatch'; END IF;
END
$verify$;
DROP TABLE wordweave.review_results;
ALTER TABLE wordweave.review_attempts OWNER TO wordweave_owner;
GRANT SELECT,INSERT,UPDATE,DELETE ON wordweave.review_attempts TO wordweave_app;
GRANT SELECT ON wordweave.review_attempts TO wordweave_maintenance;
