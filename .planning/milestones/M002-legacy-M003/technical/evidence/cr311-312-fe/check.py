from pathlib import Path
import hashlib,json,re,tarfile
ROOT=Path(__file__).resolve().parents[6]
M=ROOT/'.planning/milestones/M003'
E=M/'technical/evidence/cr311-312-fe'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p): return str(p.relative_to(ROOT))
def dump(p,data): p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
checks=[]
def check(name,ok,detail=None): checks.append({'check':name,'pass':bool(ok),'detail':detail})
before=json.loads((E/'before-manifest.json').read_text())
with tarfile.open(E/'before.tar.gz') as t:
 check('four original documents recoverable',all(hashlib.sha256(t.extractfile(p).read()).hexdigest()==v['sha256'] for p,v in before.items()),list(before))
 originals={p:t.extractfile(p).read().decode() for p in before}
protected=json.loads((E/'protected-before.json').read_text())
drift=[p for p,h in protected.items() if not (ROOT/p).exists() or sha(ROOT/p)!=h]
check('638 application/upstream/profile files unchanged',not drift,{'count':len(protected),'drift':drift})
manifest=json.loads((M/'design/evidence/cr312-r4/M003-UI-13-R4-source-manifest.json').read_text())
source_results={}
for p,h in manifest['source_files'].items():
 file=M/p
 actual=sha(file)
 if p=='changes/CR-312.md':
  # FE appended its own reception only; the original approved prefix is frozen.
  original=originals[rel(file)]
  source_results[p]=hashlib.sha256(original.encode()).hexdigest()==h and file.read_text().startswith(original)
 else: source_results[p]=actual==h
check('R4 11 source hashes including preserved CR312 original prefix',all(source_results.values()),source_results)
evidence_results={p:sha(M/p)==h for p,h in manifest['evidence_files'].items()}
check('R4 12 frozen evidence hashes',all(evidence_results.values()),evidence_results)
check('R4 archive hash',sha(M/'design/evidence/cr312-r4'/manifest['archive'])==manifest['archive_sha256'])
for n in [311,312]:
 p=M/f'changes/CR-{n}.md'; old=originals[rel(p)]
 check(f'CR{n} only append frontend reception',p.read_text().startswith(old) and p.read_text().count('id="frontend-resolution"')==1)
f=M/'technical/frontend.md';h=M/'handoffs/frontend-architecture.md';ft=f.read_text();ht=h.read_text()
ids=[f'FE3-{i:02d}' for i in range(1,17)]+[f'FE3-T{i:02d}' for i in range(1,7)]+[f'FE3-V{i:02d}' for i in range(1,22)]+[f'FE4-T{i:02d}' for i in range(1,6)]+[f'FE4-V{i:02d}' for i in range(1,9)]
check('stable baseline/current IDs and incoming explicit anchors retained',all(x in ft for x in ids) and all('id="'+x+'"' in ft for x in ['fe3-cr309','fe3-cr310','fe4-cr311-312']),{'ids':ids})
check('unique current FE04 handoff awaiting review',ht.count('\n# ')==1 and 'version: M003-FE-04' in ht and 'status: awaiting_user_review' in ht and 'version: M003-FE-04' in ft)
# Check current Markdown local targets. Optional fragments are checked for explicit ids or headings.
def slug(s): return re.sub(r'[^\w\-\u4e00-\u9fff ]','',s.lower()).replace(' ','-')
missing=[]
for p in [f,h]:
 for dest in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if re.match(r'\w+://',dest): continue
  dest=dest.split(' "')[0];target,_,anchor=dest.partition('#'); q=(p.parent/target).resolve() if target else p
  # Generated evidence files are checked after generation below.
  if q in [E/'check.json',E/'source-manifest.json']:continue
  if not q.exists():missing.append([rel(p),dest,'missing path']);continue
  if anchor and q.suffix=='.md':
   s=q.read_text(); anchors=set(re.findall(r'<a id="([^"]+)"',s))|{slug(v) for v in re.findall(r'^#+ (.+)$',s,re.M)}
   if anchor not in anchors:missing.append([rel(p),dest,'missing anchor'])
check('current FE local links and fragments resolve',not missing,missing)
# Source-reading trace: only focused inputs, no env/accounts or private data.
inputs=['frontend/app/application/shared/models.ts','frontend/app/application/admin/presets.ts','frontend/app/application/generation/reducer.ts','frontend/app/application/generation/vocabulary-search.ts','frontend/app/infrastructure/http/schemas/generation.ts','frontend/app/infrastructure/http/schemas/admin-presets.ts','frontend/app/infrastructure/http/repositories/api-repository.ts','frontend/app/infrastructure/http/repositories/admin-presets-repository.ts','frontend/app/infrastructure/http/mappers/index.ts','frontend/app/runtime/stores/generation.ts','frontend/app/runtime/stores/admin-presets.ts','frontend/app/presentation/components/GenerationWorkspace.vue','frontend/app/presentation/components/GenerationVocabularyList.vue','frontend/app/presentation/components/WordPicker.vue','frontend/app/pages/admin/presets.vue','frontend/scripts/sync-design.mjs','frontend/package.json']
check('named current code接点 exist',all((ROOT/p).is_file() for p in inputs),inputs)
check('current UIA427–438 trace and AC323–328 scope',all(str(i) in ft for i in range(427,439)) and 'AC323–328' in ft)
artifacts=[f,h,M/'changes/CR-311.md',M/'changes/CR-312.md']
with tarfile.open(E/'source.tar.gz','w:gz') as tar:
 for p in artifacts:tar.add(p,arcname=rel(p))
source={'version':'M003-FE-04','status':'awaiting_user_review','source_files':{rel(p):sha(p) for p in artifacts},'archive':'source.tar.gz','archive_sha256':sha(E/'source.tar.gz'),'before_archive_sha256':sha(E/'before.tar.gz'),'code_inputs':{p:sha(ROOT/p) for p in inputs},'upstream':{'design_manifest':sha(M/'design/evidence/cr312-r4/M003-UI-13-R4-source-manifest.json'),'backend_handoff':sha(M/'handoffs/backend-architecture.md'),'generation_api':sha(M/'technical/api/generation.md'),'preview_api':sha(M/'technical/api/presets.md'),'profile_1_0':sha(M/'reviews/evidence/start/locked-profile.yaml'),'routing_v1':sha(ROOT/'.planning/agt/model-routing-v1.lock.json')},'requested_model':'gpt-6-astra','requested_effort':'high','actual_model':'unknown','usage':'unknown','scope':'frontend technical design only; no application execution, provider call, control mutation or UAT refresh'}
dump(E/'source-manifest.json',source)
counts={'unit':'Unicode characters (not runtime tokens)','files':[rel(f),rel(h)],'before':sum(before[rel(p)]['characters'] for p in [f,h]),'after':sum(len(p.read_text()) for p in [f,h]),'by_file':{rel(p):{'before':before[rel(p)]['characters'],'after':len(p.read_text())} for p in [f,h]}}
result={'version':'M003-FE-04','method':'python3 .planning/milestones/M003/technical/evidence/cr311-312-fe/check.py','scope':'static reception/hash/link/ID checks only','pass':all(x['pass'] for x in checks),'checks':checks,'characters':counts,'not_run':['Vue/product tests','browser replay','independent QA','new-session handoff test','provider calls','UAT refresh'],'actual_input_tokens':'unknown','actual_runtime_usage':'unknown'}
dump(E/'check.json',result)
print(json.dumps({'pass':result['pass'],'passed':sum(x['pass'] for x in checks),'total':len(checks),'failed':[x for x in checks if not x['pass']],'characters':counts},ensure_ascii=False,indent=2))
raise SystemExit(0 if result['pass'] else 1)
