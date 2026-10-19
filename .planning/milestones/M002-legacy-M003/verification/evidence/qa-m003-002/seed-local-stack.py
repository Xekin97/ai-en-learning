"""Seed only the disposable database created by local-stack.py this turn."""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

here = Path(__file__).resolve().parent
work = Path((here / 'local-stack-location.txt').read_text())
assert work.name.startswith('ww-m003-qa-002-')
public = json.loads((work / 'public.json').read_text())
env = json.loads((work / 'env.json').read_text())
assert '/wordweave_m003_qa_002?' in env['APP_DATABASE_URL']


def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(opener, path, data=None, method=None):
    url = public['api_origin'] + '/api/v1' + path
    headers = {'origin': public['frontend_origin'], 'sec-fetch-site': 'same-origin'}
    if data is not None:
        headers['x-csrf-token'] = call(opener, '/bootstrap')['data']['csrf_token']
        headers['content-type'] = 'application/json'
    request = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    try:
        with opener.open(request, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        raise RuntimeError(str(error.code) + ' ' + path + ' ' + str(body.get('code')) + ' ' + str(body.get('field_errors'))) from None


admin = client()
call(admin, '/auth/login', {'username': env['ADMIN_USERNAME'], 'password': env['ADMIN_PASSWORD'], 'browser_ui_locale': 'en-US'})
models = {}
for mode in ['pass', 'q02', 'repair-mixed']:
    records = call(admin, '/admin/models')['data']
    existing = next((m for m in records['items'] if m['provider_model_id'] == 'synthetic/' + mode), None)
    if existing:
        models[mode] = existing['id']
        continue
    body = {'expected_revision': records['revision'], 'display_name': 'M003 local ' + mode, 'description': 'Synthetic local integration provider; no real model', 'provider_model_id': 'synthetic/' + mode, 'output_mode': 'json_schema', 'max_output_tokens': None, 'enabled': True, 'connection_id': None, 'connection': {'name': 'M003 disposable ' + mode, 'protocol': 'openai_chat', 'base_url': 'http://127.0.0.1:' + str(public['provider_port']), 'api_key': 'synthetic-local-key'}}
    created = call(admin, '/admin/models', body)['data']
    model = created['model']
    models[mode] = model['id']
    if not model['enabled']:
        call(admin, '/admin/models/' + model['id'] + '/enable', {'expected_revision': created['revision']})
for code in ['visitor', 'basic', 'pro', 'plus']:
    data = call(admin, '/admin/groups')['data']
    group = next(g for g in data['items'] if g['code'] == code)
    limit = 1 if code == 'pro' else 2 if code == 'plus' else 0
    call(admin, '/admin/groups/' + code, {'expected_revision': data['revision'], 'priority': group['priority'], 'max_entries': 5, 'rolling_24h_limit': 100, 'model_ids': list(models.values()), 'allowed_lengths': ['short'], 'content_review_enabled': limit > 0, 'content_repair_limit': limit}, 'PUT')
for code in ['basic', 'pro']:
    username = 'm003_local_' + code
    password = secrets.token_urlsafe(20)
    learner = client()
    call(learner, '/auth/register', {'username': username, 'password': password, 'password_confirmation': password, 'ui_locale': 'en-US'})
    env[code.upper() + '_USERNAME'] = username
    env[code.upper() + '_PASSWORD'] = password
    if code == 'pro':
        subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/psql', env['APP_DATABASE_URL'], '-X', '-v', 'ON_ERROR_STOP=1', '-c', "UPDATE wordweave.accounts SET group_code='pro' WHERE username='m003_local_pro'"], check=True, stdout=subprocess.DEVNULL)
public['models'] = models
public['selected_entries'] = ['grape', 'young']
(work / 'env.json').write_text(json.dumps(env))
os.chmod(work / 'env.json', 0o600)
(work / 'public.json').write_text(json.dumps(public, indent=2))
(here / 'local-stack-public.json').write_text(json.dumps(public, indent=2) + '\n')
(here / 'local-stack-seed.json').write_text(json.dumps({'result': 'PASS', 'models': models, 'plans': ['visitor:0', 'basic:0', 'pro:1', 'plus:2'], 'accounts': ['admin', 'basic', 'pro'], 'synthetic_only': True}, indent=2) + '\n')
print(json.dumps({'models': models, 'credentials_file': str(work / 'env.json'), 'result': 'PASS'}))
