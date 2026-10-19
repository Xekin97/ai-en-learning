#!/usr/bin/env python3
"""CR313 documentation-only checks; never accesses application or database runtime."""
from pathlib import Path
import hashlib,json,re,tarfile
ROOT=Path(__file__).resolve().parents[6]
E=Path(__file__).resolve().parent
DOC=ROOT/'.planning/milestones/M002/technical/config-portability/database.md'
HAND=ROOT/'.planning/milestones/M002/handoffs/config-portability-database.md'
checks=[]
def check(name,ok,detail=None): checks.append({'check':name,'pass':bool(ok),'detail':detail})
for p in [DOC,HAND]:
 text=p.read_text()
 for target in re.findall(r'\]\(([^)]+)\)',text):
  if target.startswith(('https://','http://','#')): continue
  file=target.split('#')[0]
  check('link:'+str(p.relative_to(ROOT))+':'+target,(p.parent/file).resolve().exists())
check('all_ac_501_514',all(re.search(r'(?:AC-|/)'+str(i)+r'(?=\D|$)',DOC.read_text()) for i in range(501,515)))
check('data_501_506',all('DATA-'+str(i) in DOC.read_text() for i in range(501,507)))
check('q01_confirmed_closed','DB313-Q01 成就身份冲突（CONFIRMED / CLOSED）' in DOC.read_text())
check('no_old_question_id','DB501-Q1' not in DOC.read_text())
check('awaiting_user_review',all('status: awaiting_user_review' in p.read_text() for p in [DOC,HAND]))
check('no_implementation_claim','未实现、未执行、未验证' in DOC.read_text())
archive=ROOT/'.planning/milestones/M002/reviews/evidence/cr313-technical-entry-126/before-entry.tar.gz'
with tarfile.open(archive) as t:
 for rel in ['.planning/milestones/M002/technical/database.md','.planning/milestones/M002/handoffs/database.md']:
  old=t.extractfile(rel).read()
  now=(ROOT/rel).read_bytes()
  check('original_baseline_exact:'+rel,now.endswith(old) and now[:-len(old)].count(b'\n\n')==1,{'old_sha256':hashlib.sha256(old).hexdigest(),'prefix_bytes':len(now)-len(old)})
manifest=json.loads((E/'source-manifest.json').read_text())
for row in manifest['files']:
 p=ROOT/row['path']
 check('source_unchanged:'+row['path'],hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'])
result={'version':'M002-DB-CR313-01','kind':'static_document_check','pass':all(c['pass'] for c in checks),'checks':checks,'runtime_tests':False,'db_access':False,'provider_calls':0,'tokens':'unknown','limitations':['No DDL/SQL/Go/frontend/browser execution','No runtime permissions/concurrency/AC verification','No new-session handoff test']}
(E/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pass':result['pass'],'checks':len(checks),'failed':[c for c in checks if not c['pass']]},ensure_ascii=False))
raise SystemExit(0 if result['pass'] else 1)
