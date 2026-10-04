from pathlib import Path
from urllib.parse import unquote
import json,hashlib,tarfile,re,socket,subprocess
root=Path.cwd();e=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();load=lambda p:json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def check(files,base=root):
 bad=[k for k,v in files.items() if not (base/k).is_file() or sha(base/k)!=v];assert not bad,bad
 return len(files)
i=load(e/'inputs.json');owned=i['owned'];protected=load(e/'protected-before.json');check(protected)
front=load(root/i['frontend']['source']);back=load(root/i['backend']['source']);check(front['files']);check(back['files']);check(i['build_sha256'],Path(i['build_directory']))
for name in ['frontend','backend']:
 assert sha(root/i[name]['source'])==i[name]['source_manifest_sha256'];assert sha((root/i[name]['source']).parent/'manifest.json')==i[name]['manifest_sha256']
dev=load((root/i['frontend']['source']).parent/'manifest.json');check(dev['artifacts'])
oldpath=e.parent/'qa2-014/manifest.json';assert sha(oldpath)==i['qa14_manifest_sha256'];old=load(oldpath)
with tarfile.open(e/'before-owned.tar.gz') as t:
 for k in owned:assert hashlib.sha256(t.extractfile(k).read()).hexdigest()==old['files'][k],k
others={k:v for k,v in old['files'].items() if k not in owned};check(others)
ports=[]
for port in [63541,38081,39081,38082,3331,3301,3391]:
 with socket.socket() as s:assert s.connect_ex(('127.0.0.1',port))!=0,port
 ports.append({'port':port,'listening':False})
executions={}
for name in ['run','control','keyboard-control','confirmed-control','final-control']:
 x=load(e/name/'execution.json');assert all(x[k] for k in ['processes_stopped','isolated_database_removed','cluster_stopped']);assert x['localProviderCalls']==x['realProviderCalls']==0;executions[name]=x
c=load(e/'coverage.json');counts={'capabilities':len(c['capabilities']),'pages':len(c['pages']),'views':sum(len(p['views']) for p in c['pages']),'ui_acceptance':sum(len(p['ui_acceptance']) for p in c['pages'])};assert counts=={'capabilities':49,'pages':25,'views':28,'ui_acceptance':119}
a=load(e/'assessment.json');assert (a['accepted_checks'],a['passed'],a['failed'])==(9,8,1)
for x in a['results']:
 d=load(e/x['source'])
 if x['id']=='I01':assert d['result']=='FAIL'
 else:assert next(r for r in d['results'] if r['id']==x['id'])['result']=='PASS'
cr=root/'.planning/milestones/M002/changes/CR-019.md'
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0');allowed=set(owned)|{str(cr.relative_to(root))};prefix=str(e.relative_to(root))+'/'
new=[k for k in paths if k and (root/k).is_file() and k not in protected and k not in allowed and not k.startswith(prefix)];assert not new,new
broken=[];anchor_checks=[]
for p in [root/k for k in owned]+[e/'README.md',cr]:
 for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' in link or link.startswith('#'):continue
  target,_,anchor=link.partition('#');path=(p.parent/unquote(target)).resolve()
  if path in [(e/'manifest.json').resolve(),(e/'finalization.json').resolve()]:continue
  if not path.exists():broken.append({'document':str(p.relative_to(root)),'link':link});continue
  if anchor and path.suffix=='.md':
   txt=path.read_text();slugs=[re.sub(r'[^\w\-\s]','',h.lower()).replace(' ','-') for h in re.findall(r'^#{1,6}\s+(.+)$',txt,re.M)]
   valid=anchor in slugs or bool(re.search(r'id=[\"\']'+re.escape(anchor)+r'[\"\']',txt));anchor_checks.append({'target':link,'valid':valid})
   if not valid:broken.append({'document':str(p.relative_to(root)),'link':link})
assert not broken,broken
private=load(Path((e/'final-control/stack-location.txt').read_text().strip())/'env.json');secrets={k:v for k,v in private.items() if re.search(r'PASSWORD|SECRET|PEPPER|MASTER_KEY|ENCRYPTION_KEY|API_KEY|TOKEN',k) and isinstance(v,str) and len(v)>6};leaks=[]
for p in e.rglob('*'):
 if not p.is_file() or p.suffix in ['.png','.gz']:continue
 for k,v in secrets.items():
  if v.encode() in p.read_bytes():leaks.append({'file':str(p.relative_to(root)),'key':k})
assert not leaks,leaks
measurement=[{'file':k,'lines':len((root/k).read_text().splitlines()),'characters':len((root/k).read_text()),'bytes':(root/k).stat().st_size} for k in owned]
write(e/'finalization.json',{'version':'M002-QA-15','authorization':i['authorization'],'protected_files':len(protected),'protected_mismatches':[],'unexpected_new_files':new,'frontend_source_files':len(front['files']),'backend_source_files':len(back['files']),'compiled_build_files_unchanged':len(i['build_sha256']),'developer_artifacts_unchanged':len(dev['artifacts']),'qa14_artifact_count':len(old['files']),'qa14_current_documents_archived_by_exact_hash':owned,'qa14_other_artifacts_unchanged':len(others),'coverage_counts':counts,'ports':ports,'cloned_databases_removed':len(executions),'original_database_mutated_by_tests':False,'broken_links':broken,'anchor_checks':anchor_checks,'credentials_in_evidence':leaks,'document_measurement':measurement,'input_tokens':'unknown','new_session_handoff_test':'not_executed','local_provider_calls':0,'real_provider_calls':0,'application_changed':False,'control_files_changed':False,'stage_transitioned':False,'cr_closed':False,'new_cr':'M002-CR-019 awaiting gate registration','developer_checks_rerun':False,'frontend_backend_rebuilt':False,'accepted_checks':{'total':9,'pass':8,'fail':1},'raw_failures_retained':True})
artifacts={str(p.relative_to(root)):sha(p) for p in sorted(e.rglob('*')) if p.is_file() and p.name!='manifest.json'};artifacts.update({k:sha(root/k) for k in owned});artifacts[str(cr.relative_to(root))]=sha(cr)
write(e/'manifest.json',{'version':'M002-QA-15','result':'FAIL_TITLE_EDIT_ICON_FIDELITY','files':artifacts,'artifact_count':len(artifacts),'finalization':'finalization.json','assessment':'assessment.json','cr001':'scoped closure recommended','cr002':'retain pending CR019 fidelity','cr019':'new P3 awaiting gate registration','uat':'NOT_EXECUTED'})
check(load(e/'manifest.json')['files'])
print(json.dumps({'protected':len(protected),'front':len(front['files']),'back':len(back['files']),'build':len(i['build_sha256']),'qa14_old_documents_archived':5,'qa14_other_unchanged':len(others),'qa15_artifacts':len(artifacts),'clones_removed':len(executions),'ports_stopped':len(ports),'links_broken':0,'accepted':{'pass':8,'fail':1}},ensure_ascii=False))
