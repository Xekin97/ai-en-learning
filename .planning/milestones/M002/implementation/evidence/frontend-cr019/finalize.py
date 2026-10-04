from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,tarfile,re,subprocess
e=Path(__file__).resolve().parent;r=e.parents[5];m=r/'.planning/milestones/M002'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text())
inputs=load(e/'inputs.json');protected=load(e/'protected-before.json')
mismatches=[k for k,v in protected.items() if not (r/k).is_file() or sha(r/k)!=v];assert not mismatches,mismatches
old=load(m/'implementation/evidence/frontend-cr017-018/manifest.json')['artifacts'];archived=[]
with tarfile.open(e/'before-owned.tar.gz') as t:
 for k,v in old.items():
  if k in inputs['owned']:
   assert hashlib.sha256(t.extractfile(k).read()).hexdigest()==v,k;archived.append(k)
  else:assert sha(r/k)==v,k
qa=m/'verification/evidence/qa2-015/manifest.json';q=load(qa)
assert all(sha(r/k)==v for k,v in q['files'].items())
source=load(e/'source.json')
with tarfile.open(e/'frontend-source.tar.gz') as t:
 for k,v in source['files'].items():assert sha(r/k)==v and hashlib.sha256(t.extractfile(k).read()).hexdigest()==v,k
build=load(e/'build-source.json');assert all(sha(Path(build['directory'])/k)==v for k,v in build['files'].items())
broken=[];anchors=[]
docs=[r/k for k in inputs['owned'] if k.endswith('.md')]+[e/'README.md']
for doc in docs:
 for target in re.findall(r'\]\(([^)]+)\)',doc.read_text()):
  if re.match(r'https?://',target):continue
  path,_,anchor=target.partition('#');p=(doc.parent/path).resolve()
  if p==e/'manifest.json':continue
  if not p.exists():broken.append({'document':str(doc.relative_to(r)),'target':target});continue
  if anchor and p.suffix=='.md':
   text=p.read_text();ids=re.findall(r'(?:id|name)=[\"\x27]([^\"\x27]+)',text)
   ids += [re.sub(r'[^\w\-\s]','',h).strip().lower().replace(' ','-') for h in re.findall(r'^#+\s+(.+)$',text,re.M)]
   ok=anchor in ids;anchors.append({'target':target,'valid':ok})
   if not ok:broken.append({'document':str(doc.relative_to(r)),'target':target})
assert not broken,broken
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=r).decode().split('\0')
allowed=set(protected)|set(inputs['owned']);prefix=str(e.relative_to(r))+'/'
unexpected=[p for p in paths if p and p not in allowed and not p.startswith(prefix) and (r/p).is_file()];assert not unexpected,unexpected
runtime=load(e/'runtime.json');assert runtime['exit_code']==0 and runtime['services_stopped'] and not runtime['listening_ports']
browser=load(e/'browser-results.json');assert len(browser['results'])==8 and all(x['result']=='PASS' for x in browser['results']) and not browser['runtime']
checks=load(e/'checks.json');assert all(x['exit_code']==0 for x in checks)
artifacts={str(p.relative_to(r)):sha(p) for p in sorted(e.rglob('*')) if p.is_file() and p.name!='manifest.json'}
artifacts.update({str(p.relative_to(r)):sha(p) for p in docs if not p.is_relative_to(e)})
manifest={'scope':'CR019 / FE2-R19 / QA2-F16','agent_name':'frontend-claire','authorization':'TRANSITION-M002-042','result':'implemented_pending_qa','finalized_at':datetime.now(timezone.utc).isoformat(),'source_file_count':len(source['files']),'production_changed_files':source['changed_files'],'compiled_file_count':build['file_count'],'developer_checks':checks,'target_unit_tests':7,'browser_cases':{'pass':8,'fail':0,'runtime_events':0,'environment':'production Nuxt + existing contract mock + approved prototype; no real backend retest'},'visual_inspection':'Representative zh390/zh1440 paired and en390 prototype screenshots viewed','protected_files':len(protected),'protected_mismatches':mismatches,'unexpected_new_files':unexpected,'prior_artifact_count':len(old),'prior_documents_archived_by_hash':archived,'prior_other_artifacts_unchanged':len(old)-len(archived),'qa15_manifest_sha256':sha(qa),'qa15_artifacts_unchanged':len(q['files']),'controls_unchanged':True,'backend_unchanged':True,'broken_links':broken,'anchor_checks':anchors,'services_stopped':True,'provider_calls':0,'cr_closed':False,'stage_transitioned':False,'uat_passed':False,'new_session_handoff_test':'not_executed','input_tokens':'unknown','runtime_model_switch':'not_performed','document_measurement':[{'file':str(p.relative_to(r)),'lines':len(p.read_text().splitlines()),'bytes':p.stat().st_size} for p in docs],'artifacts':artifacts}
(e/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['result','production_changed_files','protected_files','prior_documents_archived_by_hash','qa15_artifacts_unchanged','broken_links']},ensure_ascii=False))
