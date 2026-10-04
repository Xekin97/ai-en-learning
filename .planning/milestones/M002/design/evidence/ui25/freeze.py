from pathlib import Path
import json,hashlib,tarfile,datetime
R=Path(__file__).resolve().parents[6];D=R/'.planning/milestones/M002/design';E=D/'evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for p in [E/'UI25-static.json',E/'ui25/browser.json',E/'ui25/trial-recheck.json']:assert json.loads(p.read_text())['status']=='PASS'
old=json.loads((E/'M002-UI-24-manifest.json').read_text());source=sorted(R/n for n in old['source_sha256']);evidence=sorted(p for p in (E/'ui25').rglob('*') if p.is_file())+[E/'UI25-static.json'];archive=E/'M002-UI-25.tar.gz'
assert not archive.exists(),'Refusing to overwrite UI25 snapshot'
with tarfile.open(archive,'w:gz') as tf:
 for p in source+evidence:tf.add(p,arcname=str(p.relative_to(R)))
m={'version':'M002-UI-25','design_version':'M002-UI-25','status':'awaiting_user_review','owner':'designer-tony','input':'PRODUCT04 inherited scope plus confirmed D2-89; excludes pending CR026 cache scope','input_reception':'TRANSITION-M002-064','approval_of_design':None,'baseline':'M002-UI-24','baseline_manifest':str((E/'M002-UI-24-manifest.json').relative_to(R)),'baseline_manifest_sha256':sha(E/'M002-UI-24-manifest.json'),'baseline_archive_sha256':old['archive_sha256'],'scope':'Remove user-facing reminder category and internal logic copy; preserve operational consequences, behavior and administrator controls. No production implementation.','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_sha256':{str(p.relative_to(R)):sha(p) for p in source},'evidence_sha256':{str(p.relative_to(R)):sha(p) for p in evidence},'archive':str(archive.relative_to(R)),'archive_sha256':sha(archive),'post_freeze_verification':str((E/'UI25-freeze.json').relative_to(R))}
for name in ['M002-UI-25-manifest.json','design-manifest.json']:(E/name).write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive) as tf:
 mismatches=[n for n,h in {**m['source_sha256'],**m['evidence_sha256']}.items() if hashlib.sha256(tf.extractfile(n).read()).hexdigest()!=h or sha(R/n)!=h]
result={'version':'M002-UI-25','status':'PASS' if not mismatches else 'FAIL','source_files':len(source),'evidence_files':len(evidence),'mismatches':mismatches,'archive_sha256':m['archive_sha256'],'current_pointer_matches_version_manifest':(E/'design-manifest.json').read_bytes()==(E/'M002-UI-25-manifest.json').read_bytes(),'new_design_approved':False,'production_files_changed':0,'real_provider_calls':0,'browser_checks':113,'targeted_rechecks':8,'screenshots':4,'screenshot_budget_extension_reason':'Visual review found residual trial lock badge; one additional screenshot after removing it.','pending':'D2-88-LOCAL-SCOPE remains OPEN','tokens':'unknown'}
(E/'UI25-freeze.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2));assert not mismatches
