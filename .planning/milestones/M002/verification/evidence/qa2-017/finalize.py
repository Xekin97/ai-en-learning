from pathlib import Path
import hashlib,json,tarfile,re,socket
r=Path(__file__).resolve().parents[6];e=Path(__file__).resolve().parent;m=r/'.planning/milestones/M002'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,d):(e/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
inputs=json.loads((e/'inputs.json').read_text());protected=json.loads((e/'protected-before.json').read_text())
changed=[p for p,h in protected.items() if not (r/p).is_file() or sha(r/p)!=h];assert not changed,changed
old=json.loads((m/'verification/evidence/qa2-016/manifest.json').read_text())['files'];archived=[];unchanged=[]
with tarfile.open(e/'before-owned.tar.gz') as archive:
 for p,h in old.items():
  if p in inputs['owned']:assert hashlib.sha256(archive.extractfile(p).read()).hexdigest()==h,p;archived.append(p)
  else:assert sha(r/p)==h,p;unchanged.append(p)
for p,h in inputs['build_sha256'].items():assert sha(Path(inputs['build_directory'])/p)==h,p
owned=[r/p for p in inputs['owned']];cr=m/'changes/CR-020.md';links=[];missing=[]
# Finalization/manifest are produced below; all other local Markdown links must resolve now.
for p in [*owned,cr]:
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if target.startswith(('https:','http:','#','mailto:')):continue
  target=target.split('#')[0];dest=(p.parent/target).resolve();links.append({'from':str(p.relative_to(r)),'target':target})
  if not dest.exists() and dest not in [e/'manifest.json',e/'finalization.json']:missing.append(str(dest))
assert not missing,missing
ports=[]
for port in [3300,3330,3332,38080]:
 with socket.socket() as sock:
  if sock.connect_ex(('127.0.0.1',port))==0:ports.append(port)
assert not ports,ports
for p in ['runtime.json','control/runtime.json','keyboard-control/runtime.json']:
 d=json.loads((e/p).read_text());assert d['services_stopped'] and not d['listening_ports'] and d['provider_calls']==0
coverage=json.loads((e/'coverage.json').read_text());assert len(coverage['capabilities'])==49 and len(coverage['pages'])==25 and sum(len(p['ui_acceptance']) for p in coverage['pages'])==119
assessment=json.loads((e/'assessment.json').read_text());assert assessment['passed']==14 and assessment['failed']==4
save('finalization.json',{'version':'M002-QA-17','protected_files':len(protected),'protected_differences':changed,'qa16_archived_owned':archived,'qa16_unchanged_artifacts':len(unchanged),'build_files_unchanged':len(inputs['build_sha256']),'local_markdown_links_checked':len(links),'missing_links':missing,'services_stopped':True,'listening_ports':ports,'source_and_control_unchanged':True,'new_change_request':'M002-CR-020 pending_gate','effective_cases':18,'passed':14,'failed':4,'counts':{'capabilities':49,'pages':25,'views':28,'uia':119},'uat':'not_executed','note':'Validation of local file targets only; finalization and manifest links resolved by generation in this script. No new session handoff experiment.'})
files=[*owned,cr,*[p for p in e.rglob('*') if p.is_file() and p.name!='manifest.json']];mapping={str(p.relative_to(r)):sha(p) for p in sorted(files)}
save('manifest.json',{'version':'M002-QA-17','result':'FAIL','files':mapping,'artifact_count':len(mapping),'assessment':'assessment.json','finalization':'finalization.json','new_findings':['QA2-F17 / CR020'],'closed_before_round':['CR001 via042','CR002/019 via044'],'uat':'not_executed'})
print(json.dumps({'artifacts':len(mapping),'protected_files':len(protected),'previous_archived':len(archived),'previous_unchanged':len(unchanged),'links':len(links),'result':'14 PASS / 4 FAIL','manifest_sha256':sha(e/'manifest.json')},ensure_ascii=False))
