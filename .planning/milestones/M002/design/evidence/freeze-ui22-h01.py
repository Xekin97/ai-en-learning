from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,tarfile,re
D=Path(__file__).resolve().parents[1];R=D.parents[3];E=D/'evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.resolve().relative_to(R))
receipt=json.loads((E/'UI22-H01-reception.json').read_text());assert json.loads((E/'UI22-H01-check.json').read_text())['status']=='PASS'
old=json.loads((E/'M002-UI-22-manifest.json').read_text());sources={n:sha(R/n) for n in old['source_sha256']};sources[rel(D/'frontend-delta.md')]=sha(D/'frontend-delta.md')
files=[E/'UI22-H01-reception.json',E/'UI22-H01-check.json',E/'verify-ui22-h01.py',Path(__file__).resolve(),D.parent/'reviews/uiux-design.md',D.parent/'reviews/evidence/uiux-approval-007/approval-check.json'];evidence={rel(p):sha(p) for p in files}
archive=E/'M002-UI-22-H01.tar.gz';assert not archive.exists()
for group in ['baseline_sha256','frontend_before_sha256','control_sha256']:assert all(sha(R/n)==h for n,h in receipt[group].items())
assert sha(R/old['archive'])==old['archive_sha256'];assert all(sha(R/n)==h for n,h in old['evidence_sha256'].items())
with tarfile.open(archive,'w:gz') as tar:
 for n in sorted(sources|evidence):tar.add(R/n,arcname=n)
m={'version':'M002-UI-22-H01','design_version':'M002-UI-22','status':'delivered_design_approved','owner':'designer-tony','input':'M002-PRODUCT-03','approval_of_input':'TRANSITION-M002-006','approval_of_design':'APPROVAL-M002-007','approval_record':rel(D.parent/'reviews/uiux-design.md'),'scope':'Documentation-only frontend delta and handoff supplement; approved UI22 executable design unchanged; no stage transition.','created_at':datetime.now(timezone.utc).isoformat(),'source_sha256':sources,'evidence_sha256':evidence,'archive':rel(archive),'archive_sha256':sha(archive),'approved_design_archive':old['archive'],'approved_design_archive_sha256':old['archive_sha256'],'post_freeze_verification':rel(E/'UI22-H01-freeze-results.json')}
for p in [E/'M002-UI-22-H01-manifest.json',E/'design-manifest.json']:p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
with tarfile.open(archive) as tar:
 for n,h in (sources|evidence).items():assert hashlib.sha256(tar.extractfile(n).read()).hexdigest()==h==sha(R/n)
docs=[D/x for x in ['design-spec.md','interactions.md','responsive-accessibility.md','validation.md','frontend-delta.md','../handoffs/uiux.md']];missing=[]
for p in docs:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  if not (p.parent/target.split('#')[0]).resolve().exists():missing.append(str(p)+':'+target)
assert not missing,missing
assert (E/'design-manifest.json').read_bytes()==(E/'M002-UI-22-H01-manifest.json').read_bytes()
result={'version':m['version'],'design_version':m['design_version'],'status':'PASS','sources':len(sources),'evidence':len(evidence),'archive_sha256':m['archive_sha256'],'all_source_and_evidence_hashes_match':True,'links_resolve':True,'current_pointer_matches':True,'m001_frontend_controls_unchanged':True,'stage_transition':False}
(E/'UI22-H01-freeze-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
