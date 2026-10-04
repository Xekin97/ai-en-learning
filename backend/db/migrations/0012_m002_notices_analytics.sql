CREATE TABLE wordweave.platform_notices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  title_zh text,
  title_en text,
  body_zh text,
  body_en text,
  visible boolean NOT NULL DEFAULT false,
  remind boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  CONSTRAINT platform_notices_complete_language CHECK(
    COALESCE(btrim(title_zh)<>'' AND btrim(body_zh)<>'',false) OR
    COALESCE(btrim(title_en)<>'' AND btrim(body_en)<>'',false))
);
CREATE INDEX platform_notices_visible_order ON wordweave.platform_notices(remind DESC,published_at DESC,id ASC) WHERE visible;
CREATE TABLE wordweave.traffic_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  browser_key_hash bytea NOT NULL,
  started_at timestamptz NOT NULL,
  last_event_at timestamptz NOT NULL,
  ended_at timestamptz,
  pageviews integer NOT NULL DEFAULT 0 CHECK(pageviews>=0),
  has_key_action boolean NOT NULL DEFAULT false,
  entry_source_type text NOT NULL CHECK(entry_source_type IN ('utm','referrer','direct_unknown')),
  utm_source text CHECK(char_length(utm_source)<=128),
  utm_medium text CHECK(char_length(utm_medium)<=128),
  utm_campaign text CHECK(char_length(utm_campaign)<=128),
  referrer_host text CHECK(char_length(referrer_host)<=128),
  CHECK(last_event_at>=started_at)
);
CREATE INDEX traffic_sessions_active ON wordweave.traffic_sessions(last_event_at) WHERE ended_at IS NULL;
CREATE INDEX traffic_sessions_retention ON wordweave.traffic_sessions(started_at,id);
CREATE INDEX traffic_sessions_browser ON wordweave.traffic_sessions(browser_key_hash,last_event_at DESC);
CREATE UNIQUE INDEX traffic_sessions_one_active ON wordweave.traffic_sessions(browser_key_hash) WHERE ended_at IS NULL;
CREATE TABLE wordweave.analytics_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  event_key text NOT NULL UNIQUE,
  event_kind text NOT NULL CHECK(event_kind IN ('page_view','key_action','registered','generation_started','generation_valid','generation_failed','generation_cancelled','generation_precheck_rejected','passage_saved','review_started','review_submitted')),
  occurred_at timestamptz NOT NULL,
  started_at timestamptz,
  learning_day date NOT NULL,
  traffic_session_id uuid REFERENCES wordweave.traffic_sessions(id) ON DELETE SET NULL,
  browser_key_hash bytea,
  owner_id uuid REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  event_outcome text CHECK(event_outcome IN ('successful','unsuccessful','empty','anonymous','account')),
  source_kind text NOT NULL CHECK(source_kind IN ('browser','account','visitor')),
  reference_key uuid
);
CREATE INDEX analytics_events_owner ON wordweave.analytics_events(owner_id,occurred_at);
CREATE INDEX analytics_events_day_kind ON wordweave.analytics_events(learning_day,event_kind);
CREATE INDEX analytics_events_browser_day ON wordweave.analytics_events(browser_key_hash,learning_day);
CREATE INDEX analytics_events_retention ON wordweave.analytics_events(occurred_at,id);
CREATE INDEX analytics_events_traffic ON wordweave.analytics_events(traffic_session_id);
CREATE TABLE wordweave.analytics_daily (
  day date NOT NULL,
  metric text NOT NULL CHECK(metric IN ('pv','uv','anonymous_uv','converted_visitor_uv','new_accounts','unattributed_accounts','bounce_rate','activation_same_day','activation_7_days','retention_d1','retention_d7','retention_d30','wau','valid_generations','saved_passages','review_submissions','successful_reviews','active_learners','generation_valid','generation_failed','generation_cancelled','generation_ongoing','generation_precheck_rejected','review_cohort_started','review_cohort_submitted','review_cohort_successful')),
  dimension_key text NOT NULL CHECK(dimension_key IN ('all','utm','referrer','direct_unknown')),
  numerator bigint CHECK(numerator>=0),
  denominator bigint CHECK(denominator>=0),
  value numeric,
  updated_at timestamptz NOT NULL,
  maturity_state text NOT NULL CHECK(maturity_state IN ('ready','no_sample','observing','unavailable')),
  PRIMARY KEY(day,metric,dimension_key)
);
CREATE TABLE wordweave.review_cohort_daily (
  start_day date PRIMARY KEY,
  started_count bigint NOT NULL DEFAULT 0 CHECK(started_count>=0),
  submitted_count bigint NOT NULL DEFAULT 0 CHECK(submitted_count>=0 AND submitted_count<=started_count),
  successful_count bigint NOT NULL DEFAULT 0 CHECK(successful_count>=0 AND successful_count<=submitted_count),
  updated_at timestamptz NOT NULL
);
CREATE TABLE wordweave.analytics_accounts (
  owner_id uuid PRIMARY KEY REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  registered_learning_day date NOT NULL,
  first_saved_at timestamptz,
  retention_due_at timestamptz NOT NULL
);
CREATE TABLE wordweave.traffic_session_accounts (
  session_id uuid NOT NULL REFERENCES wordweave.traffic_sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL,
  PRIMARY KEY(session_id,owner_id)
);
CREATE INDEX traffic_session_accounts_owner ON wordweave.traffic_session_accounts(owner_id,session_id);
CREATE INDEX analytics_accounts_retention ON wordweave.analytics_accounts(retention_due_at,owner_id);
-- A non-personal aggregation checkpoint prevents deletion ahead of aggregation.
ALTER TABLE wordweave.growth_settings ADD COLUMN analytics_aggregated_through timestamptz,
  ADD COLUMN analytics_updated_at timestamptz;
DO $permissions$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['platform_notices','traffic_sessions','analytics_events','analytics_daily','review_cohort_daily','analytics_accounts','traffic_session_accounts'] LOOP
    EXECUTE format('ALTER TABLE wordweave.%I OWNER TO wordweave_owner',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON wordweave.%I TO wordweave_app',table_name);
  END LOOP;
END
$permissions$;
GRANT SELECT,UPDATE,DELETE ON wordweave.traffic_sessions,wordweave.analytics_events,wordweave.analytics_accounts,wordweave.traffic_session_accounts TO wordweave_maintenance;
GRANT SELECT,INSERT,UPDATE ON wordweave.analytics_daily,wordweave.review_cohort_daily TO wordweave_maintenance;
