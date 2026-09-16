CREATE TABLE wordweave.vocabulary_snapshots (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  version text NOT NULL UNIQUE,
  sha256 char(64) NOT NULL UNIQUE,
  byte_size integer NOT NULL,
  entry_count integer NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT vocabulary_snapshots_byte_size_positive CHECK (byte_size > 0),
  CONSTRAINT vocabulary_snapshots_entry_count_positive CHECK (entry_count > 0),
  CONSTRAINT vocabulary_snapshots_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE wordweave.vocabulary_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES wordweave.vocabulary_snapshots(id) ON DELETE RESTRICT,
  entry text NOT NULL,
  source_order integer NOT NULL,
  CONSTRAINT vocabulary_entries_entry_nonempty CHECK (entry <> ''),
  CONSTRAINT vocabulary_entries_entry_trimmed CHECK (btrim(entry) = entry),
  CONSTRAINT vocabulary_entries_entry_lowercase CHECK (entry = lower(entry)),
  CONSTRAINT vocabulary_entries_source_order_nonnegative CHECK (source_order >= 0),
  CONSTRAINT vocabulary_entries_snapshot_entry_unique UNIQUE (snapshot_id, entry),
  CONSTRAINT vocabulary_entries_snapshot_order_unique UNIQUE (snapshot_id, source_order)
);

CREATE INDEX vocabulary_entries_prefix_idx
  ON wordweave.vocabulary_entries (snapshot_id, entry text_pattern_ops);

CREATE TABLE wordweave.entitlement_groups (
  code text PRIMARY KEY,
  rolling_quota_limit integer,
  max_entries_per_run integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT entitlement_groups_code_fixed CHECK (code IN ('visitor', 'registered', 'pro', 'plus')),
  CONSTRAINT entitlement_groups_quota_nonnegative CHECK (rolling_quota_limit IS NULL OR rolling_quota_limit >= 0),
  CONSTRAINT entitlement_groups_max_entries_positive CHECK (max_entries_per_run > 0)
);

CREATE TABLE wordweave.accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  username varchar(32) NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL,
  group_code text REFERENCES wordweave.entitlement_groups(code) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  ui_locale text,
  quota_reset_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT accounts_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,32}$'),
  CONSTRAINT accounts_password_hash_nonempty CHECK (password_hash <> ''),
  CONSTRAINT accounts_role_valid CHECK (role IN ('learner', 'admin')),
  CONSTRAINT accounts_status_active CHECK (status = 'active'),
  CONSTRAINT accounts_ui_locale_valid CHECK (ui_locale IS NULL OR ui_locale IN ('zh-CN', 'en-US')),
  CONSTRAINT accounts_role_group_consistent CHECK (
    (role = 'learner' AND group_code IN ('registered', 'pro', 'plus')) OR
    (role = 'admin' AND group_code IS NULL)
  ),
  CONSTRAINT accounts_owner_pair_unique UNIQUE (id, role)
);

CREATE UNIQUE INDEX accounts_username_lower_unique_idx ON wordweave.accounts (lower(username));

CREATE TABLE wordweave.account_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT account_sessions_expiry_after_create CHECK (expires_at > created_at)
);

CREATE INDEX account_sessions_account_idx ON wordweave.account_sessions(account_id);
CREATE INDEX account_sessions_expiry_idx ON wordweave.account_sessions(expires_at);

CREATE TABLE wordweave.visitor_identities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE INDEX visitor_identities_last_seen_idx ON wordweave.visitor_identities(last_seen_at);

CREATE TABLE wordweave.ai_models (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  display_name text NOT NULL,
  description text,
  provider_model_id text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT ai_models_display_name_nonempty CHECK (btrim(display_name) <> ''),
  CONSTRAINT ai_models_description_nonempty CHECK (description IS NULL OR btrim(description) <> ''),
  CONSTRAINT ai_models_provider_id_nonempty CHECK (btrim(provider_model_id) <> '')
);

CREATE UNIQUE INDEX ai_models_display_name_lower_unique_idx ON wordweave.ai_models(lower(display_name));

CREATE TABLE wordweave.group_models (
  group_code text NOT NULL REFERENCES wordweave.entitlement_groups(code) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  PRIMARY KEY (group_code, model_id)
);

CREATE INDEX group_models_model_idx ON wordweave.group_models(model_id, group_code);

CREATE TABLE wordweave.group_lengths (
  group_code text NOT NULL REFERENCES wordweave.entitlement_groups(code) ON DELETE CASCADE,
  length_code text NOT NULL,
  PRIMARY KEY (group_code, length_code),
  CONSTRAINT group_lengths_code_valid CHECK (length_code IN ('short', 'medium', 'long', 'xlong'))
);

CREATE TABLE wordweave.openrouter_credentials (
  provider text PRIMARY KEY DEFAULT 'openrouter',
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  encryption_key_version integer NOT NULL,
  display_fingerprint text NOT NULL,
  updated_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT openrouter_credentials_singleton CHECK (provider = 'openrouter'),
  CONSTRAINT openrouter_credentials_ciphertext_nonempty CHECK (octet_length(ciphertext) > 0),
  CONSTRAINT openrouter_credentials_nonce_nonempty CHECK (octet_length(nonce) > 0),
  CONSTRAINT openrouter_credentials_key_version_positive CHECK (encryption_key_version > 0),
  CONSTRAINT openrouter_credentials_fingerprint_nonempty CHECK (display_fingerprint <> '')
);

CREATE TABLE wordweave.generation_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id uuid REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  visitor_id uuid REFERENCES wordweave.visitor_identities(id) ON DELETE CASCADE,
  credited_account_id uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  group_code_snapshot text NOT NULL,
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  model_display_name_snapshot text NOT NULL,
  provider_model_id_snapshot text NOT NULL,
  meaning_language text NOT NULL,
  scenario text NOT NULL,
  length_code text NOT NULL,
  minimum_words_snapshot integer NOT NULL,
  quota_limit_snapshot integer,
  max_entries_snapshot integer NOT NULL,
  call_status text NOT NULL DEFAULT 'active',
  disposition text NOT NULL DEFAULT 'pending',
  quota_charged boolean NOT NULL DEFAULT true,
  counts_toward_cumulative boolean NOT NULL DEFAULT false,
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT generation_runs_exactly_one_subject CHECK ((account_id IS NULL) <> (visitor_id IS NULL)),
  CONSTRAINT generation_runs_group_code_valid CHECK (group_code_snapshot IN ('visitor', 'registered', 'pro', 'plus')),
  CONSTRAINT generation_runs_meaning_language_valid CHECK (meaning_language IN ('zh', 'en', 'ja')),
  CONSTRAINT generation_runs_scenario_valid CHECK (scenario IN ('discussion', 'story', 'business', 'news')),
  CONSTRAINT generation_runs_length_valid CHECK (length_code IN ('short', 'medium', 'long', 'xlong')),
  CONSTRAINT generation_runs_minimum_words_positive CHECK (minimum_words_snapshot > 0),
  CONSTRAINT generation_runs_quota_snapshot_nonnegative CHECK (quota_limit_snapshot IS NULL OR quota_limit_snapshot >= 0),
  CONSTRAINT generation_runs_max_entries_positive CHECK (max_entries_snapshot > 0),
  CONSTRAINT generation_runs_call_status_valid CHECK (
    call_status IN ('active', 'valid', 'user_cancelled', 'provider_failed', 'server_failed', 'stream_failed', 'validation_failed')
  ),
  CONSTRAINT generation_runs_disposition_valid CHECK (disposition IN ('pending', 'saved', 'abandoned')),
  CONSTRAINT generation_runs_disposition_consistent CHECK (call_status = 'valid' OR disposition = 'pending'),
  CONSTRAINT generation_runs_terminal_consistent CHECK (
    (call_status = 'active' AND quota_charged AND NOT counts_toward_cumulative AND completed_at IS NULL) OR
    (call_status IN ('valid', 'user_cancelled') AND quota_charged AND counts_toward_cumulative AND completed_at IS NOT NULL) OR
    (call_status IN ('provider_failed', 'server_failed', 'stream_failed', 'validation_failed') AND NOT quota_charged AND NOT counts_toward_cumulative AND completed_at IS NOT NULL)
  ),
  CONSTRAINT generation_runs_account_credit_consistent CHECK (
    account_id IS NULL OR credited_account_id = account_id
  )
);

CREATE UNIQUE INDEX generation_runs_one_active_account_idx
  ON wordweave.generation_runs(account_id) WHERE call_status = 'active' AND account_id IS NOT NULL;
CREATE UNIQUE INDEX generation_runs_one_active_visitor_idx
  ON wordweave.generation_runs(visitor_id) WHERE call_status = 'active' AND visitor_id IS NOT NULL;
CREATE INDEX generation_runs_account_quota_idx
  ON wordweave.generation_runs(account_id, started_at DESC) WHERE quota_charged;
CREATE INDEX generation_runs_visitor_quota_idx
  ON wordweave.generation_runs(visitor_id, started_at DESC) WHERE quota_charged;
CREATE INDEX generation_runs_account_cumulative_idx
  ON wordweave.generation_runs(credited_account_id, started_at DESC) WHERE counts_toward_cumulative;

CREATE TABLE wordweave.generation_run_entries (
  run_id uuid NOT NULL REFERENCES wordweave.generation_runs(id) ON DELETE CASCADE,
  vocabulary_entry_id bigint NOT NULL REFERENCES wordweave.vocabulary_entries(id) ON DELETE RESTRICT,
  input_order integer NOT NULL,
  source_entry_snapshot text NOT NULL,
  PRIMARY KEY (run_id, vocabulary_entry_id),
  CONSTRAINT generation_run_entries_order_unique UNIQUE (run_id, input_order),
  CONSTRAINT generation_run_entries_order_nonnegative CHECK (input_order >= 0),
  CONSTRAINT generation_run_entries_snapshot_nonempty CHECK (source_entry_snapshot <> '')
);

CREATE INDEX generation_run_entries_vocabulary_idx ON wordweave.generation_run_entries(vocabulary_entry_id);

CREATE TABLE wordweave.generation_drafts (
  run_id uuid PRIMARY KEY REFERENCES wordweave.generation_runs(id) ON DELETE CASCADE,
  access_token_hash bytea NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT generation_drafts_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT generation_drafts_expiry_after_validation CHECK (expires_at > validated_at)
);

CREATE INDEX generation_drafts_expiry_idx ON wordweave.generation_drafts(expires_at);

CREATE TABLE wordweave.learning_batches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  generation_run_id uuid UNIQUE REFERENCES wordweave.generation_runs(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  group_code_snapshot text NOT NULL,
  model_display_name_snapshot text NOT NULL,
  provider_model_id_snapshot text NOT NULL,
  meaning_language text NOT NULL,
  scenario text NOT NULL,
  length_code text NOT NULL,
  passage text NOT NULL,
  tags text[] NOT NULL,
  participates_in_range_review boolean NOT NULL DEFAULT true,
  expected_target_count integer NOT NULL,
  validator_version text NOT NULL,
  CONSTRAINT learning_batches_owner_pair_unique UNIQUE (owner_id, id),
  CONSTRAINT learning_batches_passage_nonempty CHECK (passage <> ''),
  CONSTRAINT learning_batches_tags_count CHECK (cardinality(tags) BETWEEN 1 AND 3),
  CONSTRAINT learning_batches_tags_nonempty CHECK (array_position(tags, '') IS NULL),
  CONSTRAINT learning_batches_expected_targets_positive CHECK (expected_target_count > 0),
  CONSTRAINT learning_batches_group_valid CHECK (group_code_snapshot IN ('visitor', 'registered', 'pro', 'plus')),
  CONSTRAINT learning_batches_meaning_language_valid CHECK (meaning_language IN ('zh', 'en', 'ja')),
  CONSTRAINT learning_batches_scenario_valid CHECK (scenario IN ('discussion', 'story', 'business', 'news')),
  CONSTRAINT learning_batches_length_valid CHECK (length_code IN ('short', 'medium', 'long', 'xlong'))
);

CREATE INDEX learning_batches_owner_saved_idx ON wordweave.learning_batches(owner_id, saved_at, id);
CREATE INDEX learning_batches_range_idx ON wordweave.learning_batches(owner_id, participates_in_range_review, saved_at, id);

CREATE TABLE wordweave.batch_targets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  vocabulary_entry_id bigint NOT NULL REFERENCES wordweave.vocabulary_entries(id) ON DELETE RESTRICT,
  source_entry_snapshot text NOT NULL,
  input_order integer NOT NULL,
  contextual_meaning text NOT NULL,
  hint_phrase text NOT NULL,
  hint_surface text NOT NULL,
  hint_start integer NOT NULL,
  hint_end integer NOT NULL,
  CONSTRAINT batch_targets_batch_fk FOREIGN KEY (owner_id, batch_id)
    REFERENCES wordweave.learning_batches(owner_id, id) ON DELETE CASCADE,
  CONSTRAINT batch_targets_batch_entry_unique UNIQUE (batch_id, vocabulary_entry_id),
  CONSTRAINT batch_targets_batch_order_unique UNIQUE (batch_id, input_order),
  CONSTRAINT batch_targets_batch_id_pair_unique UNIQUE (batch_id, id),
  CONSTRAINT batch_targets_owner_id_pair_unique UNIQUE (owner_id, id),
  CONSTRAINT batch_targets_order_nonnegative CHECK (input_order >= 0),
  CONSTRAINT batch_targets_text_nonempty CHECK (
    source_entry_snapshot <> '' AND contextual_meaning <> '' AND hint_phrase <> '' AND hint_surface <> ''
  ),
  CONSTRAINT batch_targets_hint_range CHECK (hint_start >= 0 AND hint_start < hint_end)
);

CREATE INDEX batch_targets_owner_vocabulary_idx ON wordweave.batch_targets(owner_id, vocabulary_entry_id, batch_id);
CREATE INDEX batch_targets_batch_order_idx ON wordweave.batch_targets(batch_id, input_order);

CREATE TABLE wordweave.passage_occurrences (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  target_id uuid NOT NULL,
  occurrence_order integer NOT NULL,
  surface text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  CONSTRAINT passage_occurrences_target_fk FOREIGN KEY (batch_id, target_id)
    REFERENCES wordweave.batch_targets(batch_id, id) ON DELETE CASCADE,
  CONSTRAINT passage_occurrences_batch_fk FOREIGN KEY (owner_id, batch_id)
    REFERENCES wordweave.learning_batches(owner_id, id) ON DELETE CASCADE,
  CONSTRAINT passage_occurrences_target_order_unique UNIQUE (target_id, occurrence_order),
  CONSTRAINT passage_occurrences_span_unique UNIQUE (batch_id, start_offset, end_offset),
  CONSTRAINT passage_occurrences_order_nonnegative CHECK (occurrence_order >= 0),
  CONSTRAINT passage_occurrences_surface_nonempty CHECK (surface <> ''),
  CONSTRAINT passage_occurrences_range CHECK (start_offset >= 0 AND start_offset < end_offset)
);

CREATE INDEX passage_occurrences_batch_start_idx ON wordweave.passage_occurrences(batch_id, start_offset, end_offset);
CREATE INDEX passage_occurrences_target_idx ON wordweave.passage_occurrences(target_id);

CREATE TABLE wordweave.visitor_claims (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  run_id uuid NOT NULL UNIQUE REFERENCES wordweave.generation_runs(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES wordweave.visitor_identities(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  consumed_account_id uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  consumed_batch_id uuid REFERENCES wordweave.learning_batches(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT visitor_claims_status_valid CHECK (status IN ('active', 'consumed')),
  CONSTRAINT visitor_claims_state_consistent CHECK (
    (status = 'active' AND consumed_account_id IS NULL AND consumed_batch_id IS NULL AND consumed_at IS NULL) OR
    (status = 'consumed' AND consumed_account_id IS NOT NULL AND consumed_batch_id IS NOT NULL AND consumed_at IS NOT NULL)
  ),
  CONSTRAINT visitor_claims_expiry_after_create CHECK (expires_at > created_at)
);

CREATE INDEX visitor_claims_active_expiry_idx ON wordweave.visitor_claims(expires_at) WHERE status = 'active';

CREATE TABLE wordweave.review_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  mode text NOT NULL,
  single_batch_id uuid,
  range_start_date date,
  range_end_date date,
  timezone_name text,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz,
  CONSTRAINT review_sessions_owner_pair_unique UNIQUE (owner_id, id),
  CONSTRAINT review_sessions_mode_valid CHECK (mode IN ('range', 'single')),
  CONSTRAINT review_sessions_status_valid CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT review_sessions_mode_fields CHECK (
    (mode = 'range' AND single_batch_id IS NULL AND range_start_date IS NOT NULL AND range_end_date IS NOT NULL AND timezone_name IS NOT NULL AND range_start_date <= range_end_date) OR
    (mode = 'single' AND single_batch_id IS NOT NULL AND range_start_date IS NULL AND range_end_date IS NULL AND timezone_name IS NULL)
  ),
  CONSTRAINT review_sessions_completion_consistent CHECK (
    (status = 'in_progress' AND completed_at IS NULL) OR
    (status = 'completed' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT review_sessions_single_batch_fk FOREIGN KEY (owner_id, single_batch_id)
    REFERENCES wordweave.learning_batches(owner_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX review_sessions_one_active_range_idx
  ON wordweave.review_sessions(owner_id) WHERE mode = 'range' AND status = 'in_progress';
CREATE UNIQUE INDEX review_sessions_one_active_single_idx
  ON wordweave.review_sessions(owner_id, single_batch_id) WHERE mode = 'single' AND status = 'in_progress';
CREATE INDEX review_sessions_restore_idx ON wordweave.review_sessions(owner_id, status, mode, updated_at DESC);

CREATE TABLE wordweave.review_session_batches (
  owner_id uuid NOT NULL,
  session_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  batch_order integer NOT NULL,
  PRIMARY KEY (session_id, batch_id),
  CONSTRAINT review_session_batches_session_order_unique UNIQUE (session_id, batch_order),
  CONSTRAINT review_session_batches_owner_session_fk FOREIGN KEY (owner_id, session_id)
    REFERENCES wordweave.review_sessions(owner_id, id) ON DELETE CASCADE,
  CONSTRAINT review_session_batches_owner_batch_fk FOREIGN KEY (owner_id, batch_id)
    REFERENCES wordweave.learning_batches(owner_id, id) ON DELETE CASCADE,
  CONSTRAINT review_session_batches_order_nonnegative CHECK (batch_order >= 0)
);

CREATE INDEX review_session_batches_batch_idx ON wordweave.review_session_batches(batch_id);

CREATE TABLE wordweave.review_session_targets (
  session_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  target_id uuid NOT NULL,
  target_order integer NOT NULL,
  PRIMARY KEY (session_id, batch_id, target_id),
  CONSTRAINT review_session_targets_order_unique UNIQUE (session_id, batch_id, target_order),
  CONSTRAINT review_session_targets_session_batch_fk FOREIGN KEY (session_id, batch_id)
    REFERENCES wordweave.review_session_batches(session_id, batch_id) ON DELETE CASCADE,
  CONSTRAINT review_session_targets_batch_target_fk FOREIGN KEY (batch_id, target_id)
    REFERENCES wordweave.batch_targets(batch_id, id) ON DELETE CASCADE,
  CONSTRAINT review_session_targets_order_nonnegative CHECK (target_order >= 0)
);

CREATE INDEX review_session_targets_target_idx ON wordweave.review_session_targets(target_id);

CREATE TABLE wordweave.review_results (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  session_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  successful boolean NOT NULL,
  error_count integer NOT NULL,
  skip_count integer NOT NULL,
  stage1_completed boolean NOT NULL,
  stage2_completed boolean NOT NULL,
  CONSTRAINT review_results_owner_session_fk FOREIGN KEY (owner_id, session_id)
    REFERENCES wordweave.review_sessions(owner_id, id) ON DELETE CASCADE,
  CONSTRAINT review_results_session_batch_fk FOREIGN KEY (session_id, batch_id)
    REFERENCES wordweave.review_session_batches(session_id, batch_id) ON DELETE CASCADE,
  CONSTRAINT review_results_session_batch_unique UNIQUE (session_id, batch_id),
  CONSTRAINT review_results_counts_nonnegative CHECK (error_count >= 0 AND skip_count >= 0),
  CONSTRAINT review_results_stages_complete CHECK (stage1_completed AND stage2_completed),
  CONSTRAINT review_results_success_consistent CHECK (NOT successful OR skip_count = 0)
);

CREATE INDEX review_results_owner_success_idx ON wordweave.review_results(owner_id, successful, batch_id, completed_at);

CREATE FUNCTION wordweave.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
BEGIN
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END
$$;

CREATE FUNCTION wordweave.prevent_username_change() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'accounts_username_immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION wordweave.validate_hint_span() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
BEGIN
  IF NEW.hint_end > char_length(NEW.hint_phrase)
     OR substring(NEW.hint_phrase FROM NEW.hint_start + 1 FOR NEW.hint_end - NEW.hint_start) <> NEW.hint_surface THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'batch_targets_hint_span_matches';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION wordweave.validate_passage_occurrence() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
DECLARE
  source_passage text;
BEGIN
  SELECT passage INTO source_passage FROM wordweave.learning_batches WHERE id = NEW.batch_id;
  IF source_passage IS NULL
     OR NEW.end_offset > char_length(source_passage)
     OR substring(source_passage FROM NEW.start_offset + 1 FOR NEW.end_offset - NEW.start_offset) <> NEW.surface THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'passage_occurrences_span_matches';
  END IF;
  IF EXISTS (
    SELECT 1 FROM wordweave.passage_occurrences existing
    WHERE existing.batch_id = NEW.batch_id
      AND existing.id <> NEW.id
      AND int4range(existing.start_offset, existing.end_offset, '[)') && int4range(NEW.start_offset, NEW.end_offset, '[)')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'passage_occurrences_do_not_overlap';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION wordweave.validate_batch_completeness() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
DECLARE
  target_count integer;
  missing_occurrence_count integer;
  expected integer;
  checked_batch uuid;
BEGIN
  IF TG_TABLE_NAME = 'learning_batches' THEN
    checked_batch := COALESCE(NEW.id, OLD.id);
  ELSE
    checked_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  END IF;
  SELECT expected_target_count INTO expected FROM wordweave.learning_batches WHERE id = checked_batch;
  IF expected IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO target_count FROM wordweave.batch_targets WHERE batch_id = checked_batch;
  SELECT count(*) INTO missing_occurrence_count
    FROM wordweave.batch_targets target
    WHERE target.batch_id = checked_batch
      AND NOT EXISTS (SELECT 1 FROM wordweave.passage_occurrences occurrence WHERE occurrence.target_id = target.id);
  IF target_count <> expected OR missing_occurrence_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'learning_batches_targets_complete';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER entitlement_groups_touch_updated_at
BEFORE UPDATE ON wordweave.entitlement_groups
FOR EACH ROW EXECUTE FUNCTION wordweave.touch_updated_at();

CREATE TRIGGER accounts_touch_updated_at
BEFORE UPDATE ON wordweave.accounts
FOR EACH ROW EXECUTE FUNCTION wordweave.touch_updated_at();

CREATE TRIGGER accounts_username_immutable
BEFORE UPDATE ON wordweave.accounts
FOR EACH ROW EXECUTE FUNCTION wordweave.prevent_username_change();

CREATE TRIGGER ai_models_touch_updated_at
BEFORE UPDATE ON wordweave.ai_models
FOR EACH ROW EXECUTE FUNCTION wordweave.touch_updated_at();

CREATE TRIGGER review_sessions_touch_updated_at
BEFORE UPDATE ON wordweave.review_sessions
FOR EACH ROW EXECUTE FUNCTION wordweave.touch_updated_at();

CREATE CONSTRAINT TRIGGER batch_targets_hint_span_matches
AFTER INSERT OR UPDATE ON wordweave.batch_targets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_hint_span();

CREATE CONSTRAINT TRIGGER passage_occurrences_span_matches
AFTER INSERT OR UPDATE ON wordweave.passage_occurrences
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_passage_occurrence();

CREATE CONSTRAINT TRIGGER learning_batches_targets_complete_from_batch
AFTER INSERT OR UPDATE ON wordweave.learning_batches
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_batch_completeness();

CREATE CONSTRAINT TRIGGER learning_batches_targets_complete_from_target
AFTER INSERT OR UPDATE OR DELETE ON wordweave.batch_targets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_batch_completeness();

ALTER TABLE wordweave.vocabulary_snapshots OWNER TO wordweave_owner;
ALTER TABLE wordweave.vocabulary_entries OWNER TO wordweave_owner;
ALTER TABLE wordweave.entitlement_groups OWNER TO wordweave_owner;
ALTER TABLE wordweave.accounts OWNER TO wordweave_owner;
ALTER TABLE wordweave.account_sessions OWNER TO wordweave_owner;
ALTER TABLE wordweave.visitor_identities OWNER TO wordweave_owner;
ALTER TABLE wordweave.ai_models OWNER TO wordweave_owner;
ALTER TABLE wordweave.group_models OWNER TO wordweave_owner;
ALTER TABLE wordweave.group_lengths OWNER TO wordweave_owner;
ALTER TABLE wordweave.openrouter_credentials OWNER TO wordweave_owner;
ALTER TABLE wordweave.generation_runs OWNER TO wordweave_owner;
ALTER TABLE wordweave.generation_run_entries OWNER TO wordweave_owner;
ALTER TABLE wordweave.generation_drafts OWNER TO wordweave_owner;
ALTER TABLE wordweave.learning_batches OWNER TO wordweave_owner;
ALTER TABLE wordweave.batch_targets OWNER TO wordweave_owner;
ALTER TABLE wordweave.passage_occurrences OWNER TO wordweave_owner;
ALTER TABLE wordweave.visitor_claims OWNER TO wordweave_owner;
ALTER TABLE wordweave.review_sessions OWNER TO wordweave_owner;
ALTER TABLE wordweave.review_session_batches OWNER TO wordweave_owner;
ALTER TABLE wordweave.review_session_targets OWNER TO wordweave_owner;
ALTER TABLE wordweave.review_results OWNER TO wordweave_owner;

GRANT SELECT ON wordweave.vocabulary_snapshots, wordweave.vocabulary_entries TO wordweave_app, wordweave_ai;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA wordweave TO wordweave_app;
REVOKE ALL ON wordweave.openrouter_credentials FROM wordweave_app;
REVOKE DELETE ON wordweave.ai_models, wordweave.entitlement_groups FROM wordweave_app;
GRANT SELECT, INSERT, UPDATE ON wordweave.openrouter_credentials TO wordweave_ai;
GRANT SELECT, INSERT, UPDATE ON wordweave.generation_runs, wordweave.generation_drafts TO wordweave_ai;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA wordweave TO wordweave_app;
