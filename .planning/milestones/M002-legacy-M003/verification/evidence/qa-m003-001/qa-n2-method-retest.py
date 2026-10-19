"""Targeted rerun after correcting only the synthetic review evidence method."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import urllib.request

HERE = Path(__file__).resolve().parent
WORK = Path((HERE / 'local-stack-location.txt').read_text())
PUBLIC = json.loads((WORK / 'public.json').read_text())
ENV = json.loads((WORK / 'env.json').read_text())
API = PUBLIC['api_origin'] + '/api/v1'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(path, data=None, headers=None):
    actual = {'origin': PUBLIC['frontend_origin'], 'sec-fetch-site': 'same-origin'}
    actual.update(headers or {})
    if data is not None:
        actual.update({'content-type': 'application/json', 'x-csrf-token': request('/bootstrap')['csrf_token']})
    response = opener.open(urllib.request.Request(API + path, data=json.dumps(data).encode() if data is not None else None, headers=actual, method='POST' if data is not None else 'GET'), timeout=45)
    raw = response.read()
    return json.loads(raw)['data'] if raw else None


request('/auth/login', {'username': ENV['PRO_USERNAME'], 'password': ENV['PRO_PASSWORD'], 'browser_ui_locale': 'en-US'})
csrf = request('/bootstrap')['csrf_token']
payload = {'model_id': PUBLIC['models']['repair-mixed'], 'meaning_language': 'en', 'scenario': 'story', 'length': 'short', 'entries': ['grape', 'young']}
response = opener.open(urllib.request.Request(API + '/generations/stream', data=json.dumps(payload).encode(), headers={'origin': PUBLIC['frontend_origin'], 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-csrf-token': csrf}, method='POST'), timeout=45)
events = []
event = None
for raw in response:
    line = raw.decode().rstrip('\r\n')
    if line.startswith('event:'):
        event = line[6:].strip()
    elif line.startswith('data:'):
        events.append({'event': event, 'data': json.loads(line[5:].strip())})
    elif not line:
        event = None
started = next(item['data'] for item in events if item['event'] == 'generation.started')
terminal = next(item['data'] for item in events if item['event'] == 'generation.validated')
sql = "SELECT coalesce(json_agg(row_to_json(x)),'[]'::json) FROM (SELECT call_no,call_stage,provider_invoked,review_result,reason_codes,repair_requested FROM wordweave.ai_call_usage WHERE user_run_id='%s' ORDER BY call_no) x" % started['run_id']
calls = json.loads(subprocess.run(['/opt/homebrew/opt/postgresql@18/bin/psql', ENV['APP_DATABASE_URL'], '-X', '-qAt', '-c', sql], check=True, capture_output=True, text=True).stdout)
stages = [row['call_stage'] for row in calls]
repairs = [row for row in calls if row['call_stage'] == 'content_repair']
checks = {
    'n2_limit_finalized_v4': terminal['content_outcome'] == 'limit_finalized' and terminal['final_content_version'] == 4 and terminal['completion_notice'] is None,
    'two_repairs_and_three_reviews': stages == ['planning', 'generation', 'fixed_edit', 'content_review', 'content_repair', 'content_review', 'content_repair', 'content_review'],
    'recorded_reason_categories': len(repairs) == 2 and all(row['provider_invoked'] is True and row['reason_codes'] == ['forced_wording', 'contradiction'] for row in repairs),
    'public_stream_hides_internal_rounds': all(item['event'] in {'generation.started', 'generation.progress', 'generation.plan_item', 'generation.edit', 'generation.validated'} for item in events),
}
frequency = {'denominator_runs': 1, 'forced_wording_runs': len({started['run_id'] for row in repairs if 'forced_wording' in row['reason_codes']}), 'contradiction_runs': len({started['run_id'] for row in repairs if 'contradiction' in row['reason_codes']}), 'intersection_runs': len({started['run_id'] for row in repairs if {'forced_wording', 'contradiction'}.issubset(set(row['reason_codes']))}), 'union_runs': len({started['run_id'] for row in repairs if {'forced_wording', 'contradiction'}.intersection(row['reason_codes'])}), 'repair_calls': len(repairs)}
result = {'scope': 'Targeted method retest after synthetic review evidence was changed to exact substrings of the reviewed clean passage; production source unchanged.', 'run_id': started['run_id'], 'terminal': {'content_outcome': terminal['content_outcome'], 'final_content_version': terminal['final_content_version'], 'completion_notice': terminal['completion_notice']}, 'stages': stages, 'repair_facts': repairs, 'frequency_observation': frequency, 'checks': checks, 'result': 'PASS' if all(checks.values()) else 'FAIL'}
(HERE / 'n2-method-retest-final.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'result': result['result'], 'checks': checks}))
if result['result'] != 'PASS':
    raise SystemExit(1)
