"""Bounded BE07 document/fixture lint. Not application, SQL, browser or AI testing."""
from pathlib import Path
import hashlib,json,re,tarfile
root=Path(__file__).resolve().parents[6]
p=root/'.planning/milestones/M003'
e=p/'technical/evidence/cr306'
checks=[]
def check(name,condition):
 checks.append({'check':name,'pass':bool(condition)})
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
rels=['technical/backend.md','technical/ai-integration.md','technical/api/index.md','technical/api/administration.md','technical/api/generation.md','technical/api/presets.md','handoffs/backend-architecture.md']
# Immutable accepted original archive, including the seven source members.
m=json.loads((p/'reviews/evidence/cr306-control-067/backend-before-manifest.json').read_text())
check('067 accepted archive SHA256',sha(root/m['archive'])==m['sha256'])
with tarfile.open(root/m['archive']) as t:
 for item in m['files']:
  matches=[n for n in t.getnames() if n==item['path'] or n.endswith('/'+item['path'])]
  check('067 original '+item['path'],len(matches)==1 and hashlib.sha256(t.extractfile(matches[0]).read()).hexdigest()==item['sha256'])
old=json.loads((p/'reviews/evidence/cr306-control-068/unsubmitted-backend-draft.json').read_text())
check('068 superseded draft archive SHA256',sha(root/old['archive'])==old['sha256'])
for rel in rels:check(rel+' version', 'version: M003-BE-07' in (p/rel).read_text())
api=(p/'technical/api/administration.md').read_text().split('<a id="api-306"></a>')[1]
for word in ['custom_parameters','16,384','深度≤8','0模型调用','model_request_rejected','顶层不相交','max_tokens','extra_body','reasoning.max_tokens']:
 check('API306 contains '+word,word in api)
for obsolete in ['ReasoningConfig =','ReasoningCapability =','/admin/model-capabilities/refresh','expected_capability_revision','reasoning_capability:']:
 check('removed draft contract '+obsolete,all(obsolete not in (p/r).read_text() for r in rels))
check('CR remains open','status: open' in (p/'changes/CR-306.md').read_text())
fixtures=p/'technical/fixtures/cr306'
index=json.loads((fixtures/'index.json').read_text())
for name in index['files']:
 data=json.loads((fixtures/name).read_text());check(name+' JSON/version',data['fixture_version']=='M003-BE-07')
management=json.loads((fixtures/'management.json').read_text())
ms=[m for i in management['get']['body']['data']['items'] for m in i['models']]
check('full management 3 protocols',{m['connection']['protocol'] for m in ms}=={'openai_chat','openai_responses','anthropic_messages'})
check('full DTO object fields',all(isinstance(m['custom_parameters'],dict) and 'output_mode' in m and 'max_output_tokens' in m and 'connection' in m for m in ms))
check('zero-call save fixture',management['save']['expected']['model_calls']==0 and management['save']['expected']['catalog_calls']==0)
check('probe effect unverified',management['probe']['expected']['parameter_effect']=='unknown' and not management['probe']['expected']['schema_tested'])
errors=json.loads((fixtures/'errors.json').read_text())
check('error case IDs unique',len({c['id'] for c in errors['cases']})==len(errors['cases']))
def depth(v):return 1+max((depth(x) for x in (v.values() if isinstance(v,dict) else v)),default=0) if isinstance(v,(dict,list)) else 0
for c in errors['cases']:
 check('error status '+c['id'],c['problem']['status']==c['http_status'])
 if c['id']=='too_deep':
  try: check('depth rejection example is valid JSON depth9',depth(json.loads(c['raw_custom_json']))==9)
  except ValueError:check('depth rejection example is valid JSON depth9',False)
check('16KiB exact boundary recipe',len(json.dumps({'x':'a'*16376},separators=(',',':')).encode())==16384)
streams=json.loads((fixtures/'streams.json').read_text())
for c in streams['cases']:
 wire=c['wire'];check('continuous seq '+c['id'],[x['data']['seq'] for x in wire]==list(range(1,len(wire)+1)))
 check('no fake content '+c['id'],all(not x['event'].endswith(('.edit','.plan_item')) for x in wire))
 check('null first business content '+c['id'],c['expected']['first_business_content_ms'] is None)
 if c['id']=='preview_timeout':check('preview no refund field',all('quota_refunded' not in x['data'] for x in wire))
 if c['id']=='settlement_pending':check('pending no refund claim',not c['status_response']['body']['data']['quota_refunded'] and not c['expected']['terminal_confirmed'])
# New-section relative links only; inherited historical contracts are not rewritten by lint.
anchors={'technical/backend.md':'<a id="be7-cr306"></a>','technical/ai-integration.md':'<a id="ai7-reasoning"></a>','technical/api/index.md':'<a id="api-306-index"></a>','technical/api/administration.md':'<a id="api-306"></a>','technical/api/generation.md':'<a id="api-306-generation"></a>','technical/api/presets.md':'<a id="api-306-preview"></a>'}
link_count=0
for rel in rels+['changes/CR-306.md']:
 f=p/rel;s=f.read_text();marker=anchors.get(rel,'<a id="cr306-backend-repair"></a>' if rel.startswith('changes/') else None)
 if marker:s=s.split(marker,1)[1]
 for target in re.findall(r'\]\(([^)]+)\)',s):
  if '://' in target:continue
  path,_,anchor=target.partition('#');dest=(f.parent/path).resolve() if path else f
  if dest in [e/'check.json',e/'source-manifest.json']:continue
  check('link '+rel+' -> '+target,dest.exists());link_count+=1
  if anchor and dest.exists() and dest.suffix=='.md':
   txt=dest.read_text();slugs=[re.sub(r'[^\w\u3400-\u9fff -]','',h.strip().lower()).replace(' ','-') for h in re.findall(r'^#+ (.+)$',txt,re.M)]
   check('anchor '+target,('id="'+anchor+'"') in txt or anchor in slugs)
files=[p/r for r in rels+['changes/CR-306.md']]+[fixtures/'index.json']+[fixtures/n for n in index['files']]
manifest={'version':'M003-BE-07','scope':'design sources only; no implementation acceptance','files':[{'path':str(f.relative_to(root)),'sha256':sha(f),'bytes':f.stat().st_size} for f in files]}
(e/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
input_paths=[p/'handoffs/product.md',p/'product/overview.md',p/'product/abilities.md',p/'product/data-assets.md',p/'product/ai-behavior.md',p/'product/pages/index.md',p/'verification/model-reasoning-research.md',p/'reviews/cr306-custom-product-gate-069.md',root/'.planning/workflow/state.yaml',root/'.planning/agt/model-routing-v1.lock.json',root/'backend/internal/admin/model_connections.go',root/'backend/internal/admin/model_providers.go',root/'backend/internal/ai/connections.go',root/'backend/internal/ai/gateway.go']
input_measurement={'basis':'static referenced file sizes; includes whole files for partially read references, excludes repeated reads and tool output; not runtime input usage','reference_scope_characters':sum(len(f.read_text()) for f in input_paths),'files':[str(f.relative_to(root)) for f in input_paths],'actual_cumulative_input_characters':'unknown','runtime_tokens':'unknown'}
result={'input_measurement':input_measurement,'version':'M003-BE-07','kind':'static_contract_and_fixture_check_only','passed':all(c['pass'] for c in checks),'checks':checks,'new_relative_links_checked':link_count,'source_character_count':sum(len(f.read_text()) for f in files),'runtime_tokens':'unknown','not_executed':['Go/application/API','SQL/DB','browser/full-page design','live model/real latency or cost','new-session handoff'],'command':'python3 .planning/milestones/M003/technical/evidence/cr306/check.py'}
(e/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'checks':len(checks),'failed':[c['check'] for c in checks if not c['pass']],'source_character_count':result['source_character_count']}))
raise SystemExit(0 if result['passed'] else 1)
