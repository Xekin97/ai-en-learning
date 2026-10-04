from pathlib import Path
import hashlib,json,tarfile,re,socket,datetime
root=Path.cwd();p=root/'.planning/milestones/M002/verification/evidence/qa2-005'; inputs=json.loads((p/'inputs.json').read_text())
def sha(v):return hashlib.sha256(v).hexdigest()
def filehash(f):return sha(Path(f).read_bytes())
def dump(path,a):Path(path).write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
protected=[]
for f,h in inputs['protected_files'].items():
 if not (root/f).is_file() or filehash(root/f)!=h:protected.append(f)
assert not protected,protected
sources={}
for name,d in inputs['source_checks'].items():
 s=root/d['source'];assert filehash(s)==d['sha256'];a=json.loads(s.read_text());files=a['files'];mismatch=[f for f,h in files.items() if not (root/f).is_file() or filehash(root/f)!=h];assert not mismatch,mismatch;sources[name]={**d,'files_match':True}
with tarfile.open(p/'before-owned.tar.gz') as tar:archived={f:tar.extractfile(f).read() for f in tar.getnames()}
for f,h in inputs['owned_before'].items():assert sha(archived[f])==h,f
recovery={}
for name,mp in [('qa04',root/'.planning/milestones/M002/verification/evidence/qa2-004/manifest.json'),('frontend-cr010',root/'.planning/milestones/M002/implementation/evidence/frontend-cr010/manifest.json')]:
 hashes=json.loads(mp.read_text())['artifact_hashes'];unchanged=old=0
 for f,h in hashes.items():
  if (root/f).is_file() and filehash(root/f)==h:unchanged+=1
  elif f in archived and sha(archived[f])==h:old+=1
  else:raise AssertionError('History changed: '+f)
 recovery[name]={'total':len(hashes),'unchanged':unchanged,'archived_before_edit':old}
ports={}
for port in inputs['ports_before']:
 with socket.socket() as s:s.settimeout(.2);ports[port]=s.connect_ex(('127.0.0.1',int(port)))==0
assert all(ports[x] for x in ['3300','3330','38080','4186']),ports
assert not any(ports[x] for x in ['3301','3331','38081','38082','39081','63541']),ports
scenarios=[]
for fn,ids in [('analytics-results.json',['V01','V02','V03','V04']),('business-results.json',['V05','V06','V07','V09','V10']),('random-v2-results.json',['V08']),('inherited-results.json',['V11','V12','V13','V14'])]:
 a=json.loads((p/fn).read_text());
 for x in a['results']:
  if x['id'] in ids:scenarios.append({**x,'source':fn})
scenarios.sort(key=lambda x:int(x['id'][1:]));assert len(scenarios)==14 and len({x['id'] for x in scenarios})==14
assert sum(x['result']=='PASS' for x in scenarios)==13
coverage=json.loads((p/'coverage.json').read_text());oldcoverage=json.loads((p.parent/'qa2-004/coverage.json').read_text())
assert [c['capability'] for c in coverage['capabilities']]==[c['capability'] for c in oldcoverage['capabilities']]
assert [c['page'] for c in coverage['pages']]==[c['page'] for c in oldcoverage['pages']]
assert [u['id'] for c in coverage['pages'] for u in c['ui_acceptance']]==[u['id'] for c in oldcoverage['pages'] for u in c['ui_acceptance']]
counts={'capabilities':len(coverage['capabilities']),'pages':len(coverage['pages']),'views':sum(len(x['views']) for x in coverage['pages']),'uia':sum(len(x['ui_acceptance']) for x in coverage['pages'])}
assert counts=={'capabilities':49,'pages':25,'views':28,'uia':119}
owned=list(inputs['owned_before'])+['.planning/milestones/M002/changes/CR-011.md'];entry=owned[:5]
# Create placeholder so links to the manifest resolve; final manifest never hashes itself.
(p/'manifest.json').touch()
files=list(p.rglob('*'));md=[root/f for f in owned]+[p/'README.md'];missing=[];links=0
for f in md:
 for target in re.findall(r'\]\(([^)]+)\)',f.read_text()):
  if target.startswith(('http:','https:','app:','#')):continue
  target=target.split('#',1)[0].strip('<>')
  if not target:continue
  links+=1
  if not (f.parent/target).exists():missing.append({'file':str(f.relative_to(root)),'target':target})
assert not missing,missing
manifest={'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'qa-quinn','milestone':'M002','version':'M002-QA-05','authorization':'TRANSITION-M002-028','result':{'overall':'FAIL','passed_scenarios':13,'failed_scenarios':1,'cr010':'verified_pending_gate','cr011':'OPEN / QA2-F07 / P2','scenarios':scenarios},'source_checks':sources,'protected_audit':{'count':len(inputs['protected_files']),'changed':protected},'original_artifact_recovery':recovery,'artifact_link_check':{'links':links,'missing':missing},'coverage_index':counts,'document_read_size':{'unit':'utf8_bytes','scope':'same five QA entry documents','before':sum(len(archived[f]) for f in entry),'after':sum((root/f).stat().st_size for f in entry)},'real_provider_calls':0,'local_provider_calls':6,'developer_checks_rerun':False,'fixes_applied':False,'stage_transition':False,'committed':False,'deployed':False,'environment':{'owned_services_stopped':True,'original_previews_retained':True,'listening':ports},'new_session_handoff_test':{'executed':False,'reason':'No delegated/new-session experiment authorized; static checks are separate'},'input_tokens':'unknown','artifact_hashes':{},'hash_note':'QA05 evidence and owned current documents; manifest excludes itself. Original QA04 six mutable files recover from before-owned. All raw previous evidence, developer artifacts, source and control files unchanged.'}
for f in sorted(set([root/x for x in owned]+[x for x in p.rglob('*') if x.is_file() and x.name!='manifest.json'])):manifest['artifact_hashes'][str(f.relative_to(root))]=filehash(f)
dump(p/'manifest.json',manifest)
print(json.dumps({k:manifest[k] for k in ['protected_audit','original_artifact_recovery','artifact_link_check','coverage_index','document_read_size','environment']},ensure_ascii=False));print('Artifacts:',len(manifest['artifact_hashes']),'PASS 13 / FAIL 1')
