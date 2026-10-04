"""DB-02 static design verification. Run from product root before freeze.
No PostgreSQL connections, application tests, SQL execution, or role transitions.
Assertions check design coverage and unchanged sources, not runtime behavior.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess
import tarfile
import yaml

root = Path.cwd()
base = Path('.planning/milestones/M002')
ev = base / 'technical/evidence'
report = ev / 'M002-DB-02-check.json'
assert not (ev / 'M002-DB-02-manifest.json').exists(), 'frozen evidence cannot be rewritten'
assert not report.exists(), 'preserve prior check before rerunning'
inputs = json.loads((ev / 'M002-DB-02-inputs.json').read_text())
sources = {p: Path(p).read_text() for p in inputs['allowed_source_changes']}
plan = sources[str(base / 'technical/database.md')]
handoff = sources[str(base / 'handoffs/database.md')]
cr = sources[str(base / 'changes/CR-003.md')]
checks = []

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def check(name, ok, details):
    checks.append({'name': name, 'status': 'PASS' if ok else 'FAIL', 'details': details})

def meta(s):
    return yaml.safe_load(s.split('---', 2)[1])

def ids(s, prefix):
    result = set()
    for m in re.finditer(prefix + r'-(\d{3})((?:[–/\-]\d{3})*)', s):
        start = int(m[1]); result.add(f'{prefix}-{start:03}')
        for op, number in re.findall(r'([–/\-])(\d{3})', m[2]):
            end = int(number)
            result.update(f'{prefix}-{n:03}' for n in (range(start, end + 1) if op in '–-' else [end]))
            start = end
    return result

def sections(s):
    parts = re.split(r'(^#{2,3} .+$)', s, flags=re.M)
    return {parts[i]: parts[i+1] for i in range(1, len(parts), 2)}

state = yaml.safe_load(Path('.planning/workflow/state.yaml').read_text())
agents = yaml.safe_load(Path('.planning/agt/agents.yaml').read_text())['agents']
check('active_role_and_historical_approval', state['active_role']=='dba/base' and
      state['active_agent']=='dba-diana' and state['last_transition']['decision_id']=='TRANSITION-M002-010' and
      state['database_approval']['version']=='M002-DB-01' and
      any(a['display_name']=='dba-diana' and a['status']=='active' for a in agents),
      'Same technical-design role; DB-02 not approved; DB-01 historical approval retained.')
check('proposed_revision_and_open_cr', all(meta(s)['version']=='M002-DB-02' and
      meta(s)['status']=='awaiting_user_review' for s in [plan,handoff]) and
      meta(cr)['status']=='open' and meta(plan)['revision_scope']=='M002-CR-003',
      'DBA delivered proposal; approval and backend reception pending.')
changed = [p for p,h in inputs['protected_sha256'].items() if not Path(p).is_file() or sha(p)!=h]
check('protected_files', not changed, {'count':len(inputs['protected_sha256']), 'changed':changed,
      'includes':'workflow controls, product/UI, BE-01, DB-01 evidence, M001 and application sources'})

archive_failures=[]
for p,h in inputs['historical_archives'].items():
    if sha(p)!=h: archive_failures.append(p)
with tarfile.open(ev/'M002-DB-01.tar.gz') as t:
    old=t.extractfile(str(base/'technical/database.md')).read().decode()
    manifest=json.loads((ev/'M002-DB-01-manifest.json').read_text())
    for p,h in {**manifest['source_sha256'],**manifest['evidence_sha256']}.items():
        if hashlib.sha256(t.extractfile(p).read()).hexdigest()!=h: archive_failures.append(p)
with tarfile.open(ev/'M002-BE-01.tar.gz') as t:
    old_cr=t.extractfile(str(base/'changes/CR-003.md')).read().decode()
check('frozen_history_recoverable', not archive_failures, {'failures':archive_failures,
      'DB01_members_verified':len(manifest['source_sha256'])+len(manifest['evidence_sha256']),
      'BE01_archive_sha_verified':True})
check('cr_origin_preserved', cr.split('## 解决记录')[0]==old_cr.split('## 解决记录')[0],
      'Original backend problem/evidence/proposal intact; only DBA resolution progress appended.')

before,after=sections(old),sections(plan)
changed_sections=[k for k in after if after[k]!=before.get(k)]
allowed=['## 1.','### 1.1','### 1.2','### 4.3','### 5.','### 11.2','### 12.1','### 13.1','## 14.','### 14.']
unexpected=[k for k in changed_sections if not any(k.startswith(p) for p in allowed)]
check('bounded_revision', not unexpected and set(before)<=set(after),
      {'changed_sections':changed_sections,'unexpected':unexpected,
       'unchanged':'DATA mapping, word/account data, growth, cards/quota, presets/analytics, locks, backup, deletion/operations'})
assets=set(re.findall(r'DATA-\d{3}',(base/'product/data-assets.md').read_text()))
mapped=set(re.findall(r'^\| (DATA-\d{3}) \|',plan,re.M))
caps={s.upper() for s in re.findall(r'<a id="(cap-\d{3})"',(base/'product/abilities.md').read_text())}
check('inherited_data_and_capabilities', mapped==assets and len(mapped)==32 and ids(plan,'CAP')==caps and len(caps)==49,
      {'data_count':len(mapped),'cap_count':len(caps),'meaning':'Reference coverage, not feature acceptance'})
expected_ids={'T':14,'M':7,'V':19}
missing=[]
for kind,count in expected_ids.items():
    for i in range(1,count+1):
        if not re.search(r'^\| DB2-'+kind+f'{i:02}'+r'(?: |\b)',plan,re.M): missing.append(f'DB2-{kind}{i:02}')
check('stable_transaction_migration_validation_ids',not missing,{'expected':expected_ids,'missing':missing})

sql=Path('backend/db/migrations/0002_core_tables.sql').read_text()
check('existing_schema_evidence', all(s in sql for s in [
      "CHECK (status IN ('in_progress', 'completed'))",'review_sessions_completion_consistent',
      "WHERE mode = 'range' AND status = 'in_progress'",'skip_count integer NOT NULL',
      'CHECK (NOT successful OR skip_count = 0)']),
      'Read actual 0002 source; no live database measurement or migration.')
required={
 'CR003_1_minimal_overview':['has_unanswered=(skip_count>0)','successful+unsuccessful=completed<=total',
      'skipped<=unsuccessful','一个 SQL 语句快照','attempt_no 最大','DB2-V17','不新增具体空题号'],
 'CR003_2_atomic_replacement':['abandoned AND mode=\'range\' AND completed_at IS NULL',
      '旧 draft 标 restarted 并 revision+1','任一步失败全部回滚','提交先完成则替换的旧版本失效',
      '替换先完成则旧提交拒绝','DB2-T14','DB2-V18','不增加历史会话展示产品'],
 'CR003_3_bilingual_title':['title_zh text NULL','title_en text NULL','COALESCE((btrim(title_zh)',
      '整套回退','published_at DESC,id ASC','不能取正文首行代替标题','DB2-V19']}
for name,terms in required.items():
    missing=[t for t in terms if t not in plan]
    check(name,not missing,{'missing':missing,'scope':'Design requirements and validation paths present; not executed SQL tests'})
check('prior_decisions_and_runtime_limits',all(s in plan for s in [
      'DB2-Q01 / CORRECTED','采用基础与体验分别记账','90 天（推荐）','没有连接运行数据库',
      '实际迁移、并发与性能尚未验证','独立新会话接收未执行']) and all(s in handoff for s in [
      'CR039-L1','CR042-L1','AI-QUALITY-90','CAP-209','USER-COMPAT-001','USER-CLAIM-DELETE-001']),
      'No new cross-device drafts, no runtime quality claims; existing open items preserved.')

deferred={str(ev/n) for n in ['M002-DB-02-check.json','M002-DB-02-manifest.json','M002-DB-02.tar.gz','M002-DB-02-freeze-results.json']}
failures=[]; link_count=0
for p,txt in sources.items():
    for link in re.findall(r'\]\(([^)]+)\)',txt):
        if link.startswith(('https://','http://')): continue
        loc,_,anchor=link.partition('#'); target=(Path(p).parent/loc).resolve()
        link_count+=1
        relative=str(target.relative_to(root)) if target.is_relative_to(root) else str(target)
        if not target.exists():
            if relative not in deferred: failures.append({'source':p,'link':link})
        elif anchor and target.is_file():
            body=target.read_text()
            headings=[re.sub(r'[^\w\-\s]','',m.lower()).replace(' ','-')
                      for m in re.findall(r'^#+\s+(.+)$',body,re.M)]
            if f'id="{anchor}"' not in body and anchor not in headings:
                failures.append({'source':p,'link':link,'reason':'missing anchor'})
check('local_links',not failures,{'count':link_count,'failures':failures,'deferred_until_freeze':sorted(deferred)})

files=set(subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z']).decode().split('\0'))-{''}
known=set(inputs['protected_sha256'])|set(inputs['allowed_source_changes'])
allowed_evidence={str(ev/n) for n in ['M002-DB-02-inputs.json','verify-database-revision.py']}
unexpected=sorted(files-known-allowed_evidence)
check('new_files_limited_to_evidence',not unexpected,{'unexpected':unexpected})
result={'version':'M002-DB-02','created_at':datetime.now(timezone.utc).isoformat(),
        'result':'PASS_STATIC_AWAITING_REVIEW' if all(c['status']=='PASS' for c in checks) else 'FAIL',
        'source_sha256':{p:sha(p) for p in sources},'checks':checks,
        'size_comparison':{p:{'before_unicode_characters':inputs['before_source_characters'][p],
           'after_unicode_characters':len(s),'after_utf8_bytes':len(s.encode())} for p,s in sources.items()},
        'size_scope':'Same three canonical files once each; not actual cumulative input or billed tokens',
        'actual_tokens':'unknown','runtime_tests':False,'database_connected':False,
        'independent_handoff_test':False,'workflow_transition':False,
        'pending':['DB-02 user approval','backend reception and CR-003 resolution','DB2-V01–19 implementation verification']}
report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'checks':len(checks),'failed':[c for c in checks if c['status']=='FAIL'],
                  'source_sizes':result['size_comparison']},ensure_ascii=False,indent=2))
raise SystemExit(0 if result['result'].startswith('PASS') else 1)
