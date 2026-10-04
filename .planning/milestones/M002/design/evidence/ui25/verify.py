from pathlib import Path
import json,hashlib,re,subprocess,yaml
R=Path(__file__).resolve().parents[6];D=R/'.planning/milestones/M002/design';E=D/'evidence';checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name,ok,details=None):checks.append({'name':name,'pass':bool(ok),'details':details})
rec=json.loads((E/'ui25/reception.json').read_text());diff=[n for n,h in rec['protected_sha256'].items() if sha(R/n)!=h];check('Received product and control records unchanged',not diff,diff)
for group in ['frontend-cr024','backend-cr013']:
 files=json.loads((D.parent/f'implementation/evidence/{group}/source.json').read_text())['files'];diff=[n for n,h in files.items() if sha(R/n)!=h];check(group+' source unchanged',not diff,{'files':len(files),'changed':diff})
m=json.loads((E/'M002-UI-24-manifest.json').read_text());check('UI24 frozen archive and evidence retained',sha(R/m['archive'])==m['archive_sha256'] and all(sha(R/n)==h for n,h in m['evidence_sha256'].items()))
changed=[n for n,h in m['source_sha256'].items() if sha(R/n)!=h];allowed=['design-spec.md','copy.json','frontend-delta.md','interactions.md','prototype/app.js','prototype/index.html','prototype/learning.js','responsive-accessibility.md','theme.css','traceability.json','validation.md'];paths={str((D/n).relative_to(R)) for n in allowed}|{str((D.parent/'handoffs/uiux.md').relative_to(R))};check('Only scoped design source files changed',set(changed)==paths,changed)
tr=json.loads((D/'traceability.json').read_text());counts={'pages':len({x['page'] for x in tr}),'views':len({v for x in tr for v in x['views']}),'capabilities':len({c for x in tr for c in x['capability_ids']})};public={'home','explore','create','library','batch','range','sessiondone','login','register','review','overview','summary','profile','notices','growth','bag','shop','trial'};check('Inherited scope and public copy trace',counts=={'pages':25,'views':28,'capabilities':49} and all('UIA-GLOBAL-COPY25' in x['additional_ui_acceptance'] for x in tr if public.intersection(x['views'])),counts)
C=json.loads((D/'copy.json').read_text());a=json.loads((E/'ui25/copy-audit.json').read_text());flat={**C['static'],**C['templates']};issues=[]
for change in a['changes']:
 k=change['key']
 if (k in flat if change['action']=='remove' else flat.get(k)!=change['after']):issues.append(k)
 if change['action']=='rewrite' and set(re.findall(r'\{(\w+)\}',change['before']))!=set(re.findall(r'\{(\w+)\}',change['after'])):issues.append('variables:'+k)
check('Copy audit matches source and variables preserved',not issues,{'entries':len(a['changes']),'issues':issues})
node='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node';bad=[]
for name in ['app.js','learning.js']:
 p=subprocess.run([node,'--check',str(D/'prototype'/name)],capture_output=True,text=True)
 if p.returncode:bad.append(name+': '+p.stderr)
check('Changed JavaScript syntax',not bad,bad)
docs=[D/n for n in ['design-spec.md','frontend-delta.md','interactions.md','responsive-accessibility.md','validation.md']]+[D.parent/'handoffs/uiux.md'];future={'M002-UI-25-manifest.json','M002-UI-25.tar.gz','UI25-static.json','UI25-freeze.json'};missing=[];count=0
for p in docs:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  count+=1;q=(p.parent/target.split('#')[0]).resolve()
  if not q.exists() and q.name not in future:missing.append({'file':str(p.relative_to(R)),'target':target})
check('Current design links and versions',not missing and all('version: M002-UI-25' in p.read_text() and 'approval: pending_new_visual_review' in p.read_text() for p in docs),{'links':count,'missing':missing})
for report,expected in [('browser.json',113),('trial-recheck.json',8)]:
 b=json.loads((E/'ui25'/report).read_text());check(report+' passes',b['status']=='PASS' and len(b['checks'])==expected and all(x['pass'] for x in b['checks']))
retest=json.loads((E/'ui25/trial-recheck.json').read_text());check('Final trial sources match retest',all(sha(D/n)==h for n,h in retest['source_sha256'].items()))
st=yaml.safe_load((R/'.planning/workflow/state.yaml').read_text());check('Design scope only; cache decision still OPEN',st['active_agent']=='designer-tony' and st['last_transition']['decision_id']=='TRANSITION-M002-064' and 'D2-88-LOCAL-SCOPE' in st['pending_user_decisions'] and st['design_approval']['version']=='M002-UI-22')
result={'version':'M002-UI-25','status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','checks':checks,'real_provider_calls':0,'production_tests':0,'tokens':'unknown'};(E/'UI25-static.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(result['status']!='PASS')
