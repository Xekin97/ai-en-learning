#!/usr/bin/env python3
"""Static delivery checks only; never connects to DB or providers."""
from pathlib import Path
import hashlib,json,re,datetime,unicodedata
root=Path(__file__).resolve().parents[5]
m=root/'.planning/milestones/M002'
e=m/'technical/evidence'
if (e/'M002-BE-01-manifest.json').exists():
    raise SystemExit('Frozen delivery exists; create a new version instead of overwriting evidence.')
files=[m/'technical/backend.md',m/'technical/ai-integration.md',m/'handoffs/backend-architecture.md',m/'changes/CR-003.md']+sorted((m/'technical/api').glob('*.md'))
texts={p:p.read_text() for p in files}; alltext='\n'.join(texts.values())
checks=[]
def add(name,ok,detail): checks.append({'name':name,'pass':bool(ok),'detail':detail})
inputs=json.loads((e/'M002-BE-01-inputs.json').read_text())
changed=[p for p,h in inputs['protected_files'].items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
add('protected_upstream_controls_and_application',not changed,{'files':len(inputs['protected_files']),'changed':changed})
caps=set(re.findall(r'^## (CAP-\d{3})', (m/'product/abilities.md').read_text(),re.M))
trace=set(re.findall(r'^\| (CAP-\d{3}) \|',texts[m/'technical/backend.md'],re.M))
add('one_trace_row_per_capability',caps==trace,{'expected':len(caps),'actual':len(trace),'missing':sorted(caps-trace),'extra':sorted(trace-caps)})
data=set(re.findall(r'DATA-\d{3}',(m/'product/data-assets.md').read_text()))
# Expand compact DATA-001/002 and DATA-001–003 in all source documents.
def refs(prefix,text):
    result=set(re.findall(prefix+r'-\d{3}',text))
    for part in re.findall(prefix+r'-\d{3}(?:[–/](?:'+prefix+r'-)?\d{3})*',text):
        nums=[int(n) for n in re.findall(r'\d{3}',part)]
        if '–' in part and '/' not in part and len(nums)==2:
            result.update(f'{prefix}-{n:03}' for n in range(nums[0],nums[1]+1))
        else: result.update(f'{prefix}-{n:03}' for n in nums)
    return result
seen=refs('DATA',alltext)
add('data_indices_inherited',data<=seen,{'expected':len(data),'missing':sorted(data-seen),'replaced':['DATA-015']})
page_text=(m/'product/pages/index.md').read_text()
pages=set(re.findall(r'^## (PAGE-\d{3})',page_text,re.M))|{'PAGE-'+n for n in re.findall(r'id="page-(\d{3})"',page_text)}
seen_pages=refs('PAGE',alltext)
add('current_pages_referenced',pages<=seen_pages,{'expected':len(pages),'missing':sorted(pages-seen_pages)})
# Verify each real M001 route has a declared M002 destination; actions is explicitly removed.
server=(root/'backend/internal/httpapi/server.go').read_text()
route_list=re.findall(r'\.(Get|Post|Put|Patch|Delete)\("([^"]+)"',server)
route_list.append(('Get','/internal/metrics'))
api='\n'.join(texts[p] for p in files if p.parent.name=='api')
normalize=lambda s: re.sub(r'\{[^}]+\}','{id}',s)
normalized=normalize(api)
route_evidence=[]
for method,path in route_list:
    present=normalize(path) in normalized
    status='replaced_by_whole_attempt_submit' if path.endswith('/actions') else 'retained_or_expanded'
    route_evidence.append({'method':method.upper(),'source_path':path,'disposition':status,'documented_path':present})
add('existing_router_inventory',all(x['documented_path'] for x in route_evidence),{'count':len(route_evidence),'routes':route_evidence})
# Freeze artifacts referenced by source docs are generated after this non-circular check.
deferred={e/f'M002-BE-01-{s}.json' for s in ['check','manifest','freeze-results']}|{e/'M002-BE-01.tar.gz'}
broken=[]; link_count=0; pending=set(); bad_anchors=[]
def heading_ids(text):
    ids=set(re.findall(r'id="([^"]+)"',text)); counts={}
    for h in re.findall(r'^#{1,6} (.+)$',text,re.M):
        h=h.strip().lower(); h=''.join(c for c in h if not unicodedata.category(c).startswith(('P','S')) or c in '-_'); h=re.sub(r'\s','-',h)
        c=counts.get(h,0); counts[h]=c+1
        ids.add(h if c==0 else f'{h}-{c}')
    return ids
for source,txt in texts.items():
    for target in re.findall(r'\[[^]\n]*\]\(([^)]+)\)',txt):
        if target.startswith(('http:','https:','mailto:')):continue
        pathname,sep,anchor=target.partition('#')
        dest=(source.parent/pathname).resolve() if pathname else source
        link_count+=1
        if not dest.exists():
            if dest in deferred:pending.add(str(dest.relative_to(root)))
            else:broken.append({'source':str(source.relative_to(root)),'target':target})
        elif anchor and dest.suffix=='.md' and anchor not in heading_ids(dest.read_text()):
            bad_anchors.append({'source':str(source.relative_to(root)),'target':target})
add('relative_links_and_anchors',not broken and not bad_anchors,{'checked':link_count,'broken':broken,'bad_anchors':bad_anchors,'deferred_freeze_outputs':sorted(pending)})
add('db_alignment_explicitly_blocked',all('CR-003' in texts[p] for p in [m/'technical/backend.md',m/'technical/api/review.md',m/'technical/api/administration.md',m/'handoffs/backend-architecture.md']),{'open':'M002-CR-003','issues':['review_has_unanswered','range_abandon','bilingual_notice_titles']})
add('no_openapi_artifact',not list((m/'technical/api').glob('*.yaml')) and not list((m/'technical/api').glob('*.json')),{'format':'Markdown only'})
add('standing_boundaries',all(s in alltext for s in ['DB2-Q01','DB2-Q02','DB2-Q03','USER-COMPAT-001','USER-CLAIM-DELETE-001','CR039-L1','CR042-L1','AI-QUALITY-90']),{'runtime_tests':'not_run','database':'not_connected','real_ai_calls':0})
result={'version':'M002-BE-01','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS_STATIC_WITH_BLOCKED_CR' if all(c['pass'] for c in checks) else 'FAIL','checks':checks,'source_files':len(files),'source_characters':sum(len(t) for t in texts.values()),'source_bytes':sum(p.stat().st_size for p in files),'independent_handoff_test':'not_run','blocking_alignment':'M002-CR-003'}
out=e/'M002-BE-01-check.json'
if out.exists():
    i=1
    while (e/f'M002-BE-01-check-prior-{i}.json').exists():i+=1
    out.rename(e/f'M002-BE-01-check-prior-{i}.json')
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'checks':len(checks),'failures':[x for x in checks if not x['pass']],'source_files':len(files),'characters':result['source_characters']},ensure_ascii=False,indent=2))
raise SystemExit(0 if all(c['pass'] for c in checks) else 1)
