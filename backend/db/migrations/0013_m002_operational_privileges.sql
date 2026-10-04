-- Credential replacement needs the same configuration CAS as other admin
-- writes, without granting the AI role access to personal growth data or
-- granting the app role access to credential ciphertext.
CREATE FUNCTION wordweave.replace_openrouter_credential(
  p_expected_revision bigint,p_ciphertext bytea,p_nonce bytea,p_key_version integer,
  p_fingerprint text,p_actor uuid
) RETURNS TABLE(applied boolean,configuration_revision bigint,fingerprint text,credential_updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
DECLARE current_revision bigint;business_at timestamptz;
BEGIN
  SELECT s.revision INTO STRICT current_revision FROM wordweave.growth_settings s WHERE s.singleton FOR UPDATE;
  IF p_expected_revision IS NOT NULL AND p_expected_revision<>current_revision THEN
    RETURN QUERY SELECT false,current_revision,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;
  business_at:=clock_timestamp();
  INSERT INTO wordweave.openrouter_credentials(provider,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by,updated_at)
  VALUES('openrouter',p_ciphertext,p_nonce,p_key_version,p_fingerprint,p_actor,business_at)
  ON CONFLICT(provider) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,
    encryption_key_version=EXCLUDED.encryption_key_version,display_fingerprint=EXCLUDED.display_fingerprint,
    updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
  UPDATE wordweave.growth_settings SET revision=revision+1,recompute_target_revision=revision+1,
    recompute_after_owner=NULL,updated_at=business_at WHERE singleton RETURNING revision INTO current_revision;
  RETURN QUERY SELECT true,current_revision,p_fingerprint,business_at;
END
$fn$;
ALTER FUNCTION wordweave.replace_openrouter_credential(bigint,bytea,bytea,integer,text,uuid) OWNER TO wordweave_owner;
REVOKE ALL ON FUNCTION wordweave.replace_openrouter_credential(bigint,bytea,bytea,integer,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wordweave.replace_openrouter_credential(bigint,bytea,bytea,integer,text,uuid) TO wordweave_ai;

-- Ledger amounts are append-only for the application. Account removal still
-- cascades through the owner FK using PostgreSQL's referential actions.
REVOKE UPDATE,DELETE ON wordweave.growth_ledger FROM wordweave_app;

-- Recovery follows the same subject locks and terminal analytic insertion as
-- the request path; these grants name only the required tables/columns.
GRANT SELECT(id,role,group_code,quota_reset_at) ON wordweave.accounts TO wordweave_maintenance;
GRANT SELECT(id,last_seen_at) ON wordweave.visitor_identities TO wordweave_maintenance;
GRANT UPDATE(id) ON wordweave.accounts,wordweave.visitor_identities TO wordweave_maintenance;
GRANT SELECT,UPDATE ON wordweave.generation_runs,wordweave.generation_charges,wordweave.extra_credit_balances TO wordweave_maintenance;
GRANT INSERT ON wordweave.analytics_events TO wordweave_maintenance;

GRANT INSERT ON wordweave.growth_balances TO wordweave_maintenance;

-- Operators can verify the exact migration set without reading private material.
GRANT SELECT ON wordweave.schema_migrations TO wordweave_maintenance;

GRANT UPDATE(id) ON wordweave.presets TO wordweave_maintenance;

-- Existing TTL jobs use subject locks before their owned objects.
GRANT SELECT,DELETE ON wordweave.account_sessions,wordweave.generation_drafts,wordweave.visitor_claims TO wordweave_maintenance;
GRANT UPDATE(id) ON wordweave.account_sessions,wordweave.visitor_claims TO wordweave_maintenance;
GRANT DELETE ON wordweave.visitor_identities TO wordweave_maintenance;

-- Background model-retirement qualification needs identities and intervals only.
GRANT SELECT(id,owner_id,kind_snapshot,refund_eligible_at,refunded_at,activated_at,issued_at,activation_deadline),UPDATE(refund_eligible_at) ON wordweave.user_items TO wordweave_maintenance;
GRANT SELECT(item_id,model_id) ON wordweave.user_item_models TO wordweave_maintenance;
GRANT SELECT(item_id,ends_at,revoked_at) ON wordweave.model_time_contributions TO wordweave_maintenance;
GRANT SELECT(id,retired_at) ON wordweave.ai_models TO wordweave_maintenance;

-- M001 granted broad table DML. M002 retires models and edits fixed plan rows;
-- neither operation authorizes hard deletion or creating additional plan codes.
REVOKE DELETE ON wordweave.ai_models FROM wordweave_app;
REVOKE INSERT,DELETE ON wordweave.entitlement_groups FROM wordweave_app;
