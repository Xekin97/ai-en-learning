from pathlib import Path
import hashlib,json,tarfile,re,socket,subprocess
r=Path(__file__).resolve().parents[6];e=Path(__file__).resolve().parent;m=r/'.planning/milestones/M002'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,d):(e/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
i=json.loads((e/'inputs.json').read_text());protected=json.loads((e/'protected-before.json').read_text())
changed=[p for p,h in protected.items() if not (r/p).is_file() or sha(r/p)!=h];assert not changed,changed
existing=set(subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=r).decode().split('\0'))
unexpected=[p for p in existing if p and (r/p).is_file() and p not in protected and p not in i['owned'] and not p.startswith(str(e.relative_to(r))+'/')];assert not unexpected,unexpected
old=json.loads((m/'verification/evidence/qa2-017/manifest.json').read_text())['files'];archived=[];unchanged=[]
with tarfile.open(e/'before-owned.tar.gz') as tar:
 for p,h in old.items():
  if p in i['owned']:assert hashlib.sha256(tar.extractfile(p).read()).hexdigest()==h,p;archived.append(p)
  else:assert sha(r/p)==h,p;unchanged.append(p)
for p,h in i['build_sha256'].items():assert sha(Path(i['build_directory'])/p)==h,p
links=[];missing=[]
for name in i['owned']:
 p=r/name
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if target.startswith(('https:','http:','#','mailto:')):continue
  target=target.split('#')[0];dest=(p.parent/target).resolve();links.append({'from':name,'target':target})
  if not dest.exists() and dest not in [e/'manifest.json',e/'finalization.json']:missing.append(str(dest))
assert not missing,missing
ports=[]
for port in [3300,3330,3332,38080]:
 with socket.socket() as sock:
  if sock.connect_ex(('127.0.0.1',port))==0:ports.append(port)
assert not ports,ports
runtime=json.loads((e/'runtime.json').read_text());assert runtime['services_stopped'] and runtime['exit_code']==0 and not runtime['listening_ports'] and runtime['provider_calls']==0
coverage=json.loads((e/'coverage.json').read_text());assert len(coverage['capabilities'])==49 and len(coverage['pages'])==25 and sum(len(p['ui_acceptance']) for p in coverage['pages'])==119
results=json.loads((e/'results.json').read_text());assert len(results)==4 and all(x['status']=='PASS' and not x['runtime'] and all(t['pass'] for t in x['checks']) for x in results)
save('finalization.json',{'version':'M002-QA-18','protected_files':len(protected),'protected_differences':changed,'unexpected_new_files':unexpected,'qa17_archived_owned':archived,'qa17_unchanged_artifacts':len(unchanged),'build_files_unchanged':len(i['build_sha256']),'local_markdown_links_checked':len(links),'missing_links':missing,'services_stopped':True,'listening_ports':ports,'source_and_control_unchanged':True,'retested_change_request':'M002-CR-020 PASS ready_for_scoped_closure','effective_cases':4,'passed':4,'failed':0,'counts':{'capabilities':49,'pages':25,'views':28,'uia':119},'uat':'not_executed','new_session_handoff_test':'not_executed'})
files=[*[r/p for p in i['owned']],*[p for p in e.rglob('*') if p.is_file() and p.name!='manifest.json']];mapping={str(p.relative_to(r)):sha(p) for p in sorted(files)}
save('manifest.json',{'version':'M002-QA-18','result':'PASS_WITHIN_CR020_SCOPE','files':mapping,'artifact_count':len(mapping),'assessment':'assessment.json','finalization':'finalization.json','new_findings':[],'retested_findings':['QA2-F17 / CR020'],'whole_milestone':'verification_in_progress','uat':'not_executed'})
print(json.dumps({'artifacts':len(mapping),'protected_files':len(protected),'previous_archived':len(archived),'previous_unchanged':len(unchanged),'links':len(links),'result':'4 PASS / 0 FAIL','manifest_sha256':sha(e/'manifest.json')}))
