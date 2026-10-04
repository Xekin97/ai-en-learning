from pathlib import Path
import hashlib,json,re,tarfile,yaml,subprocess
R=Path('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning');D=R/'.planning/milestones/M002/design';E=D/'evidence';checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name,ok,details=None):checks.append({'name':name,'pass':bool(ok),'details':details})
for f in ['frontend-cr024','backend-cr013']:
 p=R/f'.planning/milestones/M002/implementation/evidence/{f}/source.json';d=json.loads(p.read_text())['files'];changed=[n for n,h in d.items() if sha(R/n)!=h];check(f+' application sources unchanged',not changed,{'count':len(d),'changed':changed})
with tarfile.open(D.parent/'reviews/evidence/product-design-062/received-product04.tar.gz') as tf:
 changed=[];count=0
 for m in tf.getmembers():
  if m.isfile():
   count+=1;p=R/m.name
   if not p.exists() or p.read_bytes()!=tf.extractfile(m).read():changed.append(m.name)
 check('PRODUCT04 received snapshot unchanged',not changed,{'count':count,'changed':changed})
m=json.loads((E/'M002-UI-22-H01-manifest.json').read_text());check('UI22-H01 archive retained',sha(R/m['archive'])==m['archive_sha256'])
m=json.loads((E/'M002-UI-22-manifest.json').read_text());check('UI22 approved archive retained',sha(R/m['archive'])==m['archive_sha256'])
st=yaml.safe_load((R/'.planning/workflow/state.yaml').read_text());check('designer active; no approval or transition implied',st['stage']=='uiux-design' and st['active_agent']=='designer-tony' and st['last_transition']['decision_id']=='TRANSITION-M002-062' and st['design_approval']['version']=='M002-UI-22')
tr=json.loads((D/'traceability.json').read_text());pages={x['page'] for x in tr};views={v for x in tr for v in x['views']};caps={c for x in tr for c in x['capability_ids']};check('All inherited pages/capabilities and new UIA kept',len(pages)==25 and len(views)==28 and len(caps)==49 and all('UIA-GLOBAL-SELECT23' in x['additional_ui_acceptance'] for x in tr),{'pages':len(pages),'views':len(views),'capabilities':len(caps)})
copy=json.loads((D/'copy.json').read_text())['static'];new=['notice.reading','preset.meanings','preset.meanings.pending','why.eyebrow','why.title','why.choose.title','why.choose.desc','why.ai.title','why.ai.desc','why.language.title','why.language.desc'];check('New fixed copy in both UI languages',all(lang+'.'+k in copy for lang in ['zh','en'] for k in new))
node='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node';bad=[]
for p in (D/'prototype').glob('*.js'):
 r=subprocess.run([node,'--check',str(p)],capture_output=True,text=True)
 if r.returncode:bad.append({'file':p.name,'error':r.stderr})
check('Prototype JavaScript syntax',not bad,bad)
docs=[D/n for n in ['design-spec.md','interactions.md','responsive-accessibility.md','frontend-delta.md','validation.md']]+[D.parent/'handoffs/uiux.md'];missing=[];count=0;future={'M002-UI-23.tar.gz','M002-UI-23-manifest.json','UI23-static.json','UI23-freeze.json'}
for p in docs:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  q=(p.parent/target.split('#')[0]).resolve();count+=1
  if not q.exists() and q.name not in future:missing.append({'source':str(p.relative_to(R)),'target':target})
check('Current document links resolve',not missing,{'count':count,'missing':missing})
check('Current doc version consistent',all('version: M002-UI-23' in p.read_text() and 'approval: pending_new_visual_review' in p.read_text() for p in docs))
report={'version':'M002-UI-23','checks':checks,'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','real_provider_calls':0,'production_tests':0,'tokens':'unknown'}
(E/'UI23-static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(report['status']!='PASS')
