from pathlib import Path
import hashlib,json,re,tarfile,subprocess
R=Path(__file__).resolve().parents[6]
D=R/'.planning/milestones/M002/design'
E=D/'evidence'
checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name,ok,details=None):checks.append({'name':name,'pass':bool(ok),'details':details})
rec=json.loads((E/'ui24/reception.json').read_text())
changed=[n for n,h in rec['protected_sha256'].items() if not (R/n).exists() or sha(R/n)!=h]
check('Product and workflow unchanged',not changed,{'count':len(rec['protected_sha256']),'changed':changed})
for group in ['frontend-cr024','backend-cr013']:
 data=json.loads((R/f'.planning/milestones/M002/implementation/evidence/{group}/source.json').read_text())['files']
 changed=[n for n,h in data.items() if not (R/n).exists() or sha(R/n)!=h]
 check(group+' application sources unchanged',not changed,{'count':len(data),'changed':changed})
for version in ['M002-UI-22','M002-UI-22-H01','M002-UI-23']:
 m=json.loads((E/(version+'-manifest.json')).read_text())
 check(version+' frozen archive retained',sha(R/m['archive'])==m['archive_sha256'])
 if version=='M002-UI-23':
  allowed={f['path'] for f in rec['staged_files']}
  changed=[n for n,h in m['source_sha256'].items() if sha(R/n)!=h]
  check('Only scoped UI24 design sources changed',set(changed)==allowed,{'count':len(changed),'files':changed})
  changed_evidence=[n for n,h in m['evidence_sha256'].items() if sha(R/n)!=h]
  check('UI23 original evidence retained',not changed_evidence,{'count':len(m['evidence_sha256']),'changed':changed_evidence})
with tarfile.open(D.parent/'reviews/evidence/product-design-062/received-product04.tar.gz') as tf:
 changed=[m.name for m in tf.getmembers() if m.isfile() and (not (R/m.name).exists() or (R/m.name).read_bytes()!=tf.extractfile(m).read())]
 check('Received PRODUCT04 unchanged',not changed,changed)
tr=json.loads((D/'traceability.json').read_text())
counts={'pages':len({x['page'] for x in tr}),'views':len({v for x in tr for v in x['views']}),'capabilities':len({c for x in tr for c in x['capability_ids']})}
check('Inherited scope and new UIA preserved',counts=={'pages':25,'views':28,'capabilities':49} and any(x['page']=='PAGE-207' and 'UIA-PAGE-207-LIST24' in x['additional_ui_acceptance'] for x in tr),counts)
node='/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node'
syntax=subprocess.run([node,'--check',str(D/'prototype/app.js')],capture_output=True,text=True)
check('Changed prototype JavaScript syntax',syntax.returncode==0,syntax.stderr)
docs=[D/n for n in ['design-spec.md','frontend-delta.md','interactions.md','responsive-accessibility.md','validation.md']]+[D.parent/'handoffs/uiux.md']
future={'M002-UI-24.tar.gz','M002-UI-24-manifest.json','UI24-static.json','UI24-freeze.json'}
missing=[];count=0
for p in docs:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  q=(p.parent/target.split('#')[0]).resolve();count+=1
  if not q.exists() and q.name not in future:missing.append({'source':str(p.relative_to(R)),'target':target})
check('Design links resolve',not missing,{'count':count,'missing':missing})
check('Current versions and review status consistent',all('version: M002-UI-24' in p.read_text() and 'status: awaiting_user_review' in p.read_text() and 'approval: pending_new_visual_review' in p.read_text() and 'staged_unverified' not in p.read_text() for p in docs))
b=json.loads((E/'ui24/browser.json').read_text())
check('Browser results pass and screenshot budget respected',b['status']=='PASS' and len(b['checks'])==41 and all(c['pass'] for c in b['checks']) and b['screenshots']==rec['screenshot_budget']==3,{'checks':len(b['checks']),'screenshots':b['screenshots']})
report={'version':'M002-UI-24','status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','checks':checks,'real_provider_calls':0,'production_tests':0,'tokens':'unknown'}
(E/'UI24-static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(report['status']!='PASS')
