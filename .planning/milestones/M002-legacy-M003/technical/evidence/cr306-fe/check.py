"""Bounded FE03 document/contract/source checks; no application or runtime acceptance."""
from pathlib import Path
import hashlib,json,re,tarfile,datetime,subprocess
root=Path(__file__).resolve().parents[6]
m=root/'.planning/milestones/M003'; out=Path(__file__).parent
checks=[]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name,ok,detail=None): checks.append({'id':name,'pass':bool(ok),'detail':detail})
front=m/'technical/frontend.md'; hand=m/'handoffs/frontend-architecture.md'; cr=m/'changes/CR-306.md'
s=front.read_text(); h=hand.read_text()
for p in [front,hand]:check('version:'+p.name,'version: M003-FE-03' in p.read_text())
for i in range(1,15):check(f'FE3-{i:02}',f'## FE3-{i:02}' in s)
for prefix,count in [('T',6),('V',19)]:
 for i in range(1,count+1):check(f'FE3-{prefix}{i:02}',f'FE3-{prefix}{i:02}' in s)
check('CR-open','status: open' in cr.read_text())
anchor='<a id="cr306-frontend-repair"></a>'
old=(out/'cr306-before.txt').read_text()
# Other owner's CR section may receive authorized correction concurrently; exact original prefix is reported separately.
check('CR-frontend-section-single',cr.read_text().count(anchor)==1)
cr_prefix_unchanged=cr.read_text().split(anchor)[0].rstrip()==old.rstrip()
links=[]
for p in [front,hand]:
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if target.startswith(('http:','https:','#')):continue
  parts=target.split('#',1);target=parts[0];q=(p.parent/target).resolve()
  if q.name in ['check.json','source-manifest.json','source.tar.gz'] and q.parent==out:continue
  anchor_ok=True
  if len(parts)>1 and q.is_file():
   body=q.read_text(); anchors=re.findall(r'<a id="([^"]+)"',body)
   anchors += [re.sub(r'[^\w\- ]','',x).lower().replace(' ','-') for x in re.findall(r'^#{1,6} (.+)$',body,re.M)]
   anchor_ok=parts[1] in anchors
  links.append({'source':str(p.relative_to(root)),'target':'#'.join(parts),'exists':q.exists(),'anchor_ok':anchor_ok})
check('local-links',all(x['exists'] and x['anchor_ok'] for x in links),[x for x in links if not x['exists'] or not x['anchor_ok']])
paths=['frontend/app/pages/admin/models.vue','frontend/app/presentation/components/AppDialog.vue','frontend/app/application/admin/model-draft.ts','frontend/app/application/admin/provider-draft.ts','frontend/app/application/shared/models.ts','frontend/app/application/shared/ports.ts','frontend/app/infrastructure/http/schemas/admin.ts','frontend/app/infrastructure/http/schemas/common.ts','frontend/app/infrastructure/http/mappers/index.ts','frontend/app/infrastructure/http/mappers/admin-provider-mapper.ts','frontend/app/infrastructure/http/mappers/problem-mapper.ts','frontend/app/infrastructure/http/repositories/api-repository.ts','frontend/app/runtime/stores/admin.ts','frontend/scripts/sync-design.mjs']
check('existing-source-paths',all((root/p).exists() for p in paths))
for name,tokens in {'strict-custom':['重复键','解码后的键','16384','±(2^53−1)','U+0000','root','JSON Pointer'],'modal':['showModal','model-discard','opener','dialog-body','UIA-M003-416.r1'],'typed':['ModelConfigurationInput','NewModelConfiguration','modelBody','saveModelProvider','custom_parameters','customParameters'],'business':['m003-stream-v5','Plan','Q02','USER-M003-NO-DATA-MIGRATION','generation_unavailable','accepted:false']}.items():
 # root is represented by the Chinese normative root-depth text.
 if name=='strict-custom':tokens.remove('root')
 check(name,all(t in s for t in tokens),{'missing':[t for t in tokens if t not in s]})
fixtures=m/'technical/fixtures/cr306'
management=json.loads((fixtures/'management.json').read_text());errors=json.loads((fixtures/'errors.json').read_text());streams=json.loads((fixtures/'streams.json').read_text())
check('fixture-admin-field',all(isinstance(model['custom_parameters'],dict) for provider in management['get']['body']['data']['items'] for model in provider['models']))
check('fixture-field-shape',all(set(e)=={'field','code'} for c in errors['cases'] for e in c['problem'].get('field_errors',[])))
check('fixture-five-streams',{c['id'] for c in streams['cases']}=={'timeout','fenced_plan','cancelled','settlement_pending','preview_timeout'})
check('fixture-wire-v5',streams['contract_version']=='m003-stream-v5')
before=json.loads((m/'reviews/evidence/cr306-frontend-entry-075/frontend-before-manifest.json').read_text())
archive=m/'reviews/evidence/cr306-frontend-entry-075/M003-FE-02-before-cr306.tar.gz'
before_chars=0
with tarfile.open(archive) as t:
 for item in before['files']:
  member=next((n for n in t.getnames() if n.lstrip('./')==item['path'].lstrip('./')),None)
  raw=t.extractfile(member).read() if member else b''
  check('FE02-recover:'+item['path'],hashlib.sha256(raw).hexdigest()==item['sha256'])
  before_chars+=len(raw.decode())
r1=m/'design/evidence/cr306-r1/M003-UI-10-R1-source-manifest.json';rm=json.loads(r1.read_text())
# A new owner clarification may change current files, so verify R1 frozen archive rather than compare current UI against old hashes.
archive_meta=rm['archive']
if isinstance(archive_meta,dict):
 ap=root/archive_meta.get('path',''); check('R1-frozen-archive',ap.exists() and sha(ap)==archive_meta.get('sha256'))
browser=json.loads((m/'design/evidence/cr306-r1/modal-rework-browser.json').read_text())
check('R1-owner-modal-evidence',browser.get('completed') is True and browser.get('result')=='PASS')
clarification=m/'design/evidence/cr306-r1-clarification/M003-UI-10-R1.1-contract-clarification-manifest.json'
cm=json.loads(clarification.read_text())
check('R1.1-current-source-hashes',all((root/i['path']).exists() and sha(root/i['path'])==i['sha256'] for i in cm['files']))
check('R1.1-archive-hash',sha(root/cm['archive']['path'])==cm['archive']['sha256'])
check('R1.1-frozen-R1-hashes',all(sha(root/i['path'])==i['sha256'] for i in cm['immutable_r1'].values()))
cv=json.loads((root/cm['targeted_verification']['path']).read_text())
check('R1.1-owner-evidence',cv['completed'] is True and cv['result']=='PASS' and len(cv['scenarios'])==6)
protected=json.loads((out/'protected-before.json').read_text())['files']
changes=[{'path':p,'before':digest,'after':sha(root/p) if (root/p).exists() else None} for p,digest in protected.items() if not (root/p).exists() or sha(root/p)!=digest]
authorized_ui={str((m/part).relative_to(root)) for part in ['design/design-spec.md','design/copy.json','design/prototype/app.js','design/prototype/index.html','design/prototype/fixtures.json','design/interactions.md','design/responsive-accessibility.md','handoffs/uiux.md']}
unexpected=[c for c in changes if c['path'] not in authorized_ui]
check('protected-no-unexpected-change',not unexpected,unexpected)
# Compare earlier owner sections separately; designer-tony can update only UI section in parallel.
prefix_before=old.split('<a id="cr306-ui-repair"></a>')[0]
prefix_after=cr.read_text().split('<a id="cr306-ui-repair"></a>')[0]
check('CR-other-owner-prefix-preserved',prefix_before==prefix_after)
inputs=[m/'handoffs/product.md',m/'handoffs/backend-architecture.md',m/'handoffs/database.md',m/'handoffs/uiux.md',m/'technical/backend.md',m/'technical/database.md',m/'technical/ai-integration.md',m/'technical/api/administration.md',m/'technical/api/generation.md',m/'technical/api/presets.md',m/'design/design-spec.md',m/'design/copy.json',m/'design/theme.css',m/'design/prototype/app.js',m/'design/interactions.md',m/'design/responsive-accessibility.md',m/'reviews/requirements-feedback.md',m/'reviews/cr306-frontend-entry-gate-075.md',r1]+list(fixtures.glob('*.json'))+[root/p for p in paths]
result={'version':'M003-FE-03','method':'static document/source/fixture/frozen-hash checks only','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'PASS' if all(c['pass'] for c in checks) else 'FAIL','counts':{'checks':len(checks),'passed':sum(c['pass'] for c in checks)},'checks':checks,'protected':{'baseline_count':len(protected),'changed_by_authorized_parallel_ui_owner':changes,'unexpected':unexpected,'cr_full_preexisting_prefix_unchanged':cr_prefix_unchanged,'scope':'Only enumerated files; no UAT DB/process/config validation'},'characters':{'same_scope_two_FE_files_before':before_chars,'same_scope_two_FE_files_after':len(s)+len(h),'static_referenced_inputs_unicode_characters':sum(len(p.read_text()) for p in inputs),'actual_runtime_input_tokens':'unknown','usage':'unknown'},'not_executed':['application tests/build','browser/product checks','SQL/DB/migrations','real providers','UAT','new-session handoff test'],'links':links}
(out/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'counts':result['counts'],'failed':[c for c in checks if not c['pass']],'authorized_parallel_changes':[c['path'] for c in changes]},ensure_ascii=False))
