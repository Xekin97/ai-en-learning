-- M003 current pre-release schema. The product has not been deployed, so this
-- candidate defines the complete v5 shape directly; it is not an upgrade or
-- compatibility migration for an already released pipeline.

ALTER TABLE wordweave.ai_models
  ADD COLUMN custom_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT ai_models_custom_parameters_object
    CHECK ((jsonb_typeof(custom_parameters) = 'object') IS TRUE);

ALTER TABLE wordweave.entitlement_groups
  ADD COLUMN content_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN content_repair_limit smallint NOT NULL DEFAULT 0,
  ADD CONSTRAINT entitlement_groups_content_service_valid CHECK ((
    (content_review_enabled IS FALSE AND content_repair_limit = 0) OR
    (code IN ('pro', 'plus') AND content_review_enabled IS TRUE AND
      content_repair_limit BETWEEN 1 AND 99)
  ) IS TRUE);

UPDATE wordweave.entitlement_groups
SET content_review_enabled = true, content_repair_limit = 1
WHERE code IN ('pro', 'plus');

UPDATE wordweave.growth_settings
SET revision = revision + 1,
    recompute_target_revision = revision + 1,
    recompute_after_owner = NULL,
    updated_at = clock_timestamp()
WHERE singleton;

ALTER TABLE wordweave.generation_runs
	ADD COLUMN model_request_parameters_snapshot jsonb NOT NULL,
  ADD COLUMN content_policy_version smallint,
  ADD COLUMN configuration_revision_snapshot bigint,
  ADD COLUMN content_review_enabled_snapshot boolean,
  ADD COLUMN content_repair_limit_snapshot smallint,
  ADD COLUMN pipeline_version_snapshot text,
  ADD COLUMN plan_origin_snapshot text,
  ADD COLUMN content_outcome text,
  ADD COLUMN final_content_version smallint,
  ADD COLUMN content_stop_reason text,
	ADD CONSTRAINT generation_runs_request_parameters_valid CHECK ((
		jsonb_typeof(model_request_parameters_snapshot) = 'object' AND
		model_request_parameters_snapshot ?& ARRAY['version','custom_parameters','output_mode','max_output_tokens','structured_route'] AND
		model_request_parameters_snapshot - ARRAY['version','custom_parameters','output_mode','max_output_tokens','structured_route'] = '{}'::jsonb AND
		model_request_parameters_snapshot->>'version' = 'custom-parameters-v1' AND
		jsonb_typeof(model_request_parameters_snapshot->'custom_parameters') = 'object' AND
		model_request_parameters_snapshot->>'output_mode' IN ('prompt','json_schema') AND
		(CASE WHEN model_request_parameters_snapshot->'max_output_tokens' = 'null'::jsonb THEN true
		      WHEN jsonb_typeof(model_request_parameters_snapshot->'max_output_tokens') = 'number' THEN
		        (model_request_parameters_snapshot->>'max_output_tokens')::numeric = trunc((model_request_parameters_snapshot->>'max_output_tokens')::numeric) AND
		        (model_request_parameters_snapshot->>'max_output_tokens')::numeric BETWEEN 1 AND 1048576
		      ELSE false END) AND
		model_request_parameters_snapshot->>'structured_route' IN ('openrouter_require_parameters','unchanged') AND
		(model_request_parameters_snapshot->>'structured_route' <> 'openrouter_require_parameters' OR
		 model_request_parameters_snapshot->>'output_mode' = 'json_schema')
	) IS TRUE),
  ADD CONSTRAINT generation_runs_m003_content_facts_valid CHECK ((
    (content_policy_version IS NULL AND
      configuration_revision_snapshot IS NULL AND
      content_review_enabled_snapshot IS NULL AND
      content_repair_limit_snapshot IS NULL AND
      pipeline_version_snapshot IS NULL AND
      plan_origin_snapshot IS NULL AND
      content_outcome IS NULL AND
      final_content_version IS NULL AND
      content_stop_reason IS NULL)
    OR
    (content_policy_version IS NOT NULL AND content_policy_version = 1 AND
      configuration_revision_snapshot IS NOT NULL AND configuration_revision_snapshot > 0 AND
      content_review_enabled_snapshot IS NOT NULL AND
      content_repair_limit_snapshot IS NOT NULL AND
      pipeline_version_snapshot = 'm003-content-v5' AND
      plan_origin_snapshot IS NOT NULL AND plan_origin_snapshot IN ('visitor', 'base', 'trial') AND
      ((visitor_id IS NOT NULL AND account_id IS NULL AND
          plan_origin_snapshot = 'visitor' AND group_code_snapshot = 'visitor' AND
          content_review_enabled_snapshot IS FALSE AND content_repair_limit_snapshot = 0)
       OR
       (account_id IS NOT NULL AND visitor_id IS NULL AND plan_origin_snapshot IN ('base', 'trial') AND
          ((group_code_snapshot = 'registered' AND content_review_enabled_snapshot IS FALSE AND
              content_repair_limit_snapshot = 0)
           OR
           (group_code_snapshot IN ('pro', 'plus') AND
              ((content_review_enabled_snapshot IS FALSE AND content_repair_limit_snapshot = 0) OR
               (content_review_enabled_snapshot IS TRUE AND content_repair_limit_snapshot BETWEEN 1 AND 99)))))) AND
      ((call_status = 'active' AND content_outcome IS NULL AND
          final_content_version IS NULL AND content_stop_reason IS NULL)
       OR
       (call_status = 'valid' AND content_outcome IS NOT NULL AND
          content_outcome IN ('basic', 'review_passed', 'repaired_passed', 'limit_finalized', 'service_incomplete') AND
          final_content_version IS NOT NULL AND
          ((content_review_enabled_snapshot IS FALSE AND content_repair_limit_snapshot = 0 AND
              content_outcome = 'basic' AND final_content_version = 1)
           OR
           (content_review_enabled_snapshot IS TRUE AND content_repair_limit_snapshot BETWEEN 1 AND 99 AND
              content_outcome <> 'basic' AND final_content_version BETWEEN 1 AND content_repair_limit_snapshot + 2)) AND
          ((content_outcome = 'service_incomplete' AND content_stop_reason IS NOT NULL AND
              content_stop_reason IN ('content_timeout', 'content_rate_limited',
                'content_transport_error', 'content_protocol_error', 'content_review_invalid',
                'fixed_edit_native_invalid', 'repair_native_invalid'))
           OR (content_outcome <> 'service_incomplete' AND content_stop_reason IS NULL)))
       OR
       (call_status = 'user_cancelled' AND content_outcome = 'cancelled' AND
          final_content_version IS NULL AND content_stop_reason IS NULL)
       OR
       (call_status IN ('provider_failed', 'server_failed', 'stream_failed', 'validation_failed') AND
          content_outcome = 'failed' AND final_content_version IS NULL AND content_stop_reason IS NULL)))
  ) IS TRUE);

ALTER TABLE wordweave.generation_runs
  ALTER COLUMN content_policy_version SET DEFAULT 1;

ALTER TABLE wordweave.preset_preview_runs
	ADD COLUMN model_request_parameters_snapshot jsonb NOT NULL,
  ADD COLUMN content_policy_version smallint,
  ADD COLUMN configuration_revision_snapshot bigint,
  ADD COLUMN content_review_enabled_snapshot boolean,
  ADD COLUMN content_repair_limit_snapshot smallint,
  ADD COLUMN pipeline_version_snapshot text,
  ADD COLUMN content_outcome text,
  ADD COLUMN final_content_version smallint,
  ADD COLUMN content_stop_reason text,
	ADD CONSTRAINT preset_preview_runs_request_parameters_valid CHECK ((
		jsonb_typeof(model_request_parameters_snapshot) = 'object' AND
		model_request_parameters_snapshot ?& ARRAY['version','custom_parameters','output_mode','max_output_tokens','structured_route'] AND
		model_request_parameters_snapshot - ARRAY['version','custom_parameters','output_mode','max_output_tokens','structured_route'] = '{}'::jsonb AND
		model_request_parameters_snapshot->>'version' = 'custom-parameters-v1' AND
		jsonb_typeof(model_request_parameters_snapshot->'custom_parameters') = 'object' AND
		model_request_parameters_snapshot->>'output_mode' IN ('prompt','json_schema') AND
		(CASE WHEN model_request_parameters_snapshot->'max_output_tokens' = 'null'::jsonb THEN true
		      WHEN jsonb_typeof(model_request_parameters_snapshot->'max_output_tokens') = 'number' THEN
		        (model_request_parameters_snapshot->>'max_output_tokens')::numeric = trunc((model_request_parameters_snapshot->>'max_output_tokens')::numeric) AND
		        (model_request_parameters_snapshot->>'max_output_tokens')::numeric BETWEEN 1 AND 1048576
		      ELSE false END) AND
		model_request_parameters_snapshot->>'structured_route' IN ('openrouter_require_parameters','unchanged') AND
		(model_request_parameters_snapshot->>'structured_route' <> 'openrouter_require_parameters' OR
		 model_request_parameters_snapshot->>'output_mode' = 'json_schema')
	) IS TRUE),
  ADD CONSTRAINT preset_preview_runs_m003_content_facts_valid CHECK ((
    (content_policy_version IS NULL AND
      configuration_revision_snapshot IS NULL AND
      content_review_enabled_snapshot IS NULL AND
      content_repair_limit_snapshot IS NULL AND
      pipeline_version_snapshot IS NULL AND
      content_outcome IS NULL AND
      final_content_version IS NULL AND
      content_stop_reason IS NULL)
    OR
    (content_policy_version IS NOT NULL AND content_policy_version = 1 AND
      configuration_revision_snapshot IS NOT NULL AND configuration_revision_snapshot > 0 AND
      content_review_enabled_snapshot IS NOT NULL AND
      content_repair_limit_snapshot IS NOT NULL AND
      pipeline_version_snapshot = 'm003-content-v5' AND
      ((content_review_enabled_snapshot IS FALSE AND content_repair_limit_snapshot = 0) OR
       (content_review_enabled_snapshot IS TRUE AND content_repair_limit_snapshot = 1)) AND
      ((status = 'active' AND content_outcome IS NULL AND
          final_content_version IS NULL AND content_stop_reason IS NULL)
       OR
       (status = 'valid' AND content_outcome IS NOT NULL AND
          content_outcome IN ('basic', 'review_passed', 'repaired_passed', 'limit_finalized', 'service_incomplete') AND
          final_content_version IS NOT NULL AND
          ((content_review_enabled_snapshot IS FALSE AND content_repair_limit_snapshot = 0 AND
              content_outcome = 'basic' AND final_content_version = 1)
           OR
           (content_review_enabled_snapshot IS TRUE AND content_repair_limit_snapshot = 1 AND
              content_outcome <> 'basic' AND final_content_version BETWEEN 1 AND 3)) AND
          ((content_outcome = 'service_incomplete' AND content_stop_reason IS NOT NULL AND
              content_stop_reason IN ('content_timeout', 'content_rate_limited',
                'content_transport_error', 'content_protocol_error', 'content_review_invalid',
                'fixed_edit_native_invalid', 'repair_native_invalid'))
           OR (content_outcome <> 'service_incomplete' AND content_stop_reason IS NULL)))
       OR
       (status = 'cancelled' AND content_outcome = 'cancelled' AND
          final_content_version IS NULL AND content_stop_reason IS NULL)
       OR
       (status = 'failed' AND content_outcome = 'failed' AND
          final_content_version IS NULL AND content_stop_reason IS NULL)))
  ) IS TRUE);

ALTER TABLE wordweave.preset_preview_runs
  ALTER COLUMN content_policy_version SET DEFAULT 1;

CREATE FUNCTION wordweave.reject_request_parameters_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.model_request_parameters_snapshot IS DISTINCT FROM OLD.model_request_parameters_snapshot THEN
    RAISE EXCEPTION 'model request parameters snapshot is immutable'
      USING ERRCODE = '23514', CONSTRAINT = TG_ARGV[0];
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER generation_runs_request_parameters_immutable
BEFORE UPDATE OF model_request_parameters_snapshot ON wordweave.generation_runs
FOR EACH ROW EXECUTE FUNCTION wordweave.reject_request_parameters_snapshot_update('generation_runs_request_parameters_immutable');

CREATE TRIGGER preset_preview_runs_request_parameters_immutable
BEFORE UPDATE OF model_request_parameters_snapshot ON wordweave.preset_preview_runs
FOR EACH ROW EXECUTE FUNCTION wordweave.reject_request_parameters_snapshot_update('preset_preview_runs_request_parameters_immutable');

ALTER TABLE wordweave.preset_versions
  ADD COLUMN preview_content_mode text NOT NULL DEFAULT 'basic',
  ADD CONSTRAINT preset_versions_preview_content_mode_valid
    CHECK ((preview_content_mode IN ('basic', 'enhanced')) IS TRUE);

ALTER TABLE wordweave.ai_call_usage
  ADD COLUMN call_stage text NOT NULL,
  ADD COLUMN prompt_version text,
  ADD COLUMN provider_invoked boolean,
  ADD COLUMN review_result text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN reason_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN repair_requested boolean NOT NULL DEFAULT false;

ALTER TABLE wordweave.ai_call_usage
  ADD CONSTRAINT ai_call_usage_m003_stage_valid CHECK ((
    call_stage IN ('legacy', 'planning', 'generation', 'fixed_edit',
      'technical_repair', 'content_review', 'content_repair')
  ) IS TRUE),
  ADD CONSTRAINT ai_call_usage_m003_prompt_valid CHECK ((
    (call_stage = 'legacy' AND prompt_version IS NULL AND provider_invoked IS NULL) OR
    (call_stage <> 'legacy' AND prompt_version IS NOT NULL AND btrim(prompt_version) <> '')
  ) IS TRUE),
  ADD CONSTRAINT ai_call_usage_m003_review_valid CHECK ((
    cardinality(reason_codes) BETWEEN 0 AND 3 AND
    (cardinality(reason_codes) = 0 OR
      (array_ndims(reason_codes) = 1 AND array_lower(reason_codes, 1) = 1)) AND
    array_position(reason_codes, NULL) IS NULL AND
    reason_codes <@ ARRAY['forced_wording', 'contradiction', 'other_content']::text[] AND
    (cardinality(reason_codes) < 2 OR reason_codes[1] <> reason_codes[2]) AND
    (cardinality(reason_codes) < 3 OR
      (reason_codes[1] <> reason_codes[3] AND reason_codes[2] <> reason_codes[3])) AND
    ((call_stage = 'content_review' AND
       review_result IN ('pending', 'pass', 'issues', 'indeterminate') AND
       ((review_result = 'issues' AND cardinality(reason_codes) BETWEEN 1 AND 3) OR
        (review_result <> 'issues' AND cardinality(reason_codes) = 0)) AND
       (repair_requested IS FALSE OR review_result = 'issues'))
     OR
     (call_stage = 'content_repair' AND review_result = 'not_applicable' AND
       repair_requested IS FALSE AND cardinality(reason_codes) BETWEEN 1 AND 3)
     OR
     (call_stage NOT IN ('content_review', 'content_repair') AND
       review_result = 'not_applicable' AND repair_requested IS FALSE AND
       cardinality(reason_codes) = 0))
  ) IS TRUE);

ALTER TABLE wordweave.ai_call_usage ALTER COLUMN call_stage DROP DEFAULT;
