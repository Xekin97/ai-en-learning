CREATE TABLE wordweave.presets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  draft_version_id uuid NOT NULL,
  published_version_id uuid,
  listed boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  CHECK(NOT listed OR published_version_id IS NOT NULL)
);
CREATE TABLE wordweave.preset_versions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  preset_id uuid NOT NULL REFERENCES wordweave.presets(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK(version_no>0),
  title text NOT NULL CHECK(btrim(title)<>''),
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  meaning_language text NOT NULL CHECK(meaning_language IN ('zh','en','ja')),
  scenario text NOT NULL CHECK(scenario IN ('discussion','story','business','news')),
  length_code text NOT NULL CHECK(length_code IN ('short','medium','long','xlong')),
  configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
  config_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  preview_id uuid,
  UNIQUE(preset_id,version_no),
  UNIQUE(preset_id,id)
);
ALTER TABLE wordweave.presets
  ADD CONSTRAINT presets_draft_version_fk FOREIGN KEY(id,draft_version_id) REFERENCES wordweave.preset_versions(preset_id,id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT presets_published_version_fk FOREIGN KEY(id,published_version_id) REFERENCES wordweave.preset_versions(preset_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE wordweave.preset_version_entries (
  version_id uuid NOT NULL REFERENCES wordweave.preset_versions(id) ON DELETE CASCADE,
  vocabulary_entry_id bigint NOT NULL REFERENCES wordweave.vocabulary_entries(id) ON DELETE RESTRICT,
  input_order integer NOT NULL CHECK(input_order>=0),
  PRIMARY KEY(version_id,vocabulary_entry_id),
  UNIQUE(version_id,input_order)
);
CREATE TABLE wordweave.preset_preview_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  preset_id uuid NOT NULL REFERENCES wordweave.presets(id) ON DELETE CASCADE,
  version_id uuid,
  requested_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','valid','cancelled','failed')),
  model_id uuid NOT NULL REFERENCES wordweave.ai_models(id) ON DELETE RESTRICT,
  model_name_snapshot text NOT NULL,
  provider_model_snapshot text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  failure_category text,
  config_hash bytea NOT NULL,
  UNIQUE(preset_id,id),
  FOREIGN KEY(preset_id,version_id) REFERENCES wordweave.preset_versions(preset_id,id) ON DELETE SET NULL (version_id),
  CHECK(status<>'active' OR version_id IS NOT NULL),
  CHECK((status='active' AND completed_at IS NULL) OR (status<>'active' AND completed_at IS NOT NULL)),
  CHECK((status='failed')=(failure_category IS NOT NULL))
);
CREATE TABLE wordweave.preset_previews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  preset_id uuid NOT NULL REFERENCES wordweave.presets(id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE,
  config_hash bytea NOT NULL,
  validated_payload jsonb NOT NULL CHECK(jsonb_typeof(validated_payload)='object'),
  validated_at timestamptz NOT NULL,
  validator_version text NOT NULL CHECK(validator_version<>''),
  UNIQUE(preset_id,id),
  FOREIGN KEY(preset_id,run_id) REFERENCES wordweave.preset_preview_runs(preset_id,id) ON DELETE CASCADE
);
ALTER TABLE wordweave.preset_versions ADD CONSTRAINT preset_versions_preview_fk
  FOREIGN KEY(preset_id,preview_id) REFERENCES wordweave.preset_previews(preset_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE wordweave.generation_runs
  ADD COLUMN entry_kind text NOT NULL DEFAULT 'normal' CHECK(entry_kind IN ('normal','preset')),
  ADD COLUMN preset_version_id uuid REFERENCES wordweave.preset_versions(id) ON DELETE SET NULL;

CREATE TABLE wordweave.plan_quota_states (
  owner_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES wordweave.entitlement_groups(code) ON DELETE RESTRICT CHECK(plan_code IN ('registered','pro','plus')),
  origin text NOT NULL CHECK(origin IN ('base','trial')),
  reset_epoch bigint NOT NULL DEFAULT 0 CHECK(reset_epoch>=0),
  reset_at timestamptz NOT NULL,
  PRIMARY KEY(owner_id,plan_code,origin),
  CHECK(origin<>'trial' OR reset_epoch=0)
);
CREATE TABLE wordweave.generation_charges (
  run_id uuid PRIMARY KEY REFERENCES wordweave.generation_runs(id) ON DELETE CASCADE,
  account_id uuid REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  visitor_id uuid REFERENCES wordweave.visitor_identities(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK(source_kind IN ('plan','extra_credit','visitor')),
  plan_code text,
  origin text,
  quota_epoch bigint CHECK(quota_epoch>=0),
  item_id uuid,
  units integer NOT NULL DEFAULT 1 CHECK(units=1),
  state text NOT NULL CHECK(state IN ('reserved','consumed','refunded')),
  charged_at timestamptz NOT NULL,
  settled_at timestamptz,
  FOREIGN KEY(account_id,plan_code,origin) REFERENCES wordweave.plan_quota_states(owner_id,plan_code,origin) ON DELETE CASCADE,
  FOREIGN KEY(account_id,item_id) REFERENCES wordweave.user_items(owner_id,id) ON DELETE CASCADE,
  CONSTRAINT generation_charges_typed_source CHECK(
    (source_kind='plan' AND account_id IS NOT NULL AND visitor_id IS NULL AND plan_code IS NOT NULL AND origin IS NOT NULL AND origin IN ('base','trial') AND quota_epoch IS NOT NULL AND item_id IS NULL) OR
    (source_kind='extra_credit' AND account_id IS NOT NULL AND visitor_id IS NULL AND item_id IS NOT NULL AND plan_code IS NULL AND origin IS NULL AND quota_epoch IS NULL) OR
    (source_kind='visitor' AND account_id IS NULL AND visitor_id IS NOT NULL AND item_id IS NULL AND plan_code IS NULL AND origin IS NULL AND quota_epoch IS NULL)),
  CHECK((state='reserved' AND settled_at IS NULL) OR (state<>'reserved' AND settled_at IS NOT NULL))
);
CREATE INDEX generation_charges_plan_window ON wordweave.generation_charges(account_id,plan_code,origin,quota_epoch,charged_at) WHERE source_kind='plan' AND state<>'refunded';
CREATE INDEX generation_charges_visitor_window ON wordweave.generation_charges(visitor_id,charged_at) WHERE source_kind='visitor' AND state<>'refunded';
CREATE INDEX generation_charges_item ON wordweave.generation_charges(item_id) WHERE item_id IS NOT NULL;

-- A legacy reset separated all earlier consumption, including a same-plan reset.
-- Epoch zero holds pre-reset/history rows; epoch one is the retained live window.
INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_epoch,reset_at)
 SELECT id,group_code,'base',1,quota_reset_at FROM wordweave.accounts WHERE role='learner';
INSERT INTO wordweave.plan_quota_states(owner_id,plan_code,origin,reset_epoch,reset_at)
 SELECT DISTINCT r.account_id,r.group_code_snapshot,'base',0,'-infinity'::timestamptz
 FROM wordweave.generation_runs r WHERE r.account_id IS NOT NULL
 ON CONFLICT(owner_id,plan_code,origin) DO NOTHING;
INSERT INTO wordweave.generation_charges(run_id,account_id,visitor_id,source_kind,plan_code,origin,quota_epoch,state,charged_at,settled_at)
 SELECT r.id,r.account_id,r.visitor_id,
   CASE WHEN r.account_id IS NULL THEN 'visitor' ELSE 'plan' END,
   CASE WHEN r.account_id IS NULL THEN NULL ELSE r.group_code_snapshot END,
   CASE WHEN r.account_id IS NULL THEN NULL ELSE 'base' END,
   CASE WHEN r.account_id IS NULL THEN NULL
     WHEN r.group_code_snapshot=a.group_code AND r.started_at>=a.quota_reset_at THEN 1 ELSE 0 END,
   CASE WHEN r.call_status='active' THEN 'reserved' WHEN r.quota_charged THEN 'consumed' ELSE 'refunded' END,
   r.started_at,r.completed_at
 FROM wordweave.generation_runs r LEFT JOIN wordweave.accounts a ON a.id=r.account_id;

CREATE TABLE wordweave.ai_call_usage (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_run_id uuid REFERENCES wordweave.generation_runs(id) ON DELETE CASCADE,
  preview_run_id uuid REFERENCES wordweave.preset_preview_runs(id) ON DELETE CASCADE,
  call_no integer NOT NULL CHECK(call_no>0),
  provider_request_id text,
  model_snapshot text NOT NULL,
  input_tokens bigint CHECK(input_tokens>=0),
  output_tokens bigint CHECK(output_tokens>=0),
  cost_amount numeric CHECK(cost_amount>=0),
  currency text CHECK(currency='openrouter_credits'),
  usage_status text NOT NULL CHECK(usage_status IN ('known','partial','unknown')),
  completed_at timestamptz NOT NULL,
  CHECK((user_run_id IS NULL)<>(preview_run_id IS NULL)),
  CHECK((cost_amount IS NULL)=(currency IS NULL)),
  CHECK((usage_status='known' AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND cost_amount IS NOT NULL) OR
    (usage_status='unknown' AND input_tokens IS NULL AND output_tokens IS NULL AND cost_amount IS NULL) OR
    (usage_status='partial' AND (input_tokens IS NOT NULL OR output_tokens IS NOT NULL OR cost_amount IS NOT NULL)
      AND (input_tokens IS NULL OR output_tokens IS NULL OR cost_amount IS NULL))),
  UNIQUE(user_run_id,call_no),
  UNIQUE(preview_run_id,call_no)
);
CREATE INDEX preset_preview_runs_started ON wordweave.preset_preview_runs(started_at,id);
CREATE INDEX ai_call_usage_completed ON wordweave.ai_call_usage(completed_at,id);

DO $permissions$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['presets','preset_versions','preset_version_entries','preset_preview_runs','preset_previews','plan_quota_states','generation_charges','ai_call_usage'] LOOP
    EXECUTE format('ALTER TABLE wordweave.%I OWNER TO wordweave_owner',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON wordweave.%I TO wordweave_app',table_name);
  END LOOP;
END
$permissions$;
GRANT SELECT,UPDATE ON wordweave.generation_charges,wordweave.extra_credit_balances TO wordweave_maintenance;
GRANT SELECT,DELETE ON wordweave.preset_versions,wordweave.preset_version_entries,wordweave.preset_preview_runs,wordweave.preset_previews,wordweave.ai_call_usage TO wordweave_maintenance;
GRANT UPDATE ON wordweave.preset_preview_runs TO wordweave_maintenance;
GRANT SELECT ON wordweave.presets TO wordweave_maintenance;
