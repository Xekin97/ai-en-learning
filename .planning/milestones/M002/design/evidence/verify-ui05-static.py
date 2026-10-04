from pathlib import Path
import hashlib,json,re,tarfile
D=Path(__file__).resolve().parents[1];R=D.parents[3]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
report={'version':'M002-UI-05','scope':'Design structure and protected-input integrity; not UI or product acceptance','checks':[]}
def check(name,ok,details=None):report['checks'].append({'name':name,'status':'PASS' if ok else 'FAIL','details':details})
rec=json.loads((D/'evidence/UI05-reception.json').read_text());changed=[n for n,h in rec['protected'].items() if not (R/n).exists() or digest(R/n)!=h]
check('Approved product, reviews, CR and workflow controls unchanged',not changed,{'files':len(rec['protected']),'changed':changed})
check('Before-design snapshot recoverable and hash-matched',digest(R/rec['prior_snapshot'])==rec['prior_snapshot_sha256'])
T=json.loads((D/'traceability.json').read_text());views=[v for row in T for v in row['views']]
check('25 current pages, 28 unique prototype views',len(T)==25 and len(views)==len(set(views))==28)
caps=set().union(*(set(r['capability_ids']) for r in T));expected=set(re.findall(r'^## (CAP-\d+)',(D.parent/'product/abilities.md').read_text(),re.M))
check('Every current product capability maps to a design page',caps==expected,{'mapped':len(caps),'missing':sorted(expected-caps)})
data=set().union(*(set(r['data_ids']) for r in T));data_expected=set('DATA-'+str(n).zfill(3) for n in [*range(1,19),*range(201,215)])-{'DATA-015'}
check('31 active data assets trace to design; replaced DATA-015 excluded',data==data_expected,{'missing':sorted(data_expected-data)})
spec=(D/'design-spec.md').read_text();app=(D/'prototype/app.js').read_text();missing=[]
for r in T:
 if r['ui_acceptance'] not in spec:missing.append(r['ui_acceptance'])
 for v in r['views']:
  if not re.search(r'\b'+v+r': "'+r['page']+'"',app):missing.append(v)
check('Prototype PAGE bindings and all local UI acceptance entries agree',not missing,missing)
copy=json.loads((D/'copy.json').read_text());keys=set(copy['static'])|set(copy['templates']);duplicates=set(copy['static'])&set(copy['templates']);unpaired=[k for k in keys if ('en.'+k[3:] if k.startswith('zh.') else 'zh.'+k[3:]) not in keys]
check('Shared copy has no duplicate keys and both UI languages',not duplicates and not unpaired,{'keys':len(keys),'duplicate':sorted(duplicates),'unpaired':unpaired})
missingcopy=[]
for p in (D/'prototype').glob('*.js'):
 for k in re.findall(r'\bt\(["\']([^"\']+)["\']\s*[,)]',p.read_text()):
  for l in ['zh','en']:
   if l+'.'+k not in keys:missingcopy.append(str(p.name)+':'+l+'.'+k)
check('Literal rendered copy keys resolve in both languages',not missingcopy,sorted(set(missingcopy)))
check('Every current module parses',all(__import__('subprocess').run(['node','--check',str(p)],capture_output=True).returncode==0 for p in (D/'prototype').glob('*.js')))
check('Current design source metadata agrees',all('version: M002-UI-05' in (D/p).read_text() for p in ['design-spec.md','interactions.md','responsive-accessibility.md','validation.md']))
report['status']='PASS' if all(c['status']=='PASS' for c in report['checks']) else 'FAIL'
(D/'evidence/UI05-static-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False));raise SystemExit(report['status']!='PASS')
