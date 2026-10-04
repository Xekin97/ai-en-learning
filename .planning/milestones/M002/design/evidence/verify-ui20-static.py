from pathlib import Path
import hashlib,json,re,tarfile
D=Path(__file__).resolve().parents[1];R=D.parents[3]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
report={'version':'M002-UI-20','scope':'Design structure and protected-input integrity; not UI or product acceptance','checks':[]}
def check(name,ok,details=None):report['checks'].append({'name':name,'status':'PASS' if ok else 'FAIL','details':details})
rec=json.loads((D/'evidence/UI20-reception.json').read_text());changed=[n for n,h in rec['protected_sha256'].items() if not (R/n).exists() or digest(R/n)!=h]
check('Approved product, reviews, CR and workflow controls unchanged',not changed,{'files':len(rec['protected_sha256']),'changed':changed})
check('Before-design snapshot recoverable and hash-matched',digest(R/rec['old_source_snapshot'])==rec['old_source_snapshot_sha256'])
T=json.loads((D/'traceability.json').read_text());views=[v for row in T for v in row['views']]
check('25 current pages, 28 unique prototype views',len(T)==25 and len(views)==len(set(views))==28)
caps=set().union(*(set(r['capability_ids']) for r in T));expected=set(re.findall(r'^## (CAP-\d+)',(D.parent/'product/abilities.md').read_text(),re.M))
check('Every current product capability maps to a design page',caps==expected,{'mapped':len(caps),'missing':sorted(expected-caps)})
data=set().union(*(set(r['data_ids']) for r in T));data_expected=set('DATA-'+str(n).zfill(3) for n in [*range(1,19),*range(201,215)])-{'DATA-015'}
check('31 active data assets trace to design; replaced DATA-015 excluded',data==data_expected,{'missing':sorted(data_expected-data)})
spec=(D/'design-spec.md').read_text();app=(D/'prototype/app.js').read_text();missing=[]
for r in T:
 for a in [r['ui_acceptance'],*r.get('additional_ui_acceptance',[])]:
  if a not in spec:missing.append(a)
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
check('Current design source metadata agrees',all('version: M002-UI-20' in (D/p).read_text() for p in ['design-spec.md','interactions.md','responsive-accessibility.md','validation.md','../handoffs/uiux.md']))

check('Every page uses approved PRODUCT-03',all(r['source_version']=='M002-PRODUCT-03' for r in T))
check('CAP-220 maps to library and batch',all('CAP-220' in r['capability_ids'] for r in T if r['page'] in ['PAGE-005','PAGE-006']))
F=json.loads((D/'prototype/fixtures.json').read_text());presets=(D/'prototype/presets.js').read_text()
check('Preset fixtures and form use one title, no description metadata',all(isinstance(p['title'],str) and not ({'label','description'}&set(p)) for p in F['presets']) and '#preset-title' in presets and not any(x in presets for x in ['preset-zh','preset-en','preset-desc-zh','preset-desc-en','draft.label']))
check('Existing saved batches use original word-joined titles',all(isinstance(b['title'],str) and b['title']==' · '.join(w['word'] for w in b['targets']) for b in F['library']))
missinglinks=[];deferred=[]
future={'M002-UI-20.tar.gz','M002-UI-20-manifest.json','UI20-static-results.json'}
for rel in ['design-spec.md','interactions.md','responsive-accessibility.md','validation.md','../handoffs/uiux.md']:
 doc=D/rel
 for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',doc.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  target=target.split('#')[0];dest=(doc.parent/target).resolve()
  if not dest.exists():
   if dest.name in future:deferred.append(str(dest.relative_to(R)))
   else:missinglinks.append(rel+':'+target)
check('Current Markdown links resolve; archive/manifest checked again after freezing',not missinglinks,{'missing':missinglinks,'deferred_until_freeze':sorted(set(deferred))})
for filename in ['UI20-browser-results.json']:
 result=json.loads((D/'evidence'/filename).read_text())
 check(filename+' passes its stated scope',result['status']=='PASS' and all(not isinstance(x,dict) or x['status']=='PASS' for x in result['checks']))

check('Full published sample fixture replaces excerpts',all(isinstance(p.get('sampleText'),str) and len(p['sampleText'].split('\n\n'))==3 and 'excerpt' not in p for p in F['presets']))
icons=json.loads((D/'prototype/assets/lucide.json').read_text())
check('Local Iconify asset set and preserved license',len(icons['icons'])==48 and (D/'prototype/assets/lucide-LICENSE.txt').exists() and (D/'prototype/assets/README.md').exists())
check('No glyph placeholders remain in prototype JavaScript',not any(re.search('[∿✳◇≋✦⌄↗←→♧◷✓○]',p.read_text()) for p in (D/'prototype').glob('*.js')))
icon_source=(D/'prototype/icons.js').read_text()
check('SVG icons decorative, local and not focusable','aria-hidden="true"' in icon_source and 'focusable="false"' in icon_source and './assets/lucide.json' in icon_source)
check('Home example and actions have current semantic regions',all(x in app for x in ['home-hero','home-word-row','home-paper','home-word-meaning','home-path']) and 'class="hero"' not in app)
gallery=(D/'prototype/gallery.js').read_text()
check('Approved five-item navigation order and exact bilingual labels', '["home", "explore", "create", "range", "library"]' in app and all(copy['static'].get(l+'.nav.'+k)==v for l,values in [('zh',['首页','精选','学习','复习','书架']),('en',['Home','Picks','Learn','Review','Library'])] for k,v in zip(['home','explore','create','range','library'],values)))
check('Playback controls and shared playback copy removed', 'data-gallery="play"' not in gallery and all(l+'.gallery.'+k not in keys for l in ['zh','en'] for k in ['play','pause','manual']))
with tarfile.open(R/rec['old_source_snapshot']) as archive:
 old_fixtures=json.load(archive.extractfile(str((D/'prototype/fixtures.json').relative_to(R))))
check('Shared business fixtures unchanged', F==old_fixtures)
report['status']='PASS' if all(c['status']=='PASS' for c in report['checks']) else 'FAIL'
(D/'evidence/UI20-static-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False));raise SystemExit(report['status']!='PASS')
