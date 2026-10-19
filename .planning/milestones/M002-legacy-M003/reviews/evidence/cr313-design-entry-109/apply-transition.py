from pathlib import Path
import yaml,json,hashlib,datetime,copy
r=Path('.')
e=r/'.planning/milestones/M003/reviews/evidence/cr313-design-entry-109'
review=e/'gate-last.md'
body=review.read_text()
assert 'review_status: PASS' in body and 'TRANSITION-M003-109' in body
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
before=json.loads((e/'before-manifest.json').read_text())
for f,h in before['files'].items(): assert sha(f)==h, f
paths={'state':r/'.planning/workflow/state.yaml','project':r/'.planning/agt/project.yaml','agents':r/'.planning/agt/agents.yaml','history':r/'.planning/workflow/history.yaml'}
d={k:yaml.safe_load(v.read_text()) for k,v in paths.items()}
s=d['state']; assert s['last_transition']['id']=='TRANSITION-M003-108'
assert s['product_submission']['version']=='M003-PRODUCT-12-R1'
assert s['milestone_closeout']['status']=='not_approved'
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
auth=json.loads((e/'authorization.json').read_text())
record='.planning/milestones/M003/reviews/cr313-design-entry-109.md'
Path(record).write_bytes(review.read_bytes())
t={'id':'TRANSITION-M003-109','decision_id':'TRANSITION-M003-109','operation':'transition-stage','milestone':'M003','from':'product-planning','to':'uiux-design','previous_role':'product/to-c','previous_agent':'product-maya','active_role':'uiux/base','active_agent':'designer-tony','timestamp':now,'authorized_by':auth['id'],'checked_by':'gatekeeper-owen','recorded_by':'root','evidence':record,'scope':auth['scope']}
s['retained_design_submissions']=s.get('retained_design_submissions',[])+[dict(copy.deepcopy(s['design_submission']),work=copy.deepcopy(s['design_work']))]
s.pop('design_submission')
s.update(stage='uiux-design',active_role='uiux/base',active_agent='designer-tony',status='active',last_transition=t,allowed_transitions=['technical-design','product-planning'])
s['product_submission'].update(status='accepted',approved=True,approval=t['id'],approved_at=now)
s['product_work']['status']='accepted'
s['retained_product_approvals'].append({'version':'M003-PRODUCT-12-R1','decision_id':t['id'],'user_authorization':auth['id'],'evidence':record,'manifest':str(e/'product-manifest.json'),'scope':'CR-313 operational configuration import/export'})
s['authorization_refs'].insert(0,{'id':auth['id'],'scope':auth['scope'],'source':str(e/'authorization.json')})
s['pending_user_decisions']=[x for x in s['pending_user_decisions'] if x['id']!='M003-PRODUCT-12-R1-REVIEW']
for c in s['open_change_requests']:
 if c['id']=='CR-313': c.update(owner_stage='uiux-design',next_action='Deliver separate UI15 prototype and formal admin design; product12R1 accepted by109; implementation remains pending')
profile=yaml.safe_load(Path('.planning/milestones/M003/reviews/evidence/start/locked-profile.yaml').read_text())
ui=next(x for x in profile['workflow']['stages'] if x['id']=='uiux-design')
s['required_artifacts']=[x.replace('{milestone}','M003') for x in ui['required_artifacts']]
root='.planning/milestones/M003/design/config-portability'
handoff='.planning/milestones/M003/handoffs/config-portability-uiux.md'
s['required_artifacts'] += [root+'/'+x for x in ['theme.css','prototype/index.html','formal/index.html','copy.json','design-spec.md','interactions.md','responsive-accessibility.md']]+[handoff]
s['design_work']={'scope':'CR-313 configuration import/export','owner':'designer-tony','status':'in_progress','version_target':'M003-UI-15','inputs':['M003-PRODUCT-12-R1','Existing M002/M003 admin layouts/dialogs/styles and safe mock fixtures'],'new_source_root':root,'target_handoff':handoff,'upstream_handoff':s['current_handoff'],'started_at':now,'must_deliver':['separate interaction prototype','formal design based on existing admin UI','reusable copy/styles/state/accessibility and browser evidence'],'preserve':'UI14 pronunciation and all existing canonical design/handoff bytes; pending review remains separate','not_authorized':['source implementation','technical/API/crypto implementation','real provider calls or credential reads','UAT3015 or preview4174/4175 refresh','UI14 approval','overall milestone closeout']}
s['context_entries'].update(stage_entry=record,upstream_handoff=s['current_handoff'],task_index='.planning/milestones/M003/product/config-portability.md',pending_design_handoff=handoff)
m=d['project']['milestone']; m.update(active_role='uiux/base',active_agent='designer-tony',current_scope='CR-313 operational configuration import/export design',current_product_status='accepted',current_design_version='M003-UI-15',current_design_status='in_progress')
m['retained_pending_designs']=[{'version':'M003-UI-14','scope':'pronunciation','status':'awaiting_user_review','handoff':'.planning/milestones/M003/handoffs/uiux.md'}]
events=[json.loads(x) for x in (e/'gate-events.jsonl').read_text().splitlines() if x.strip()]
thread=next((x['thread_id'] for x in events if x['type']=='thread.started'),None)
for a in d['agents']['agents']:
 a['status']='active' if a['display_name']=='designer-tony' else 'registered'
 if a['display_name']=='designer-tony': a.update(activated_at=now,runtime_note='UI15 CR313 prototype/formal design active by109; UI14 pronunciation pending review preserved')
 if a['display_name']=='product-maya': a['runtime_note']='PRODUCT12-R1 CR313 accepted by109; no further product work active'
 if a['display_name']=='gatekeeper-owen':
  a['runtime_note']='109 independent read-only gate PASS; parent mechanically applied scoped design transition'
  if thread:a['runtime_id']=thread
oldhistory=copy.deepcopy(d['history'])
d['history']['transitions'].append(t)
for k,v in paths.items():v.write_text(yaml.safe_dump(d[k],allow_unicode=True,sort_keys=False,width=110))
assert d['history']['transitions'][:-1]==oldhistory['transitions']
assert all(v==d['history'][k] for k,v in oldhistory.items() if k!='transitions')
receipt={'result':'PASS','transition':t,'overall_milestone_closeout':'not_approved','pronunciation_ui14':'awaiting_user_review unchanged','source_and_runtime_changes':False,'gate_sha256':sha(review),'control_after':{str(v):sha(v) for v in paths.values()},'scoped_handoff_strategy':auth['source_strategy']}
(e/'transition-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'transition':t['id'],'active':'designer-tony','stage':s['stage'],'product_accepted':s['product_submission']['version'],'milestone_closeout':s['milestone_closeout']['status']}))
