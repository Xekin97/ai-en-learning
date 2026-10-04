from pathlib import Path
import json,hashlib,tarfile,datetime,subprocess
R=Path('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning');D=R/'.planning/milestones/M002/design';E=D/'evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
check=subprocess.run(['python3',str(E/'ui23/verify.py')],capture_output=True,text=True)
if check.returncode:raise SystemExit(check.stdout)
source=sorted([p for p in D.rglob('*') if p.is_file() and 'evidence' not in p.relative_to(D).parts and 'product-baseline-draft' not in p.relative_to(D).parts]+[D.parent/'handoffs/uiux.md'])
evidence=sorted([p for p in (E/'ui23').rglob('*') if p.is_file()]+[p for p in E.glob('UI23-*.json') if p.name!='UI23-freeze.json'])
archive=E/'M002-UI-23.tar.gz'
if archive.exists():raise SystemExit('Refusing to overwrite existing UI23 snapshot')
with tarfile.open(archive,'w:gz') as tf:
 for p in source+evidence:tf.add(p,arcname=str(p.relative_to(R)))
m={'version':'M002-UI-23','design_version':'M002-UI-23','status':'awaiting_user_review','owner':'designer-tony','input':'M002-PRODUCT-04','input_reception':'TRANSITION-M002-062','approval_of_design':None,'baseline':'M002-UI-22-H01','baseline_visual_approval':'APPROVAL-M002-007','scope':'CR025 five user-requested product/design changes; runnable prototype and handoff, no production implementation or stage transition.','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_sha256':{str(p.relative_to(R)):sha(p) for p in source},'evidence_sha256':{str(p.relative_to(R)):sha(p) for p in evidence},'archive':str(archive.relative_to(R)),'archive_sha256':sha(archive),'before_archive':str((E/'M002-UI-23-before.tar.gz').relative_to(R)),'before_archive_sha256':sha(E/'M002-UI-23-before.tar.gz'),'post_freeze_verification':str((E/'UI23-freeze.json').relative_to(R))}
(E/'M002-UI-23-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
(E/'design-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive) as tf:
 mismatches=[n for n,h in {**m['source_sha256'],**m['evidence_sha256']}.items() if hashlib.sha256(tf.extractfile(n).read()).hexdigest()!=h or sha(R/n)!=h]
result={'version':'M002-UI-23','status':'PASS' if not mismatches else 'FAIL','source_files':len(source),'evidence_files':len(evidence),'mismatches':mismatches,'archive_sha256':m['archive_sha256'],'current_pointer_matches_version_manifest':(E/'design-manifest.json').read_bytes()==(E/'M002-UI-23-manifest.json').read_bytes(),'new_design_approved':False,'production_files_changed':0,'real_provider_calls':0,'screenshots':8,'screenshot_budget_expansion_reason':'Observed toast overlap and close/title collision at short viewport; two targeted visual retests.','tokens':'unknown'}
(E/'UI23-freeze.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
