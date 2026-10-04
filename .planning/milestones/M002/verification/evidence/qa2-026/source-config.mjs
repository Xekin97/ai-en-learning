import { execFileSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';

// Private values remain in memory; no credentials in console, evidence or arguments.
export function existingConfiguration() {
  const container = JSON.parse(execFileSync('docker', ['inspect', 'wordweave_uat-backend-1'], {encoding:'utf8'}))[0];
  const env = Object.fromEntries(container.Config.Env.map(s => {const at=s.indexOf('=');return [s.slice(0,at),s.slice(at+1)];}));
  const endpoint = env.OPENROUTER_BASE_URL;
  if (endpoint !== 'https://openrouter.ai/api/v1') throw Error('Unexpected source provider endpoint');
  const sql = query => execFileSync('docker', ['exec','wordweave_uat-postgres-1','psql','-U','postgres','-d','wordweave','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',query], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const credential = JSON.parse(sql("SELECT json_build_object('ciphertext',encode(ciphertext,'base64'),'nonce',encode(nonce,'base64'),'version',encryption_key_version) FROM wordweave.openrouter_credentials WHERE provider='openrouter'"));
  const keys = Object.fromEntries(env.OPENROUTER_MASTER_KEYS.split(',').map(s => {const at=s.indexOf(':');return [s.slice(0,at),s.slice(at+1)];}));
  const cipher = Buffer.from(credential.ciphertext,'base64');
  const decipher = createDecipheriv('aes-256-gcm',Buffer.from(keys[credential.version],'base64'),Buffer.from(credential.nonce,'base64'));
  decipher.setAAD(Buffer.from('wordweave/openrouter/v1')); decipher.setAuthTag(cipher.subarray(-16));
  const key = Buffer.concat([decipher.update(cipher.subarray(0,-16)),decipher.final()]).toString();
  const models = JSON.parse(sql("SELECT json_agg(json_build_object('name',display_name,'provider_model',provider_model_id,'description',description)) FROM wordweave.ai_models WHERE enabled AND provider_model_id <> 'provider/integration'"));
  return {endpoint,key,models};
}
