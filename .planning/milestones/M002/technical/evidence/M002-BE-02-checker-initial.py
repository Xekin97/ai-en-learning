#!/usr/bin/env python3
"""Static delivery checks only; never connects to DB or providers."""
from pathlib import Path
import hashlib,json,re,datetime,unicodedata,tarfile,subprocess,yaml
root=Path(__file__).resolve().parents[5]
m=root/'.planning/milestones/M002'
e=m/'technical/evidence'
if (e/'M002-BE-02-manifest.json').exists():
    raise SystemExit('Frozen delivery exists; create a new version instead of overwriting evidence.')
files=[m/'technical/backend.md',m/'technical/ai-integration.md',m/'handoffs/backend-architecture.md',m/'changes/CR-003.md']+sorted((m/'technical/api').glob('*.md'))
texts={p:p.read_text() for p in files}; alltext='\n'.join(texts.values())
checks=[]
def add(name,ok,detail): checks.append({'name':name,'pass':bool(ok),'detail':detail})
inputs=json.loads((e/'M002-BE-02-inputs.json').read_text())
changed=[p for p,h in inputs['protected_sha256'].items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
add('protected_upstream_controls_and_application',not changed,{'files':len(inputs['protected_sha256']),'changed':changed})
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
deferred={e/f'M002-BE-02-{s}.json' for s in ['check','manifest','freeze-results']}|{e/'M002-BE-02.tar.gz'}
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
state=yaml.safe_load((root/'.planning/workflow/state.yaml').read_text())
meta=lambda text:yaml.safe_load(text.split('---',2)[1])
plan=texts[m/'technical/backend.md']; handoff=texts[m/'handoffs/backend-architecture.md']; review=texts[m/'technical/api/review.md']; admin=texts[m/'technical/api/administration.md']; notice=texts[m/'technical/api/growth-benefits.md']; cr=texts[m/'changes/CR-003.md']
add('approved_database_and_active_backend',state['active_agent']=='backend-alex' and state['active_role']=='backend-architect/base' and state['stage']=='technical-design' and state['database_approval']['version']=='M002-DB-02' and state['last_transition']['decision_id']=='TRANSITION-M002-011',{'database_approval':state['database_approval']['decision_id'],'role_activation':inputs['role_activation']})
add('pending_backend_review_not_self_approved',all(meta(texts[p])['version']=='M002-BE-02' and meta(texts[p])['status']=='awaiting_user_review' for p in [m/'technical/backend.md',m/'technical/ai-integration.md',m/'technical/api/index.md',m/'handoffs/backend-architecture.md']) and meta(plan)['blocking_alignment'] is None and meta(handoff)['blocking_alignment'] is None and meta(cr)['status']=='open' and meta(cr)['resolution_status']=='ready_for_review',{'data_dependency':'received','CR003_formal_status':'open','backend':'awaiting_user_review'})
add('CR003_1_minimal_facts_and_legacy_null',all(t in review for t in ['attempt_no 最大值','一个 SQL 语句快照','skip_count>0','has_answer:bool|null','不互为取反' if '不互为取反' in review else '部分作答可以同时为 true','不额外增加逐题查询接口','DB2-V17/18']) and 'DB2-V17' in plan,{'scope':'Static contract coverage; no SQL/HTTP tests','mapped':'DB2-R07 / BE2-V05'})
add('CR003_2_replacement_transaction_and_write_precedence',all(t in review for t in ['DB2-T14','restarted/revision+1','abandoned/completed_at=NULL','任一步失败全部回滚','两次替换只有一个成功','abandoned 一律409 session_replaced','先 GET active-range','清completed_at']) and 'DB2-T14' in plan,{'mapped':'DB2-R08 / BE2-V05','old_session_receipt':'read-only GET remains allowed'})
add('CR003_3_notice_pair_atomicity_and_fallback',all(t in admin for t in ['title_zh/en','完整语言对 CHECK','另一语言仅填一个字段允许保存','冲突409 revision_conflict','不部分保存','DB2-V19']) and all(t in notice for t in ['优先当前界面语言的完整 title+body','先选语言再渲染正文','remind DESC,published_at DESC,id ASC','未新增逐用户提示记录']),{'mapped':'DB2-R09 / BE2-V12','scope':'Documentation alignment, not sanitizer/runtime validation'})
add('no_stale_DBA_blocker_in_active_contracts',not any(t in plan+review+admin+notice+handoff for t in ['proposed/BLOCKED','CR-003未关闭前','CR-003待DBA','CR-003阻塞']) and 'BE2-D01' in plan and '数据接收完成' in plan,{'scope':'Removed former data dependency only; BE-02 approval and implementation verification remain pending'})
# Archives preserve exact original bytes; approved DB source except the mutable CR resolution stays identical.
db_manifest=json.loads((e/'M002-DB-02-manifest.json').read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
archive_ok=sha(root/inputs['approved_database_archive'])==inputs['approved_database_archive_sha256'] and sha(root/inputs['BE01_archive']['path'])==inputs['BE01_archive']['sha256']
db_current_ok=all(sha(root/p)==h for p,h in db_manifest['source_sha256'].items() if not p.endswith('/changes/CR-003.md'))
add('approved_DB_and_frozen_history_unchanged',archive_ok and db_current_ok,{'DB02_archive':inputs['approved_database_archive_sha256'],'BE01_archive':inputs['BE01_archive']['sha256'],'mutable_CR':'Only current resolution evolves; DB02 original CR recoverable in archive'})
def sections(text):
    parts=re.split(r'(^#{1,3} .+$)',text,flags=re.M)
    return {parts[i]:parts[i+1] for i in range(1,len(parts),2)}
with tarfile.open(root/inputs['BE01_archive']['path']) as tar:
    original={p:tar.extractfile(str(p.relative_to(root))).read().decode() for p in files}
untouched={m/'technical/backend.md':['### 1.1 已确认决策的落实','### 1.3 有实际取舍的技术选择','## 2. 模块与内部调用','### 4.1 实际旧入口的改造点','### 4.4 权益与时间','## 5. 安全、数据与输入','## 6. 分析与运维'],m/'technical/api/growth-benefits.md':[k for k in sections(original[m/'technical/api/growth-benefits.md']) if k!='## 5. API-205 平台消息'],m/'technical/api/administration.md':[k for k in sections(original[m/'technical/api/administration.md']) if not k.startswith(('## 2.','## 5.'))]}
# The administration section containing RewardInput changes only the DB version reference.
fail=[]
for p,keys in untouched.items():
    old_sec,new_sec=sections(original[p]),sections(texts[p])
    for k in keys:
        if k not in old_sec or old_sec[k]!=new_sec.get(k): fail.append({'path':str(p.relative_to(root)),'section':k})
for p in [m/'technical/api/analytics.md',m/'technical/api/generation-presets.md',m/'technical/api/identity-library.md']:
    if texts[p]!=original[p]:fail.append({'path':str(p.relative_to(root)),'section':'whole file'})
add('unrelated_architecture_and_inheritance_preserved',not fail,{'changed_outside_scope':fail,'unchanged_API_files':3})
add('stable_validation_ids',all(re.search(r'^\| BE2-V'+f'{i:02}'+r' \|',plan,re.M) for i in range(1,18)),{'retained':17,'expanded':['BE2-V05','BE2-V12'],'runtime_results':'not_run'})
add('no_openapi_artifact',not list((m/'technical/api').glob('*.yaml')) and not list((m/'technical/api').glob('*.json')),{'format':'Markdown only'})
add('standing_boundaries',all(s in alltext for s in ['DB2-Q01','DB2-Q02','DB2-Q03','USER-COMPAT-001','USER-CLAIM-DELETE-001','CR039-L1','CR042-L1','AI-QUALITY-90']),{'runtime_tests':'not_run','database':'not_connected','real_ai_calls':0})
result={'version':'M002-BE-02','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS_STATIC_AWAITING_REVIEW' if all(c['pass'] for c in checks) else 'FAIL','checks':checks,'source_files':len(files),'source_characters':sum(len(t) for t in texts.values()),'source_bytes':sum(p.stat().st_size for p in files),'independent_handoff_test':'not_run','blocking_alignment':None,'CR003_status':'open_ready_for_review','runtime_tests':False,'database_connected':False,'source_sha256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'size_comparison':{str(p.relative_to(root)):{'before_unicode_characters':inputs['before_sources'][str(p.relative_to(root))]['unicode_characters'],'after_unicode_characters':len(texts[p]),'after_utf8_bytes':p.stat().st_size} for p in files},'size_scope':'Same 11 delivery files once each; not cumulative runtime input or billed tokens','actual_tokens':'unknown'}
out=e/'M002-BE-02-check.json'
if out.exists():
    i=1
    while (e/f'M002-BE-02-check-prior-{i}.json').exists():i+=1
    out.rename(e/f'M002-BE-02-check-prior-{i}.json')
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'checks':len(checks),'failures':[x for x in checks if not x['pass']],'source_files':len(files),'characters':result['source_characters']},ensure_ascii=False,indent=2))
raise SystemExit(0 if all(c['pass'] for c in checks) else 1)
