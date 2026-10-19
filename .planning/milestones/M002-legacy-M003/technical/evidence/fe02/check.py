"""Finite FE02 document/source reception checks; no application or model execution."""
from pathlib import Path
import hashlib, json, re
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[6]
M = ROOT / '.planning/milestones/M003'
OUT = Path(__file__).resolve().parent
FILES = [M/'technical/frontend.md', M/'handoffs/frontend-architecture.md']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
errors = []
links = 0
for p in FILES:
    s = p.read_text()
    if 'version: M003-FE-02' not in s: errors.append(f'{p.name}: version')
    if s.count('```') % 2: errors.append(f'{p.name}: fences')
    for target in re.findall(r'\]\(([^)]+)\)', s):
        if '://' in target: continue
        links += 1
        path, _, anchor = target.partition('#')
        q = (p.parent / unquote(path)).resolve() if path else p
        if not q.exists(): errors.append(f'{p.name}: missing {target}'); continue
        if anchor:
            body = q.read_text()
            anchors = set(re.findall(r'(?:id|name)=["\']([^"\']+)', body))
            for line in body.splitlines():
                if not line.startswith('#'): continue
                title = re.sub(r'^#+\s+', '', line).strip().lower()
                title = re.sub(r'[^\w\-\s\u4e00-\u9fff]', '', title)
                anchors.add(re.sub(r'\s+', '-', title))
            if unquote(anchor) not in anchors: errors.append(f'{p.name}: anchor {target}')
body = FILES[0].read_text()
ids = [f'FE3-{i:02}' for i in range(1,11)] + [f'FE3-T{i:02}' for i in range(1,7)] + [f'FE3-V{i:02}' for i in range(1,14)]
for item in ids:
    if item not in body: errors.append('missing stable ID: '+item)
copy = json.loads((M/'design/copy.json').read_text())
keys = set(copy['static']) | set(copy['templates'])
for key in ['m003.plan.note','m003.recheck','m003.incomplete','m003.preview.incomplete','m003.q02.confirm','m003.impact','m003.effect.new','m003.effect.inflight','m003.service.basic','m003.service.enhanced']:
    for lang in ['zh','en']:
        if lang+'.'+key not in keys: errors.append('missing copy: '+lang+'.'+key)
app = (M/'design/prototype/app.js').read_text()
if "t(reviewOn?'m003.service.enhanced':'m003.service.basic')" not in app and "t(reviewOn ? 'm003.service.enhanced'" not in app:
    errors.append('CR303 badge source')
if "t('m003.impact',{basic:plan.basicUsers,trial:plan.trialUsers})" not in app:
    errors.append('CR303 separate counts source')
report=json.loads((M/'design/evidence/ui09-r3/cr303-report.json').read_text())
# The report is upstream prototype evidence, not freshly executed product evidence.
checks=report.get('checks', report.get('assertions', []))
if not checks: errors.append('UI report checks not found')
if any(not x.get('pass') for x in checks): errors.append('UI report non-pass')
allowed={str(p.relative_to(ROOT)) for p in FILES}|{str((M/'changes/CR-303.md').relative_to(ROOT))}
baseline=json.loads((M/'reviews/evidence/control-052/frontend-preservation-before.json').read_text())['files']
changed=[]
checked=0
for path,digest in baseline.items():
    if path in allowed: continue
    checked+=1
    q=ROOT/path
    if not q.is_file() or sha(q)!=digest: changed.append(path)
if changed: errors.append('protected files changed')
result={
 'version':'M003-FE-02','scope':'document static checks only; no runtime claim',
 'result':'PASS' if not errors else 'FAIL','errors':errors,
 'local_links_checked':links,'stable_ids_checked':ids,
 'ui_reception':{'version':'M003-UI-09-R3','source_mappings':'badge follows reviewOn; basic/trial separate','upstream_prototype_checks':len(checks),'not_product_validation':True},
 'preservation':{'baseline':'reviews/evidence/control-052/frontend-preservation-before.json','checked':checked,'allowed_current_files':sorted(allowed),'unexpected_changes':changed},
 'documents_before_unicode_chars':26227,
 'documents_after_unicode_chars':sum(len(p.read_text()) for p in FILES),
 'documents':{str(p.relative_to(ROOT)):{'sha256':sha(p),'unicode_chars':len(p.read_text())} for p in FILES},
 'manual_contract_review':['v5 seq/draft/rev/code-point splice and retained final downgrade','Plan retained until authoritative complete Result including Q02','busy strict accepted:false and no automatic POST','UI09-R3/M002 current source, prefix copy and shared 760px reading column','N0..99 and V<=N+2, preview V<=3, execution tests <=2','namespace/epoch/cancel/status/preview binding and plan conflict boundaries'],
 'not_executed':['product build/unit/browser tests','backend/DB/migrations','real model/quality/latency/capacity','new-session handoff test'],
 'runtime_input_tokens':'unknown','runtime_usage':'unknown',
}
(OUT/'check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'result':result['result'],'errors':errors,'links':links,'protected':checked,'unexpected_changes':changed,'document_chars':result['documents_after_unicode_chars']},ensure_ascii=False))
raise SystemExit(bool(errors))
