#!/usr/bin/env python3
"""BE05-R1 document-only check. Never executes v5 reducer, provider or application."""
from pathlib import Path
import json,hashlib,re
ROOT=Path(__file__).resolve().parents[5];T=ROOT/'.planning/milestones/M003/technical';E=T/'evidence'
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(ok,message):
 if not ok:raise AssertionError(message)
before=load(E/'be05-r1-before.json');policy=load(E/'be05-r1-display-policy.json')
docs=[ROOT/p for p in before['document_before_sha256']]
for p,h in before['protected_sha256'].items():require(sha(ROOT/p)==h,'frozen file changed: '+p)
for p,rows in before['event_schema_rows'].items():require([s for s in (ROOT/p).read_text().splitlines() if re.match(r'\| (generation|preview)\.',s)]==rows,'wire event schema changed')
for p in docs:
 s=p.read_text();require('version: M003-BE-05-R1\n' in s,'seven document versions')
 for old in ['正文安全首片到达即收起全部规划预览','第一条正文edit原子收起/清除全部临时规划卡片','正文首个安全片段显示时收起临时规划','首片收起全部临时规划','first edit收起','planning projection/首片收起']:
  require(old not in s,'superseded active display rule: '+str(p))
g=(T/'api/generation.md').read_text();require('第一条及后续正文edit都保留已有规划卡片' in g,'edit retains plan');require('status=valid' in g and '完整`Result`' in g and 'result=null' in g,'complete result boundary');require('failed/cancelled清全部临时内容' in g and '启动新请求先清旧plan/正文' in g,'failure/cancel/new request cleanup')
require(policy['version']=='M003-BE-05-R1' and policy['contract_version']=='m003-stream-v5','policy version')
require(policy['label']=='初始构思，文章和实际用法可能调整','provisional label')
require(set(policy['retain_during'])=={'initial_draft','fixed_edit','content_repair','retained_restore','finalizing','settlement_pending','unexpected_eof'},'retain states')
require(set(policy['clear_on'])=={'authoritative_valid_with_complete_result_including_Q02','failed','cancelled','new_request'},'clear boundaries')
require('expected.plan_hidden_on_first_edit' in g and '历史证据' in g,'old fixture assertion explicitly historical')
links=0
for p in docs:
 for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' in link or link.startswith('#'):continue
  target=(p.parent/link.split('#')[0].strip('<>')).resolve();require(target.exists() or target==E/'be05-r1-check.json','broken link: '+link);links+=1
require((E/policy['wire_source']).resolve().exists(),'existing v5 source')
paths=docs+[E/'be05-r1-display-policy.json',Path(__file__).resolve(),E/'be05-r1-before.json']
report={'version':'M003-BE-05-R1','status':'PASS','scope':'document versions/display semantics/local links/frozen artifact hashes only','current_documents_checked':len(docs),'event_schema_rows_unchanged':sum(len(v) for v in before['event_schema_rows'].values()),'frozen_v5_files_unchanged':len(before['protected_sha256']),'local_links_checked':links,'payload_sets_added':0,'wire_version':'m003-stream-v5','historical_expected_override':'plan_hidden_on_first_edit=true is historical; current UI retains until authoritative valid complete Result','browser_verification':'pending UI07-R1 targeted checks and user review','not_run':['v5 checker','fixture regeneration','browser','Go','DB','real model','quality/load test'],'sha256':{str(p.relative_to(ROOT)):sha(p) for p in paths}}
(E/'be05-r1-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['status','current_documents_checked','event_schema_rows_unchanged','frozen_v5_files_unchanged','local_links_checked','payload_sets_added']},ensure_ascii=False))
