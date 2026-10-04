CREATE TABLE wordweave.growth_balances (
  owner_id uuid PRIMARY KEY REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  points bigint NOT NULL DEFAULT 0 CHECK(points>=0),
  experience bigint NOT NULL DEFAULT 0 CHECK(experience>=0),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE wordweave.growth_settlements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('checkin','makeup','mastery','level_reward','achievement_reward','exchange','item_activation','model_refund','admin_grant','save','review')),
  source_key text NOT NULL CHECK(source_key<>''),
  request_fingerprint bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  config_snapshot jsonb NOT NULL CHECK(jsonb_typeof(config_snapshot)='object'),
  UNIQUE(owner_id,kind,source_key),
  UNIQUE(owner_id,id)
);
CREATE TABLE wordweave.growth_ledger (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  settlement_id uuid NOT NULL,
  component_key text NOT NULL CHECK(component_key<>''),
  currency text NOT NULL CHECK(currency IN ('points','experience')),
  delta bigint NOT NULL CHECK(delta<>0),
  balance_after bigint NOT NULL CHECK(balance_after>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,settlement_id) REFERENCES wordweave.growth_settlements(owner_id,id) ON DELETE CASCADE,
  UNIQUE(settlement_id,component_key,currency),
  CHECK(currency<>'experience' OR delta>0)
);
CREATE INDEX growth_ledger_owner_created ON wordweave.growth_ledger(owner_id,created_at DESC,id DESC);
CREATE TABLE wordweave.user_growth (
  owner_id uuid PRIMARY KEY REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  mastered_total bigint NOT NULL DEFAULT 0 CHECK(mastered_total>=0),
  saved_total bigint NOT NULL DEFAULT 0 CHECK(saved_total>=0),
  successful_review_total bigint NOT NULL DEFAULT 0 CHECK(successful_review_total>=0),
  highest_checkin_streak integer NOT NULL DEFAULT 0 CHECK(highest_checkin_streak>=0),
  highest_review_streak integer NOT NULL DEFAULT 0 CHECK(highest_review_streak>=0),
  config_revision_seen bigint NOT NULL DEFAULT 0 CHECK(config_revision_seen>=0)
);
CREATE TABLE wordweave.user_learning_days (
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  learning_day date NOT NULL,
  active boolean NOT NULL DEFAULT false,
  review_success boolean NOT NULL DEFAULT false,
  valid_generations integer NOT NULL DEFAULT 0 CHECK(valid_generations>=0),
  review_submissions integer NOT NULL DEFAULT 0 CHECK(review_submissions>=0),
  successful_reviews integer NOT NULL DEFAULT 0 CHECK(successful_reviews>=0),
  saved_count integer NOT NULL DEFAULT 0 CHECK(saved_count>=0),
  PRIMARY KEY(owner_id,learning_day)
);
CREATE TABLE wordweave.user_masteries (
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  lexeme_id bigint NOT NULL REFERENCES wordweave.lexemes(id) ON DELETE RESTRICT,
  mastered_at timestamptz NOT NULL,
  settlement_id uuid NOT NULL,
  PRIMARY KEY(owner_id,lexeme_id),
  FOREIGN KEY(owner_id,settlement_id) REFERENCES wordweave.growth_settlements(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE wordweave.checkin_rules (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  effective_day date NOT NULL UNIQUE,
  base_points bigint NOT NULL CHECK(base_points>=0),
  step_points bigint NOT NULL CHECK(step_points>=0),
  cap_points bigint NOT NULL CHECK(cap_points>=base_points),
  normal_experience bigint NOT NULL CHECK(normal_experience>=0),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL
);
CREATE TABLE wordweave.user_checkins (
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  learning_day date NOT NULL,
  kind text NOT NULL CHECK(kind IN ('normal','makeup')),
  rule_id uuid NOT NULL REFERENCES wordweave.checkin_rules(id) ON DELETE RESTRICT,
  streak_at_last_settlement integer NOT NULL CHECK(streak_at_last_settlement>0),
  points_paid bigint NOT NULL CHECK(points_paid>=0),
  normal_experience_paid bigint NOT NULL CHECK(normal_experience_paid>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_id,learning_day),
  CHECK(kind<>'makeup' OR normal_experience_paid=0)
);

CREATE TABLE wordweave.item_definitions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK(kind IN ('makeup','extra_credit','model_trial','plan_trial')),
  name_zh text,
  name_en text,
  description_zh text,
  description_en text,
  exchange_price bigint NOT NULL CHECK(exchange_price>=0),
  activation_ttl_seconds bigint NOT NULL CHECK(activation_ttl_seconds>0),
  listed boolean NOT NULL DEFAULT false,
  extra_count integer,
  trial_seconds bigint,
  target_plan_code text REFERENCES wordweave.entitlement_groups(code) ON DELETE RESTRICT,
  retirement_points bigint,
  ever_issued boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  CHECK(COALESCE(btrim(name_zh)<>'',false) OR COALESCE(btrim(name_en)<>'',false)),
  CHECK(COALESCE(btrim(description_zh)<>'',false) OR COALESCE(btrim(description_en)<>'',false)),
  CONSTRAINT item_definitions_typed_effect CHECK(
    (kind='makeup' AND extra_count IS NULL AND trial_seconds IS NULL AND target_plan_code IS NULL AND retirement_points IS NULL) OR
    (kind='extra_credit' AND extra_count IS NOT NULL AND extra_count>0 AND trial_seconds IS NULL AND target_plan_code IS NULL AND retirement_points IS NULL) OR
    (kind='model_trial' AND extra_count IS NULL AND trial_seconds IS NOT NULL AND trial_seconds>0 AND target_plan_code IS NULL AND retirement_points IS NOT NULL AND retirement_points>=0) OR
    (kind='plan_trial' AND extra_count IS NULL AND trial_seconds IS NOT NULL AND trial_seconds>0 AND target_plan_code IS NOT NULL AND target_plan_code IN ('registered','pro','plus') AND retirement_points IS NULL))
);
CREATE TABLE wordweave.item_definition_models (
  definition_id uuid NOT NULL REFERENCES wordweave.item_definitions(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  PRIMARY KEY(definition_id,model_id)
);
CREATE INDEX item_definition_models_model ON wordweave.item_definition_models(model_id);

CREATE TABLE wordweave.growth_levels (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  level_no integer NOT NULL UNIQUE CHECK(level_no>0),
  min_experience bigint NOT NULL CHECK(min_experience>=0),
  reward_enabled boolean NOT NULL,
  points bigint NOT NULL CHECK(points>=0),
  item_definition_id uuid REFERENCES wordweave.item_definitions(id) ON DELETE RESTRICT,
  item_count integer NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  CONSTRAINT growth_levels_min_experience_unique UNIQUE(min_experience) DEFERRABLE INITIALLY IMMEDIATE,
  CHECK((item_definition_id IS NULL AND item_count=0) OR (item_definition_id IS NOT NULL AND item_count>0)),
  CHECK(level_no<>1 OR (min_experience=0 AND NOT reward_enabled AND points=0 AND item_definition_id IS NULL AND item_count=0))
);
CREATE INDEX growth_levels_item ON wordweave.growth_levels(item_definition_id);
CREATE TABLE wordweave.achievement_tiers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK(kind IN ('checkin_streak','review_streak','mastered_words','saved_passages')),
  threshold bigint NOT NULL CHECK(threshold>0 AND threshold<=9007199254740991),
  enabled boolean NOT NULL,
  name_zh text,
  name_en text,
  title_zh text,
  title_en text,
  description_zh text CHECK(description_zh IS NULL OR btrim(description_zh)<>''),
  description_en text CHECK(description_en IS NULL OR btrim(description_en)<>''),
  points bigint NOT NULL CHECK(points>=0),
  experience bigint NOT NULL CHECK(experience>=0),
  item_definition_id uuid REFERENCES wordweave.item_definitions(id) ON DELETE RESTRICT,
  item_count integer NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  CONSTRAINT achievement_tiers_kind_threshold_unique UNIQUE(kind,threshold) DEFERRABLE INITIALLY IMMEDIATE,
  CHECK(COALESCE(btrim(name_zh)<>'',false) OR COALESCE(btrim(name_en)<>'',false)),
  CHECK(COALESCE(btrim(title_zh)<>'',false) OR COALESCE(btrim(title_en)<>'',false)),
  CHECK((item_definition_id IS NULL AND item_count=0) OR (item_definition_id IS NOT NULL AND item_count>0))
);
CREATE INDEX achievement_tiers_item ON wordweave.achievement_tiers(item_definition_id);
CREATE TABLE wordweave.level_awards (
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES wordweave.growth_levels(id) ON DELETE RESTRICT,
  achieved_at timestamptz NOT NULL,
  claimed_at timestamptz,
  settlement_id uuid,
  PRIMARY KEY(owner_id,level_id),
  FOREIGN KEY(owner_id,settlement_id) REFERENCES wordweave.growth_settlements(owner_id,id) ON DELETE CASCADE,
  CHECK((claimed_at IS NULL)=(settlement_id IS NULL))
);
CREATE TABLE wordweave.achievement_awards (
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES wordweave.achievement_tiers(id) ON DELETE RESTRICT,
  achieved_at timestamptz NOT NULL,
  title_zh_snapshot text,
  title_en_snapshot text,
  claimed_at timestamptz,
  settlement_id uuid,
  PRIMARY KEY(owner_id,tier_id),
  FOREIGN KEY(owner_id,settlement_id) REFERENCES wordweave.growth_settlements(owner_id,id) ON DELETE CASCADE,
  CHECK((claimed_at IS NULL)=(settlement_id IS NULL)),
  CHECK(COALESCE(btrim(title_zh_snapshot)<>'',false) OR COALESCE(btrim(title_en_snapshot)<>'',false))
);

CREATE TABLE wordweave.user_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES wordweave.item_definitions(id) ON DELETE RESTRICT,
  issuance_settlement_id uuid NOT NULL,
  issuance_component text NOT NULL CHECK(issuance_component<>''),
  issued_at timestamptz NOT NULL,
  activation_deadline timestamptz NOT NULL,
  kind_snapshot text NOT NULL CHECK(kind_snapshot IN ('makeup','extra_credit','model_trial','plan_trial')),
  parameters_snapshot jsonb NOT NULL CHECK(jsonb_typeof(parameters_snapshot)='object'),
  activated_at timestamptz,
  ended_at timestamptz,
  used_target_day date,
  refunded_at timestamptz,
  refund_eligible_at timestamptz,
  UNIQUE(issuance_settlement_id,issuance_component),
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,issuance_settlement_id) REFERENCES wordweave.growth_settlements(owner_id,id) ON DELETE CASCADE,
  CHECK(activation_deadline>issued_at),
  CHECK(activated_at IS NULL OR activated_at<activation_deadline),
  CHECK(used_target_day IS NULL OR (kind_snapshot='makeup' AND activated_at IS NOT NULL)),
  CHECK(refunded_at IS NULL OR (kind_snapshot='model_trial' AND refund_eligible_at IS NOT NULL))
);
CREATE INDEX user_items_owner_issued ON wordweave.user_items(owner_id,issued_at DESC,id DESC);
CREATE INDEX user_items_unused ON wordweave.user_items(owner_id,activation_deadline,id) WHERE activated_at IS NULL AND refunded_at IS NULL;
CREATE INDEX user_items_refundable ON wordweave.user_items(owner_id,refund_eligible_at,id) WHERE refund_eligible_at IS NOT NULL AND refunded_at IS NULL;
CREATE INDEX user_items_definition ON wordweave.user_items(definition_id);
CREATE TABLE wordweave.user_item_models (
  item_id uuid NOT NULL,
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL,
  PRIMARY KEY(item_id,model_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES wordweave.user_items(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX user_item_models_model ON wordweave.user_item_models(model_id,item_id);
CREATE TABLE wordweave.extra_credit_balances (
  item_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  initial_count integer NOT NULL CHECK(initial_count>0),
  remaining_count integer NOT NULL CHECK(remaining_count>=0 AND remaining_count<=initial_count),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY(owner_id,item_id) REFERENCES wordweave.user_items(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX extra_credit_balances_available ON wordweave.extra_credit_balances(owner_id,expires_at,item_id) WHERE remaining_count>0;
CREATE TABLE wordweave.model_time_contributions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  item_id uuid NOT NULL,
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE(item_id,model_id),
  FOREIGN KEY(owner_id,item_id) REFERENCES wordweave.user_items(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(item_id,model_id) REFERENCES wordweave.user_item_models(item_id,model_id) ON DELETE CASCADE,
  CHECK(starts_at<ends_at)
);
CREATE INDEX model_time_contributions_authorization ON wordweave.model_time_contributions(owner_id,model_id,ends_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX model_time_contributions_model ON wordweave.model_time_contributions(model_id,item_id);
CREATE TABLE wordweave.plan_trials (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  target_plan_code text NOT NULL REFERENCES wordweave.entitlement_groups(code) ON DELETE RESTRICT CHECK(target_plan_code IN ('registered','pro','plus')),
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  closed_at timestamptz,
  close_reason text CHECK(close_reason IN ('expired','replaced')),
  UNIQUE(owner_id,id),
  CHECK(ends_at>started_at),
  CHECK((closed_at IS NULL)=(close_reason IS NULL))
);
CREATE UNIQUE INDEX plan_trials_one_open ON wordweave.plan_trials(owner_id) WHERE closed_at IS NULL;
CREATE TABLE wordweave.plan_trial_uses (
  item_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  added_seconds bigint NOT NULL CHECK(added_seconds>0),
  previous_ends_at timestamptz,
  result_ends_at timestamptz NOT NULL,
  activated_at timestamptz NOT NULL,
  FOREIGN KEY(owner_id,item_id) REFERENCES wordweave.user_items(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,trial_id) REFERENCES wordweave.plan_trials(owner_id,id) ON DELETE CASCADE
);

-- Stable opaque domain event identities do not preserve batch/answer content in
-- the growth ledger. They survive retries but are removed with their domain row.
ALTER TABLE wordweave.generation_runs ADD COLUMN growth_event_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE wordweave.learning_batches ADD COLUMN growth_event_id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE wordweave.review_attempts ADD COLUMN growth_event_id uuid NOT NULL DEFAULT uuidv7();

CREATE FUNCTION wordweave.guard_growth_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
  IF NEW.currency='points' AND NEW.delta<0 AND NOT EXISTS(
    SELECT 1 FROM wordweave.growth_settlements WHERE id=NEW.settlement_id AND owner_id=NEW.owner_id AND kind='exchange'
  ) THEN RAISE EXCEPTION 'negative points require an exchange settlement' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER growth_ledger_source_guard BEFORE INSERT OR UPDATE ON wordweave.growth_ledger FOR EACH ROW EXECUTE FUNCTION wordweave.guard_growth_ledger();
CREATE FUNCTION wordweave.guard_item_definition_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.ever_issued THEN RAISE EXCEPTION 'issued item definitions cannot be deleted' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.kind<>OLD.kind OR (OLD.ever_issued AND NOT NEW.ever_issued) THEN
    RAISE EXCEPTION 'item kind and issued history are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER item_definitions_identity_guard BEFORE UPDATE OR DELETE ON wordweave.item_definitions FOR EACH ROW EXECUTE FUNCTION wordweave.guard_item_definition_identity();
CREATE FUNCTION wordweave.check_item_definition_models() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,wordweave AS $fn$
DECLARE definition uuid; item_kind text; members bigint;
BEGIN
  IF TG_TABLE_NAME='item_definitions' THEN definition:=NEW.id;
  ELSIF TG_OP='DELETE' THEN definition:=OLD.definition_id;
  ELSE definition:=NEW.definition_id; END IF;
  SELECT kind INTO item_kind FROM wordweave.item_definitions WHERE id=definition;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO members FROM wordweave.item_definition_models WHERE definition_id=definition;
  IF (item_kind='model_trial' AND members=0) OR (item_kind<>'model_trial' AND members<>0) THEN
    RAISE EXCEPTION 'model set does not match item kind' USING ERRCODE='23514';
  END IF;
  -- Moving a membership must also validate its former definition.
  IF TG_TABLE_NAME='item_definition_models' AND TG_OP='UPDATE' THEN
    IF OLD.definition_id<>NEW.definition_id AND EXISTS(SELECT 1 FROM wordweave.item_definitions d
      WHERE d.id=OLD.definition_id AND d.kind='model_trial' AND NOT EXISTS(SELECT 1 FROM wordweave.item_definition_models m WHERE m.definition_id=d.id)) THEN
      RAISE EXCEPTION 'model trial requires a model' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END
$fn$;
CREATE CONSTRAINT TRIGGER item_definitions_models_complete AFTER INSERT OR UPDATE ON wordweave.item_definitions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wordweave.check_item_definition_models();
CREATE CONSTRAINT TRIGGER item_definition_models_complete AFTER INSERT OR UPDATE OR DELETE ON wordweave.item_definition_models
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wordweave.check_item_definition_models();

DO $permissions$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['growth_balances','growth_settlements','growth_ledger','user_growth','user_learning_days','user_masteries','checkin_rules','user_checkins','item_definitions','item_definition_models','growth_levels','achievement_tiers','level_awards','achievement_awards','user_items','user_item_models','extra_credit_balances','model_time_contributions','plan_trials','plan_trial_uses'] LOOP
    EXECUTE format('ALTER TABLE wordweave.%I OWNER TO wordweave_owner',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON wordweave.%I TO wordweave_app',table_name);
  END LOOP;
END
$permissions$;
GRANT SELECT ON wordweave.growth_balances,wordweave.user_learning_days,wordweave.user_masteries,wordweave.checkin_rules,wordweave.user_checkins,wordweave.item_definitions,wordweave.growth_levels,wordweave.achievement_tiers TO wordweave_maintenance;
GRANT SELECT,INSERT,UPDATE ON wordweave.user_growth,wordweave.level_awards,wordweave.achievement_awards TO wordweave_maintenance;
ALTER FUNCTION wordweave.guard_growth_ledger() OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.guard_item_definition_identity() OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.check_item_definition_models() OWNER TO wordweave_owner;
REVOKE ALL ON FUNCTION wordweave.guard_growth_ledger(),wordweave.guard_item_definition_identity(),wordweave.check_item_definition_models() FROM PUBLIC;
