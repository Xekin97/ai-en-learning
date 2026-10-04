from pathlib import Path
import json,hashlib,tarfile,re
from datetime import datetime,timezone
D=Path(__file__).resolve().parents[1];R=D.parents[3];E=D/'evidence'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(R))
rec=json.loads((E/'UI21-reception.json').read_text())
assert json.loads((E/'UI21-static-results.json').read_text())['status']=='PASS'
assert json.loads((E/'UI21-browser-results.json').read_text())['status']=='PASS'
protected=rec['protected_sha256'];assert all(digest(R/n)==h for n,h in protected.items())
source={n:digest(R/n) for n in rec['source_before_sha256']}
source.update({rel(p):digest(p) for p in [D/'prototype/icons.js',D/'prototype/home-motion.js',*(D/'prototype/assets').iterdir()] if p.is_file()})
evidence={rel(p):digest(p) for p in E.iterdir() if p.is_file() and (p.name.startswith('UI21') or re.match(r'(verify|capture|assemble|freeze)-ui21',p.name)) and p.name!='UI21-freeze-results.json'}
archive=E/'M002-UI-21.tar.gz';assert not archive.exists(),'Frozen version already exists'
with tarfile.open(archive,'w:gz') as t:
 for n in sorted({**source,**evidence}):t.add(R/n,arcname=n)
manifest={'version':'M002-UI-21','status':'awaiting_user_review','owner':'designer-tony','input':'M002-PRODUCT-03','approval_of_input':'TRANSITION-M002-006','user_design_direction':'Fade toast in and out over 300ms, retain ten-second welcome dwell and top-layer continuity; honor reduced motion','created_at':datetime.now(timezone.utc).isoformat(),'source_sha256':source,'evidence_sha256':evidence,'scope':'Design revision only; no visual approval or stage transition','archive':rel(archive),'archive_sha256':digest(archive),'post_freeze_verification':rel(E/'UI21-freeze-results.json')}
for p in [E/'M002-UI-21-manifest.json',E/'design-manifest.json']:p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
checks=[]
with tarfile.open(archive) as t:
 for n,h in {**source,**evidence}.items():assert hashlib.sha256(t.extractfile(n).read()).hexdigest()==h==digest(R/n)
checks.append({'name':'Archive and disk match all source and evidence digests','status':'PASS','sources':len(source),'evidence':len(evidence)})
missing=[]
for p in [D/'design-spec.md',D/'interactions.md',D/'responsive-accessibility.md',D/'validation.md',D.parent/'handoffs/uiux.md']:
 for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  if not (p.parent/target.split('#')[0]).resolve().exists():missing.append(str(p)+':'+target)
assert not missing,missing
checks.append({'name':'All current document links resolve after freeze','status':'PASS'})
assert all(digest(R/n)==h for n,h in protected.items())
checks.append({'name':'Protected inputs, workflow and historical evidence unchanged','status':'PASS','files':len(protected)})
checks.append({'name':'Current and immutable manifests identical','status':'PASS' if (E/'design-manifest.json').read_bytes()==(E/'M002-UI-21-manifest.json').read_bytes() else 'FAIL'})
result={'version':'M002-UI-21','status':'PASS','checks':checks,'archive_sha256':digest(archive)}
(E/'UI21-freeze-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
