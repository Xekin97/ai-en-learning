#!/usr/bin/env python3
"""Product document checks only. Does not approve or exercise the application."""
from pathlib import Path
import re, json, hashlib, tarfile, sys
from datetime import datetime, timezone
from urllib.parse import unquote

HERE=Path(__file__).resolve().parent
P=HERE.parent
M=P.parent
ROOT=M.parents[2]
V='M002-PRODUCT-02'
PREPARE='--prepare' in sys.argv
sha=lambda b:hashlib.sha256(b).hexdigest()
audit=json.loads((HERE/(V+'-sources.json')).read_text())
with tarfile.open(HERE/(V+'-inputs.tar.gz')) as t:
    inputs={n:t.extractfile(n).read() for n in t.getnames() if t.getmember(n).isfile()}
paths=[P/'overview.md',P/'abilities.md',P/'data-assets.md',P/'pages/index.md',P/'ai-behavior.md',P/'history.md',M/'decisions/product-decisions.md',M/'handoffs/product.md',M/'changes/M002-CR-001.md']
docs={p:p.read_text() for p in paths}
failures=[]
checks=[]
def check(name,ok,details=None):
    checks.append({'name':name,'result':'PASS' if ok else 'FAIL','details':details})
    if not ok:failures.append(name)
def original(p):return inputs[str(p.relative_to(ROOT))].decode()
def sections(s,prefix,level=2):
    # All sibling headings terminate a section, including non-ID tail sections.
    matches=list(re.finditer(r'^'+('#'*level)+r' ('+prefix+r'-\d{3})[^\n]*\n',s,re.M))
    result={}
    for m in matches:
        end=re.search(r'^#{1,'+str(level)+r'} ',s[m.end():],re.M)
        body=s[m.start():m.end()+end.start() if end else len(s)]
        body=re.sub(r'<a id="[^"]+"></a>','',body).strip()
        result[m.group(1)]=body
    return result
caps=sections(docs[P/'abilities.md'],'CAP')
oldcap={'CAP-'+f'{i:03}' for i in [*range(1,23),*range(101,108)]}
newcap={'CAP-'+str(i) for i in range(201,220)}
expected_caps=oldcap|newcap
check('48 capability definitions',set(caps)==expected_caps,{'count':len(caps)})
acs=re.findall(r'\*\*(AC-\d{3})\*\*',docs[P/'abilities.md'])
check('48 unique acceptance definitions',len(acs)==48 and set(acs)=={c.replace('CAP','AC') for c in expected_caps})
data_ids=set(re.findall(r'<a id="(data-\d{3})"',docs[P/'data-assets.md']))
expected_data={'data-'+f'{i:03}' for i in [*range(1,19),*range(201,215)]}
check('32 asset identities including replaced DATA-015',data_ids==expected_data,{'count':len(data_ids)})
pages=set(re.findall(r'<a id="(page-\d{3})"',docs[P/'pages/index.md']))
expected_pages={'page-'+f'{i:03}' for i in [2,3,5,6,7,8,103,*range(201,219)]}
aliases={'page-'+f'{i:03}' for i in [1,4,9,101,102]}
check('25 current page responsibilities',pages==expected_pages,{'count':len(pages)})
check('5 old page aliases have destinations',all(p.upper() in docs[P/'pages/index.md'].split('## 完整保留的页面与会话')[0] for p in aliases))
page_caps=set(re.findall(r'CAP-\d{3}',docs[P/'pages/index.md']))
# Expand compact references: CAP-018/019/020 and CAP-201–204.
def ids(text,prefix):
    result=set()
    for m in re.finditer(prefix+r'-(\d{3})((?:/\d{3})*)(?:[–至](?:'+prefix+r'-)?(\d{3}))?',text):
        first,slashes,last=m.groups();result.add(prefix+'-'+first)
        for n in re.findall(r'\d{3}',slashes):result.add(prefix+'-'+n)
        if last:
            for i in range(int(first),int(last)+1):result.add(prefix+'-'+f'{i:03}')
    return result
page_caps=ids(docs[P/'pages/index.md'],'CAP')
check('all current capabilities mapped in page catalog',expected_caps<=page_caps,sorted(expected_caps-page_caps))
check('inherited capability matrix complete',all('['+c+']' in docs[P/'overview.md'] for c in oldcap))
for prefix,known in [('CAP',expected_caps),('DATA',{x.upper() for x in expected_data}),('PAGE',{x.upper() for x in expected_pages|aliases})]:
    used=set().union(*(ids(docs[p],prefix) for p in paths[:5]))
    check(prefix+' references defined',not(used-known),sorted(used-known))

old_newcaps=sections(original(P/'abilities.md'),'CAP')
amended={'CAP-205','CAP-207','CAP-209','CAP-218','CAP-219'}
preserved=sorted(newcap-amended)
check('14 unamended M002 detailed capability bodies preserved exactly',all(caps[k]==old_newcaps[k] for k in preserved),[k for k in preserved if caps[k]!=old_newcaps[k]])
for k in amended:
    check(k+' confirmed navigation amendment retains acceptance',bool(re.search(r'\*\*AC-'+k[4:]+r'\*\*',caps[k])))
before_dec=original(M/'decisions/product-decisions.md')
after_dec=docs[M/'decisions/product-decisions.md']
decision_rows=[x for x in before_dec.splitlines() if re.match(r'^\| D2-\d+ ',x)]
check('D2-01–76 history verbatim',len(decision_rows)==76 and all(x in after_dec for x in decision_rows))
check('D2-77–80 latest explicit user instructions recorded',all('| D2-'+str(i)+' |' in after_dec for i in range(77,81)))

def slug(s):
    s=re.sub(r'<[^>]*>','',s).lower().strip()
    return re.sub(r'[^\w\- ]','',s).replace(' ','-')
def anchors(s):
    explicit=set(re.findall(r'<a (?:id|name)="([^"]+)"',s))
    headings=set(slug(m) for m in re.findall(r'^#{1,6} (.+?)\s*#*$',s,re.M))
    return explicit|headings
future={HERE/(V+'-check.json'),HERE/(V+'-review.tar.gz'),HERE/(V+'-review.json')}
links=[]; broken=[]; pending=[]
for p,s in docs.items():
    # Inline Markdown links. Ignore external URLs; do not read any referenced historical body as an input.
    for dest in re.findall(r'\]\(([^\s)]+)\)',s):
        if re.match(r'^[a-z]+://',dest):continue
        name,sep,frag=dest.partition('#')
        target=(p.parent/unquote(name)).resolve() if name else p
        links.append((str(p.relative_to(ROOT)),dest))
        if not target.exists():
            if PREPARE and target in future:pending.append(str(target.relative_to(ROOT)))
            else:broken.append((str(p.relative_to(ROOT)),dest,'missing file'))
        elif frag and target.suffix=='.md':
            if unquote(frag) not in anchors(target.read_text()):broken.append((str(p.relative_to(ROOT)),dest,'missing anchor'))
check('relative links and fragments',not broken,{'checked':len(links),'broken':broken,'prepare_only_pending':sorted(set(pending))})
for p in paths[:5]:
    explicit=re.findall(r'<a id="([^"]+)"',docs[p])
    check(str(p.relative_to(P))+' has unique explicit anchors',len(explicit)==len(set(explicit)))
check('no duplicated common-rule section',docs[P/'abilities.md'].count('## 通用数据与失败边界')==1)

source_mismatch=[p for p,h in audit['source_hashes'].items() if sha(inputs[p])!=h]
check('input snapshot matches source manifest',not source_mismatch,source_mismatch)
protected_mismatch=[p for p,h in audit['protected_hashes'].items() if not (ROOT/p).exists() or sha((ROOT/p).read_bytes())!=h]
check('design gate evidence workflow controls and incoming handoff unchanged',not protected_mismatch,{'checked':len(audit['protected_hashes']),'changed':protected_mismatch})
old_mismatch=[p for p,h in audit['source_hashes'].items() if '/M001/' in p and sha((ROOT/p).read_bytes())!=h]
check('M001 source documents unchanged',not old_mismatch,old_mismatch)
gate=json.loads((M/'reviews/evidence/product-gate-002.json').read_text())
check('original approved archive unchanged',sha((ROOT/gate['snapshot']).read_bytes())==gate['snapshot_sha256'])
check('withdrawn draft not used as product source',audit['withdrawn_draft_used'] is False and not any('/design/' in p for p in inputs))

# This is a recorded product-owner review, not a semantic theorem or software test.
manual=[
    {'flow':'独立注册登录与访客承接','references':['CAP-002','CAP-003','CAP-011','PAGE-002','PAGE-003'],'review':'校验与角色分流保留；认证互切保持有效结果；承接不重生成/扣额且先于提醒'},
    {'flow':'普通造文及原词资源','references':['CAP-006','CAP-007','CAP-008','CAP-009','CAP-010','AI C40-01–06'],'review':'特殊词条、完整输出/位置、模型和释义显式选择；Story/Brief 默认；取消/失败/成功放弃分别计量'},
    {'flow':'复习库与日期/单批会话','references':['CAP-012','CAP-013','CAP-014','CAP-015','CAP-017','CAP-020','CAP-022'],'review':'六项全库统计、目标搜索旧到新、参与开关与单批权限分离、本地日期与独立恢复保留'},
    {'flow':'作答到最终结算','references':['CAP-018','CAP-019','CAP-201','CAP-202','CAP-203','CAP-204'],'review':'全部原位置与匿名组保留；错误可前进、草稿确认恢复、最终判分、临时答案与最小事实分离'},
    {'flow':'数据删除与账号安全','references':['CAP-004','CAP-005','CAP-016','CAP-106','DATA-017'],'review':'改密/退出/重置会话范围不同；批次删除清对应承接记录，成长不能恢复内容；注销覆盖个人新增资产'},
    {'flow':'原后台完整继承','references':['CAP-101','CAP-102','CAP-103','CAP-104','CAP-105','CAP-106','CAP-107'],'review':'密钥、模型增改启停移除、固定四计划全部配置、用户定位/调整计划/重置密码/只读库保留；八模块不混淆'},
    {'flow':'成长积分奖励与道具','references':['CAP-211','CAP-212','CAP-213','CAP-214','CAP-215','CAP-216','CAP-217'],'review':'详细规则正文未改写；签到自动、其他手动；掌握去重、补签补差、逐模型续期、最新下架积分和后台补发保持'},
    {'flow':'预设草稿发布与锁定台','references':['CAP-218','PAGE-212','PAGE-216','PAGE-217'],'review':'仅浏览位置改为独立目录；完整成功预览后手动发布、无静默替换、访客/本人额度仍分别适用'},
    {'flow':'指标和时间语义','references':['CAP-219','DATA-016','DATA-213','DATA-214'],'review':'学习日 04:00、库日期本地日、额度滚动24h分开；原统计与累计成长、管理员预览分别定义'},
    {'flow':'当前版本和角色边界','references':['M002-CR-001','TRANSITION-M002-003','M002-PRODUCT-02'],'review':'产品角色修订待审；不自批、不改设计/控制面，不把旧批准赋予新版'}
]
inventory=[]
for p,b in inputs.items():
    inventory.append({'path':p,'characters':len(b.decode()),'utf8_bytes':len(b)})
same_scope=[p for p in paths if str(p.relative_to(ROOT)) in inputs]
same_scope_counts={
    'paths':[str(p.relative_to(ROOT)) for p in same_scope],
    'before_characters':sum(len(original(p)) for p in same_scope),
    'after_characters':sum(len(docs[p]) for p in same_scope),
    'before_utf8_bytes':sum(len(inputs[str(p.relative_to(ROOT))]) for p in same_scope),
    'after_utf8_bytes':sum(len(docs[p].encode()) for p in same_scope),
    'interpretation':'完整继承修订导致正文增加；不是 token 测量，不以字符数宣称上下文预算已通过'
}
manifest_path=HERE/(V+'-review.json')
if not PREPARE:
    if manifest_path.exists():
        manifest=json.loads(manifest_path.read_text())
        changed=[p for p,h in manifest['files'].items() if sha((ROOT/p).read_bytes())!=h]
        check('frozen review documents match current files',not changed,changed)
        check('frozen review archive digest',sha((ROOT/manifest['archive']).read_bytes())==manifest['archive_sha256'])
        with tarfile.open(ROOT/manifest['archive']) as t:
            members={n:sha(t.extractfile(n).read()) for n in t.getnames() if t.getmember(n).isfile()}
        check('frozen archive members match review manifest',members==manifest['files'])
    else:check('frozen review manifest exists',False)
report={
    'version':V,'author':'product-maya','checked_at':datetime.now(timezone.utc).isoformat(),
    'scope':'static_product_documents_only','status':'PASS' if not failures else 'FAIL',
    'prepare_mode':PREPARE,'checks':checks,'failures':failures,
    'counts':{'capabilities':len(caps),'acceptance_ids':len(acs),'asset_identities':len(data_ids),'current_page_responsibilities':len(pages),'old_page_aliases':len(aliases)},
    'manual_review':{'performed_by':'product-maya','method':'对照原件逐项检查已确认语义及主要完整路径；非独立角色复核','observations':manual},
    'independent_fresh_session_handoff':{'status':'not_executed','reason':'本轮为同一产品角色修订，未安排独立责任角色/新会话接收；静态链接和追踪检查不替代接收'},
    'implementation_tests':'not_executed','real_model_calls':'not_executed','product_approval':'not_granted_by_this_check',
    'source_read_inventory':inventory,'same_scope_size_comparison':same_scope_counts,
    'context_budget':{'token_usage':'unknown','runtime_model_switch':'not_performed','reason_for_full_sources':'用户要求完整跨期继承审计，需要逐项读取旧规则与当前规则；超过规划软预算，不截去不可遗漏的权限/生命周期/失败边界'},
    'document_hashes':{str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in paths},
    'input_snapshot_sha256':sha((HERE/(V+'-inputs.tar.gz')).read_bytes())
}
(HERE/(V+'-check.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'checks':len(checks),'counts':report['counts'],'failures':[c for c in checks if c['result']=='FAIL']},ensure_ascii=False,indent=2))
sys.exit(1 if failures else 0)
