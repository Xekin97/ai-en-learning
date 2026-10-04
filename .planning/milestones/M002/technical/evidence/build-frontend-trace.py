from pathlib import Path
import json,re

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M002'
target = M / 'technical/frontend-traceability.json'
if target.exists(): raise SystemExit('Refusing to replace an existing trace')
# view: production route, component, application model, APIs, plan anchor, test
spec = {
'home': ('/', 'HomeStoryStack', 'PublicHomeSamples', '001 209', 'design', '13 15'),
'register': ('/register', 'AuthForm', 'AuthIntent', '002 006', 'generation', '07'),
'login': ('/login', 'AuthForm', 'Session Welcome', '002 006 205', 'notices', '07 12'),
'library': ('/library', 'LibraryStats LibraryRow', 'LibraryPage', '007 008', 'generation', '08'),
'batch': ('/library/:batchId', 'TitleEditor SavedPassage ReadOnlyConfiguration', 'BatchDetail', '007 008', 'generation', '08 13'),
'range': ('/review', 'ReviewRangeSetup', 'RangeSetup ActiveRange', '008', 'review', '04 05 08'),
'sessiondone': ('/review/:sessionId', 'SessionTotals', 'ReviewSession', '008', 'review', '05'),
'review': ('/review/:sessionId', 'LetterSlots PassageCloze', 'Draft ReviewSession', '008', 'review', '03 04 05'),
'overview': ('/review/:sessionId', 'AnswerOverview', 'Draft', '008', 'review', '03 05'),
'summary': ('/review/:sessionId', 'AttemptSummary', 'EphemeralComparison Receipt', '008', 'review', '05'),
'create': ('/create', 'CreationWorkspace EditableConfiguration WordPicker', 'GenerationWorkspace', '004 005 006', 'generation', '06 07'),
'profile': ('/account', 'AccountShell ProfileForm AccountSecurity', 'Account', '003 201', 'growth', '07'),
'notices': ('/notices', 'NoticeList SafeNoticeBody', 'NoticeCollection', '205', 'notices', '12'),
'growth': ('/account/growth', 'AccountShell CheckinCalendar AchievementGroup LevelAwardList', 'Growth', '203', 'growth', '09 10'),
'bag': ('/account/items', 'AccountShell OwnedItemCard EffectPreview', 'OwnedItem', '204', 'growth', '09'),
'shop': ('/account/exchange', 'AccountShell ShopItemCard', 'Catalog', '204', 'growth', '09'),
'trial': ('/trial/:presetId', 'PresetWorkspace ReadOnlyConfiguration', 'PublishedPreset GenerationWorkspace', '202 005 006', 'generation', '06 07 11'),
'explore': ('/explore', 'MeaningLanguageTabs PresetGallery', 'PublishedPresetCollection', '202 209', 'generation', '11 15'),
'adminhome': ('/admin', 'OverviewMetrics ModuleLinks', 'AdminOverview', '209', 'growth', '16'),
'metrics': ('/admin/analytics', 'MetricTile MetricChart', 'AnalyticsDashboard', '209', 'quality', '16'),
'models': ('/admin/models', 'CredentialForm ModelEditor RemovalImpact', 'AdminModels', '101', 'growth', '10'),
'plans': ('/admin/plans', 'PlanEditor PriorityEditor', 'Plans', '102', 'growth', '10'),
'users': ('/admin/users', 'UserSearch', 'UserSearchPage', '103', 'growth', '10'),
'userdetail': ('/admin/users/:userId', 'UserDetailSections AdminBatchReader', 'UserDetail', '103', 'growth', '10'),
'credits': ('/admin/users/:userId#points', 'PointsLedger PointGrantForm', 'UserLedger', '103', 'growth', '10'),
'operations': ('/admin/growth', 'CheckinSettings LevelEditor AchievementEditor ItemDefinitionEditor', 'OperationsDraft', '206', 'growth', '10'),
'messages': ('/admin/notices', 'NoticeEditor MarkdownPreview', 'AdminNotices', '207', 'notices', '10 12'),
'presets': ('/admin/presets', 'PresetEditor PreviewWorkspace PublishConfirmation', 'PresetDraft', '208 202', 'generation', '11'),
}
trace = json.loads((M/'design/traceability.json').read_text())
pages=[]
for x in trace:
 views=[]
 for v in x['views']:
  route,component,model,apis,anchor,tests=spec[v]
  views.append({'prototype_view':v,'route':route,'components':component.split(),'application_models':model.split(),'apis':['API-'+a for a in apis.split()],'plan':'frontend.md#'+anchor,'verification':['FE2-V'+a for a in tests.split()]})
 pages.append({'page':x['page'],'title':x['title'],'product_source':x['source'],'design_source':'../design/design-spec.md','capabilities':x['capability_ids'],'data':x['data_ids'],'states':x['states'],'ui_acceptance':[x['ui_acceptance'],*x.get('additional_ui_acceptance',[])],'views':views})
caps=[]
for line in (M/'technical/backend.md').read_text().splitlines():
 if re.match(r'\| CAP-\d{3} \|',line):
  cap,meaning,apis,data=[s.strip() for s in line.split('|')[1:5]]
  caps.append({'capability':cap,'behavior':meaning,'backend_source':'backend.md#3-全量继承与用例追踪','apis_source_notation':apis,'data_source_notation':data,'pages':[p['page'] for p in pages if cap in p['capabilities']]})
old={'PAGE-001':['PAGE-205'],'PAGE-002':['PAGE-002'],'PAGE-003':['PAGE-003'],'PAGE-004':['PAGE-204'],'PAGE-005':['PAGE-005'],'PAGE-006':['PAGE-006'],'PAGE-007':['PAGE-007'],'PAGE-008':['PAGE-008','PAGE-201','PAGE-202','PAGE-203'],'PAGE-009':['PAGE-206'],'PAGE-101':['PAGE-208'],'PAGE-102':['PAGE-208'],'PAGE-103':['PAGE-103']}
fde_anchors=['routes','design','generation','review','generation','growth','notices','generation','growth']
fde=[{'id':f'FDE-{i:02}','source':f'../design/frontend-delta.md#fde-{i:02}','plan':'frontend.md#'+a} for i,a in enumerate(fde_anchors,1)]
# Use document reference + section label; Markdown heading slug includes Chinese text.
for x in fde:x['source']='../design/frontend-delta.md';x['source_section']=x['id']
data=sorted({d for p in pages for d in p['data']})
out={'version':'M002-FE-01','status':'awaiting_user_review','product':'M002-PRODUCT-03','design':'M002-UI-22-H01','api':'M002-BE-02','pages':pages,'capabilities':caps,'m001_pages':old,'design_deltas':fde,'active_data':data,'replaced_data':[{'id':'DATA-015','replacement':'DATA-202','rule':'Only minimal facts; no historic answers','plan':'frontend.md#review'}],'contract_gaps':[{'id':'FE2-G01','pages':['PAGE-210','PAGE-214'],'source':'../changes/CR-004.md'},{'id':'FE2-G02','pages':['PAGE-210'],'source':'../changes/CR-004.md'},{'id':'FE2-G03','pages':['PAGE-212'],'source':'../changes/CR-004.md'}]}
target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'pages':len(pages),'views':sum(len(p['views']) for p in pages),'CAP':len(caps),'active_DATA':len(data),'UIA':len({u for p in pages for u in p['ui_acceptance']}),'M001':len(old)}))
