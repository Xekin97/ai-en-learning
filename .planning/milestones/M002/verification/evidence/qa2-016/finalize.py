from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,tarfile,re,subprocess,socket
q=Path(__file__).resolve().parent;r=q.parents[5];m=r/'.planning/milestones/M002'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();load=lambda p:json.loads(p.read_text())
inputs=load(q/'inputs.json');protected=load(q/'protected-before.json');owned=set(inputs['owned'])
mismatches=[k for k,v in protected.items() if not (r/k).is_file() or sha(r/k)!=v];assert not mismatches,mismatches
old=q.parent/'qa2-015';manifest=load(old/'manifest.json');assert sha(old/'manifest.json')==inputs['qa15_manifest_sha256']
with tarfile.open(q/'before-owned.tar.gz') as t:
 for k in owned:assert hashlib.sha256(t.extractfile(k).read()).hexdigest()==manifest['files'][k],k
for k,v in manifest['files'].items():
 if k not in owned:assert sha(r/k)==v,k
source_counts={};developer_artifacts={}
for component in ['frontend','backend']:
 d=m/'implementation/evidence'/inputs[component]['source'];source=load(d/'source.json');artifact=load(d/'manifest.json');files=artifact.get('artifacts',artifact.get('evidence_hashes'))
 assert sha(d/'source.json')==inputs[component]['source_manifest_sha256'];assert sha(d/'manifest.json')==inputs[component]['manifest_sha256']
 assert all(sha(r/k)==v for k,v in source['files'].items());assert all(sha(r/k)==v for k,v in files.items())
 source_counts[component]=len(source['files']);developer_artifacts[component]=len(files)
assert all(sha(Path(inputs['build_directory'])/k)==v for k,v in inputs['build_sha256'].items())
run=load(q/'control/results.json');assessment=load(q/'assessment.json');assert len(run['results'])==4 and all(x['result']=='PASS' for x in run['results']) and not run['runtime']
assert assessment['results']==[dict(x,source='control/results.json') for x in run['results']]
assert len(load(q/'results.json')['results'])==4 and all(x['result']=='FAIL' for x in load(q/'results.json')['results'])
for runtime in [q/'runtime.json',q/'control/runtime.json']:
 d=load(runtime);assert d['services_stopped'] and not d['listening_ports']
ports=[]
for port in [3300,3330,3332,38080]:
 with socket.socket() as sock:ports.append({'port':port,'listening':sock.connect_ex(('127.0.0.1',port))==0})
assert not any(p['listening'] for p in ports)
coverage=load(q/'coverage.json');counts={'capabilities':len(coverage['capabilities']),'pages':len(coverage['pages']),'views':sum(len(p['views']) for p in coverage['pages']),'ui_acceptance':sum(len(p['ui_acceptance']) for p in coverage['pages'])}
assert counts=={'capabilities':49,'pages':25,'views':28,'ui_acceptance':119}
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=r).decode().split('\0');allowed=set(protected)|owned;prefix=str(q.relative_to(r))+'/'
unexpected=[x for x in paths if x and (r/x).is_file() and x not in allowed and not x.startswith(prefix)];assert not unexpected,unexpected
broken=[];anchors=[];docs=[r/k for k in owned]+[q/'README.md']
for doc in docs:
 for raw in re.findall(r'\]\(([^)]+)\)',doc.read_text()):
  if re.match(r'https?://',raw):continue
  path,_,anchor=raw.partition('#');p=(doc.parent/path).resolve()
  if p in [q/'manifest.json',q/'finalization.json']:continue
  if not p.exists():broken.append({'document':str(doc.relative_to(r)),'target':raw});continue
  if anchor and p.suffix=='.md':
   text=p.read_text();ids=re.findall(r'(?:id|name)=[\"\x27]([^\"\x27]+)',text)+[re.sub(r'[^\w\-\s]','',h).strip().lower().replace(' ','-') for h in re.findall(r'^#+\s+(.+)$',text,re.M)]
   valid=anchor in ids;anchors.append({'target':raw,'valid':valid})
   if not valid:broken.append({'document':str(doc.relative_to(r)),'target':raw})
assert not broken,broken
result={'version':'M002-QA-16','authorization':'TRANSITION-M002-043','checked_at':datetime.now(timezone.utc).isoformat(),'protected_files':len(protected),'protected_mismatches':mismatches,'unexpected_new_files':unexpected,'source_files_unchanged':source_counts,'developer_artifacts_unchanged':developer_artifacts,'compiled_build_files_unchanged':len(inputs['build_sha256']),'qa15_artifact_count':len(manifest['files']),'qa15_current_documents_archived_by_exact_hash':sorted(owned),'qa15_other_artifacts_unchanged':len(manifest['files'])-len(owned),'qa15_original_result_preserved':manifest['result'],'coverage_counts':counts,'accepted_checks':{'total':4,'pass':4,'fail':0},'raw_initial_checks':{'total':4,'pass':0,'fail':4,'retained':True,'cause':'QA snapshot serialization assumption; corrected in separate control'},'ports':ports,'database_used':False,'local_provider_calls':0,'real_provider_calls':0,'application_changed':False,'control_files_changed':False,'stage_transitioned':False,'cr_closed':False,'developer_checks_rerun':False,'frontend_backend_rebuilt':False,'broken_links':broken,'anchor_checks':anchors,'new_session_handoff_test':'not_executed','input_tokens':'unknown','document_measurement':[{'file':str(p.relative_to(r)),'lines':len(p.read_text().splitlines()),'bytes':p.stat().st_size} for p in docs]}
(q/'finalization.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
artifacts={str(p.relative_to(r)):sha(p) for p in sorted(q.rglob('*')) if p.is_file() and p.name!='manifest.json'};artifacts.update({k:sha(r/k) for k in owned})
(q/'manifest.json').write_text(json.dumps({'version':'M002-QA-16','result':assessment['result'],'files':artifacts,'artifact_count':len(artifacts),'finalization':'finalization.json','assessment':'assessment.json','cr001':'closed original inheritance scope via042','cr002':'verified_pending_gate_scoped_closure','cr019':'verified_pending_gate_scoped_closure','uat':'NOT_EXECUTED'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':assessment['result'],'artifacts':len(artifacts),'protected_files':len(protected),'coverage':counts,'raw_failures_retained':True,'services_stopped':True,'broken_links':broken},ensure_ascii=False))
