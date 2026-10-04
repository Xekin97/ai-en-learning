-- A provider is an immutable connection. Editing a model's connection creates
-- a new provider, so another model can never inherit an unintended key/URL.
CREATE TABLE wordweave.ai_providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
 protocol text NOT NULL CHECK (protocol IN ('openai_chat','openai_responses','anthropic_messages')),
 base_url text NOT NULL CHECK (length(base_url) BETWEEN 1 AND 2048),
 credential_configured boolean NOT NULL DEFAULT false,
 masked_hint text,
 legacy_url_pending boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO wordweave.ai_providers(id,name,protocol,base_url,legacy_url_pending)
 VALUES('00000000-0000-4000-8000-000000000001','OpenRouter','openai_chat','https://openrouter.ai/api/v1',true);

CREATE TABLE wordweave.ai_provider_credentials (
 provider_id uuid PRIMARY KEY REFERENCES wordweave.ai_providers(id),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext)>0),
 nonce bytea NOT NULL CHECK(octet_length(nonce)>0),
 encryption_key_version integer NOT NULL CHECK(encryption_key_version>0),
 display_fingerprint text NOT NULL CHECK(display_fingerprint<>''),
 updated_by uuid REFERENCES wordweave.accounts(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO wordweave.ai_provider_credentials
 SELECT '00000000-0000-4000-8000-000000000001',ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by,updated_at
 FROM wordweave.openrouter_credentials;
UPDATE wordweave.ai_providers p SET credential_configured=true,masked_hint=c.display_fingerprint
 FROM wordweave.ai_provider_credentials c WHERE c.provider_id=p.id;

ALTER TABLE wordweave.ai_models ADD COLUMN provider_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES wordweave.ai_providers(id);
ALTER TABLE wordweave.ai_models ADD COLUMN max_output_tokens integer CHECK(max_output_tokens BETWEEN 1 AND 1048576);
ALTER TABLE wordweave.ai_models ADD COLUMN output_mode text NOT NULL DEFAULT 'json_schema' CHECK(output_mode IN ('prompt','json_schema'));
-- Preserve all legacy values, including updated_at: no row UPDATE/trigger.
ALTER TABLE wordweave.ai_models ALTER COLUMN output_mode SET DEFAULT 'prompt';
DROP INDEX wordweave.ai_models_active_provider_unique;
CREATE UNIQUE INDEX ai_models_active_provider_unique ON wordweave.ai_models(provider_id,provider_model_id) WHERE retired_at IS NULL;

-- Only the migrated initialization command uses this compatibility view.
-- The API and runtime use the unified tables exclusively.
DROP TABLE wordweave.openrouter_credentials;
CREATE VIEW wordweave.openrouter_credentials AS
 SELECT 'openrouter'::text AS provider,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by,updated_at
 FROM wordweave.ai_provider_credentials WHERE provider_id='00000000-0000-4000-8000-000000000001';

CREATE FUNCTION wordweave.sync_provider_credential_status() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE wordweave.ai_providers SET credential_configured=false,masked_hint=NULL WHERE id=OLD.provider_id;
  RETURN OLD;
 END IF;
 UPDATE wordweave.ai_providers SET credential_configured=true,masked_hint=NEW.display_fingerprint WHERE id=NEW.provider_id;
 RETURN NEW;
END $fn$;
CREATE TRIGGER provider_credential_status AFTER INSERT OR UPDATE OR DELETE ON wordweave.ai_provider_credentials
 FOR EACH ROW EXECUTE FUNCTION wordweave.sync_provider_credential_status();

-- Called inside the app's configuration transaction with ciphertext only.
CREATE FUNCTION wordweave.write_provider_credential(p_provider uuid,p_cipher bytea,p_nonce bytea,p_version integer,p_hint text,p_actor uuid,p_source uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
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

ALTER TABLE wordweave.ai_providers OWNER TO wordweave_owner;
ALTER TABLE wordweave.ai_provider_credentials OWNER TO wordweave_owner;
ALTER VIEW wordweave.openrouter_credentials OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.sync_provider_credential_status() OWNER TO wordweave_owner;
ALTER FUNCTION wordweave.write_provider_credential(uuid,bytea,bytea,integer,text,uuid,uuid) OWNER TO wordweave_owner;
REVOKE ALL ON wordweave.ai_providers,wordweave.ai_provider_credentials,wordweave.openrouter_credentials FROM PUBLIC,wordweave_app,wordweave_ai;
GRANT SELECT,INSERT,UPDATE ON wordweave.ai_providers TO wordweave_app;
GRANT SELECT ON wordweave.ai_providers,wordweave.ai_provider_credentials,wordweave.ai_models TO wordweave_ai;
GRANT SELECT ON wordweave.openrouter_credentials TO wordweave_ai;
REVOKE ALL ON FUNCTION wordweave.sync_provider_credential_status(),wordweave.write_provider_credential(uuid,bytea,bytea,integer,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wordweave.write_provider_credential(uuid,bytea,bytea,integer,text,uuid,uuid) TO wordweave_app;
