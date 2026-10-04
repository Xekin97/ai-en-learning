from pathlib import Path
import hashlib,json,re,yaml
D=Path(__file__).resolve().parents[1];R=D.parents[3];E=D/'evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((E/'UI22-H01-reception.json').read_text());m=json.loads((E/'M002-UI-22-manifest.json').read_text())
report={'version':'M002-UI-22-H01','design_version':'M002-UI-22','scope':'Documentation coverage, links, approval and unchanged design/baseline/frontend sources; no browser or production test.','checks':[]}
def check(name,ok,details=None):report['checks'].append({'name':name,'status':'PASS' if ok else 'FAIL','details':details})
mutable=[D/x for x in ['design-spec.md','interactions.md','responsive-accessibility.md','validation.md','../handoffs/uiux.md']];mutable_names={str(p.resolve().relative_to(R)) for p in mutable}
changed=[n for n,h in r['approved_source_sha256'].items() if n not in mutable_names and sha(R/n)!=h]
check('Approved prototype, copy, styles, fixtures and traceability unchanged',not changed,changed)
check('Approved archive and immutable evidence intact',sha(R/m['archive'])==m['archive_sha256'] and all(sha(R/n)==h for n,h in m['evidence_sha256'].items()))
for field,label in [('baseline_sha256','Seven M001 baseline documents intact'),('frontend_before_sha256','Ninety existing frontend files intact'),('control_sha256','Post-approval workflow controls intact')]:
 changed=[n for n,h in r[field].items() if sha(R/n)!=h];check(label,not changed,{'files':len(r[field]),'changed':changed})
old_protected=json.loads((E/'UI22-reception.json').read_text())['protected_sha256'];product={n:h for n,h in old_protected.items() if '/milestones/M002/product/' in n or '/milestones/M002/changes/' in n}
check('Approved product and CR sources untouched',all(sha(R/n)==h for n,h in product.items()),{'files':len(product)})
state=yaml.safe_load((R/'.planning/workflow/state.yaml').read_text());approval=state['design_approval'];gate=R/approval['source'];gate_check=json.loads((D.parent/'reviews/evidence/uiux-approval-007/approval-check.json').read_text())
check('Explicit UI22 user approval recorded without stage transition',approval['decision_id']=='APPROVAL-M002-007' and approval['version']=='M002-UI-22' and approval['status']=='approved' and state['stage']=='uiux-design' and state['active_agent']=='designer-tony' and sha(gate)==gate_check['review_sha256'])
delta=(D/'frontend-delta.md').read_text();trace=json.loads((D/'traceability.json').read_text());pages={x['page'] for x in trace};views={v for x in trace for v in x['views']};oldtrace=(D.parent.parent/'M001/design/traceability.md').read_text();oldpages=set(re.findall(r'^\| (PAGE-\d+) ',oldtrace,re.M))
check('All twelve M001 pages have an explicit destination',len(oldpages)==12 and all(re.search(re.escape(p)+r' →',delta) for p in oldpages),{'count':len(oldpages),'pages':sorted(oldpages)})
check('All current pages and prototype views appear in handoff delta',len(pages)==25 and len(views)==28 and all(p in delta for p in pages) and all(re.search(r'\b'+v+r'\b',delta) for v in views),{'pages':len(pages),'views':len(views)})
check('Nine change groups and known CAP-209 gap remain explicit',all('FDE-'+str(n).zfill(2) in delta for n in range(1,10)) and 'CAP-209 同日欢迎分支' in delta and '0 天' in delta)
docs=[*mutable,D/'frontend-delta.md'];check('Current documentation identifies H01 and approved UI22 separately',all('version: M002-UI-22-H01' in p.read_text() and 'design_version: M002-UI-22' in p.read_text() and 'approval: APPROVAL-M002-007' in p.read_text() for p in docs))
missing=[];count=0;future={'M002-UI-22-H01.tar.gz','M002-UI-22-H01-manifest.json','UI22-H01-check.json'}
for p in docs:
 for target in re.findall(r'\]\(([^)\n]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  dest=(p.parent/target.split('#')[0]).resolve();count+=1
  if not dest.exists() and dest.name not in future:missing.append(str(p.relative_to(R))+':'+target)
check('Document and existing frontend source links resolve',not missing,{'links':count,'missing':missing,'deferred':sorted(future)})
check('Frontend handoff and design entry link the requested delta',all('frontend-delta.md' in p.read_text() for p in [D/'design-spec.md',D.parent/'handoffs/uiux.md']))
report['status']='PASS' if all(x['status']=='PASS' for x in report['checks']) else 'FAIL';(E/'UI22-H01-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False));raise SystemExit(report['status']!='PASS')
