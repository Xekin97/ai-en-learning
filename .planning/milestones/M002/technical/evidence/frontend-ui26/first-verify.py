from pathlib import Path
import json,re,hashlib,tarfile,urllib.request,yaml
D=Path(__file__).resolve().parents[2];M=D.parent;R=M.parents[2];E=D/'evidence/frontend-ui26';checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(n,ok,d=None):checks.append({'name':n,'pass':bool(ok),'details':d})
rec=json.loads((E/'reception.json').read_text());diff=[n for n,h in rec['protected_sha256'].items()if not(R/n).exists()or sha(R/n)!=h];check('All protected sources unchanged',not diff,{'files':len(rec['protected_sha256']),'changed':diff})
s=yaml.safe_load((R/'.planning/workflow/state.yaml').read_text());check('Correct active role, approval and pending branch preserved',s['stage']=='technical-design'and s['active_agent']=='frontend-bob'and s['design_approval']['version']=='M002-UI-26'and'D2-88-LOCAL-SCOPE'in s['pending_user_decisions'])
t=json.loads((D/'frontend-traceability.json').read_text());design=json.loads((M/'design/traceability.json').read_text());lookup={x['page']:x for x in t['pages']};missing=[]
for d in design:
 ids=set(re.findall(r'UIA-[A-Z0-9-]+',d['ui_acceptance'])+d.get('additional_ui_acceptance',[]));covered=set(lookup[d['page']]['ui_acceptance']);missing.extend(sorted(ids-covered))
counts={'pages':len(lookup),'views':sum(len(p['views'])for p in t['pages']),'capabilities':len(t['capabilities']),'m001_pages':len(t['m001_pages']),'ui_acceptance':len({x for p in t['pages']for x in p['ui_acceptance']})}
check('All inherited scope and UI26 acceptances traced',not missing and counts['pages']==25 and counts['views']==28 and counts['capabilities']==49 and counts['m001_pages']==12,{'counts':counts,'missing':missing})
with tarfile.open(E/'before-sources.tar.gz')as tf:
 old=json.load(tf.extractfile(str((D/'frontend-traceability.json').relative_to(R))))
 for p in old['pages']:
  current=lookup[p['page']];check('Preserve '+p['page'],set(p['ui_acceptance'])<=set(current['ui_acceptance'])and p['capabilities']==current['capabilities']and p['data']==current['data']and {v['route']for v in p['views']}=={v['route']for v in current['views']})
selects={}
for p in(R/'frontend/app').rglob('*.vue'):
 n=len(re.findall(r'<select\b',p.read_text()))
 if n:selects[str(p.relative_to(R))]=n
check('Actual native single-select migration inventory',len(selects)==9 and sum(selects.values())==19,selects)
codefiles=['frontend/app/presentation/components/GenerationWorkspace.vue','frontend/app/presentation/components/AppDialog.vue','frontend/app/presentation/components/NoticeHost.vue','frontend/app/presentation/components/SafeNoticeBody.vue','frontend/app/pages/notices.vue','frontend/app/pages/admin/notices.vue','frontend/app/pages/admin/presets.vue','frontend/app/pages/explore.vue','frontend/app/pages/index.vue','frontend/app/runtime/stores/generation.ts','frontend/app/runtime/stores/admin-presets.ts','frontend/app/application/admin/presets.ts','frontend/app/application/shared/models.ts','frontend/app/application/shared/ports.ts','frontend/app/infrastructure/http/mappers/presets-mapper.ts','frontend/app/infrastructure/http/mappers/admin-presets-mapper.ts','frontend/app/infrastructure/http/schemas/admin-presets.ts','frontend/scripts/sync-design.mjs','backend/internal/httpapi/server.go','backend/internal/httpapi/catalog_handlers.go','backend/internal/generation/presets.go']
check('Existing implementation mapping paths exist',all((R/p).is_file()for p in codefiles))
api=(D/'api/generation-presets.md').read_text();handler=(R/'backend/internal/httpapi/catalog_handlers.go').read_text();check('Admin contract discrepancy explicitly tracked','（V/L）：q1–64字符'in api and'func (server *Server) vocabularySearch'in handler and any(g['id']=='FE3-G01'and g['status'].startswith('open_')for g in t['contract_gaps']))
check('Historical gaps are closed without deleting trace',all(g['status']=='design_closed'for g in t['contract_gaps']if g['id'].startswith('FE2-')))
plan=(D/'frontend.md').read_text();check('Six implementable task boundaries and nine validation groups',all(f'FE3-I{i:02}'in plan for i in range(1,7))and all(f'FE3-V{i:02}'in plan for i in range(1,10)))
copy=json.loads((M/'design/copy.json').read_text());flat={**copy['static'],**copy['templates']};keys=['picker.placeholder','picker.selected','picker.empty','picker.options','picker.chosen','picker.clear','picker.none','picker.loading','picker.error','picker.full','picker.count','picker.remaining','picker.added','picker.removed','picker.matches','preset.meanings','preset.meanings.pending','why.title']
check('New source copy keys exist in both languages',all(l+'.'+k in flat for l in ['zh','en']for k in keys))
check('No invented vocabulary DTO identifiers in plan','API004 只返回 entry 文本和 vocabulary_version，没有词条 ID'in plan and'绝不能据原型注释虚构 entry_id'in plan)
future={'M002-FE-03-check.json','M002-FE-03-manifest.json','M002-FE-03.tar.gz'};bad=[];links=0
for p in [D/'frontend.md',M/'handoffs/frontend-architecture.md',M/'changes/CR-027.md']:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','mailto:')):continue
  dest,_,anchor=target.partition('#');dest=re.sub(r':\d+$','',dest);q=(p.parent/dest).resolve()if dest else p
  links+=1
  if not q.exists()and q.name not in future:bad.append({'file':str(p.relative_to(R)),'target':target})
check('Current document links resolve',not bad,{'links':links,'missing':bad})
for doc in [D/'frontend.md',M/'handoffs/frontend-architecture.md']:check(doc.name+' version and limits', 'M002-FE-03'in doc.read_text()and'CR027'in doc.read_text()and'CR026'in doc.read_text())
try:
 response=urllib.request.urlopen('http://127.0.0.1:4186/prototype/?page=create&lang=zh&v=M002-UI-26',timeout=5);body=response.read().decode();http={'status':response.status,'ui26_assets':'M002-UI-26'in body};check('Existing prototype service available',http['status']==200 and http['ui26_assets'],http)
except Exception as e:check('Existing prototype service available',False,str(e))
inputs={'version':'M002-FE-03','received_design':'M002-UI-26','approval':'APPROVAL-M002-065','code_paths_sha256':{n:sha(R/n)for n in codefiles},'native_select_inventory':selects,'design_reused_reports':[str((M/'design/evidence'/n).relative_to(R))for n in ['ui26/browser.json','ui26/interaction-check.json','ui26/visual-review.json','UI26-static.json']],'new_browser_tests':0,'new_screenshots':0,'dependency_changes':0,'contract_gap':'FE3-G01 / M002-CR-027'}
(E/'inputs.json').write_text(json.dumps(inputs,ensure_ascii=False,indent=2)+'\n')
result={'version':'M002-FE-03','status':'PASS'if all(c['pass']for c in checks)else'FAIL','delivery_status':'SCOPED_CONTRACT_GAP','checks':checks,'open_gaps':['FE3-G01 / CR027'],'production_tests':0,'real_provider_calls':0,'tokens':'unknown'};(D/'evidence/M002-FE-03-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(checks),'failed':[c for c in checks if not c['pass']]},ensure_ascii=False,indent=2));raise SystemExit(result['status']!='PASS')
