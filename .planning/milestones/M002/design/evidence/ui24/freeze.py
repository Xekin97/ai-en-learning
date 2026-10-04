from pathlib import Path
import json,hashlib,tarfile,datetime
R=Path(__file__).resolve().parents[6]
D=R/'.planning/milestones/M002/design'
E=D/'evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert json.loads((E/'UI24-static.json').read_text())['status']=='PASS'
assert json.loads((E/'ui24/browser.json').read_text())['status']=='PASS'
old=json.loads((E/'M002-UI-23-manifest.json').read_text())
source=sorted(R/n for n in old['source_sha256'])
evidence=sorted(p for p in (E/'ui24').rglob('*') if p.is_file())+[E/'UI24-static.json']
archive=E/'M002-UI-24.tar.gz'
if archive.exists():raise SystemExit('Refusing to overwrite existing UI24 snapshot')
with tarfile.open(archive,'w:gz') as tf:
 for p in source+evidence:tf.add(p,arcname=str(p.relative_to(R)))
m={'version':'M002-UI-24','design_version':'M002-UI-24','status':'awaiting_user_review','owner':'designer-tony','input':'M002-PRODUCT-04','input_reception':'TRANSITION-M002-062','approval_of_design':None,'baseline':'M002-UI-23','baseline_manifest':str((E/'M002-UI-23-manifest.json').relative_to(R)),'baseline_manifest_sha256':sha(E/'M002-UI-23-manifest.json'),'baseline_archive_sha256':old['archive_sha256'],'baseline_visual_approval':'APPROVAL-M002-007 (UI22; unchanged scope only)','scope':'UIA-PAGE-207-LIST24 notice list refinement, inheriting UI23 five additions. Applied and verified prototype, no production implementation or stage transition.','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_sha256':{str(p.relative_to(R)):sha(p) for p in source},'evidence_sha256':{str(p.relative_to(R)):sha(p) for p in evidence},'archive':str(archive.relative_to(R)),'archive_sha256':sha(archive),'post_freeze_verification':str((E/'UI24-freeze.json').relative_to(R))}
for name in ['M002-UI-24-manifest.json','design-manifest.json']:(E/name).write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive) as tf:
 mismatches=[n for n,h in {**m['source_sha256'],**m['evidence_sha256']}.items() if hashlib.sha256(tf.extractfile(n).read()).hexdigest()!=h or sha(R/n)!=h]
result={'version':'M002-UI-24','status':'PASS' if not mismatches else 'FAIL','source_files':len(source),'evidence_files':len(evidence),'mismatches':mismatches,'archive_sha256':m['archive_sha256'],'current_pointer_matches_version_manifest':(E/'design-manifest.json').read_bytes()==(E/'M002-UI-24-manifest.json').read_bytes(),'new_design_approved':False,'production_files_changed':0,'stage_transition':None,'real_provider_calls':0,'screenshots':3,'tokens':'unknown'}
(E/'UI24-freeze.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
assert not mismatches
