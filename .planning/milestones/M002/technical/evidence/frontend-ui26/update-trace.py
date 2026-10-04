from pathlib import Path
import json,re
D=Path(__file__).resolve().parents[2];M=D.parent;p=D/'frontend-traceability.json';t=json.loads(p.read_text());design=json.loads((M/'design/traceability.json').read_text());d={x['page']:x for x in design}
t.update({'version':'M002-FE-03','status':'scoped_contract_gap','product':'M002-PRODUCT-04 plus D2-89; CR026 draft excluded','design':'M002-UI-26','design_approval':'APPROVAL-M002-065','contract_alignment':'SCOPED_GAP_FE3_G01_ADMIN_VOCABULARY'})
for row in t['pages']:
 source=d[row['page']];old=row['ui_acceptance'];new=re.findall(r'UIA-[A-Z0-9-]+',source['ui_acceptance'])+source.get('additional_ui_acceptance',[]);row['ui_acceptance']=list(dict.fromkeys(old+new));row['design_source']='../design/design-spec.md'
 for view in row['views']:
  name=view['prototype_view'];codes=['FE3-V01','FE3-V03']
  if 'UIA-GLOBAL-COPY25'in row['ui_acceptance']:codes+=['FE3-V08']
  if name in ['notices','messages']:codes+=['FE3-V04','FE3-V05'];view['components']+=['NoticeReadingDialog']
  if name in ['create','presets']:codes+=['FE3-V02','FE3-V06','FE3-V09'];view['components']+=['WordPicker','AppSelect'];view['application_models']+=['VocabularyResultModel']
  if name in ['presets','explore']:codes+=['FE3-V07'];view['components']+=['PresetWordMeanings']
  if name=='home':codes+=['FE3-V08']
  view['verification']=list(dict.fromkeys(view['verification']+codes));view['components']=list(dict.fromkeys(view['components']));view['application_models']=list(dict.fromkeys(view['application_models']));view['incremental_plan']='frontend.md#ui26'
for gap in t['contract_gaps']:
 gap.update({'status':'design_closed','change_request_status':'closed_by_TRANSITION-M002-016','closure_source':'../reviews/technical-design.md'})
t['contract_gaps'].append({'id':'FE3-G01','pages':['PAGE-212'],'source':'../changes/CR-027.md','status':'open_backend_contract_reception_required','plan':'frontend.md#ui26','affected_api':'API-004','owner':'backend-alex','blocked_scope':'Admin catalog search integration; other UI26 paths independently specified'})
t['ui26_incremental_tasks']=[{'id':f'FE3-I{i:02}','plan':'frontend.md#delivery','status':'planned' if i!=4 else 'partially_blocked_by_CR027'}for i in range(1,7)]
t['ui26_verification']=[{'id':f'FE3-V{i:02}','plan':'frontend.md#ui26','status':'not_executed_on_production'}for i in range(1,10)]
p.write_text(json.dumps(t,ensure_ascii=False,indent=2)+'\n')
