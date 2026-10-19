"""Only FE owner acceptance of API306 compact-byte clarification; no application test."""
from pathlib import Path
import json,hashlib,tarfile,datetime
root=Path(__file__).resolve().parents[7];m=root/'.planning/milestones/M003';out=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def entry(p):return {'path':str(p.relative_to(root)),'sha256':sha(p)}
before=json.loads((out/'before-manifest.json').read_text())
f=m/'technical/frontend.md';h=m/'handoffs/frontend-architecture.md';api=m/'technical/api/administration.md';v=m/'technical/fixtures/cr306/compact-byte-vectors.json';be=m/'technical/evidence/cr306/compact-bytes-check.json'
vec=json.loads(v.read_text());owner=json.loads(be.read_text());checks=[]
def check(id,ok):checks.append({'id':id,'pass':bool(ok)})
check('FE-precise-contract-and-vector-links','api306-compact-bytes' in f.read_text() and 'fixtures/cr306/compact-byte-vectors.json' in f.read_text() and 'api306-compact-bytes' in h.read_text())
check('single-algorithm-reference','TextEncoder().encode(JSON.stringify(value)).byteLength' in f.read_text() and 'U+2028/U+2029' in f.read_text())
check('rounded-integer-safety','9007199254740991.5' in f.read_text() and '归一后成为整数也须安全' in h.read_text())
check('owner-vector-shape',len(vec['accepted'])==13 and len(vec['size_recipes'])==5 and len(vec['rejected_numbers'])==3)
check('owner-vector-evidence-hash',owner['passed'] is True and owner['fixture_sha256']==sha(v))
check('owner-before-archive-hash',sha(root/owner['before_archive'])==owner['before_archive_sha256'])
check('API-anchor-exists','<a id="api306-compact-bytes"></a>' in api.read_text())
check('listed-protected-state-UI-frozen-files-unchanged',all(sha(root/x['path'])==x['sha256'] for x in before['protected']))
check('own-before-archive-hash',sha(root/before['archive']['path'])==before['archive']['sha256'])
with tarfile.open(out/'before.tar.gz') as t:
 check('own-before-documents-recoverable',all(hashlib.sha256(t.extractfile(x['path']).read()).hexdigest()==x['sha256'] for x in before['files']))
check('no-stage-reopening','stage: implementation' in (root/'.planning/workflow/state.yaml').read_text() and 'active_agent: backend-ethan' in (root/'.planning/workflow/state.yaml').read_text())
result={'scope':'FE03 owner support: documentation references and acceptance only','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS' if all(x['pass'] for x in checks) else 'FAIL','checks':checks,'count':len(checks),'not_executed':['old 63-item check','application/parser tests','browser','Go/DB','real model','new-session handoff'],'serving_model':'unknown','usage':'unknown'}
(out/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
files=[f,h,out/'check.py',out/'check.json']
with tarfile.open(out/'source.tar.gz','w:gz') as t:
 for p in files:t.add(p,arcname=str(p.relative_to(root)))
manifest={'version':'M003-FE-03','amendment':'API306 compact-byte owner clarification','active_workflow':'implementation/backend-ethan; unchanged','before_manifest':entry(out/'before-manifest.json'),'files':[entry(p) for p in files],'archive':entry(out/'source.tar.gz'),'inputs':[entry(p) for p in [api,v,be,m/'technical/evidence/cr306/compact-bytes-before.tar.gz']],'scope':'Two FE originals only; no new business rule, UI or production implementation. Original FE03 manifests, source package and check remain frozen.'}
(out/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'checks':len(checks),'failed':[x for x in checks if not x['pass']],'source':manifest['archive']},ensure_ascii=False))
