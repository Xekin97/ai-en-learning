from pathlib import Path
import json,hashlib,tarfile,datetime,subprocess

ROOT=Path(__file__).resolve().parents[5]
M=ROOT/'.planning/milestones/M002'
E=M/'technical/evidence'
manifest=E/'M002-FE-01-manifest.json'
archive=E/'M002-FE-01.tar.gz'
result=E/'M002-FE-01-freeze-results.json'
assert not any(p.exists() for p in [manifest,archive,result]), 'Frozen outputs already exist'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(ROOT))
inputs=json.loads((E/'M002-FE-01-inputs.json').read_text())
report=json.loads((E/'M002-FE-01-check.json').read_text())
assert report['status']=='PASS' and report['semantic_contract_alignment']=='BLOCKED_CR004'
assert all((ROOT/f['path']).is_file() and sha(ROOT/f['path'])==f['sha256'] for f in inputs['protected_files'])
sources=[M/'technical/frontend.md',M/'technical/frontend-traceability.json',M/'handoffs/frontend-architecture.md',M/'changes/CR-004.md']
evidence=[E/n for n in ['M002-FE-01-inputs.json','receive-frontend-prototype.cjs','M002-FE-01-prototype.json','M002-FE-01-home-zh.png','M002-FE-01-growth-en.png','build-frontend-trace.py','verify-frontend-design.py','M002-FE-01-check-prior-1.json','M002-FE-01-handoff-prior-1.md','M002-FE-01-check.json','freeze-frontend-design.py']]
allfiles=sources+evidence
items=[dict(path=rel(p),sha256=sha(p),bytes=p.stat().st_size,kind='source' if p in sources else 'evidence') for p in allfiles]
with tarfile.open(archive,'w:gz') as t:
 for p in allfiles:t.add(p,arcname=rel(p),recursive=False)
data={'version':'M002-FE-01','status':'awaiting_user_review','approved':False,'role':'frontend-bob','role_activation':'TRANSITION-M002-012','frozen_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':{'product':'M002-PRODUCT-03','design':'M002-UI-22-H01','database':'M002-DB-02','backend':'M002-BE-02'},'contract_alignment':'BLOCKED_CR004','contract_gaps':['FE2-G01','FE2-G02','FE2-G03'],'sources':len(sources),'evidence_files':len(evidence),'files':items,'archive':{'path':rel(archive),'sha256':sha(archive),'bytes':archive.stat().st_size},'verification_attempts':[{'report':rel(E/'M002-FE-01-check-prior-1.json'),'status':'FAIL','reason':'Handoff used the compressed G01–03 range instead of listing all three gap IDs individually. Full evidence and original handoff retained; current handoff explicitly lists FE2-G01, FE2-G02, FE2-G03.'},{'report':rel(E/'M002-FE-01-check.json'),'status':'PASS','checks':20}],'prototype_reception':{'checks':56,'status':'PASS','report':rel(E/'M002-FE-01-prototype.json'),'scope':'28 approved views in two locale/viewport combinations, reduced motion; not implementation verification'},'production_tests':False,'real_ai_calls':0,'stage_transition':False,'git_commit':None,'post_freeze_verification':rel(result)}
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive,'r:gz') as t:
 assert set(t.getnames())=={f['path'] for f in items}
 assert all(hashlib.sha256(t.extractfile(f['path']).read()).hexdigest()==f['sha256']==sha(ROOT/f['path']) for f in items)
assert all(sha(ROOT/f['path'])==f['sha256'] for f in inputs['protected_files'])
result.write_text(json.dumps({'version':'M002-FE-01','status':'PASS','manifest_sha256':sha(manifest),'archive_sha256':sha(archive),'members':len(items),'all_current_and_archived_bytes_match':True,'protected_files_unchanged':len(inputs['protected_files']),'contract_alignment':'BLOCKED_CR004','workflow_transition':False,'production_tests':False},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'PASS','sources':len(sources),'evidence':len(evidence),'members':len(items),'archive_sha256':sha(archive),'contract_alignment':'BLOCKED_CR004'}))
