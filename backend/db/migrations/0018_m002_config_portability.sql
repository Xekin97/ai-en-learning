-- M002 CR313 applies only to fresh, unpublished schema initialization in this
-- milestone. Existing environments require a separately authorized rollout.
ALTER TABLE wordweave.ai_providers
  ADD COLUMN retired_at timestamptz,
  ADD CONSTRAINT ai_providers_retired_unconfigured CHECK (retired_at IS NULL OR credential_configured IS FALSE);

ALTER TABLE wordweave.growth_levels ADD COLUMN retired_at timestamptz;
ALTER TABLE wordweave.achievement_tiers ADD COLUMN retired_at timestamptz;

ALTER TABLE wordweave.growth_levels DROP CONSTRAINT growth_levels_min_experience_unique;
ALTER TABLE wordweave.growth_levels
  ADD COLUMN active_min_experience bigint GENERATED ALWAYS AS
    (CASE WHEN retired_at IS NULL THEN min_experience ELSE NULL END) STORED,
  ADD CONSTRAINT growth_levels_active_min_experience_unique
    UNIQUE(active_min_experience) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE wordweave.achievement_tiers DROP CONSTRAINT achievement_tiers_kind_threshold_unique;
ALTER TABLE wordweave.achievement_tiers
  ADD COLUMN active_threshold bigint GENERATED ALWAYS AS
    (CASE WHEN retired_at IS NULL THEN threshold ELSE NULL END) STORED,
  ADD CONSTRAINT achievement_tiers_active_threshold_unique
    UNIQUE(kind,active_threshold) DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE wordweave.config_import_receipts (
  operation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES wordweave.accounts(id) ON DELETE CASCADE,
  category text NOT NULL CHECK(category IN ('models','plans','items','growth')),
  request_fingerprint bytea NOT NULL CHECK(octet_length(request_fingerprint)=32),
  status text NOT NULL CHECK(status IN ('applied','not_applied')),
  baseline_revision bigint NOT NULL CHECK(baseline_revision>0),
  result_revision bigint NOT NULL CHECK(result_revision>0),
  effective_day date,
  result_counts jsonb NOT NULL CHECK(
    jsonb_typeof(result_counts)='object' AND result_counts ?& ARRAY['added','updated','removed','unchanged'] AND
    (result_counts-ARRAY['added','updated','removed','unchanged'])='{}'::jsonb AND
    jsonb_typeof(result_counts->'added')='number' AND (result_counts->>'added')::bigint>=0 AND
    jsonb_typeof(result_counts->'updated')='number' AND (result_counts->>'updated')::bigint>=0 AND
    jsonb_typeof(result_counts->'removed')='number' AND (result_counts->>'removed')::bigint>=0 AND
    jsonb_typeof(result_counts->'unchanged')='number' AND (result_counts->>'unchanged')::bigint>=0),
  reason_code text,
  resolved_at timestamptz NOT NULL,
  commit_not_after timestamptz NOT NULL,
  retain_until timestamptz NOT NULL,
  CHECK(retain_until>commit_not_after),
  CHECK((status='applied' AND reason_code IS NULL AND result_revision=baseline_revision+1 AND
         ((category='growth' AND effective_day IS NOT NULL) OR (category<>'growth' AND effective_day IS NULL))) OR
        (status='not_applied' AND reason_code IS NOT NULL AND
         reason_code IN ('preview_expired','revision_changed','impact_changed','dependency_changed','resolved_before_commit','transaction_rolled_back') AND
         result_revision=baseline_revision AND effective_day IS NULL AND
         result_counts='{"added":0,"updated":0,"removed":0,"unchanged":0}'::jsonb))
);
CREATE INDEX config_import_receipts_actor ON wordweave.config_import_receipts(actor_id);
CREATE INDEX config_import_receipts_retain ON wordweave.config_import_receipts(retain_until);

CREATE FUNCTION wordweave.config_import_receipt_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'config import receipt is immutable'; END $fn$;
CREATE TRIGGER config_import_receipt_immutable BEFORE UPDATE ON wordweave.config_import_receipts
  FOR EACH ROW EXECUTE FUNCTION wordweave.config_import_receipt_immutable();

-- The app cannot read credential ciphertext. This narrow function is invoked
-- only after the shared configuration row is locked by the caller.
CREATE FUNCTION wordweave.retire_provider_credential(p_provider uuid,p_at timestamptz,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
  PERFORM revision FROM wordweave.growth_settings WHERE singleton FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM wordweave.accounts WHERE id=p_actor AND role='admin' AND status='active') THEN
    RAISE EXCEPTION 'administrator authorization expired' USING ERRCODE='42501';
  END IF;
  DELETE FROM wordweave.ai_provider_credentials WHERE provider_id=p_provider;
  UPDATE wordweave.ai_providers SET retired_at=p_at WHERE id=p_provider AND retired_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider is missing or already retired' USING ERRCODE='P0002'; END IF;
END $fn$;

-- Credential writers are security-definer entry points because the app and AI
-- roles cannot read ciphertext. Reassert the active-provider and administrator
-- invariants inside those entry points so a stale caller cannot recreate
-- credentials after retirement.
CREATE OR REPLACE FUNCTION wordweave.update_provider_credential(p_provider uuid,p_cipher bytea,p_nonce bytea,p_version integer,p_hint text,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
  PERFORM revision FROM wordweave.growth_settings WHERE singleton FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM wordweave.accounts WHERE id=p_actor AND role='admin' AND status='active') THEN
    RAISE EXCEPTION 'administrator authorization expired' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM wordweave.ai_providers WHERE id=p_provider AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'provider is missing or retired' USING ERRCODE='P0002';
  END IF;
  INSERT INTO wordweave.ai_provider_credentials(provider_id,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by)
  VALUES(p_provider,p_cipher,p_nonce,p_version,p_hint,p_actor)
  ON CONFLICT(provider_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,
    encryption_key_version=EXCLUDED.encryption_key_version,display_fingerprint=EXCLUDED.display_fingerprint,
    updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
END $fn$;

CREATE OR REPLACE FUNCTION wordweave.write_provider_credential(p_provider uuid,p_cipher bytea,p_nonce bytea,p_version integer,p_hint text,p_actor uuid,p_source uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
  PERFORM revision FROM wordweave.growth_settings WHERE singleton FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM wordweave.accounts WHERE id=p_actor AND role='admin' AND status='active') THEN
    RAISE EXCEPTION 'administrator authorization expired' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM wordweave.ai_providers WHERE id=p_provider AND retired_at IS NULL) OR
     (p_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wordweave.ai_providers WHERE id=p_source AND retired_at IS NULL)) THEN
    RAISE EXCEPTION 'provider is missing or retired' USING ERRCODE='P0002';
  END IF;
  IF p_source IS NOT NULL THEN
    INSERT INTO wordweave.ai_provider_credentials(provider_id,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by)
      SELECT p_provider,ciphertext,nonce,encryption_key_version,display_fingerprint,p_actor
      FROM wordweave.ai_provider_credentials WHERE provider_id=p_source;
    IF NOT FOUND THEN RAISE EXCEPTION 'credential missing' USING ERRCODE='P0002'; END IF;
  ELSE
    INSERT INTO wordweave.ai_provider_credentials(provider_id,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by)
      VALUES(p_provider,p_cipher,p_nonce,p_version,p_hint,p_actor);
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION wordweave.replace_openrouter_credential(
  p_expected_revision bigint,p_ciphertext bytea,p_nonce bytea,p_key_version integer,p_fingerprint text,p_actor uuid
) RETURNS TABLE(applied boolean,configuration_revision bigint,fingerprint text,credential_updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
DECLARE current_revision bigint;business_at timestamptz;
BEGIN
  SELECT s.revision INTO STRICT current_revision FROM wordweave.growth_settings s WHERE s.singleton FOR UPDATE;
  IF p_expected_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM wordweave.accounts WHERE id=p_actor AND role='admin' AND status='active') THEN
    RAISE EXCEPTION 'administrator authorization expired' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM wordweave.ai_providers WHERE id='00000000-0000-4000-8000-000000000001' AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'provider is missing or retired' USING ERRCODE='P0002';
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision<>current_revision THEN
    RETURN QUERY SELECT false,current_revision,NULL::text,NULL::timestamptz; RETURN;
  END IF;
  business_at:=clock_timestamp();
  INSERT INTO wordweave.ai_provider_credentials(provider_id,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by,updated_at)
  VALUES('00000000-0000-4000-8000-000000000001',p_ciphertext,p_nonce,p_key_version,p_fingerprint,p_actor,business_at)
  ON CONFLICT(provider_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,encryption_key_version=EXCLUDED.encryption_key_version,
    display_fingerprint=EXCLUDED.display_fingerprint,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
  UPDATE wordweave.growth_settings SET revision=revision+1,recompute_target_revision=revision+1,recompute_after_owner=NULL,updated_at=business_at
    WHERE singleton RETURNING revision INTO current_revision;
  RETURN QUERY SELECT true,current_revision,p_fingerprint,business_at;
END $fn$;

CREATE FUNCTION wordweave.purge_config_import_receipts(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
DECLARE removed integer;
BEGIN
  IF p_limit<1 OR p_limit>200 THEN RAISE EXCEPTION 'invalid cleanup limit'; END IF;
  PERFORM revision FROM wordweave.growth_settings WHERE singleton FOR SHARE;
  WITH expired AS (
    SELECT operation_id FROM wordweave.config_import_receipts
    WHERE retain_until<clock_timestamp() ORDER BY retain_until,operation_id LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM wordweave.config_import_receipts r USING expired e WHERE r.operation_id=e.operation_id;
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed;
END $fn$;

ALTER TABLE wordweave.config_import_receipts OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.config_import_receipt_immutable() OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.retire_provider_credential(uuid,timestamptz,uuid) OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.purge_config_import_receipts(integer) OWNER TO wordweave_owner;
REVOKE ALL ON wordweave.config_import_receipts FROM PUBLIC,wordweave_ai;
GRANT SELECT,INSERT ON wordweave.config_import_receipts TO wordweave_app;
GRANT SELECT,DELETE ON wordweave.config_import_receipts TO wordweave_maintenance;
REVOKE ALL ON FUNCTION wordweave.retire_provider_credential(uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wordweave.retire_provider_credential(uuid,timestamptz,uuid) TO wordweave_app;
REVOKE ALL ON FUNCTION wordweave.purge_config_import_receipts(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wordweave.purge_config_import_receipts(integer) TO wordweave_app,wordweave_maintenance;
REVOKE ALL ON FUNCTION wordweave.config_import_receipt_immutable() FROM PUBLIC;

GRANT SELECT(retired_at) ON wordweave.ai_providers TO wordweave_maintenance;
