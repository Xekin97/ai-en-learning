from pathlib import Path
import json,hashlib,tarfile,difflib,subprocess,re
from datetime import datetime,timezone
b=Path('.planning/milestones/M002/implementation/evidence/frontend-cr010')
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,d): Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
before=json.loads((b/'before.json').read_text())
results=json.loads((b/'browser-v4/results.json').read_text())
assert len(results['results'])==26 and all(x['result']=='PASS' for x in results['results'])
assert json.loads((b/'time-copy/result.json').read_text())['result']=='PASS'
files=json.loads(Path('.planning/milestones/M002/implementation/evidence/frontend-cr009/source.json').read_text())['files']
modified='frontend/app/pages/admin/analytics.vue'; added='frontend/tests/integration/m002-analytics-layout.mjs'
assert [f for f,h in files.items() if sha(f)!=h]==[modified]
files[modified]=sha(modified);files[added]=sha(added);files=dict(sorted(files.items()))
dump(b/'source.json',{'files':files})
with tarfile.open(b/'frontend-source.tar.gz','w:gz') as t:
 for f in files: t.add(f,arcname=f,recursive=False)
with tarfile.open(b/'frontend-source.tar.gz') as t:
 assert len(t.getnames())==len(files)==277
 assert all(hashlib.sha256(t.extractfile(f).read()).hexdigest()==h for f,h in files.items())
with tarfile.open(b/'before-owned.tar.gz') as t:
 old=t.extractfile(modified).read().decode()
 recoverable=[f for f,h in before['owned_before'].items() if hashlib.sha256(t.extractfile(f).read()).hexdigest()==h]
 assert len(recoverable)==4
patch=''.join(difflib.unified_diff(old.splitlines(True),Path(modified).read_text().splitlines(True),fromfile='a/'+modified,tofile='b/'+modified))
patch+=''.join(difflib.unified_diff([],Path(added).read_text().splitlines(True),fromfile='/dev/null',tofile='b/'+added))
(b/'source-diff.patch').write_text(patch)
def changed(items): return [f for f,h in items.items() if not Path(f).is_file() or sha(f)!=h]
protected=changed(before['protected_files']);assert not protected,protected
qa=json.loads(Path('.planning/milestones/M002/verification/evidence/qa2-004/manifest.json').read_text())['artifact_hashes'];assert not changed(qa)
backend=json.loads(Path('.planning/milestones/M002/implementation/evidence/backend-cr007/source.json').read_text())['files'];assert not changed(backend)
documents=[f for f in before['owned_before']]+[added]
broken=[];links=0
for f in documents+[str(b/'README.md')]:
 if not f.endswith('.md'):continue
 for target in re.findall(r'\]\(([^\s)]+)\)',Path(f).read_text()):
  if target.startswith(('http:','https:','mailto:','#')):continue
  target=target.split('#')[0];links+=1
  resolved=(Path(f).parent/target).resolve()
  if resolved!=(b/'manifest.json').resolve() and not resolved.exists():broken.append([f,target])
assert not broken,broken
ports={}
for port in [3301,3331,38081,39081,63541,3300,3330,38080,4186]:
 ports[str(port)]=subprocess.run(['lsof','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True).returncode==0
assert not any(ports[str(x)] for x in [3301,3331,38081,39081,63541]),ports
assert all(ports[str(x)] for x in [3300,3330,38080,4186]),ports
checks={}
for name,command,log in [('unit','pnpm test','unit.log'),('typecheck','pnpm typecheck','typecheck-v4.log'),('lint','pnpm lint','lint-v4.log'),('format','pnpm format:check','format-v4.log'),('boundaries','pnpm lint:boundaries','boundaries-v4.log'),('build','node ../'+str(b/'build.mjs'),'build-v4.log')]:
 checks[name]={'command':command,'cwd':'frontend','log':log,'sha256':sha(b/log),'exit_code':0}
checks['unit'].update(files=29,passed=309,note='Unchanged business logic; final template/CSS changes do not affect covered logic.')
checks['boundaries'].update(modules=242,dependencies=271)
checks['browser']={'command':'node frontend/tests/integration/m002-analytics-layout.mjs <new-output-dir>','cwd':'.','result':'browser-v4/results.json','exit_code':0,'passed':26,'engines':['chromium','firefox','webkit'],'widths':[320,390,1280,1440],'periods':[7,30],'languages':['en','zh'],'scope':'Chromium full language/width/period matrix; Firefox/WebKit representative 30-day sizes; unknown/no-sample/observing; API/table/keyboard/geometry; scoped axe and runtime'}
checks['time_copy']={'script':'time-copy.mjs','result':'time-copy/result.json','exit_code':0,'languages':['en','zh'],'engine':'webkit'}
audit={'protected_count':len(before['protected_files']),'unexpected_changes':protected,'qa04_artifacts_unchanged':len(qa),'backend_source_files_unchanged':len(backend),'old_current_documents_recoverable':recoverable,'source_files_matched':len(files),'source_archive_round_trip':True,'links_checked':links,'broken_links':broken}
m={'role':'frontend-claire','authorization':'TRANSITION-M002-027','milestone':'M002','result':'cr010_implemented_pending_qa','date':datetime.now(timezone.utc).isoformat(),'design':'UI22/H01','git_head':before['git_head'],'committed':False,'deployed':False,'risk':'normal: page-local analytics layout and timestamp hydration','node':'24.21.0','pnpm':'10.33.0','source':'source.json','source_sha256':sha(b/'source.json'),'source_files':len(files),'archive':'frontend-source.tar.gz','archive_sha256':sha(b/'frontend-source.tar.gz'),'archive_round_trip':'277 source hashes match archive and working files','current_documents':{f:sha(f) for f in documents},'checks':checks,'source_changes':{'modified':[modified],'added':[added]},'preserved_failures':{'before-browser/results.json':'Old production build: 320px viewport / 770px document','browser/results.json':'4 layout/label failures plus SQL preparation error; attempt-1 source and build preserved','browser-v2/results.json':'Missing local SSR backend origin; setup did not reach analytics','browser-verified/results.json':'25 PASS / runtime FAIL; WebKit hydration mismatch','browser-final/results.json':'25 PASS / runtime FAIL persists after waiting for networkidle','hydration-diagnostic.log':'Diagnostic build identifies Intl separator mismatch: comma vs at; resolved through NuxtTime in v4'},'qa_status':'CR010 independent verification pending; QA04 remains FAIL; CR009 scoped closure 027 retained','limitations':['Scoped analytics visual and axe verification, not full UIA','No physical devices, manual screen reader, production proxy/deployment or full performance acceptance','New-session independent handoff test not executed'],'real_provider_calls':0,'local_provider_calls':0,'stage_transition':False,'runtime_model_switch':'not_performed','delegation':False,'protected_audit':audit,'environment':{'listening':ports,'owned_services_stopped':True,'prior_previews_preserved':True,'private_temporary_data_preserved':True,'isolated_builds_preserved':True},'input_tokens':'unknown','artifact_hashes':{str(p):sha(p) for p in sorted(b.rglob('*')) if p.is_file() and p.name!='manifest.json'},'hash_note':'Excludes this manifest itself. Current mutable role docs archived before edits; prior QA04/control/CR/approved artifacts and evidence unchanged.'}
dump(b/'manifest.json',m)
assert (b/'manifest.json').is_file()
print(json.dumps({'source_files':len(files),'artifact_hashes':len(m['artifact_hashes']),'protected_audit':audit,'environment':m['environment']},ensure_ascii=False,indent=2))
