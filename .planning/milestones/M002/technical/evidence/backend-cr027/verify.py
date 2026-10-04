from pathlib import Path
import re, json, hashlib, tarfile, yaml, ctypes
r=Path(__file__).resolve().parents[6]
m=r/'.planning/milestones/M002';e=m/'technical/evidence';i=json.loads((e/'M002-BE-04-inputs.json').read_text());checks=[]
def check(name, condition, detail=None):
 checks.append({'check':name,'result':'PASS' if condition else 'FAIL','detail':detail})
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
with tarfile.open(e/'M002-BE-04-before.tar.gz') as t:
 old={p:t.extractfile('.planning/milestones/M002/'+p).read().decode() for p in i['sources']}
new={p:(m/p).read_text() for p in i['sources']}
s=yaml.safe_load((r/'.planning/workflow/state.yaml').read_text())
check('role_and_stage',s['active_agent']=='backend-alex' and s['stage']=='technical-design')
changed=[p for p,h in i['protected'].items() if not (r/p).is_file() or digest(r/p)!=h]
check('protected_files_unchanged',not changed,{'count':len(i['protected']),'changed':changed})
check('old_sources_recoverable',all(hashlib.sha256(v.encode()).hexdigest()==i['before']['.planning/milestones/M002/'+p] for p,v in old.items()))
a=new['technical/api/generation-presets.md'];b=new['technical/backend.md'];h=new['handoffs/backend-architecture.md'];c=new['changes/CR-027.md']
check('API004_admin_scope_explicit','（**V/L/A**）' in a and '所有角色可用于搜索' in (m/'product/data-assets.md').read_text())
check('API004_only_search_section_changed',a.split('`POST /api/v1/vocabulary/random`',1)[1]==old['technical/api/generation-presets.md'].split('`POST /api/v1/vocabulary/random`',1)[1])
idx=new['technical/api/index.md'];prev=old['technical/api/index.md']
check('common_API_contract_unchanged',idx.split('## 1.',1)[1].split('## 5.',1)[0]==prev.split('## 1.',1)[1].split('## 5.',1)[0])
check('canonical_entry_response_retained','{items:[{entry:string}],vocabulary_version:string}' in a and '无 entry_id' in a and '不增加端点' in a)
check('read_only_and_no_privilege_expansion',all(x in a for x in ['不调用模型','不扣生成次数','不创建预设/预览/学习记录','不因可搜索获得个人学习权限','以下随机候选、普通选项/生成继续仅 V/L']))
old_ids=set(re.findall(r'\bBE2-(?:D|R|V)\d+', '\n'.join(old.values())));new_ids=set(re.findall(r'\bBE2-(?:D|R|V)\d+', '\n'.join(new.values())))
check('inherited_stable_BE_ids_retained',old_ids<=new_ids,{'missing':sorted(old_ids-new_ids)})
check('all_original_capabilities_retained',set(re.findall(r'\| CAP-\d+ \|',old['technical/backend.md']))==set(re.findall(r'\| CAP-\d+ \|',b)))
check('CR027_followups_visible',all(x in b and x in h for x in ['BE4-I01','BE4-V01']) and '仍 OPEN' in c and '待前端接收' in c)
check('excluded_and_retained_work_preserved',all(x in h for x in ['D2-88-LOCAL-SCOPE','CR039-L1','CR042-L1','AI-QUALITY-90','W01','QA26-MINIMAX']))
# Static source evidence; this is not HTTP execution or application unit testing.
server=(r/'backend/internal/httpapi/server.go').read_text();handler=(r/'backend/internal/httpapi/catalog_handlers.go').read_text();service=(r/'backend/internal/vocabulary/service.go').read_text();sql=(r/'backend/db/queries/vocabulary.sql').read_text();analytics=(r/'backend/internal/httpapi/analytics_events.go').read_text()
search_handler=handler.split('func (server *Server) vocabularySearch',1)[1].split('func (server *Server) generationOptions',1)[0]
search_service=service.split('func (s *Service) Search',1)[1].split('const randomCandidateSQL',1)[0]
check('static_shared_route_and_read_query', 'api.Get("/vocabulary/search", server.vocabularySearch)' in server and not any(x in search_handler for x in ['IsAdmin','entitlement.','generation.']) and 'SearchVocabulary' in search_service and 'GetVocabularySnapshot' in search_service and not re.search(r'\b(UPDATE|INSERT|DELETE)\b',sql))
check('static_admin_random_is_denied','if actor.IsAdmin()' in service.split('func (s *Service) Search')[0] and 'return result, entitlement.ErrForbidden' in service and 'if actor.IsAdmin()' in analytics)
check('limit_narrowing_finding_evidenced','strconv.Atoi(raw)' in search_handler and 'int32(limit)' in search_handler and 'limit < 1 || limit > 20' in search_service and ctypes.c_int32(4294967297).value==1,{'method':'static source inspection plus signed-int32 arithmetic illustration; no HTTP','input':4294967297,'after_int32':ctypes.c_int32(4294967297).value})
# Check added local links, preserving unchanged baseline link behavior.
def links(s):return set(re.findall(r'\]\(([^)]+)\)',s))
def slug(v):return re.sub(r'[^\w\-\s]','',v.lower()).replace(' ','-')
missing=[];checked=[]
for p,v in new.items():
 for url in sorted(links(v)-links(old[p])):
  if url.startswith(('http:','https:','mailto:')):continue
  loc,_,anchor=url.partition('#');loc=re.sub(r':\d+$','',loc)
  target=((m/p).parent/loc).resolve() if loc else m/p
  # This report is generated below; all other targets must already exist.
  if target==e/'M002-BE-04-check.json':continue
  if not target.is_file():missing.append([p,url,'missing_file']);continue
  if anchor and target.suffix=='.md':
   t=target.read_text();ids=set(re.findall(r'<a id="([^"]+)"',t))|{slug(x) for x in re.findall(r'^#{1,6} (.+)$',t,re.M)}
   if anchor not in ids:missing.append([p,url,'missing_anchor'])
  checked.append([p,url])
check('added_local_links_and_anchors',not missing,{'checked':len(checked),'missing':missing})
result={'version':'M002-BE-04','scope':'static documents and existing source inspection','status':'PASS' if all(x['result']=='PASS' for x in checks) else 'FAIL','checks':checks,'source_hashes':{p:digest(m/p) for p in i['sources']},'document_sizes':{'before':i['document_size_before'],'after':{p:{'chars':len(v),'bytes':len(v.encode())} for p,v in new.items()}},'not_run':['actual HTTP with admin/visitor/learner','application unit/integration tests','DB writes or migrations','provider calls','independent new-session handoff'],'unresolved':['frontend FE3-G01 reception','BE4-I01 code correction','BE4-V01–03 runtime verification'],'application_modified':False,'real_ai_calls':0}
out=e/'M002-BE-04-check.json'
if out.exists() and json.loads(out.read_text()).get('status')=='FAIL':
 n=1
 while (e/f'M002-BE-04-check-prior-{n}.json').exists():n+=1
 out.rename(e/f'M002-BE-04-check-prior-{n}.json')
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':result['status'],'checks':len(checks),'failures':[x for x in checks if x['result']=='FAIL']},ensure_ascii=False))
raise SystemExit(0 if result['status']=='PASS' else 1)
