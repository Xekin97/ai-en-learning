from pathlib import Path
import json,hashlib,tarfile,datetime
D=Path(__file__).resolve().parents[2];M=D.parent;R=M.parents[2];E=D/'evidence/frontend-ui26'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
check=json.loads((D/'evidence/M002-FE-03-check.json').read_text());assert check['status']=='PASS'
rec=json.loads((E/'reception.json').read_text());assert all(sha(R/n)==h for n,h in rec['protected_sha256'].items())
source=[D/'frontend.md',D/'frontend-traceability.json',M/'handoffs/frontend-architecture.md',M/'changes/CR-027.md'];evidence=sorted(p for p in E.rglob('*')if p.is_file())+[D/'evidence/M002-FE-03-check.json'];archive=D/'evidence/M002-FE-03.tar.gz';assert not archive.exists()
with tarfile.open(archive,'w:gz')as tf:
 for p in source+evidence:tf.add(p,arcname=str(p.relative_to(R)))
manifest={'version':'M002-FE-03','role':'frontend-bob','status':'scoped_contract_gap','approved':False,'activation':'TRANSITION-M002-065','design':'M002-UI-26','design_approval':'APPROVAL-M002-065','product':'PRODUCT04 + D2-89 + user word picker request','excluded':'CR026 / D2-88-LOCAL-SCOPE','blocking_contract_gaps':['FE3-G01 / M002-CR-027: admin vocabulary search contract; other mapped work independent'],'baseline_archive':'.planning/milestones/M002/technical/evidence/M002-FE-02.tar.gz','baseline_archive_sha256':sha(D/'evidence/M002-FE-02.tar.gz'),'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_sha256':{str(p.relative_to(R)):sha(p)for p in source},'evidence_sha256':{str(p.relative_to(R)):sha(p)for p in evidence},'archive':str(archive.relative_to(R)),'archive_sha256':sha(archive),'checks':39,'production_changes':0,'production_tests':0,'real_provider_calls':0,'tokens':'unknown'}
(D/'evidence/M002-FE-03-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive)as tf:bad=[n for n,h in{**manifest['source_sha256'],**manifest['evidence_sha256']}.items()if sha(R/n)!=h or hashlib.sha256(tf.extractfile(n).read()).hexdigest()!=h]
assert not bad
report={'version':'M002-FE-03','status':'PASS','delivery_status':manifest['status'],'source_files':len(source),'evidence_files':len(evidence),'archive_sha256':manifest['archive_sha256'],'mismatches':bad,'protected_files':len(rec['protected_sha256']),'production_files_changed':0,'stage_unchanged':True,'role_unchanged':True,'pending':['FE3-G01 / CR027 backend contract clarification','CR026 / D2-88-LOCAL-SCOPE excluded']}
(D/'evidence/M002-FE-03-freeze.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
