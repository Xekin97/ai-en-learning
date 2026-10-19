"""Independent M003 HTTP/SSE and persistence checks against this round's disposable stack."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import threading
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
WORK = Path((HERE / 'local-stack-location.txt').read_text())
assert WORK.name.startswith('ww-m003-qa-001-')
PUBLIC = json.loads((WORK / 'public.json').read_text())
ENV = json.loads((WORK / 'env.json').read_text())
assert '/wordweave_m003_qa_001?' in ENV['APP_DATABASE_URL']
API = PUBLIC['api_origin'] + '/api/v1'
ORIGIN = PUBLIC['frontend_origin']
RESULT = {'scope': 'Disposable PostgreSQL + real Go HTTP/SSE + synthetic provider; no linguistic quality, real fee, or production capacity claim.', 'checks': {}, 'flows': {}, 'plan_api': {}, 'failures': []}


def check(name, value, detail=None):
    RESULT['checks'][name] = {'pass': bool(value), 'detail': detail}
    if not value:
        RESULT['failures'].append(name)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, data=None, method=None, headers=None, timeout=30):
        request_headers = {'origin': ORIGIN, 'sec-fetch-site': 'same-origin'}
        request_headers.update(headers or {})
        if data is not None:
            request_headers['content-type'] = 'application/json'
            if 'x-csrf-token' not in {key.lower(): value for key, value in request_headers.items()}:
                request_headers['x-csrf-token'] = self.request('/bootstrap')['json']['data']['csrf_token']
        req = urllib.request.Request(API + path, data=json.dumps(data).encode() if data is not None else None, headers=request_headers, method=method)
        try:
            response = self.opener.open(req, timeout=timeout)
            raw = response.read()
            content_type = response.headers.get('content-type', '')
            return {'status': response.status, 'headers': dict(response.headers), 'raw': raw.decode(), 'json': json.loads(raw) if raw and 'json' in content_type else None}
        except urllib.error.HTTPError as error:
            raw = error.read()
            return {'status': error.code, 'headers': dict(error.headers), 'raw': raw.decode(), 'json': json.loads(raw) if raw else None}

    def login(self, username, password):
        result = self.request('/auth/login', {'username': username, 'password': password, 'browser_ui_locale': 'en-US'})
        if result['status'] != 200:
            raise RuntimeError('login failed ' + str(result))

    def stream(self, path, data, started=None):
        csrf = self.request('/bootstrap')['json']['data']['csrf_token']
        req = urllib.request.Request(API + path, data=json.dumps(data).encode(), headers={'origin': ORIGIN, 'sec-fetch-site': 'same-origin', 'x-csrf-token': csrf, 'content-type': 'application/json', 'accept': 'text/event-stream'}, method='POST')
        try:
            response = self.opener.open(req, timeout=45)
        except urllib.error.HTTPError as error:
            raw = error.read()
            return {'status': error.code, 'headers': dict(error.headers), 'problem': json.loads(raw), 'events': []}
        events = []
        event_name = None
        for raw_line in response:
            line = raw_line.decode().rstrip('\r\n')
            if line.startswith('event:'):
                event_name = line[6:].strip()
            elif line.startswith('data:'):
                payload = json.loads(line[5:].strip())
                events.append({'event': event_name, 'data': payload})
                if started and event_name and event_name.endswith('.started'):
                    started.set()
            elif not line:
                event_name = None
        return {'status': response.status, 'headers': dict(response.headers), 'events': events}


def apply_edits(events):
    text = ''
    rev = 0
    revisions_ok = True
    for event in events:
        if not event['event'].endswith('.edit'):
            continue
        data = event['data']
        revisions_ok = revisions_ok and data['base_rev'] == rev and data['rev'] == rev + 1
        text = text[:data['at']] + data['insert'] + text[data['at'] + data['delete_count']:]
        rev = data['rev']
    return text, rev, revisions_ok


def summarize_flow(label, response, expected_limit, expected_outcome, expected_version):
    events = response['events']
    names = [event['event'] for event in events]
    seq = [event['data']['seq'] for event in events]
    started = next(event['data'] for event in events if event['event'] == 'generation.started')
    terminal = next(event['data'] for event in events if event['event'] == 'generation.validated')
    draft, revision, revisions_ok = apply_edits(events)
    plan_indices = [i for i, name in enumerate(names) if name == 'generation.plan_item']
    first_edit = names.index('generation.edit')
    RESULT['flows'][label] = {
        'status': response['status'], 'event_names': names, 'seq': seq,
        'run_id': started['run_id'], 'generation_token_present': bool(started['generation_token']),
        'snapshot': started['snapshot'], 'final_content_version': terminal['final_content_version'],
        'content_outcome': terminal['content_outcome'], 'completion_notice': terminal['completion_notice'],
        'edit_revision': revision, 'edit_sources': [event['data']['source'] for event in events if event['event'] == 'generation.edit'],
        'draft_equals_result': draft == terminal['result']['passage']
    }
    prefix = label + '_'
    check(prefix + 'http_sse', response['status'] == 200 and response['headers'].get('Cache-Control') == 'no-store')
    check(prefix + 'seq_contiguous', seq == list(range(1, len(seq) + 1)), seq)
    check(prefix + 'v5_snapshot', started['contract_version'] == 'm003-stream-v5' and started['snapshot']['content_service']['content_repair_limit'] == expected_limit and started['snapshot']['native_correction_policy'] == {'version': 'm003-native-policy-v1', 'scope': 'logical_request', 'max_calls': 2, 'editable': False}, started['snapshot'])
    check(prefix + 'real_plan_before_writer', len(plan_indices) >= 2 and max(plan_indices) < first_edit)
    check(prefix + 'splice_and_result', revisions_ok and draft == terminal['result']['passage'] and revision > 1)
    check(prefix + 'terminal', terminal['content_outcome'] == expected_outcome and terminal['final_content_version'] == expected_version)
    if expected_outcome == 'service_incomplete':
        check(prefix + 'q02_notice', terminal['completion_notice'] == 'content_review_incomplete')
    else:
        check(prefix + 'notice_absent', terminal['completion_notice'] is None)
    return started, terminal


def group_body(group, revision, limit):
    return {
        'expected_revision': revision,
        'priority': group['priority'], 'rolling_24h_limit': group['rolling_24h_limit'],
        'max_entries': group['max_entries'], 'allowed_lengths': group['allowed_lengths'],
        'model_ids': [model['id'] for model in group['models']],
        'content_review_enabled': limit > 0, 'content_repair_limit': limit
    }


admin = Client(); admin.login(ENV['ADMIN_USERNAME'], ENV['ADMIN_PASSWORD'])
basic = Client(); basic.login(ENV['BASIC_USERNAME'], ENV['BASIC_PASSWORD'])
pro = Client(); pro.login(ENV['PRO_USERNAME'], ENV['PRO_PASSWORD'])
payload = {'model_id': PUBLIC['models']['pass'], 'meaning_language': 'en', 'scenario': 'story', 'length': 'short', 'entries': ['grape', 'young']}

# Hold the only configured generation slot with a real N0 run and verify the second request is rejected before acceptance.
holder_started = threading.Event()
holder = {}
thread = threading.Thread(target=lambda: holder.update(response=basic.stream('/generations/stream', payload, holder_started)))
thread.start()
if not holder_started.wait(10):
    raise RuntimeError('holder generation never reached started')
busy = pro.stream('/generations/stream', payload)
thread.join(45)
busy_retry = busy.get('problem', {}).get('context', {}).get('retry_after_seconds')
check('busy_503_before_acceptance', busy['status'] == 503 and busy['problem']['code'] == 'generation_busy' and busy['problem']['context']['accepted'] is False and busy_retry is not None and busy['headers'].get('Retry-After') == str(busy_retry), busy)
basic_started, _ = summarize_flow('basic_n0', holder['response'], 0, 'basic', 1)
save_basic = basic.request('/generations/' + basic_started['run_id'] + '/save', {}, 'POST', {'X-Generation-Token': basic_started['generation_token']})
check('basic_save', save_basic['status'] == 201 and bool(save_basic['json']['data']['batch_id']), save_basic['status'])

# Enhanced N1 pass and Q02 delivery are separate real runs under the same approved pipeline.
for label, model, outcome, version in [('enhanced_n1_pass', 'pass', 'review_passed', 2), ('enhanced_n1_q02', 'q02', 'service_incomplete', 2)]:
    response = pro.stream('/generations/stream', {**payload, 'model_id': PUBLIC['models'][model]})
    started, terminal = summarize_flow(label, response, 1, outcome, version)
    status = pro.request('/generations/' + started['run_id'] + '/status', headers={'X-Generation-Token': started['generation_token']})
    check(label + '_status_recovery', status['status'] == 200 and status['json']['data']['status'] == 'valid' and status['json']['data']['result']['passage'] == terminal['result']['passage'] and status['json']['data']['completion_notice'] == terminal['completion_notice'])
    wrong = pro.request('/generations/' + started['run_id'] + '/status', headers={'X-Generation-Token': 'wrong-token'})
    check(label + '_wrong_token_hidden', wrong['status'] in (404, 410), wrong['status'])
    if label.endswith('q02'):
        saved = pro.request('/generations/' + started['run_id'] + '/save', {}, 'POST', {'X-Generation-Token': started['generation_token']})
        check('q02_save_allowed', saved['status'] == 201, saved['status'])

# Plan API: read-only native policy, invalid boundaries, non-admin denial, preview/PUT, stale revision conflict, independent 0/99.
groups = admin.request('/admin/groups')['json']['data']
RESULT['plan_api']['initial_native_policy'] = groups['native_correction_policy']
check('native2_read_only_projection', groups['native_correction_policy'] == {'version': 'm003-native-policy-v1', 'scope': 'logical_request', 'max_calls': 2, 'editable': False})
check('non_admin_groups_denied', pro.request('/admin/groups')['status'] == 403)
pro_group = next(item for item in groups['items'] if item['code'] == 'pro')
base = group_body(pro_group, groups['revision'], 1)
invalids = [
    ('negative', {**base, 'content_repair_limit': -1}), ('over99', {**base, 'content_repair_limit': 100}),
    ('fraction', {**base, 'content_repair_limit': 1.5}), ('null', {**base, 'content_repair_limit': None}),
    ('enabled_zero', {**base, 'content_repair_limit': 0}), ('native_write', {**base, 'native_correction_policy': {'max_calls': 99}})
]
for name, body in invalids:
    answer = admin.request('/admin/groups/pro', body, 'PUT')
    RESULT['plan_api']['invalid_' + name] = {'status': answer['status'], 'code': answer['json'].get('code') if answer['json'] else None}
    check('plan_invalid_' + name, answer['status'] in (400, 422), RESULT['plan_api']['invalid_' + name])

# Save Plus=99 first, then prove a stale Pro write conflicts and must be re-previewed.
initial_revision = groups['revision']
plus = next(item for item in groups['items'] if item['code'] == 'plus')
plus99 = group_body(plus, initial_revision, 99)
impact99 = admin.request('/admin/groups/plus/impact-preview', plus99, 'POST')
put99 = admin.request('/admin/groups/plus', plus99, 'PUT')
check('plus99_preview_put', impact99['status'] == 200 and put99['status'] == 200 and put99['json']['data']['group']['content_repair_limit'] == 99)
stale_pro = group_body(pro_group, initial_revision, 2)
conflict = admin.request('/admin/groups/pro', stale_pro, 'PUT')
check('stale_revision_conflict', conflict['status'] == 409 and conflict['json']['code'] == 'revision_conflict', conflict['status'])
current = admin.request('/admin/groups')['json']['data']
pro_current = next(item for item in current['items'] if item['code'] == 'pro')
pro2 = group_body(pro_current, current['revision'], 2)
impact2 = admin.request('/admin/groups/pro/impact-preview', pro2, 'POST')
put2 = admin.request('/admin/groups/pro', pro2, 'PUT')
check('pro2_repreview_put', impact2['status'] == 200 and impact2['json']['data']['base_users'] >= 1 and 'active_trial_users' in impact2['json']['data'] and put2['status'] == 200)
after = admin.request('/admin/groups')['json']['data']
limits = {item['code']: item['content_repair_limit'] for item in after['items']}
RESULT['plan_api']['final_limits'] = limits
check('pro_plus_independent_limits', limits['pro'] == 2 and limits['plus'] == 99, limits)

# N2 executes exactly two conditional repairs with both approved reason categories persisted.
repair = pro.stream('/generations/stream', {**payload, 'model_id': PUBLIC['models']['repair-mixed']})
repair_started, _ = summarize_flow('enhanced_n2_mixed', repair, 2, 'limit_finalized', 4)

# Persisted run/call/charge facts are the authority for stage order, one charge and reason-frequency observations.
def psql_json(sql):
    output = subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/psql', ENV['APP_DATABASE_URL'], '-X', '-qAt', '-c', sql], check=True, capture_output=True, text=True).stdout.strip()
    return json.loads(output)

runs = psql_json("SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM (SELECT id::text,group_code_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,call_status,disposition,content_outcome,final_content_version,content_stop_reason,quota_charged,counts_toward_cumulative FROM wordweave.generation_runs ORDER BY started_at) x")
calls = psql_json("SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM (SELECT user_run_id::text,call_no,call_stage,prompt_version,usage_status,provider_invoked,review_result,reason_codes,repair_requested FROM wordweave.ai_call_usage WHERE user_run_id IS NOT NULL ORDER BY user_run_id,call_no) x")
charges = psql_json("SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM (SELECT run_id::text,source_kind,plan_code,origin,units,state FROM wordweave.generation_charges ORDER BY run_id) x")
facts = {'runs': runs, 'calls': calls, 'charges': charges}
(HERE / 'db-facts.json').write_text(json.dumps(facts, ensure_ascii=False, indent=2) + '\n')

def stages(run_id):
    return [row['call_stage'] for row in calls if row['user_run_id'] == run_id]

check('basic_stage_order', stages(basic_started['run_id']) == ['planning', 'generation'], stages(basic_started['run_id']))
pass_run = RESULT['flows']['enhanced_n1_pass']['run_id']
q02_run = RESULT['flows']['enhanced_n1_q02']['run_id']
mixed_stages = stages(repair_started['run_id'])
check('enhanced_pass_stage_order', stages(pass_run) == ['planning', 'generation', 'fixed_edit', 'content_review'], stages(pass_run))
check('q02_stage_order', stages(q02_run) == ['planning', 'generation', 'fixed_edit', 'content_review'], stages(q02_run))
check('n2_stage_order', mixed_stages == ['planning', 'generation', 'fixed_edit', 'content_review', 'content_repair', 'content_review', 'content_repair', 'content_review'], mixed_stages)
mixed_repairs = [row for row in calls if row['user_run_id'] == repair_started['run_id'] and row['call_stage'] == 'content_repair']
check('mixed_reason_frequency_facts', len(mixed_repairs) == 2 and all(row['provider_invoked'] is True and row['reason_codes'] == ['forced_wording', 'contradiction'] for row in mixed_repairs), mixed_repairs)
frequency = {
    'normal_runs': len(runs),
    'runs_with_forced_wording_repair': len({row['user_run_id'] for row in calls if row['call_stage'] == 'content_repair' and row['provider_invoked'] is True and 'forced_wording' in row['reason_codes']}),
    'runs_with_contradiction_repair': len({row['user_run_id'] for row in calls if row['call_stage'] == 'content_repair' and row['provider_invoked'] is True and 'contradiction' in row['reason_codes']}),
    'runs_with_both': len({row['user_run_id'] for row in calls if row['call_stage'] == 'content_repair' and row['provider_invoked'] is True and {'forced_wording', 'contradiction'}.issubset(set(row['reason_codes']))}),
    'repair_calls': len([row for row in calls if row['call_stage'] == 'content_repair' and row['provider_invoked'] is True])
}
RESULT['content_frequency'] = frequency
check('one_charge_per_run', len(charges) == len(runs) and all(row['units'] == 1 and row['state'] == 'consumed' for row in charges), charges)
check('unknown_usage_not_zero', all(row['usage_status'] == 'unknown' for row in calls) and all(row['provider_invoked'] is True for row in calls))

RESULT['result'] = 'PASS' if not RESULT['failures'] else 'FAIL'
(HERE / 'api-results.json').write_text(json.dumps(RESULT, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'result': RESULT['result'], 'checks': len(RESULT['checks']), 'failures': RESULT['failures'], 'frequency': frequency}))
if RESULT['failures']:
    raise SystemExit(1)
