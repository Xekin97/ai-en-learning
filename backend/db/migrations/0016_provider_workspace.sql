-- Provider editing rotates its own credential without changing provider/model identities.
-- No existing application rows are modified by this migration.
DROP INDEX wordweave.ai_models_active_name_unique;
CREATE UNIQUE INDEX ai_models_active_name_unique ON wordweave.ai_models(provider_id,lower(display_name)) WHERE retired_at IS NULL;
CREATE FUNCTION wordweave.update_provider_credential(p_provider uuid,p_cipher bytea,p_nonce bytea,p_version integer,p_hint text,p_actor uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wordweave AS $fn$
BEGIN
 INSERT INTO wordweave.ai_provider_credentials(provider_id,ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by)
 VALUES(p_provider,p_cipher,p_nonce,p_version,p_hint,p_actor)
 ON CONFLICT(provider_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,nonce=EXCLUDED.nonce,
 encryption_key_version=EXCLUDED.encryption_key_version,display_fingerprint=EXCLUDED.display_fingerprint,
 updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp();
END $fn$;
ALTER FUNCTION wordweave.update_provider_credential(uuid,bytea,bytea,integer,text,uuid) OWNER TO wordweave_owner;
REVOKE ALL ON FUNCTION wordweave.update_provider_credential(uuid,bytea,bytea,integer,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wordweave.update_provider_credential(uuid,bytea,bytea,integer,text,uuid) TO wordweave_app;
