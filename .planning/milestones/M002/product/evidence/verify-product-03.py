#!/usr/bin/env python3
"""Check the PRODUCT-03 document revision, never the application or an approval."""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import unquote
import hashlib, json, re, sys, tarfile

E=Path(__file__).resolve().parent
P=E.parent; M=P.parent; ROOT=M.parents[2]
V='M002-PRODUCT-03'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
audit=json.loads((E/(V+'-sources.json')).read_text())
with tarfile.open(ROOT/audit['inputs_archive']) as t:
    before={n:t.extractfile(n).read().decode() for n in t.getnames() if t.getmember(n).isfile()}
paths=[P/n for n in ['overview.md','abilities.md','data-assets.md','pages/index.md','ai-behavior.md','history.md']]+[M/'decisions/product-decisions.md',M/'handoffs/product.md',M/'changes/M002-CR-002.md']
docs={p:p.read_text() for p in paths}
checks=[]
def check(name,ok,detail=None):
    checks.append({'name':name,'status':'PASS' if ok else 'FAIL','details':detail})
def original(p):return before[str(p.relative_to(ROOT))]
def sections(s):
    found={}
    for m in re.finditer(r'^## (CAP-\d{3})[^\n]*\n',s,re.M):
        end=re.search(r'^#{1,2} ',s[m.end():],re.M)
        body=s[m.start():m.end()+end.start() if end else len(s)]
        found[m[1]]=re.sub(r'<a id="[^"]+"></a>','',body).strip()
    return found
def ids(s,prefix):
    found=set()
    for m in re.finditer(prefix+r'-(\d{3})((?:/\d{3})*)(?:[–至](?:'+prefix+r'-)?(\d{3}))?',s):
        start,parts,end=m.groups();found.add(prefix+'-'+start)
        found.update(prefix+'-'+p for p in re.findall(r'\d{3}',parts))
        if end:found.update(prefix+'-'+f'{i:03}' for i in range(int(start),int(end)+1))
    return found
caps=sections(docs[P/'abilities.md']); old=sections(original(P/'abilities.md'))
expected={'CAP-'+f'{n:03}' for n in [*range(1,23),*range(101,108),*range(201,221)]}
acs=re.findall(r'\*\*(AC-\d{3})\*\*',docs[P/'abilities.md'])
check('49 unique capabilities and acceptance IDs',set(caps)==expected and len(re.findall(r'^## CAP-\d{3}',docs[P/'abilities.md'],re.M))==49 and len(acs)==49 and set(acs)=={c.replace('CAP','AC') for c in expected})
assets=set(re.findall(r'<a id="(data-\d{3})"',docs[P/'data-assets.md']))
pages=set(re.findall(r'<a id="(page-\d{3})"',docs[P/'pages/index.md']))
expected_assets={'data-'+f'{n:03}' for n in [*range(1,19),*range(201,215)]}
expected_pages={'page-'+f'{n:03}' for n in [2,3,5,6,7,8,103,*range(201,219)]}
check('32 data identities and 25 current pages preserved',assets==expected_assets and pages==expected_pages)
check('All capabilities mapped to pages',expected<=ids(docs[P/'pages/index.md'],'CAP'),sorted(expected-ids(docs[P/'pages/index.md'],'CAP')))
for prefix,known in [('CAP',expected),('DATA',{v.upper() for v in expected_assets}),('PAGE',{v.upper() for v in expected_pages}|{'PAGE-'+f'{n:03}' for n in [1,4,9,101,102]})]:
    used=set().union(*(ids(docs[p],prefix) for p in paths[:5]))
    check(prefix+' references resolve',used<=known,sorted(used-known))
changed=sorted(k for k in old if caps.get(k)!=old[k])
allowed={'CAP-010','CAP-012','CAP-013','CAP-014','CAP-107','CAP-217','CAP-218'}
check('Only seven existing capability sections amended; 41 unchanged',set(changed)==allowed,changed)
check('AI output, quality and safety contract unchanged',docs[P/'ai-behavior.md'].split('## 继承后完整输出、质量与安全规则',1)[1]==original(P/'ai-behavior.md').split('## 继承后完整输出、质量与安全规则',1)[1])
oldrows=[l for l in original(M/'decisions/product-decisions.md').splitlines() if re.match(r'^\| D2-\d+ ',l)]
check('80 prior decision rows preserved; 81 and 82 added',len(oldrows)==80 and all(l in docs[M/'decisions/product-decisions.md'] for l in oldrows) and all('| D2-'+str(n)+' |' in docs[M/'decisions/product-decisions.md'] for n in [81,82]))
check('Current product documents and handoff stamped PRODUCT-03',all('version: '+V in docs[p] and 'change_request: M002-CR-002' in docs[p] for p in paths[:6]+[M/'handoffs/product.md']))
check('Title and preset requirements traced to data and pages',all('CAP-220' in docs[p] for p in [P/'overview.md',P/'data-assets.md',P/'pages/index.md',P/'ai-behavior.md']) and all(any(ref in docs[p] for ref in ['D2-82','D2-81/82']) for p in [P/'overview.md',P/'data-assets.md',P/'pages/index.md',P/'ai-behavior.md']))
stale=['标题/说明','标题、说明等展示文案','公开内容及中英文展示文案','展示内容中英文配置','展示已发布样文、说明']
check('No obsolete preset fields in current five product documents',all(term not in docs[p] for p in paths[:5] for term in stale))
# Check internal file links and anchors without treating frozen historical text as current rules.
def anchors(s):
    values=set(re.findall(r'<a (?:id|name)="([^"]+)"',s))
    for h in re.findall(r'^#{1,6} (.+?)\s*#*$',s,re.M):
        values.add(re.sub(r'[^\w\- ]','',re.sub(r'<[^>]*>','',h).lower().strip()).replace(' ','-'))
    return values
pending={E/(V+'-check.json'),E/(V+'-review.tar.gz'),E/(V+'-review.json')}
errors=[];count=0
for p,s in docs.items():
    for dest in re.findall(r'\]\(([^\s)]+)\)',s):
        if re.match(r'^[a-z]+://',dest):continue
        count+=1
        name,_,fragment=dest.partition('#')
        target=(p.parent/unquote(name)).resolve() if name else p
        if not target.exists() and not ('--freeze' in sys.argv and target in pending):errors.append([str(p.relative_to(ROOT)),dest,'file'])
        elif target.exists() and fragment and target.suffix=='.md' and unquote(fragment) not in anchors(target.read_text()):errors.append([str(p.relative_to(ROOT)),dest,'anchor'])
check('Document links and anchors resolve',not errors,{'checked':count,'errors':errors})
for group in ['protected_sha256','read_only_implementation_evidence']:
    mismatch=[k for k,v in audit[group].items() if not (ROOT/k).exists() or sha(ROOT/k)!=v]
    check(group+' unchanged',not mismatch,{'checked':len(audit[group]),'mismatch':mismatch})
check('Input snapshot remains intact',sha(ROOT/audit['inputs_archive'])==audit['inputs_archive_sha256'] and all(hashlib.sha256(before[k].encode()).hexdigest()==v for k,v in audit['input_sha256'].items()))
state=(ROOT/'.planning/workflow/state.yaml').read_text()
check('Product activated and CR indexed',all(v in state for v in ['stage: product-planning','active_role: product/to-c','active_agent: product-maya','TRANSITION-M002-005','M002-CR-002']) and 'status: open' in docs[M/'changes/M002-CR-002.md'])
report={'version':V,'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'static_product_documents_only','status':'PASS' if all(c['status']=='PASS' for c in checks) else 'FAIL','counts':{'capabilities':len(caps),'acceptance_ids':len(acs),'data_identities':len(assets),'current_pages':len(pages)},'checks':checks,'product_review':{'performed_by':'product-maya','independent_review':False,'observations':['本人新旧批次编辑、默认词条标题、普通文本、取消/空白/保存失败/权限/删除边界齐备。','标题持久化与列表/详情一致，其他内容、搜索/顺序、复习、成长与额度保持；提交前不新增泄漏答案的标题展示。','预设单标题、无说明字段，样文和释义语言保持；仅标题改动仍须发布，私人标题与公开预设隔离。','原完整继承和未涉及的能力逐段保持，历史批准及 UI-05 保留，未用旧 UI 验证证明本次规则。']},'application_tests':'not_executed','real_model_calls':'not_executed','independent_fresh_session_handoff':'not_executed','product_approval':'not_granted_by_this_check','token_usage':'unknown'}
if '--freeze' in sys.argv:
    (E/(V+'-check.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if report['status']=='PASS':
        bundle=paths+[Path(__file__),E/(V+'-sources.json'),E/(V+'-check.json')]
        archive=E/(V+'-review.tar.gz')
        with tarfile.open(archive,'w:gz') as tar:
            for p in bundle:tar.add(p,arcname=str(p.relative_to(ROOT)))
        manifest={'version':V,'status':'ready_for_review','archive':str(archive.relative_to(ROOT)),'archive_sha256':sha(archive),'files':{str(p.relative_to(ROOT)):sha(p) for p in bundle}}
        (E/(V+'-review.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
else:
    manifest=json.loads((E/(V+'-review.json')).read_text())
    changed=[k for k,v in manifest['files'].items() if sha(ROOT/k)!=v]
    with tarfile.open(ROOT/manifest['archive']) as tar:
        frozen={n:hashlib.sha256(tar.extractfile(n).read()).hexdigest() for n in tar.getnames() if tar.getmember(n).isfile()}
    if changed or sha(ROOT/manifest['archive'])!=manifest['archive_sha256'] or frozen!=manifest['files']:
        report['status']='FAIL';report['freeze_mismatch']=changed
print(json.dumps({'version':V,'status':report['status'],'checks':len(checks),'failed':[c for c in checks if c['status']=='FAIL'],'counts':report['counts']},ensure_ascii=False,indent=2))
sys.exit(0 if report['status']=='PASS' else 1)
