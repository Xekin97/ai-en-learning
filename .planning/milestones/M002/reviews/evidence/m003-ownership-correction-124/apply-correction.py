from pathlib import Path
import json,yaml,hashlib,shutil,datetime,copy,re,os,tarfile
r=Path.cwd(); ms=r/'.planning/milestones'; old=ms/'M003'; new=ms/'M002'; e=new/'reviews/evidence/m003-ownership-correction-124'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
rel=lambda p:str(Path(p).relative_to(r))
gate=(e/'gate-last.md').read_text();assert 'review_status: PASS' in gate and 'TRANSITION-M002-124' in gate
before=json.loads((e/'m003-preservation-manifest.json').read_text())
assert all(sha(r/f)==h for f,h in before['files'].items())
statepath=r/'.planning/workflow/state.yaml';s=yaml.safe_load(statepath.read_text());assert s['milestone']=='M003' and s['stage']=='uiux-design' and s['active_agent']=='designer-tony'
a=json.loads((e/'authorization.json').read_text());now=datetime.datetime.now(datetime.timezone.utc).isoformat()
record=new/'reviews/milestone-ownership-correction-124.md';record.write_text(gate)
# Copies are scoped mutable working entries; original histories stay immutable.
filemap={}
for folder in ['product/pronunciation','design/config-portability']:
 for p in sorted((old/folder).rglob('*')):
  if p.is_file():filemap[p]=new/p.relative_to(old)
for sub in ['product/config-portability.md','handoffs/product.md','handoffs/config-portability-uiux.md']:
 filemap[old/sub]=new/sub
filemap[old/'handoffs/uiux.md']=new/'handoffs/pronunciation-uiux.md'
for p in (old/'changes').glob('CR-3*.md'):filemap[p]=new/'changes'/p.name
for src,dst in filemap.items():
 if dst.exists():assert dst==new/'handoffs/product.md',str(dst)
 dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
# Mapped Markdown links point to the current copies or the exact preserved original.
linkmap=dict(filemap)
for name in ['overview.md','data-assets.md','abilities.md','ai-behavior.md','pages/index.md']:
 linkmap[old/'product'/name]=new/'product'/name
linkmap[old/'design/design-spec.md']=new/'design/design-spec.md'
def links(text,src,dst):
 def one(match):
  raw=match.group(1);angle=raw.startswith('<') and raw.endswith('>');target=raw[1:-1] if angle else raw
  if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) or target.startswith('#'):return match.group(0)
  parts=re.split(r'([?#].*)',target,maxsplit=1);stem=parts[0];suffix=''.join(parts[1:])
  origin=Path(stem) if stem.startswith('/') else (src.parent/stem).resolve()
  dest=linkmap.get(origin,origin)
  rewritten=(str(dest) if stem.startswith('/') else os.path.relpath(dest,dst.parent))+suffix
  return ']('+('<'+rewritten+'>' if angle else rewritten)+')'
 return re.sub(r'\]\(([^)]+)\)',one,text)
versions={'M003-PRODUCT-12-R1':'M002-PRODUCT-09-R1','M003-PRODUCT-11':'M002-PRODUCT-08','M003-UI-15-R1':'M002-UI-33-R1','M003-UI-15':'M002-UI-33','M003-UI-14':'M002-UI-32'}
changed=[]
for src,dst in filemap.items():
 # Evidence/vendor are immutable copied provenance; designer produces a new R1 manifest separately.
 if dst.suffix!='.md' or '/evidence/' in str(dst) or '/vendor/' in str(dst):continue
 body=links(src.read_text(),src,dst)
 body=re.sub(r'(?m)^milestone: M003$', 'milestone: M002',body)
 if body.startswith('---'):
  parts=body.split('---',2)
  for oldver,newver in versions.items():parts[1]=parts[1].replace(oldver,newver)
  if 'config-portability' in str(dst) and ('design/' in str(dst) or 'handoffs/' in str(dst)):
   parts[1]=re.sub(r'(?m)^status:.*$', 'status: in_revision',parts[1])
   parts[1]=re.sub(r'(?m)^version:.*$', 'version: M002-UI-33-R1',parts[1])
  body='---'.join(parts)
 notice='\n> 归属纠正124：本文件需求属于 **M002**。正文旧 M003 版本/决定号仅为原件追踪标识，不能用来启动或收尾里程碑。当前状态以 [M002续做索引]('+os.path.relpath(new/'continuation.md',dst.parent)+') 和工作流为准；本次仅转接归属与链接，不重新批准业务。\n\n'
 if body.startswith('---'):
  idx=body.find('---',3)+3;body=body[:idx]+notice+body[idx:]
 else:body=notice+body
 dst.write_text(body);changed.append(rel(dst))
# All original M003 sources are now M002-owned historical artifacts, not an active milestone.
index='''# M002 当前续做与原件索引\n\n用户明确：原 M003 是未经授权新建的里程碑，其全部需求都属于 M002。当前为 **M002 / UIUX / designer-tony**，继续 CR-313 正式设计继承修正。M002 当前续做未批准收尾；原123历史范围的验收事实保留。\n\n## 当前工作与状态\n\n| 范围 | 状态 | 当前入口与原件 |\n|---|---|---|\n| 短文质量、普通纠错/付费审稿返修、规划/流式体验、模型自定义参数、相关UAT修正 | 已实现范围沿既有逐项验收；原CR301–312已resolved，模型语义质量仍不属于QA | [业务基线原件](../M003/product/overview.md)、[技术原件](../M003/technical/backend.md)、[验证原件](../M003/handoffs/verification.md)；以下CR列表保留准确状态 |\n| 单词发音 | 产品已接受，设计待审 | [M002-PRODUCT-08](product/pronunciation/overview.md)、[M002-UI-32交接](handoffs/pronunciation-uiux.md)；原UI14源与hash保留，未推定批准 |\n| 管理台配置导入导出 CR-313 | 产品已接受；正式设计继承返工中 | [M002-PRODUCT-09-R1](product/config-portability.md)、[M002-UI-33-R1交接](handoffs/config-portability-uiux.md) |\n\n原M003目录整棵树（product/design/technical/implementation/verification/changes/decisions/reviews及证据）全部是M002需求的历史原件。路径和冻结版本号保留用于复现，不能据其旧frontmatter推断M003有效或批准状态。新修改写入M002当前入口；不重新编号已引用的DATA/CAP/PAGE/AC/CR/决定号，不重跑已通过验收。\n\n## 历史入口及原件归属\n\n- [原产品原件](../M003/product/overview.md)、[原设计原件](../M003/design/design-spec.md)、[原数据库设计](../M003/technical/database.md)、[原后端/API](../M003/technical/backend.md)、[原前端设计](../M003/technical/frontend.md)。\n- [原后端实现](../M003/handoffs/backend-implementation.md)、[原前端实现](../M003/handoffs/frontend-implementation.md)、[原验证/UAT](../M003/handoffs/verification.md)。\n- [归属原话](reviews/evidence/m003-ownership-correction-124/authorization.json)、[门禁124](reviews/milestone-ownership-correction-124.md)、[全量旧源hash](reviews/evidence/m003-ownership-correction-124/m003-preservation-manifest.json)、[转接映射](reviews/evidence/m003-ownership-correction-124/rehome-map.json)。\n\nM003初始化001与M004初始化001已撤销；原M002123历史验收不被擦除，仅其终态被本次明确续做替代。以前的M003107/109等专业产物接收在M002中沿用相同范围与原件，不扩张为新版设计批准。\n\n## CR归属\n\n| 编号 | 原状态 | M002当前入口 |\n|---|---|---|\n'''
for p in sorted((new/'changes').glob('CR-3*.md')):
 txt=p.read_text();front=yaml.safe_load(txt.split('---',2)[1]) if txt.startswith('---') else {}
 index+=f"| {p.stem} | {front.get('status','see source')} | [{p.stem}](changes/{p.name}) |\n"
index+='\n## 当前研发边界\n\n当前只继续设计继承修正：直接继承此前M002视觉基线及原M003已接受的模型/计划增量，不能重画简化管理台。后续阶段按原Profile门禁执行。真实UAT3015和4174/4175原件服务继续可访问；路径中的旧编号只表示历史运行标识。公开新里程碑必须获得明确的里程碑启动授权，“下一步”或“继续研发”不构成新建里程碑授权。\n'
(new/'continuation.md').write_text(index)
# Compact current pointers preserve existing M002 specialist bodies and original design assets.
entry_paths=[new/'product'/x for x in ['overview.md','data-assets.md','abilities.md','pages/index.md','ai-behavior.md']]+[new/'design/design-spec.md',new/'handoffs/uiux.md']
for p in entry_paths:
 oldbody=p.read_text()
 link=os.path.relpath(new/'continuation.md',p.parent)
 current=os.path.relpath(new/('design/config-portability/design-spec.md' if '/design/' in str(p) or p.name=='uiux.md' else 'product/config-portability.md'),p.parent)
 prefix=f'> **当前归属：M002（纠正124）**。全部原M003需求均归入本里程碑；[完整续做索引]({link})。当前[配置导入导出增量]({current})的产品已接受、设计继承返工中；单词发音设计仍单独待审。以下为保留的前期M002基线，旧完成/待审措辞不覆盖续做索引与控制面。\n\n'
 p.write_text(prefix+oldbody)
# Prevent baseline readers using pre-increment technical/QA sources as the newest baseline.
for area in ['technical','implementation','verification','handoffs']:
 for p in sorted((new/area).glob('*.md')):
  original=old/area/p.name
  if not original.exists() or p in entry_paths or p in filemap.values():continue
  label=os.path.relpath(original,p.parent);idx=os.path.relpath(new/'continuation.md',p.parent)
  p.write_text(f'> **M002续做索引124**：本里程碑包含原M003全部需求。[较新同类原件]({label})及其已记录的逐项接收/验证均归M002；旧编号只是历史标识。当前工作与未完成项见[续做索引]({idx})，下方前期记录保留，不能据旧完成态关闭当前M002。\n\n'+p.read_text())
p=new/'technical/api/index.md'
if p.exists():p.write_text('> **M002续做124**：[较新API基线原件](../../../M003/technical/api/index.md)属于M002；当前范围见[续做索引](../../continuation.md)。下方早期API目录保留为历史基线。\n\n'+p.read_text())
for dirname in ['M003','M004']:
 p=ms/dirname/'README.md';prior=p.read_text() if p.exists() else ''
 p.write_text(f'# {dirname} 已撤销：需求归属M002\n\n用户明确这些需求均属M002；本目录只保留历史原件及冻结证据，不是活动或已完成里程碑。当前工作从 [M002续做索引](../M002/continuation.md) 进入。旧frontmatter、版本号和运行路径不构成里程碑授权，禁止据此继续创建下游M00x。\n\n'+prior)
mapreceipt={'effective_milestone':'M002','authority':rel(record),'files':{rel(k):rel(v) for k,v in filemap.items()},'version_aliases':versions,'copied_mutable_markdown':changed,'historical_prefix_ownership':{'.planning/milestones/M003/':'M002 all inherited scopes','.planning/milestones/M004/':'M002 pronunciation original historical record'},'source_hashes':{rel(k):sha(k) for k in filemap},'target_hashes':{rel(v):sha(v) for v in filemap.values()},'pending_pronunciation_design':'M002-UI-32 current handoff links unchanged original UI14 design snapshot; no design changes/approval'}
(e/'rehome-map.json').write_text(json.dumps(mapreceipt,ensure_ascii=False,indent=2)+'\n')
# Control recovery: keep all past facts while reopening the correct milestone.
t={'id':'TRANSITION-M002-124','decision_id':'TRANSITION-M002-124','operation':'recover-or-rollback','milestone':'M002','from_milestone':'M003','from':'uiux-design','to':'uiux-design','previous_role':'uiux/base','previous_agent':'designer-tony','active_role':'uiux/base','active_agent':'designer-tony','timestamp':now,'authorized_by':a['id'],'checked_by':'gatekeeper-owen','recorded_by':'root','evidence':rel(record),'scope':a['scope']}
s['milestone']='M002';s['last_transition']=t;s['status']='active';s['current_handoff']=rel(new/'handoffs/config-portability-uiux.md')
s['previous_milestone']=yaml.safe_load((old/'reviews/evidence/start/m002-state.yaml').read_text())['previous_milestone']
s['required_artifacts']=[x.replace('.planning/milestones/M003/','.planning/milestones/M002/') for x in s['required_artifacts']]
s['pending_user_decisions']=[{'id':'M002-UI-32-DESIGN-REVIEW','scope':'Pronunciation design rehomed from UI14, unchanged and unapproved','status':'awaiting_user_review','handoff':rel(new/'handoffs/pronunciation-uiux.md'),'legacy_decision_id':'M003-UI-14-DESIGN-REVIEW','does_not_imply':'M002 overall closeout'}]
s['authorization_refs'].insert(0,{'id':a['id'],'scope':a['scope'],'source':rel(e/'authorization.json')})
s['milestone_closeout']={'status':'not_approved','source':rel(record),'explicit_user_approval_required':True,'prior_scoped_acceptance':'TRANSITION-M002-123 remains historical; current continuation explicitly reopened'}
s['milestone_authorization_policy']={'new_milestone_requires_explicit_user_request_or_confirmation':True,'next_step_does_not_authorize_new_milestone':True,'source':rel(e/'authorization.json')}
s['milestone_ownership_correction']={'record':rel(record),'source_index':rel(new/'continuation.md'),'legacy_source_mapping':rel(e/'rehome-map.json'),'withdrawn_milestones':['M003','M004'],'retained_history':'all old professional approvals and functional scoped UAT records keep their scope; no overall closeout'}
s['superseded_control_decisions'] += [{'id':'TRANSITION-M003-001','scope':'autonomous new milestone initialization; all requirements actually M002'},{'id':'TRANSITION-M003-106','scope':'M003 active milestone inference only; preserve scoped work/approvals'},{'id':'TRANSITION-M002-123','scope':'terminal state superseded by explicit reopening; historical scoped acceptance remains valid'}]
for c in s['open_change_requests']:
 if c['id']=='CR-313':c.update(source=rel(new/'changes/CR-313.md'),next_action='Continue M002-UI-33-R1 directly from prior formal design sources; config prototype UI15 is rejected',pronunciation_design_status='M002-UI-32 awaiting_user_review; legacy UI14 unchanged')
s['context_entries'].update(start_record=rel(record),current_handoff=s['current_handoff'],task_index=rel(new/'design/config-portability/design-spec.md'),stage_entry=rel(record),upstream_handoff=rel(new/'handoffs/product.md'),pending_scope_change=rel(new/'changes/CR-313.md'),scope_index=rel(new/'continuation.md'))
s['retained_legacy_product_submission']=copy.deepcopy(s['product_submission'])
s['product_submission'].update(version='M002-PRODUCT-09-R1',legacy_version='M003-PRODUCT-12-R1',handoff=rel(new/'handoffs/product.md'),source_manifest=rel(e/'rehome-map.json'),ownership_correction=t['id'])
s['product_work'].update(version_target='M002-PRODUCT-09-R1',current_source=rel(new/'product/config-portability.md'),source=rel(new/'changes/CR-313.md'))
s['design_work'].update(version_target='M002-UI-33-R1',new_source_root=rel(new/'design/config-portability'),target_handoff=s['current_handoff'],upstream_handoff=rel(new/'handoffs/product.md'),ownership_correction=t['id'])
s['design_work']['inputs']=['M002-PRODUCT-09-R1; mechanical alias of accepted PRODUCT12-R1','Prior formal M002 sources plus inherited accepted model/plan increments; original source hashes preserved']
s['design_submission'].update(version='M002-UI-33',legacy_version='M003-UI-15',handoff=s['current_handoff'],status='changes_requested',approved=False,ownership_correction=t['id'])
for x in s.get('retained_design_submissions',[]):
 if x['version']=='M003-UI-14':x.update(version='M002-UI-32',legacy_version='M003-UI-14',handoff=rel(new/'handoffs/pronunciation-uiux.md'),ownership_correction=t['id'])
for x in s['retained_product_approvals']:
 if x['version'] in versions:x.update(legacy_version=x['version'],version=versions[x['version']],ownership_correction=t['id'])
statepath.write_text(yaml.safe_dump(s,sort_keys=False,allow_unicode=True,width=110))
pp=r/'.planning/agt/project.yaml';p=yaml.safe_load(pp.read_text());p['milestone'].update(id='M002',status='active',active_role='uiux/base',active_agent='designer-tony',current_handoff=s['current_handoff'],current_scope='M002 continuation: CR313 formal-design inheritance correction',current_uat_milestone='M002',current_design_version='M002-UI-33-R1',current_design_status='in_revision',current_product_version='M002-PRODUCT-09-R1',current_product_status='accepted',milestone_closeout_status='not_approved',correction_record=rel(record),initialization_record='.planning/milestones/M002/reviews/start.md')
p['milestone']['previous_completion']={'id':'M001','completion_decision':'TRANSITION-M001-138','completion_record':'.planning/milestones/M001/handoffs/verification.md'}
p['milestone']['retained_pending_designs']=[{'version':'M002-UI-32','legacy_version':'M003-UI-14','scope':'pronunciation','status':'awaiting_user_review','handoff':rel(new/'handoffs/pronunciation-uiux.md')}]
p['milestone']['historical_started_at_m003']=p['milestone'].pop('started_at',None)
oldproject=yaml.safe_load((old/'reviews/evidence/start/m002-project.yaml').read_text());p['milestone']['started_at']=oldproject.get('milestone',{}).get('started_at',now);p['milestone']['reopened_at']=now
p['milestone_authorization_policy']=s['milestone_authorization_policy'];p['milestone_ownership_correction']=s['milestone_ownership_correction']
pp.write_text(yaml.safe_dump(p,sort_keys=False,allow_unicode=True,width=110))
ap=r/'.planning/agt/agents.yaml';aa=yaml.safe_load(ap.read_text());events=[json.loads(x) for x in (e/'gate-events.jsonl').read_text().splitlines() if x.strip()];thread=next((x['thread_id'] for x in events if x['type']=='thread.started'),None)
for agent in aa['agents']:
 agent['status']='active' if agent['display_name']=='designer-tony' else 'registered'
 if agent['display_name']=='designer-tony':agent['runtime_note']='M002-UI-33-R1 inherits prior formal design; M003 ownership withdrawn by124; continue only in M002 scope'
 if agent['display_name']=='gatekeeper-owen':
  agent['runtime_note']='M002124 ownership recovery independently reviewed; parent applied mechanical correction'
  if thread:agent['runtime_id']=thread
ap.write_text(yaml.safe_dump(aa,sort_keys=False,allow_unicode=True,width=110))
hp=r/'.planning/workflow/history.yaml';h=yaml.safe_load(hp.read_text());prior=copy.deepcopy(h);assert not any(isinstance(v,list) and any(isinstance(x,dict) and (x.get('id')==t['id'] or x.get('decision_id')==t['id']) for x in v) for v in h.values());h['transitions'].append(t);hp.write_text(yaml.safe_dump(h,sort_keys=False,allow_unicode=True,width=110));assert h['transitions'][:-1]==prior['transitions']
assert all(v==h[k] for k,v in prior.items() if k!='transitions')
assert all(sha(r/f)==val for f,val in before['files'].items() if f!='.planning/milestones/M003/README.md')
(e/'transition-receipt.json').write_text(json.dumps({'result':'PASS','transition':t,'milestone_closeout':'not_approved','preserved_m003_files':len(before['files']),'copied_files':len(filemap),'new_semantic_approvals':False,'application_runtime_changes':False,'current_scope_index':rel(new/'continuation.md'),'source_map':rel(e/'rehome-map.json')},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'milestone':s['milestone'],'stage':s['stage'],'agent':s['active_agent'],'current_design':s['design_work']['version_target'],'copied_files':len(filemap),'preserved_m003':len(before['files'])},ensure_ascii=False))
