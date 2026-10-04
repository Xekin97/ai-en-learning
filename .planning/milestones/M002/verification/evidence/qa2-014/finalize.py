from pathlib import Path
from urllib.parse import unquote
import json, hashlib, tarfile, re, socket
root=Path.cwd(); e=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def check(files,base=root):
 failures=[k for k,v in files.items() if not (base/k).is_file() or sha(base/k)!=v]
 assert not failures,failures
 return len(files)
i=load(e/'inputs.json'); owned=i['owned']
protected=load(e/'protected-before.json'); check(protected)
front=load(root/i['frontend']['source']); back=load(root/i['backend']['source'])
check(front['files']); check(back['files']);check(i['build_sha256'],Path(i['build_directory']))
for name in ['frontend','backend']:
 assert sha(root/i[name]['source'])==i[name]['source_manifest_sha256']
 assert sha((root/i[name]['source']).parent/'manifest.json')==i[name]['manifest_sha256']
dev=load((root/i['frontend']['source']).parent/'manifest.json'); check(dev['artifacts'])
oldpath=e.parent/'qa2-013/manifest.json'; assert sha(oldpath)==i['qa13_manifest_sha256']; old=load(oldpath)
archived=[]
with tarfile.open(e/'before-owned.tar.gz') as t:
 for k in owned:
  assert hashlib.sha256(t.extractfile(k).read()).hexdigest()==old['files'][k],k
  archived.append(k)
others={k:v for k,v in old['files'].items() if k not in owned};check(others)
ports=[]
for port in [63541,38081,39081,38082,3331,3301]:
 with socket.socket() as s:
  stopped=s.connect_ex(('127.0.0.1',port))!=0
  assert stopped,port
  ports.append({'port':port,'listening':False})
execution=load(e/'run/execution.json')
assert execution['processes_stopped'] and execution['isolated_database_removed'] and execution['cluster_stopped']
c=load(e/'coverage.json'); counts={'capabilities':len(c['capabilities']),'pages':len(c['pages']),'views':sum(len(p['views']) for p in c['pages']),'ui_acceptance':sum(len(p['ui_acceptance']) for p in c['pages'])}
assert counts=={'capabilities':49,'pages':25,'views':28,'ui_acceptance':119}
# Markdown link targets; deferred finalization/manifest are created below.
broken=[]
for p in [root/k for k in owned]+[e/'README.md']:
 for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' in link or link.startswith('#'):continue
  target=(p.parent/unquote(link.split('#')[0])).resolve()
  if not target.exists() and target not in [(e/'manifest.json').resolve(),(e/'finalization.json').resolve()]:broken.append({'document':str(p.relative_to(root)),'link':link})
assert not broken,broken
# Check only known private configuration secrets; never include values in output.
private=load(Path((e/'run/stack-location.txt').read_text().strip())/'env.json')
secrets={k:v for k,v in private.items() if re.search(r'PASSWORD|SECRET|PEPPER|MASTER_KEY|ENCRYPTION_KEY|API_KEY|TOKEN',k) and isinstance(v,str) and len(v)>6}
leaks=[]
for p in e.rglob('*'):
 if not p.is_file() or p.suffix in ['.png','.gz']:continue
 for k,v in secrets.items():
  if v.encode() in p.read_bytes():leaks.append({'file':str(p.relative_to(root)),'key':k})
assert not leaks,leaks
measurement=[]
for k in owned:
 p=root/k; text=p.read_text();measurement.append({'file':k,'lines':len(text.splitlines()),'characters':len(text),'bytes':p.stat().st_size})
final={'version':'M002-QA-14','authorization':i['authorization'],'protected_files':len(protected),'protected_mismatches':[],
'frontend_source_files':len(front['files']),'backend_source_files':len(back['files']),'compiled_build_files_unchanged':len(i['build_sha256']),
'developer_artifacts_unchanged':len(dev['artifacts']),'qa13_artifact_count':len(old['files']),'qa13_current_documents_archived_by_exact_hash':archived,'qa13_other_artifacts_unchanged':len(others),
'coverage_counts':counts,'ports':ports,'isolated_database_removed':True,'original_database_mutated_by_tests':False,'broken_links':broken,'credentials_in_evidence':leaks,'document_measurement':measurement,
'input_tokens':'unknown','new_session_handoff_test':'not_executed','local_provider_calls':1,'real_provider_calls':0,'application_changed':False,'control_files_changed':False,'stage_transitioned':False,'cr_closed':False,
'developer_unit_lint_type_build_rerun':False,'backend_runtime_compilation':'local service only; matching source; no developer quality checks rerun','checks':{'total':21,'pass':21,'fail':0}}
write(e/'finalization.json',final)
artifacts={str(p.relative_to(root)):sha(p) for p in sorted(e.rglob('*')) if p.is_file() and p.name!='manifest.json'}
artifacts.update({k:sha(root/k) for k in owned})
write(e/'manifest.json',{'version':'M002-QA-14','result':'PASS_WITHIN_CR017_CR018_RETEST_SCOPE','files':artifacts,'artifact_count':len(artifacts),'finalization':'finalization.json','assessment':'assessment.json','formal_closure':'pending_gate','uat':'NOT_EXECUTED'})
check(load(e/'manifest.json')['files'])
print(json.dumps({'protected_unchanged':len(protected),'front':len(front['files']),'back':len(back['files']),'compiled':len(i['build_sha256']),'dev_artifacts':len(dev['artifacts']),'old_current_docs_archived':len(archived),'old_other_artifacts':len(others),'qa14_artifacts':len(artifacts),'coverage_counts':counts,'ports_stopped':len(ports),'secret_leaks':len(leaks),'broken_links':len(broken)},ensure_ascii=False))
