"""BE-03 static reception and synthetic contract checks, not HTTP/DB tests."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess
import tarfile
import uuid
import yaml

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M002'
E = M / 'technical/evidence'
OUT = E / 'M002-BE-03-check.json'
assert not OUT.exists() and not (E / 'M002-BE-03-manifest.json').exists(), 'Preserve prior/frozen results'
inputs = json.loads((E / 'M002-BE-03-inputs.json').read_text())
docs = {str(p.relative_to(M)): p.read_text() for p in [ROOT / f for f in inputs['allowed_source_changes']]}
be = docs['technical/backend.md']; admin = docs['technical/api/administration.md']
gen = docs['technical/api/generation-presets.md']; growth = docs['technical/api/growth-benefits.md']
handoff = docs['handoffs/backend-architecture.md']; cr = docs['changes/CR-004.md']
ex = json.loads((E / 'M002-BE-03-contract-examples.json').read_text())
checks = []


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def check(name, ok, details):
    checks.append({'name': name, 'status': 'PASS' if ok else 'FAIL', 'details': details})


def meta(s):
    return yaml.safe_load(s.split('---', 2)[1])


def sections(s):
    parts = re.split(r'(^#{2,3} .+$)', s, flags=re.M)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}


state = yaml.safe_load((ROOT / '.planning/workflow/state.yaml').read_text())
check('authorized_role_and_database', state['active_agent'] == 'backend-alex' and
      state['active_role'] == 'backend-architect/base' and state['stage'] == 'technical-design' and
      state['last_transition']['decision_id'] == 'TRANSITION-M002-014' and
      state['database_approval']['version'] == 'M002-DB-03', '014 approves DB03 and backend reception only.')
check('proposed_version_open_cr', all(meta(docs[p])['version'] == 'M002-BE-03' and
      meta(docs[p])['status'] == 'awaiting_user_review' for p in [
      'technical/backend.md', 'technical/ai-integration.md', 'technical/api/index.md', 'handoffs/backend-architecture.md']) and
      meta(cr)['status'] == 'open' and 'M002-CR-004' in state['open_change_requests'] and
      'M002-CR-003' not in state['open_change_requests'], 'No self approval, stage change, or premature CR closure.')
changed = [p for p, h in inputs['protected_sha256'].items() if not (ROOT / p).is_file() or sha(ROOT / p) != h]
check('protected_files', not changed, {'count': len(inputs['protected_sha256']), 'changed': changed})
check('head_unchanged', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip() == inputs['head'], 'No application commit.')
with tarfile.open(ROOT / inputs['before_archive']['path']) as t:
    prior = {str(Path(p).relative_to('.planning/milestones/M002')): t.extractfile(p).read().decode()
             for p in inputs['allowed_source_changes']}
check('before_snapshot_intact', sha(ROOT / inputs['before_archive']['path']) == inputs['before_archive']['sha256'] and
      all(hashlib.sha256(prior[str(Path(p).relative_to('.planning/milestones/M002'))].encode()).hexdigest() == h
          for p, h in inputs['before_sources'].items()), 'Eight pre-edit sources exactly recoverable.')
check('cr_diagnosis_preserved', cr.split('## 解决记录')[0] == prior['changes/CR-004.md'].split('## 解决记录')[0], 'Only resolution status/receiving owner updated.')
failures = []
for path, h in inputs['historical_archives'].items():
    if sha(ROOT / path) != h:
        failures.append(path)
    mf = json.loads(Path(str(ROOT / path).replace('.tar.gz', '-manifest.json')).read_text())
    entries = {**mf['source_sha256'], **mf['evidence_sha256']} if 'source_sha256' in mf else {f['path']: f['sha256'] for f in mf['files']}
    with tarfile.open(ROOT / path) as t:
        for p, digest in entries.items():
            if hashlib.sha256(t.extractfile(p).read()).hexdigest() != digest:
                failures.append(p)
check('frozen_archives', not failures, {'archives': inputs['historical_members_verified'], 'failures': failures})

before, after = sections(prior['technical/backend.md']), sections(be)
allowed = ['## 1.', '### 1.2', '### 1.3', '### 1.4', '## 2.', '### 4.2', '### 4.5', '## 5.', '## 7.', '## 8.', '## 9.']
changed_sections = [k for k in after if after[k] != before.get(k)]
unexpected = [k for k in changed_sections if not any(k.startswith(a) for a in allowed)]
check('bounded_architecture_changes', not unexpected and set(before) <= set(after), {'changed': changed_sections, 'unexpected': unexpected})
preserved = []
for path, markers in [('technical/api/administration.md', ['## 1.', '## 2.', '## 3.', '### 道具定义管理', '## 5.', '## 6.']),
                      ('technical/api/generation-presets.md', ['## 1.', '## 2.', '## 3.', '## 4.']),
                      ('technical/api/growth-benefits.md', ['## 1.', '## 3.', '## 4.'])]:
    old_sec, new_sec = sections(prior[path]), sections(docs[path])
    for heading in old_sec:
        if any(heading.startswith(m) for m in markers):
            preserved.append((path, heading, old_sec[heading] == new_sec.get(heading)))
check('unrelated_api_semantics_preserved', all(v for _, _, v in preserved), {'sections': len(preserved), 'changed': [x for x in preserved if not x[2]]})
old_ai = prior['technical/ai-integration.md']; new_ai = docs['technical/ai-integration.md']
expected_ai = old_ai.replace('version: M002-BE-02', 'version: M002-BE-03').replace('当前 DB-02 沿用原用量表定义', '当前 DB-03 沿用原用量表定义')
check('ai_body_unchanged', new_ai.split('BE-01 已完成的代码/官方文档核对证据保留')[0] == expected_ai.split('BE-01 已完成的代码/官方文档核对证据保留')[0], 'Only version/database reference and final reception status updated; prompt/runtime unchanged.')
caps = set(re.findall(r'^\| (CAP-\d{3}) \|', be, re.M))
expected_caps = {x.upper() for x in re.findall(r'<a id="(cap-\d{3})"', (M / 'product/abilities.md').read_text())}
check('complete_capability_mapping', caps == expected_caps and len(caps) == 49 and
      before['## 3. 全量继承与用例追踪'] == after['## 3. 全量继承与用例追踪'], '49 CAP and inherited DATA/PAGE mappings unchanged.')
check('stable_validation_ids', all(re.search(r'^\| BE2-V' + f'{i:02}' + r' \|', be, re.M) for i in range(1, 22)) and
      all(f'BE2-R{i:02}' in handoff or ('R01–08' in handoff and f'R{i:02}→' in handoff) for i in range(1, 9)), 'V01–17 retained; V18–21 added; R01–08 remain locatable.')
check('three_gaps_traceable', all(tag in be and tag in handoff and tag in cr for tag in ['FE2-G01', 'FE2-G02', 'FE2-G03']) and
      '后端不能自行宣布 FE-01' in handoff and '前端 schema/保存编排接收尚未完成' in handoff, 'Backend completion distinct from frontend acceptance.')
check('description_contract', all(x in admin for x in ['OptionalBilingual', 'description:OptionalBilingual', '两种均 null 合法', 'description_zh/en', '2000', '管理 GET 保留实际两语言槽']) and
      'description:string|null' in growth and '只有已达成 title 用原称号快照' in growth and '不新增成就独立说明字段' not in admin, 'Nullable separate fields and learner projection with current description/old honor.')
check('atomic_commands_and_recovery', all(x in admin for x in ['PUT /growth/settings', 'PUT /growth/levels', 'PUT /growth/achievements',
      'saved_rows', 'expected_revision', '不接受 cursor/limit', '拿锁后一次确定 learning_day',
      '同一 pending', 'DEFERRED' if 'DEFERRED' in admin else '延迟', 'IMMEDIATE',
      '/changes/1/value/threshold', '五值均不变', '不证明某次旧请求成功', '同 revision 重放被409拒绝']), 'Three domain commands, complete reads, stable IDs, indexed errors, safe unknown commit.')
check('whole_change_confirmation', all(x in admin for x in ['LevelImpact', '5分钟', '包含 client_key、id、全部字段',
      'confirmed=true', '修改任一行必须重新预览确认', '用户进度变化不单独使 token 失效']) and
      '不长持配置锁扫描用户' in be, 'Confirmation binds full normalized change set and actor/session/config, not frozen user progress.')
check('admin_options_contract', all(x in gen for x in ['AdminGenerationOptions', 'can_preview', 'vocabulary_version:string',
      'credential_missing 优先于 no_models', 'models=[]', '503 temporarily_unavailable',
      '不解密或回传密钥', '不做连通性探针', '选项不作为提交授权']), 'Exact admin-safe DTO and failure distinction; no plan/quota/secret exposure.')

# Validate authored examples as static protocol data. This does not invoke an app.
errors = []


def require(ok, label):
    if not ok:
        errors.append(label)


def amount(x):
    return isinstance(x, str) and bool(re.fullmatch(r'0|[1-9][0-9]*', x)) and int(x) <= 9223372036854775807


def bilingual(x):
    return isinstance(x, dict) and set(x) == {'zh_CN', 'en_US'} and all(v is None or isinstance(v, str) for v in x.values())


for i, c in enumerate(ex['description_cases']):
    require(bilingual(c['input']), f'description input {i}')
    stored = {k: None if v is None or not v.strip() else v for k, v in c['input'].items()}
    key = {'zh-CN': 'zh_CN', 'en-US': 'en_US'}[c['locale']]
    require(stored == c['stored'] and (stored[key] or stored['en_US' if key == 'zh_CN' else 'zh_CN']) == c['projection'], f'description projection {i}')
for c in ex['description_invalid_cases']:
    require(not bilingual(c['value']), 'invalid description rejected')
for i, c in enumerate(ex['admin_options_cases']):
    data = c['response']['data']
    require(set(data) == {'models', 'meaning_languages', 'scenarios', 'lengths', 'vocabulary_version', 'revision', 'availability'}, f'options keys {i}')
    require(data['meaning_languages'] == ['zh', 'en', 'ja'] and data['scenarios'] == ['discussion', 'story', 'business', 'news'] and data['lengths'] == ['short', 'medium', 'long', 'xlong'], f'options enums {i}')
    for model in data['models']:
        require(set(model) == {'id', 'name', 'description'} and (model['description'] is None or isinstance(model['description'], str)), f'model keys {i}')
    reason = 'credential_missing' if not c['credential_configured_fixture'] else 'no_models' if not data['models'] else None
    require(data['availability'] == {'can_preview': reason is None, 'reason': reason}, f'options availability {i}')
require(ex['admin_options_failure']['http_status'] == 503 and 'data' not in ex['admin_options_failure']['response'], 'read failure not empty success')
settings = ex['settings']; request = settings['request']; response = settings['response']['data']
require(set(request) == {'mastery_experience', 'base_points', 'step_points', 'cap_points', 'normal_experience', 'expected_revision'}, 'five settings fields')
require(all(amount(request[k]) for k in request if k != 'expected_revision') and int(request['cap_points']) >= int(request['base_points']), 'setting amounts')
require(response['mastery_experience'] == request['mastery_experience'] and response['pending']['effective_day'] > response['learning_day'] and all(response['pending'][k] == request[k] for k in ['base_points', 'step_points', 'cap_points', 'normal_experience']), 'settings timing example')
for name in ['level_save', 'achievement_save']:
    case = ex[name]; rows = case['request']['changes']; config = case['response']['data']['configuration']; mappings = case['response']['data']['saved_rows']
    require(len(config['items']) == 6 and len(mappings) == len(rows), name + ' six tiers')
    require(len({r['client_key'] for r in rows}) == len(rows), name + ' unique keys')
    for row, mapping in zip(rows, mappings):
        try:
            uuid.UUID(row['client_key'])
        except ValueError:
            errors.append(name + ' UUID')
        require(row['client_key'] == mapping['client_key'] and (row['id'] is None or row['id'] == mapping['id']), name + ' mapping')
        result = next(r for r in config['items'] if r['id'] == mapping['id'])
        require(all(result[k] == v for k, v in row['value'].items()), name + ' complete persisted fields')
        require(amount(row['value']['reward']['points']), name + ' points')
    before_by_id = {r['id']: r for r in case['before']['items']}; changed_ids = {r['id'] for r in rows}
    for row in config['items']:
        if row['id'] in before_by_id and row['id'] not in changed_ids:
            require(row == before_by_id[row['id']], name + ' untouched row')
levels = ex['level_save']; after_levels = levels['response']['data']['configuration']['items']
require([int(x['min_experience']) for x in after_levels] == [0, 200, 300, 400, 500, 600], 'legal threshold move')
require(levels['preview_request'] == {k: v for k, v in levels['request'].items() if k not in ['confirmation_token', 'confirmed']}, 'same preview/save change set')
require(ex['row_error']['state_after'] == ex['achievement_save']['before'] and ex['row_error']['response']['field_errors'][0]['field'] == '/changes/1/value/threshold', 'row failure leaves full state unchanged example')
require(ex['unknown_commit']['retry_response']['code'] == 'revision_conflict' and ex['unknown_commit']['read_after']['data']['revision'] == 'cfg_after', 'unknown commit requires read')
check('synthetic_contract_examples', not errors, {'errors': errors, 'description_cases': 6, 'invalid_descriptions': 3, 'admin_option_cases': 4, 'tiers_each': 6, 'runtime_execution': False})

future = {E / name for name in ['M002-BE-03-check.json', 'M002-BE-03-manifest.json', 'M002-BE-03.tar.gz', 'M002-BE-03-freeze-results.json']}
broken = []
for key, value in docs.items():
    for target in re.findall(r'\]\(([^)]+)\)', value):
        if target.startswith(('http:', 'https:', '#')):
            continue
        resolved = (M / key).parent / target.split('#')[0]
        if not resolved.exists() and resolved.resolve() not in future:
            broken.append({'file': key, 'target': target})
check('local_file_links', not broken and '<a id="api-206-growth-config"></a>' in admin, {'broken': broken, 'new_explicit_anchor': 'api-206-growth-config'})
result = {'version': 'M002-BE-03', 'status': 'PASS' if all(c['status'] == 'PASS' for c in checks) else 'FAIL',
          'checked_at': datetime.now(timezone.utc).isoformat(), 'checks': checks,
          'scope': 'Static document/protocol-example validation only; no production implementation, HTTP, token signature or database/concurrency tests',
          'professional_reception': 'BACKEND_COMPLETED_PENDING_APPROVAL_AND_FRONTEND', 'CR004_status': 'open',
          'application_tests': False, 'database_access': False, 'real_ai_calls': 0, 'workflow_changed': False,
          'document_maintenance': {'same_source_set': list(docs),
          'before_chars': sum(len(v) for v in prior.values()), 'after_chars': sum(len(v) for v in docs.values()),
          'before_bytes': sum(len(v.encode()) for v in prior.values()), 'after_bytes': sum(len(v.encode()) for v in docs.values()),
          'new_session_reception': 'not_performed', 'tokens': 'unknown'}}
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'checks': len(checks), 'failures': [c for c in checks if c['status'] == 'FAIL']}, ensure_ascii=False))
raise SystemExit(0 if result['status'] == 'PASS' else 1)
