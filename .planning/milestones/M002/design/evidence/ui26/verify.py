from pathlib import Path
import json,hashlib,re,subprocess,yaml,tarfile
R=Path(__file__).resolve().parents[6];D=R/'.planning/milestones/M002/design';E=D/'evidence';checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name,ok,details=None):checks.append({'name':name,'pass':bool(ok),'details':details})
rec=json.loads((E/'ui26/reception.json').read_text());diff=[n for n,h in rec['protected_sha256'].items() if sha(R/n)!=h];check('Received product and control records unchanged',not diff,diff)
for group in ['frontend-cr024','backend-cr013']:
 files=json.loads((D.parent/f'implementation/evidence/{group}/source.json').read_text())['files'];diff=[n for n,h in files.items() if sha(R/n)!=h];check(group+' source unchanged',not diff,{'files':len(files),'changed':diff})
m=json.loads((E/'M002-UI-25-manifest.json').read_text());check('UI25 frozen archive and evidence retained',sha(R/m['archive'])==m['archive_sha256'] and all(sha(R/n)==h for n,h in m['evidence_sha256'].items()))
changed=[n for n,h in m['source_sha256'].items() if sha(R/n)!=h];allowed=['design-spec.md','copy.json','frontend-delta.md','interactions.md','prototype/app.js','prototype/index.html','prototype/presets.js','responsive-accessibility.md','theme.css','traceability.json','validation.md'];paths={str((D/n).relative_to(R)) for n in allowed}|{str((D.parent/'handoffs/uiux.md').relative_to(R))};check('Only scoped existing design sources changed',set(changed)==paths,changed)
tr=json.loads((D/'traceability.json').read_text());counts={'pages':len({x['page'] for x in tr}),'views':len({v for x in tr for v in x['views']}),'capabilities':len({c for x in tr for c in x['capability_ids']})};check('Inherited scope and new picker trace',counts=={'pages':25,'views':28,'capabilities':49} and all(any(x['page']==p and aid in x['additional_ui_acceptance'] for x in tr)for p,aid in [('PAGE-204','UIA-PAGE-204-WORDS26'),('PAGE-212','UIA-PAGE-212-WORDS26')]),counts)
C=json.loads((D/'copy.json').read_text());flat={**C['static'],**C['templates']}
with tarfile.open(R/m['archive'])as tf:before=json.load(tf.extractfile(str((D/'copy.json').relative_to(R))))
old={**before['static'],**before['templates']};newkeys=set(flat)-set(old);expected={lang+'.picker.'+k for lang in ['zh','en'] for k in ['placeholder','selected','empty','options','chosen','clear','none','loading','error','full','count','remaining','added','removed','matches']};check('Additive bilingual picker copy; inherited copy unchanged',newkeys==expected and all(flat[k]==v for k,v in old.items()) and not set(C['static']).intersection(C['templates']),{'added':len(newkeys)})
check('Picker template parameters match',all(set(re.findall(r'\{(\w+)\}',flat[l+'.picker.'+k]))=={v}for l in ['zh','en']for k,v in [('count','count'),('remaining','count'),('matches','count'),('added','word'),('removed','word')]))
node='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node';bad=[]
for name in ['app.js','presets.js','word-picker.js']:
 p=subprocess.run([node,'--check',str(D/'prototype'/name)],capture_output=True,text=True)
 if p.returncode:bad.append(name+': '+p.stderr)
check('Changed JavaScript syntax',not bad,bad)
docs=[D/n for n in ['design-spec.md','frontend-delta.md','interactions.md','responsive-accessibility.md','validation.md']]+[D.parent/'handoffs/uiux.md'];future={'M002-UI-26-manifest.json','M002-UI-26.tar.gz','UI26-static.json','UI26-freeze.json'};missing=[];count=0
for p in docs:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  count+=1;q=(p.parent/target.split('#')[0]).resolve()
  if not q.exists() and q.name not in future:missing.append({'file':str(p.relative_to(R)),'target':target})
check('Current design links and versions',not missing and all('version: M002-UI-26' in p.read_text() and 'approval: pending_new_visual_review' in p.read_text() for p in docs),{'links':count,'missing':missing})
for report,expected in [('browser.json',167),('interaction-check.json',18)]:
 b=json.loads((E/'ui26'/report).read_text());check(report+' passes',b['status']=='PASS' and len(b['checks'])==expected and all(x['pass'] for x in b['checks']))
retest=json.loads((E/'ui26/interaction-check.json').read_text());check('Browser-checked source unchanged',all(sha(D/n)==h for n,h in retest['source_sha256'].items()))
v=json.loads((E/'ui26/visual-review.json').read_text());check('Four inspected representative images match',v['status']=='PASS' and len(v['images'])==4 and all(x['inspected']and sha(E/'ui26'/x['file'])==x['sha256'] for x in v['images']))
st=yaml.safe_load((R/'.planning/workflow/state.yaml').read_text());check('Design scope only; cache decision still OPEN',st['active_agent']=='designer-tony' and st['last_transition']['decision_id']=='TRANSITION-M002-064' and 'D2-88-LOCAL-SCOPE' in st['pending_user_decisions'] and st['design_approval']['version']=='M002-UI-22')
result={'version':'M002-UI-26','status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','checks':checks,'real_provider_calls':0,'production_tests':0,'tokens':'unknown'};(E/'UI26-static.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(checks),'failed':[x for x in checks if not x['pass']]},ensure_ascii=False,indent=2));raise SystemExit(result['status']!='PASS')
