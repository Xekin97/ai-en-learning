#!/usr/bin/env python3
"""BE03 document/fixture check only. No server, database, model, or business tests."""
from pathlib import Path
import copy
import hashlib
import json
import re

TECH = Path(__file__).resolve().parents[1]
ROOT = TECH.parent
FIX = TECH / 'fixtures/stream-v3'
VERSION = 'M003-BE-03'
CONTRACT = 'm003-stream-v3'
DOCS = [TECH / 'backend.md', TECH / 'ai-integration.md', *(TECH / 'api' / x for x in ('index.md', 'generation.md', 'administration.md', 'presets.md')), ROOT / 'handoffs/backend-architecture.md']

def require(value, message):
    if not value:
        raise AssertionError(message)

def read_json(path):
    def unique(pairs):
        result = {}
        for k, v in pairs:
            require(k not in result, f'duplicate JSON key: {k}')
            result[k] = v
        return result
    return json.loads(path.read_text(), object_pairs_hook=unique)

INDEX = read_json(FIX / 'index.json')
PACKS = read_json(FIX / 'packages.json')
SCHEMA = {}
for name in ('generation.md', 'presets.md'):
    content = (TECH / 'api' / name).read_text()
    # Extract exact event keys from the authoritative Markdown table, not a second schema.
    for event, body in re.findall(r'^\| ((?:generation|preview)\.[a-z_]+) \| `([^`]+)` \|$', content, re.M):
        require(event not in SCHEMA, f'duplicate documented event: {event}')
        SCHEMA[event] = set(re.findall(r'([a-z_]+):', body))
require(len(SCHEMA) == 14, 'expected seven documented event types per stream')

def check_package(package):
    require(set(package) == {'passage', 'tags', 'targets'}, 'Result keys')
    require(len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", package['passage'])) >= PACKS['minimum_words'], 'fixture minimum length')
    require(1 <= len(package['tags']) <= 3 and len(set(package['tags'])) == len(package['tags']), 'tags')
    require([t['entry'] for t in package['targets']] == PACKS['entries'], 'ordered exact target entries')
    for target in package['targets']:
        require(set(target) == {'entry', 'entry_meaning', 'hint_phrase', 'hint_blanks', 'occurrences'}, 'Target keys')
        require(target['entry_meaning'].strip() and target['hint_phrase'].strip(), 'meaning/hint nonempty')
        require(target['occurrences'] and target['hint_blanks'], 'required offsets')
        for o in target['occurrences']:
            require(set(o) == {'surface', 'start', 'end'}, 'occurrence keys')
            require(type(o['start']) is int and type(o['end']) is int, 'integer offset')
            require(0 <= o['start'] < o['end'] <= len(package['passage']), 'offset bounds')
            require(package['passage'][o['start']:o['end']] == o['surface'] == target['entry'], 'Unicode code-point occurrence')
        for blank in target['hint_blanks']:
            require(set(blank) == {'start', 'end'}, 'hint offset keys')
            require(target['hint_phrase'][blank['start']:blank['end']] == target['entry'], 'hint matches its target')

def check_policy(policy):
    require(policy == {'version':'m003-native-policy-v1', 'scope':'logical_request', 'max_calls':2, 'editable':False}, 'native budget')

def check_service(service, n):
    require(service == {'native_validation':True, 'content_review_enabled':n > 0, 'content_repair_limit':n}, 'content budget')

def check_valid(data, n, expected_package):
    version = data['final_content_version']
    require(type(version) is int and 1 <= version <= n + 1, 'final version bounds')
    require(expected_package == 'v' + str(version), 'last valid identity')
    require(data['result'] == PACKS['packages'][expected_package], 'atomic final package')
    check_package(data['result'])
    outcome = data['content_outcome']
    require(outcome in {'basic','review_passed','repaired_passed','limit_finalized','service_incomplete'}, 'outcome enum')
    require((n == 0) == (outcome == 'basic'), 'outcome policy')
    require(data['completion_notice'] == ('content_review_incomplete' if outcome == 'service_incomplete' else None), 'notice association')

def check_fixture(f):
    require(f['fixture_version'] == VERSION and f['contract_version'] == CONTRACT, 'fixture version')
    n = f['internal_evidence']['N']
    require(0 <= n <= 2 and f['internal_evidence']['actual_content_repairs'] <= 2, 'synthetic path depth')
    state, final, notice, save = 'submitting', None, None, False
    started = composing = learning = finalizing = ended = False
    is_preview = f['wire'][0]['event'].startswith('preview.')
    prefix = 'preview.' if is_preview else 'generation.'
    run = None
    for seq, event in enumerate(f['wire'], 1):
        name, d = event['event'], event['data']
        require(set(event) == {'event','data'}, 'wire event keys')
        require(name.startswith(prefix) and name in SCHEMA, 'documented event namespace')
        require(set(d) == SCHEMA[name], f'exact documented fields {name}')
        require(type(d['seq']) is int and d['seq'] == seq and not ended, 'continuous seq, no event after stream end')
        kind = name[len(prefix):]
        if kind == 'started':
            require(seq == 1 and not started and d['contract_version'] == CONTRACT, 'started once')
            started = True
            run = d['preview_run_id' if is_preview else 'run_id']
            snap = d if is_preview else d['snapshot']
            check_service(snap['content_service'], n)
            check_policy(snap['native_correction_policy'])
            state = 'accepted'
        else:
            require(started, 'start required')
        if kind == 'progress':
            if d['phase'] == 'composing':
                require(not composing and not learning and not finalizing, 'composing order')
                composing, state = True, 'generating'
            else:
                require(d['phase'] == 'finalizing' and learning and not finalizing, 'finalizing order')
                finalizing, state = True, 'finalizing'
        elif kind == 'learning_ready':
            require(composing and not learning and not finalizing, 'learning once/order')
            require(d['content_version'] == 1, 'learning identity')
            expected = [{k:t[k] for k in ('entry','entry_meaning')} for t in PACKS['packages']['v1']['targets']]
            require(d['entries'] == expected, 'learning is exact first valid package projection')
            learning, state = True, 'learning_preview'
        elif kind == 'validated':
            require(finalizing, 'DB completion preceded by finalizing')
            require(d['preview_run_id' if is_preview else 'run_id'] == run, 'run identity')
            check_valid(d, n, f['internal_evidence']['last_valid_package'])
            final, notice, save, ended = d['result'], d['completion_notice'], not is_preview, True
            state = 'preview_complete_needs_current_draft_check' if is_preview else 'complete'
        elif kind in ('failed','cancelled'):
            if not is_preview:
                require(d['quota_refunded'] is (kind == 'failed'), 'terminal refund')
            ended, state = True, kind
            final, notice, save = None, None, False
        elif kind == 'settlement_pending':
            require(d['code'] == 'settlement_unconfirmed', 'pending code')
            ended, state, save = True, 'pending', False
    if not ended:
        require(f['transport_end'] == 'unexpected_eof', 'EOF must be explicit')
        state, save = 'pending', False
    for response in f['status_responses']:
        require(response['http_status'] == 200, 'fixture status HTTP')
        body = response['body']
        require(set(body) == {'data','meta'} and set(body['meta']) == {'request_id'}, 'JSON response envelope')
        d = body['data']
        common = {'contract_version','status','final_content_version','result','content_outcome','completion_notice'}
        keys = common | ({'preview_run_id','draft_version','preview_content_mode','usage'} if is_preview else {'run_id','snapshot','can_save','quota_refunded'})
        require(set(d) == keys and d['contract_version'] == CONTRACT, 'status exact fields')
        require(d['preview_run_id' if is_preview else 'run_id'] == run, 'status identity')
        if d['status'] == 'valid':
            check_valid(d, n, f['internal_evidence']['last_valid_package'])
            if final is not None:
                require(final == d['result'] and notice == d['completion_notice'], 'idempotent DB terminal')
            final, notice, save = d['result'], d['completion_notice'], False if is_preview else d['can_save']
            require(is_preview or not d['quota_refunded'], 'valid not refunded')
            state = 'preview_complete_needs_current_draft_check' if is_preview else 'complete'
        elif d['status'] == 'active':
            require(d['result'] is None and d['content_outcome'] is None and d['final_content_version'] is None, 'active no result')
            require(is_preview or not d['can_save'], 'active cannot save')
            # An old active read cannot override a committed result.
            if final is None:
                state, save = 'pending', False
        else:
            require(d['status'] in {'failed','cancelled'}, 'status enum')
            require(d['result'] is None and d['final_content_version'] is None and d['completion_notice'] is None, 'nonvalid no package')
            require(d['content_outcome'] == d['status'], 'nonvalid outcome')
            require(is_preview or (not d['can_save'] and d['quota_refunded'] is (d['status']=='failed')), 'nonvalid action/refund')
            require(final is None, 'terminal conflict')
            state, save = d['status'], False
    expected = f['expected']
    require(state == expected['ui_state'] and save == expected['can_save'] and notice == expected['completion_notice'], 'expected final UI')
    require(final == (PACKS['packages'][expected['final_package']] if expected['final_package'] else None), 'expected final content')
    require(not expected['article_before_terminal'] and not expected['visible_repair_count'] and not expected['visible_repair_limit'], 'display safety')

for package in PACKS['packages'].values():
    check_package(package)
fixtures = [read_json(FIX / x) for x in INDEX['files']]
for fixture in fixtures:
    check_fixture(fixture)
# Deliberately break representative contracts to establish that checks are meaningful.
negative = []
for label, mutation in [
    ('seq_gap', lambda f: f['wire'][1]['data'].__setitem__('seq', 9)),
    ('private_counter', lambda f: f['wire'][1]['data'].__setitem__('repair_attempt', 1)),
    ('wrong_preview_meaning', lambda f: f['wire'][2]['data']['entries'][0].__setitem__('entry_meaning', 'invented')),
    ('mixed_final_package', lambda f: f['wire'][-1]['data']['result'].__setitem__('tags', ['mixed'])),
    ('missing_notice', lambda f: f['wire'][-1]['data'].__setitem__('completion_notice', 'content_review_incomplete')),
]:
    bad = copy.deepcopy(fixtures[0]); mutation(bad)
    try:
        check_fixture(bad)
    except AssertionError:
        negative.append(label)
    else:
        raise AssertionError(f'negative contract not rejected: {label}')

link_count = 0
for doc in DOCS:
    content = doc.read_text()
    require(f'version: {VERSION}' in content, f'version mismatch {doc.name}')
    for link in re.findall(r'\]\(([^)]+)\)', content):
        if '://' in link or link.startswith('#'):
            continue
        path = link.split('#',1)[0].strip('<>')
        target = (doc.parent / path).resolve()
        require(target.exists() or target == TECH/'evidence/stream-v3-check.json', f'broken local link: {doc.name}: {link}')
        link_count += 1
sources = [*DOCS, *sorted(FIX.glob('*.json')), Path(__file__).resolve()]
evidence = {
    'version':VERSION, 'contract_version':CONTRACT, 'status':'PASS',
    'scope':'static Markdown and synthetic fixture consistency only',
    'scenario_count':len(fixtures), 'event_count':sum(len(f['wire']) for f in fixtures),
    'documented_event_types':sorted(SCHEMA), 'negative_mutations_rejected':negative,
    'local_link_targets_checked':link_count, 'current_seven_document_characters':sum(len(d.read_text()) for d in DOCS),
    'runtime_tokens':'unknown', 'production_latency':'unmeasured',
    'not_run':['Go business tests','database migration','real provider calls','browser prototype','UAT3302'],
    'source_sha256':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sources}
}
(TECH/'evidence/stream-v3-check.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:evidence[k] for k in ('status','scenario_count','event_count','negative_mutations_rejected','local_link_targets_checked','current_seven_document_characters')}, ensure_ascii=False))
