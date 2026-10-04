"""DB-03 document/source checks only. No database, app tests, or workflow writes."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess
import tarfile
import yaml

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M002'
E = M / 'technical/evidence'
REPORT = E / 'M002-DB-03-check.json'
assert not REPORT.exists() and not (E / 'M002-DB-03-manifest.json').exists(), 'Preserve prior/frozen evidence'
inputs = json.loads((E / 'M002-DB-03-inputs.json').read_text())
plan = (M / 'technical/database.md').read_text()
handoff = (M / 'handoffs/database.md').read_text()
cr = (M / 'changes/CR-004.md').read_text()
checks = []


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def check(name, ok, details):
    checks.append(dict(name=name, status='PASS' if ok else 'FAIL', details=details))


def meta(s):
    return yaml.safe_load(s.split('---', 2)[1])


def sections(s):
    parts = re.split(r'(^#{2,3} .+$)', s, flags=re.M)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}


def ids(s, prefix):
    result = set()
    for m in re.finditer(prefix + r'-(\d{3})((?:[–/\-]\d{3})*)', s):
        start = int(m[1]); result.add(f'{prefix}-{start:03}')
        for op, number in re.findall(r'([–/\-])(\d{3})', m[2]):
            end = int(number)
            result.update(f'{prefix}-{n:03}' for n in (range(start, end + 1) if op in '–-' else [end]))
            start = end
    return result


state = yaml.safe_load((ROOT / '.planning/workflow/state.yaml').read_text())
registry = yaml.safe_load((ROOT / '.planning/agt/agents.yaml').read_text())['agents']
check('role_and_approval_boundaries', state['stage'] == 'technical-design' and
      state['active_role'] == 'dba/base' and state['active_agent'] == 'dba-diana' and
      state['last_transition']['decision_id'] == 'TRANSITION-M002-013' and
      state['database_approval']['version'] == 'M002-DB-02' and
      state['backend_approval']['version'] == 'M002-BE-02' and
      [a['display_name'] for a in registry if a['kind'] == 'specialist' and a['status'] == 'active'] == ['dba-diana'],
      'DB-03 proposed only; no backend activation, FE acceptance, or implementation approval.')
check('proposed_metadata_open_cr', all(meta(s)['version'] == 'M002-DB-03' and
      meta(s)['status'] == 'awaiting_user_review' and meta(s)['revision_scope'] == 'M002-CR-004'
      for s in [plan, handoff]) and meta(cr)['status'] == 'open' and
      'M002-CR-004' in state['open_change_requests'] and 'M002-CR-003' not in state['open_change_requests'],
      'CR004 partial DBA proposal; CR003 formally closed reception remains closed.')
changed = [p for p, h in inputs['protected_sha256'].items() if not (ROOT / p).is_file() or sha(ROOT / p) != h]
check('protected_sources', not changed, {'count': len(inputs['protected_sha256']), 'changed': changed})
check('source_head_unchanged', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip() == inputs['head'],
      'No application commit or migration created.')

before_archive = ROOT / inputs['before_archive']['path']
with tarfile.open(before_archive) as t:
    before_bytes = {p: t.extractfile(p).read() for p in inputs['allowed_source_changes']}
check('input_snapshot_intact', sha(before_archive) == inputs['before_archive']['sha256'] and
      all(hashlib.sha256(before_bytes[p]).hexdigest() == h for p, h in inputs['before_sources'].items()),
      'Exact pre-edit DB02 document/handoff and FE01 CR004 recoverable.')
old = before_bytes['.planning/milestones/M002/technical/database.md'].decode()
old_cr = before_bytes['.planning/milestones/M002/changes/CR-004.md'].decode()
check('cr_origin_unchanged', cr.split('## 解决记录')[0] == old_cr.split('## 解决记录')[0],
      'Only DBA resolution progress changed; original diagnosis and proposal preserved.')
failures = []
counts = {}
for p, expected in inputs['historical_archives'].items():
    if sha(ROOT / p) != expected:
        failures.append(p)
    mf = json.loads(Path(str(ROOT / p).replace('.tar.gz', '-manifest.json')).read_text())
    members = ({**mf['source_sha256'], **mf['evidence_sha256']} if 'source_sha256' in mf
               else {x['path']: x['sha256'] for x in mf['files']})
    with tarfile.open(ROOT / p) as t:
        for member, h in members.items():
            if hashlib.sha256(t.extractfile(member).read()).hexdigest() != h:
                failures.append(member)
    counts[Path(p).name] = len(members)
check('historical_archives', not failures, {'verified_members': counts, 'failures': failures})

before, after = sections(old), sections(plan)
changes = [k for k in after if after[k] != before.get(k)]
allowed = ['## 1.', '### 1.1', '### 1.2', '### 1.3', '### 6.3', '### 6.4',
           '### 11.2', '### 12.1', '### 13.1', '## 14.', '### 14.']
unexpected = [k for k in changes if not any(k.startswith(p) for p in allowed)]
check('bounded_database_revision', not unexpected and set(before) <= set(after),
      {'changed_sections': changes, 'unexpected': unexpected,
       'unchanged': 'M001 mapping, review/CR003 behavior, notices, cards, quotas, presets, analytics, lock order, backup, permissions, cleanup'})
assets = set(re.findall(r'DATA-\d{3}', (M / 'product/data-assets.md').read_text()))
mapped = set(re.findall(r'^\| (DATA-\d{3}) \|', plan, re.M))
caps = {s.upper() for s in re.findall(r'<a id="(cap-\d{3})"', (M / 'product/abilities.md').read_text())}
check('data_capability_inheritance', mapped == assets and len(mapped) == 32 and ids(plan, 'CAP') == caps and len(caps) == 49,
      {'data_indexes': len(mapped), 'capabilities': len(caps), 'meaning': 'Reference coverage, not feature acceptance'})
missing = []
for kind, count in [('T', 16), ('M', 7), ('V', 23)]:
    for i in range(1, count + 1):
        if not re.search(r'^\| DB2-' + kind + f'{i:02}' + r'(?: |\b)', plan, re.M):
            missing.append(f'DB2-{kind}{i:02}')
check('stable_ids_and_added_validation', not missing, {'missing': missing, 'transactions': 16, 'migrations': 7, 'future_validations': 23})
ops = (M / 'design/prototype/operations.js').read_text()
growth = (M / 'design/prototype/growth.js').read_text()
sql = '\n'.join(p.read_text() for p in (ROOT / 'backend/db/migrations').glob('*.sql'))
check('source_evidence', '["title", "description", "honor"]' in ops and
      'case "settings-save"' in ops and '["firstxp", "firstxp"]' in ops and
      'achievement-description' in growth and 'CREATE TABLE wordweave.achievement_tiers' not in sql and
      len(list((ROOT / 'backend/db/migrations').glob('*.sql'))) == 7,
      'Approved UI has independent optional description and one Save; actual repo has only M001 migrations.')
s63 = after['### 6.3 等级、成就和实际领取']
s64 = after['### 6.4 成长表单的一次保存（DB2-R11）']
check('description_semantics', all(x in s63 for x in [
      'description_zh text NULL', 'description_en text NULL', '说明两种均空合法',
      '纯空白规范为 NULL', '管理读取返回实际两个语言槽', '缺译取另一语言',
      '两列皆 NULL', '说明不与名称/称号要求成套语言', '不改既有 `title_*_snapshot`',
      '达成/领取不会保存说明快照', '不增加搜索索引']),
      'Nullable plain text, independent language fallback, raw admin fields, current descriptions and preserved honor snapshots.')
check('atomic_settings_and_day_boundary', all(x in s64 for x in [
      'FOR UPDATE', '期望的全局 revision', '拿到锁后取一次', '04:00',
      '保存学习日+1', '新建或更新唯一 pending', '首次掌握经验提交后',
      '两部分均回滚', '全局 revision 加 1']),
      'One transaction for five values; mastery current, checkin future, locked business-day boundary.')
check('atomic_tier_merge_identity_and_constraints', all(x in s64 for x in [
      '全部等级', '所选 kind 的全部成就档', '稳定 id', '第五档及更多',
      '未提交行保持', '不能删后重建', '初始门槛为 0',
      '[0,100,200]→[0,200,300]', 'DEFERRED', 'IMMEDIATE',
      'CHECK/NOT NULL 仍立即检查', '不拿这些延迟唯一约束作 `ON CONFLICT`']),
      'Validate final full set; preserve IDs; selected uniqueness checks can be deferred; no generic JSON/batch platform.')
check('read_commit_recovery_boundaries', all(x in s64 for x in [
      'FOR SHARE', '一个 SQL 语句快照', '分页跨请求', '重算目标 revision 与游标重置',
      '确认 COMMIT 成功后', '提交结果不明', '不能推进 revision' if '不能推进 revision' in s64 else '不推进 revision',
      '不重复新增档', '不冒充原保存收据', '不在持锁期间扫描所有用户']),
      'Consistent reads, one accepted revision, delayed worker scans, unknown commit requires reread; no false replay receipt.')
check('bounded_migration', all(x in after['### 12.1 数据保留与变更策略'] for x in [
      'DB-02 是已批准设计而非已部署结构', '原行保持 NULL', '不得重写已执行迁移',
      '门槛无冲突', '不能删已录入说明']),
      'Implement later in real migration chain; no fabricated production upgrade or destructive backfill.')
check('handoff_ownership_open_reception', all(x in handoff and x in cr for x in ['FE2-G01', 'FE2-G02', 'FE2-G03', 'backend-alex', 'frontend-bob']) and
      'CR-004 / OPEN' in handoff and '不重开 CR-003' in handoff and
      '运行应用测试' in handoff and '字段' in cr,
      'DBA proposal delivered; backend DTOs/commands/options and frontend reception remain outstanding.')

future = {E / n for n in ['M002-DB-03-check.json', 'M002-DB-03-manifest.json', 'M002-DB-03.tar.gz', 'M002-DB-03-freeze-results.json']}
broken = []
for path in [M / 'technical/database.md', M / 'handoffs/database.md', M / 'changes/CR-004.md']:
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if target.startswith(('http:', 'https:', '#')):
            continue
        target = target.split('#')[0]
        resolved = (path.parent / target).resolve()
        if not resolved.exists() and resolved not in future:
            broken.append({'file': str(path.relative_to(ROOT)), 'target': target})
check('local_file_links', not broken, {'broken': broken, 'note': 'File targets checked; anchors not interpreted.'})
report = {'version': 'M002-DB-03', 'status': 'PASS' if all(c['status'] == 'PASS' for c in checks) else 'FAIL',
          'created_at': datetime.now(timezone.utc).isoformat(), 'checks': checks,
          'scope': 'Static document/source consistency; no schema execution or runtime correctness claim',
          'professional_reception': 'PARTIAL_DBA_PROPOSAL_CR004_OPEN',
          'future_db_tests_run': False, 'application_tests_run': False, 'real_ai_calls': 0,
          'workflow_modified': False, 'document_maintenance': {
              'before_database': {'chars': len(old), 'bytes': len(old.encode())},
              'after_database': {'chars': len(plan), 'bytes': len(plan.encode())},
              'handoff': {'chars': len(handoff), 'bytes': len(handoff.encode())},
              'independent_new_session_reception': False, 'runtime_token_usage': 'unknown'}}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'checks': len(checks), 'failures': [c for c in checks if c['status'] == 'FAIL']}, ensure_ascii=False))
raise SystemExit(0 if report['status'] == 'PASS' else 1)
