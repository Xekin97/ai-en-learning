from pathlib import Path
import json,re,hashlib,subprocess,datetime,yaml

ROOT=Path(__file__).resolve().parents[5]
M=ROOT/'.planning/milestones/M002'
E=M/'technical/evidence'
REPORT=E/'M002-FE-01-check.json'
if REPORT.exists(): raise SystemExit('Refusing to overwrite an existing evidence report')
def read(p): return (ROOT/p).read_text()
def sha(p): return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
plan=(M/'technical/frontend.md').read_text()
handoff=(M/'handoffs/frontend-architecture.md').read_text()
cr=(M/'changes/CR-004.md').read_text()
trace=json.loads((M/'technical/frontend-traceability.json').read_text())
ui=json.loads((M/'design/traceability.json').read_text())
inputs=json.loads((E/'M002-FE-01-inputs.json').read_text())
browser=json.loads((E/'M002-FE-01-prototype.json').read_text())
state=yaml.safe_load(read('.planning/workflow/state.yaml'))
checks=[]
def check(id,label,ok,details=None): checks.append(dict(id=id,label=label,status='PASS' if ok else 'FAIL',details=details))
check('FE2-S01','Active authorized frontend role',state['active_agent']=='frontend-bob' and state['active_role']=='frontend-architect/base' and state['stage']=='technical-design')
protected=[x['path'] for x in inputs['protected_files'] if not (ROOT/x['path']).is_file() or sha(x['path'])!=x['sha256']]
check('FE2-S02','All pre-existing bytes preserved',not protected,{'protected':len(inputs['protected_files']),'changed':protected})
checks_input=[]
for version,digest in [('M002-BE-02','975171990e515a40c71c618577b79f562d9ceace828d50cff57ffc3d6d2d9d5e'),('M002-DB-02','7771a8a773c370524e79414a0882580879933c1dc72c9a33173ab84642b3a9c7')]:
 checks_input.append(sha(f'.planning/milestones/M002/technical/evidence/{version}.tar.gz')==digest)
dm=json.loads((M/'design/evidence/design-manifest.json').read_text())
checks_input += [sha(dm['archive'])==dm['archive_sha256'],sha(dm['approved_design_archive'])==dm['approved_design_archive_sha256']]
check('FE2-S03','Approved snapshots and design inputs',all(checks_input) and all(sha(p)==h for p,h in dm['source_sha256'].items()))
project=yaml.safe_load(read('.planning/agt/project.yaml'))
base=project['agt_base'];profile=base['profile']
pinned=subprocess.check_output(['git','show',base['git_revision']+':'+profile['source']],cwd=ROOT/'../agt-coding-v2')
check('FE2-S04','Pinned Profile lock',hashlib.sha256(pinned).hexdigest()==profile['sha256'] and profile['reference']=='consumer-ai-web@1.0.0')
pages=trace['pages']; expected={x['page'] for x in ui}
check('FE2-S05','25 PAGE and 28 view coverage',{p['page'] for p in pages}==expected and sum(len(p['views']) for p in pages)==28)
caps=set(re.findall(r'^\| (CAP-\d{3}) \|',(M/'technical/backend.md').read_text(),re.M))
check('FE2-S06','49 CAP with nonempty page destinations',{x['capability'] for x in trace['capabilities']}==caps and len(caps)==49 and all(x['pages'] for x in trace['capabilities']))
check('FE2-S07','31 active DATA plus explicit replaced DATA-015',len(trace['active_data'])==31 and trace['replaced_data'][0]['id']=='DATA-015' and trace['replaced_data'][0]['replacement']=='DATA-202')
def uis(rows):return {a for x in rows for a in [x['ui_acceptance'],*x.get('additional_ui_acceptance',[])]}
current={a for p in pages for a in p['ui_acceptance']}
check('FE2-S08','119 approved UIA exact coverage',current==uis(ui) and len(current)==119)
check('FE2-S09','12 M001 destinations and all FDE',len(trace['m001_pages'])==12 and all(set(v)<=expected for v in trace['m001_pages'].values()) and {x['id'] for x in trace['design_deltas']}=={f'FDE-{i:02}' for i in range(1,10)})
check('FE2-S10','View/component/model/API/verification links',all(v['components'] and v['application_models'] and v['apis'] and v['verification'] and v['plan'].split('#')[1] in re.findall(r'<a id="([^"]+)"',plan) for p in pages for v in p['views']))
anchors=set(re.findall(r'<a id="([^"]+)"',plan))
check('FE2-S11','17 runtime verification and implementation tasks declared',set(re.findall(r'\| (FE2-V\d{2}) \|',plan))=={f'FE2-V{i:02}' for i in range(1,18)} and all(f'FE2-I{i:02}' in plan for i in range(7)))
check('FE2-S12','Contract gaps visible and not silently resolved',all(x in cr and x in plan and x in handoff for x in ['FE2-G01','FE2-G02','FE2-G03']) and 'M002-CR-004' in handoff and 'BLOCKED' in handoff and 'awaiting_user_review' in plan and 'awaiting_specialist_reception' in cr)
check('FE2-S13','Local-draft/ephemeral-comparison and recovery boundaries explicitly designed',all(s in plan for s in ['IndexedDB','localRevision','BroadcastChannel','BFCache','has_answer=null','already_submitted','base/trial','pagehide','不存题面','不重建答案对照']))
check('FE2-S14','SSR and typed data boundary explicitly designed',all(s in plan for s in ['SSR','request revision','epoch','mapper','BigInt','Amount','AST','SafeNoticeBody','Promise.allSettled']))
copy=json.loads((M/'design/copy.json').read_text())
icons=json.loads((M/'design/prototype/assets/lucide.json').read_text())
check('FE2-S15','Actual copy and local icon source shapes received',len(copy['static'])==1300 and len(copy['templates'])==64 and len(icons['icons'])==48 and all(k in copy['static'] for k in ['zh.welcome.today','en.welcome.today','zh.g.welcome.new']) and 'g.welcome.new' in plan)
check('FE2-S16','Prototype reception 56 real browser entries',browser['status']=='PASS' and len(browser['checks'])==56 and all(x['status']=='PASS' for x in browser['checks']) and browser['production_verified'] is False,{'browser':browser['browser'],'scope':'Reduced-motion approved prototype entry reception only'})
future={'M002-FE-01-check.json','M002-FE-01-manifest.json'}
missing=[]
for relative in ['technical/frontend.md','handoffs/frontend-architecture.md','changes/CR-004.md']:
 f=M/relative
 for link in re.findall(r'\]\(([^)]+)\)',f.read_text()):
  path=link.split('#')[0]
  if not path or '://' in path:continue
  target=(f.parent/path).resolve()
  if not target.exists() and target.name not in future: missing.append((relative,link))
check('FE2-S17','Source and handoff relative links resolve',not missing,missing)
check('FE2-S18','Runtime limitations and role handoff preserved',all(s in handoff for s in ['CR039-L1','CR042-L1','AI-QUALITY-90','CR003','dba-diana','backend-alex','frontend-bob','无委派授权']) and '不启动实现' in handoff)
files=subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
old={x['path'] for x in inputs['protected_files']}
new=sorted(p for p in set(files)-old if p and (ROOT/p).is_file())
allowed=[p for p in new if p.startswith('.planning/milestones/M002/technical/evidence/') or p in ['.planning/milestones/M002/technical/frontend.md','.planning/milestones/M002/technical/frontend-traceability.json','.planning/milestones/M002/handoffs/frontend-architecture.md','.planning/milestones/M002/changes/CR-004.md']]
check('FE2-S19','Only professional design/evidence additions; HEAD unchanged',new==allowed and subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()==inputs['head'],{'new_files':new})
check('FE2-S20','Full inherited admin, personal views and timing semantics',all(v in {x['prototype_view'] for p in pages for x in p['views']} for v in ['models','plans','users','userdetail','credits','operations','messages','presets','metrics','adminhome','profile','growth','bag','shop']) and all(s in plan for s in ['10s','300ms','04','滚动24h','session_revision']))
report={'version':'M002-FE-01','recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PASS' if all(c['status']=='PASS' for c in checks) else 'FAIL','checks':checks,'semantic_contract_alignment':'BLOCKED_CR004','production_tests':False,'real_ai_calls':0,'stage_transition':False}
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'checks':len(checks),'failures':[c for c in checks if c['status']!='PASS'],'contract_alignment':report['semantic_contract_alignment']},ensure_ascii=False))
raise SystemExit(0 if report['status']=='PASS' else 1)
