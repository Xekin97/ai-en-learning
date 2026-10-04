-- M002 DB2-M02/M03. Existing learning content and vocabulary IDs are retained.
ALTER TABLE wordweave.accounts
  ADD COLUMN nickname text,
  ADD COLUMN gender text,
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN last_learning_at timestamptz,
  ADD CONSTRAINT accounts_nickname_valid CHECK (nickname IS NULL OR (btrim(nickname)<>'' AND char_length(nickname)<=64)),
  ADD CONSTRAINT accounts_gender_valid CHECK (gender IS NULL OR gender IN ('female','male'));

CREATE TABLE wordweave.lexemes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_entry text NOT NULL UNIQUE,
  CHECK (canonical_entry<>'' AND canonical_entry=btrim(canonical_entry) AND canonical_entry=lower(canonical_entry))
);
INSERT INTO wordweave.lexemes(canonical_entry)
  SELECT DISTINCT entry FROM wordweave.vocabulary_entries ORDER BY entry;
ALTER TABLE wordweave.vocabulary_entries ADD COLUMN lexeme_id bigint REFERENCES wordweave.lexemes(id) ON DELETE RESTRICT;
UPDATE wordweave.vocabulary_entries v SET lexeme_id=l.id FROM wordweave.lexemes l WHERE l.canonical_entry=v.entry;
ALTER TABLE wordweave.vocabulary_entries ALTER COLUMN lexeme_id SET NOT NULL,
  ADD CONSTRAINT vocabulary_entries_snapshot_lexeme_unique UNIQUE(snapshot_id,lexeme_id);

ALTER TABLE wordweave.learning_batches ADD COLUMN title text,
  ADD COLUMN title_revision bigint NOT NULL DEFAULT 1 CHECK(title_revision>0);
UPDATE wordweave.learning_batches b SET title=t.title FROM (
  SELECT batch_id,string_agg(source_entry_snapshot,' · ' ORDER BY input_order) AS title
  FROM wordweave.batch_targets GROUP BY batch_id
) t WHERE t.batch_id=b.id;
-- The inherited completeness trigger queues an event on title backfill. Flush
-- it before the following ALTER TABLE; otherwise populated M001 databases fail.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE wordweave.learning_batches ALTER COLUMN title SET NOT NULL,
  ADD CONSTRAINT learning_batches_title_nonempty CHECK(btrim(title)<>'');

ALTER TABLE wordweave.ai_models ADD COLUMN retired_at timestamptz,
  ADD CONSTRAINT ai_models_retired_disabled CHECK(retired_at IS NULL OR NOT enabled);
DROP INDEX wordweave.ai_models_display_name_lower_unique_idx;
ALTER TABLE wordweave.ai_models DROP CONSTRAINT ai_models_provider_model_id_key;
CREATE UNIQUE INDEX ai_models_active_name_unique ON wordweave.ai_models(lower(display_name)) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX ai_models_active_provider_unique ON wordweave.ai_models(provider_model_id) WHERE retired_at IS NULL;

-- Preserve the existing four-plan ordering. Operators can subsequently exchange
-- priorities atomically; this does not seed rewards or activate growth.
ALTER TABLE wordweave.entitlement_groups ADD COLUMN priority integer;
UPDATE wordweave.entitlement_groups SET priority=CASE code WHEN 'visitor' THEN 0 WHEN 'registered' THEN 1 WHEN 'pro' THEN 2 WHEN 'plus' THEN 3 END;
ALTER TABLE wordweave.entitlement_groups ALTER COLUMN priority SET NOT NULL,
  ADD CONSTRAINT entitlement_groups_priority_unique UNIQUE(priority) DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE wordweave.growth_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  activated_at timestamptz,
  mastery_experience bigint NOT NULL DEFAULT 0 CHECK(mastery_experience>=0),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  recompute_target_revision bigint NOT NULL DEFAULT 1 CHECK(recompute_target_revision>0),
  recompute_after_owner uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO wordweave.growth_settings(singleton) VALUES(true);

ALTER TABLE wordweave.lexemes OWNER TO wordweave_owner;
ALTER TABLE wordweave.growth_settings OWNER TO wordweave_owner;
GRANT SELECT ON wordweave.lexemes TO wordweave_app;
GRANT SELECT,UPDATE ON wordweave.growth_settings TO wordweave_app,wordweave_maintenance;
