"""Copy authorized saved OpenRouter configuration into the disposable M003 UAT.

The source database is read-only. Secrets travel through process memory and
local API calls only; reports contain neither keys nor ciphertext.
"""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

here = Path(__file__).resolve().parent
work = Path((here / 'local-stack-location.txt').read_text().strip())
assert work.name.startswith('ww-m003-uat-001-')
env = json.loads((work / 'env.json').read_text())
public = json.loads((work / 'public.json').read_text())
assert '/wordweave_m003_uat_001?' in env['APP_DATABASE_URL']
assert public['api_origin'] == 'http://127.0.0.1:54673'


def captured(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30, **kwargs)
    if result.returncode:
        raise RuntimeError('Local configuration read/decryption failed; secret output suppressed')
    return result.stdout


def source_sql(sql):
    return captured(['docker', 'exec', 'wordweave_uat-postgres-1', 'psql', '-U', 'postgres', '-d', 'wordweave', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql])


def client():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(opener, path, data=None, method=None):
    headers = {'origin': public['frontend_origin'], 'sec-fetch-site': 'same-origin'}
    if data is not None:
        headers.update({'x-csrf-token': call(opener, '/bootstrap')['data']['csrf_token'], 'content-type': 'application/json'})
    request = urllib.request.Request(public['api_origin'] + '/api/v1' + path, headers=headers, data=json.dumps(data).encode() if data is not None else None, method=method)
    try:
        with opener.open(request, timeout=40) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = json.loads(error.read())
        raise RuntimeError(f"Local API {path}: HTTP {error.code}, {raw.get('code', 'unknown')}") from None


def login(role):
    opener = client()
    call(opener, '/auth/login', {'username': env[role + '_USERNAME'], 'password': env[role + '_PASSWORD'], 'browser_ui_locale': 'zh-CN'})
    return opener


admin = login('ADMIN')
before = call(admin, '/admin/groups')['data']
backup = work / 'plans-before-real-models.json'
if not backup.exists():
    backup.write_text(json.dumps(before, indent=2))

source = [json.loads(line) for line in source_sql("SELECT row_to_json(m) FROM (SELECT display_name,description,provider_model_id FROM wordweave.ai_models WHERE enabled AND provider_model_id IN ('deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash') ORDER BY display_name) m").splitlines()]
assert len(source) == 2, 'Expected the two previously verified saved models'
docker_config = json.loads(captured(['docker', 'inspect', 'ai-en-learning-app-1']))[0]
source_env = dict(item.split('=', 1) for item in docker_config['Config']['Env'] if '=' in item)
base_url = source_env.get('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1')
assert base_url == 'https://openrouter.ai/api/v1', 'Unexpected saved provider endpoint'
credential = json.loads(source_sql("SELECT json_build_object('ciphertext',encode(ciphertext,'base64'),'nonce',encode(nonce,'base64'),'version',encryption_key_version) FROM wordweave.openrouter_credentials WHERE provider='openrouter'"))
keys = dict(item.strip().split(':', 1) for item in source_env['OPENROUTER_MASTER_KEYS'].split(','))
credential['key'] = keys[str(credential['version'])]
decrypt = """
const fs = require('node:fs'), crypto = require('node:crypto');
try {
  const v = JSON.parse(fs.readFileSync(0, 'utf8'));
  const ciphertext = Buffer.from(v.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(v.key, 'base64'), Buffer.from(v.nonce, 'base64'));
  decipher.setAAD(Buffer.from('wordweave/openrouter/v1'));
  decipher.setAuthTag(ciphertext.subarray(-16));
  process.stdout.write(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]));
} catch { process.stderr.write('Saved credential decryption failed'); process.exitCode = 1; }
"""
api_key = captured(['/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node', '-e', decrypt], input=json.dumps(credential))
assert api_key.strip(), 'Saved credential was empty'
real_models = []
connection_id = None
for saved in source:
    records = call(admin, '/admin/models')['data']
    model = next((m for m in records['items'] if m['provider_model_id'] == saved['provider_model_id'] and m['connection']['base_url'] == base_url), None)
    if model is None:
        body = {**saved, 'expected_revision': records['revision'], 'enabled': True, 'output_mode': 'prompt', 'max_output_tokens': None, 'connection_id': connection_id, 'connection': None}
        if connection_id is None:
            body['connection'] = {'name': 'OpenRouter', 'protocol': 'openai_chat', 'base_url': base_url, 'api_key': api_key}
        model = call(admin, '/admin/models', body)['data']['model']
    assert model['enabled'] and model['connection']['credential_configured']
    connection_id = model['connection']['id']
    real_models.append({k: model[k] for k in ['id', 'display_name', 'provider_model_id', 'output_mode', 'enabled']})
del api_key, credential, keys, source_env, docker_config

for code in ['visitor', 'basic', 'pro', 'plus']:
    data = call(admin, '/admin/groups')['data']
    group = next(g for g in data['items'] if g['code'] == code)
    body = {k: group[k] for k in ['priority', 'max_entries', 'rolling_24h_limit', 'allowed_lengths', 'content_review_enabled', 'content_repair_limit']}
    body['expected_revision'] = data['revision']
    body['model_ids'] = list(dict.fromkeys([m['id'] for m in group['models']] + [m['id'] for m in real_models]))
    call(admin, '/admin/groups/' + code, body, 'PUT')

checks = []
for role in ['VISITOR', 'BASIC', 'PRO', 'PLUS']:
    options = call(client() if role == 'VISITOR' else login(role), '/generation-options')['data']
    visible = {m['id'] for m in options['models']}
    assert all(m['id'] in visible for m in real_models)
    checks.append({'role': role, 'real_models_selectable': True, 'can_generate': options['availability']['can_generate'], 'content_service': options['content_service']})
after = call(admin, '/admin/groups')['data']
for old in before['items']:
    new = next(g for g in after['items'] if g['code'] == old['code'])
    assert all(old[k] == new[k] for k in ['priority', 'max_entries', 'rolling_24h_limit', 'allowed_lengths', 'content_review_enabled', 'content_repair_limit'])

summary = {'result': 'PASS', 'configured_at': datetime.now(timezone.utc).isoformat(), 'source': 'Existing local Docker OpenRouter configuration; source database read-only', 'base_url': base_url, 'real_models': real_models, 'checks': checks, 'plan_limits_preserved': True, 'synthetic_models_preserved': True, 'secret_transfer': 'Memory only, stored via local admin API under current UAT encryption key', 'provider_probe_calls': 0, 'passage_generation_calls': 0, 'quality_evaluation': 'not_run', 'user_acceptance': 'not_recorded', 'output_mode_note': 'Legacy source has no per-model output mode; current prompt mode selected'}
(here / 'real-model-configuration.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
public.update({'synthetic_only': False, 'real_models': real_models, 'real_provider': 'OpenRouter'})
(work / 'public.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n')
(here / 'local-stack-public.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n')
access_path = here / 'access.json'
access = json.loads(access_path.read_text())
access.update({'synthetic_only': False, 'real_models': real_models, 'real_model_readiness': str(here.relative_to(here.parents[5]) / 'real-model-configuration.json')})
access_path.write_text(json.dumps(access, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False))
