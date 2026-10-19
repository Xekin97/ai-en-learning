from pathlib import Path
from urllib.parse import unquote
import datetime,hashlib,json,re,yaml
root=Path.cwd()
ev=root/'.planning/milestones/M002/technical/pronunciation/evidence/frontend'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
inputs=json.loads((ev/'input-manifest.json').read_text())
controls=set(inputs['control_files'])
changed=[f for f,h in inputs['files'].items() if f not in controls and sha(root/f)!=h]
assert not changed,changed
s=yaml.safe_load((root/'.planning/workflow/state.yaml').read_text())
assert (s['milestone'],s['stage'],s['active_role'],s['active_agent'])==('M002','technical-design','frontend-architect/base','frontend-bob')
assert s['last_transition']['id']=='TRANSITION-M002-135'
assert sha(root/'.planning/workflow/history.yaml')==inputs['files']['.planning/workflow/history.yaml']
assert s['backend_submission']['release_ready'] is False
checks=[{'name':'role_and_history','result':'PASS'},{'name':'read_only_inputs','result':'PASS','count':len(inputs['files'])-len(controls)}]
for mf in [
 '.planning/milestones/M002/technical/pronunciation/evidence/backend/delivery-manifest.json',
 '.planning/milestones/M002/technical/pronunciation/evidence/database-delivery-manifest.json',
 '.planning/milestones/M002/design/pronunciation/evidence/M002-UI-32-R3-source-manifest.json',
 '.planning/milestones/M002/reviews/evidence/cr313-verification-entry-131/implementation-before.json']:
 d=json.loads((root/mf).read_text());files=d['files'];pairs=files.items() if isinstance(files,dict) else [(x['path'],x['sha256']) for x in files]
 assert all((root/f).exists() and sha(root/f)==h for f,h in pairs),mf
 if 'archive' in d:assert sha(root/d['archive'])==d['archive_sha256']
 checks.append({'name':mf,'result':'PASS','files_verified':len(files)})
# Submission/static receipts are created after this check; every other local link must exist now.
future={str(ev/'static-check.json'),str(root/'.planning/milestones/M002/reviews/evidence/pronunciation-frontend-submission-135/submission-receipt.json')}
docs=[root/'.planning/milestones/M002/technical/pronunciation/frontend.md',root/'.planning/milestones/M002/handoffs/pronunciation-frontend-architecture.md',root/'.planning/milestones/M002/changes/CR-315.md']
links=[]
for p in docs:
 for ref in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if ref.startswith(('https:','http:','#')):continue
  path=unquote(ref.split('#')[0]);target=(p.parent/path).resolve()
  assert target.exists() or str(target) in future,(str(p),ref)
  links.append({'source':str(p.relative_to(root)),'target':str(target.relative_to(root)),'exists':target.exists()})
checks.append({'name':'local_references','result':'PASS','links_checked':len(links),'expected_submission_receipts':2})
report={'version':'M002-FE-PRON-01','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Static source/preservation and document references only; not feature validation','result':'PASS','checks':checks,'links':links,'intake_evidence':'.planning/milestones/M002/technical/pronunciation/evidence/frontend/intake-probe.json','real_audio_verified':False,'application_tests_executed':False,'open_items':['CR-315','OPEN-401','OPEN-402','OPEN-403'],'runtime_model':'unknown'}
(ev/'static-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':report['result'],'checks':len(checks),'links':len(links),'real_audio_verified':False},ensure_ascii=False))
