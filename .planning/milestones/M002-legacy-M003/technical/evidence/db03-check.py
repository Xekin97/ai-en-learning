"""DB03 document/source and finite predicate-model checks; never connects to a DB."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M003'
DOCS = [M / 'technical/database.md', M / 'handoffs/database.md']
OUT = Path(__file__).with_suffix('.json')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = []

def check(name, actual, expected=True):
    checks.append({'name': name, 'actual': actual, 'expected': expected, 'pass': actual == expected})

for p in DOCS:
    s = p.read_text()
    check(p.name + ': DB03 awaiting review', 'version: M003-DB-03' in s and 'status: awaiting_user_review' in s)
s = DOCS[0].read_text()
for n in range(1, 10):
    check(f'DB3-{n:02} heading', len(re.findall(rf'^## DB3-{n:02}\b', s, re.M)) == 1)
for n in range(1, 7):
    check(f'DB3-V{n:02} retained', f'| DB3-V{n:02} |' in s)
for literal in ('planning/generation/fixed_edit/technical_repair/content_review/content_repair',
                'fixed_edit_native_invalid', 'm003-content-v5', 'IS NOT TRUE', 'IS TRUE',
                '最多101', 'enhanced为1至3'):
    check('DB03 contract: ' + literal, literal in s)

# Verify source evidence without confusing existing code with proposed design.
source_names = [
    'backend/db/migrations/0017_m003_content_review.sql',
    'backend/internal/entitlement/service.go',
    'backend/internal/generation/service.go',
    'backend/internal/generation/preset_preview.go',
    'backend/internal/generation/pipeline.go',
    'backend/internal/generation/usage.go',
    'backend/internal/platform/postgres/migrate.go',
]
source_hashes = {p: sha(ROOT / p) for p in source_names}
sql = (ROOT / source_names[0]).read_text()
check('candidate stage omits Plan/editor', "'planning'" not in sql and "'fixed_edit'" not in sql)
check('candidate two run bounds remain N+1', sql.count('final_content_version BETWEEN 1 AND content_repair_limit_snapshot + 1'), 2)
check('candidate omits fixed edit reason', 'fixed_edit_native_invalid' not in sql)
check('candidate has no outer IS TRUE guard', 'IS TRUE' not in sql)
check('source pipeline really v2', 'PipelineVersion       = "m003-content-v2"' in (ROOT / source_names[1]).read_text())
check('source user max 100', 'pipeline.Version > 100' in (ROOT / source_names[2]).read_text())
check('source preview max 2', 'pipeline.Version > 2' in (ROOT / source_names[3]).read_text())

manifest_path = M / 'reviews/evidence/control-032/M003-BE-05-source-manifest.json'
manifest = json.loads(manifest_path.read_text())
check('BE05 archive hash preserved', sha(ROOT / manifest['archive']), manifest['sha256'])
for path, digest in manifest['files'].items():
    check('BE05 frozen ' + path, sha(M / path), digest)

# Explicit SQL three-valued logical model of the local offending branches.
# PostgreSQL was NOT executed; this does not validate emitted SQL or a live schema.
def sql_and(*xs):
    return False if False in xs else None if None in xs else True

def sql_or(*xs):
    return True if True in xs else None if None in xs else False

unknowns = []
for name, value in [
    ('policy NULL with complete non-NULL new fields', sql_or(False, sql_and(None, True))),
    ('valid with NULL outcome', sql_or(False, sql_and(True, None))),
    ('service_incomplete with NULL stop_reason', sql_or(False, sql_and(True, None))),
]:
    old_accepts = value is not False
    guarded_accepts = value is True
    check(name + ': current CHECK accepts UNKNOWN', old_accepts)
    check(name + ': IS TRUE rejects UNKNOWN', guarded_accepts, False)
    unknowns.append({'case': name, 'sql_truth': 'UNKNOWN', 'current_CHECK_accepts': old_accepts,
                     'proposed_IS_TRUE_accepts': guarded_accepts})

# Finite valid-row boundary model of DB3-03; full snapshots/owner/transaction
# validation is explicitly outside these samples, and no provider is invoked.
old_reasons = {'content_timeout','content_rate_limited','content_transport_error',
               'content_protocol_error','content_review_invalid','repair_native_invalid'}
def valid_row(pipeline, n, v, outcome, reason=None, preview=False):
    if pipeline is None or not pipeline.strip() or not 0 <= n <= (1 if preview else 99):
        return False
    if v is None or outcome not in {'basic','review_passed','repaired_passed','limit_finalized','service_incomplete'}:
        return False
    extra = 2 if pipeline == 'm003-content-v5' and n > 0 else 1
    if not 1 <= v <= n + extra or ((outcome == 'basic') != (n == 0)):
        return False
    reasons = old_reasons | ({'fixed_edit_native_invalid'} if pipeline == 'm003-content-v5' else set())
    return reason in reasons if outcome == 'service_incomplete' else reason is None

cases = [
    ('v5 basic final1', ('m003-content-v5',0,1,'basic'), True),
    ('v5 basic final2 rejected', ('m003-content-v5',0,2,'basic'), False),
    ('v5 edit fails retaining V1', ('m003-content-v5',1,1,'service_incomplete','fixed_edit_native_invalid'), True),
    ('v5 edited pass V2', ('m003-content-v5',1,2,'review_passed'), True),
    ('v5 N1 V3 limit', ('m003-content-v5',1,3,'limit_finalized'), True),
    ('v5 N1 V4 rejected', ('m003-content-v5',1,4,'limit_finalized'), False),
    ('v5 N2 V4', ('m003-content-v5',2,4,'repaired_passed'), True),
    ('v5 N99 V101 static only', ('m003-content-v5',99,101,'limit_finalized'), True),
    ('v5 N99 V102 rejected', ('m003-content-v5',99,102,'limit_finalized'), False),
    ('v5 preview enhanced V3', ('m003-content-v5',1,3,'limit_finalized',None,True), True),
    ('v5 preview N2 rejected', ('m003-content-v5',2,3,'repaired_passed',None,True), False),
    ('old v2 N1 V2 preserved', ('m003-content-v2',1,2,'limit_finalized'), True),
    ('old v2 N1 V3 rejected', ('m003-content-v2',1,3,'limit_finalized'), False),
    ('old v4 N1 V2 preserved hypothetical row', ('m003-content-v4',1,2,'limit_finalized'), True),
    ('old v4 N1 V3 rejected hypothetical row', ('m003-content-v4',1,3,'limit_finalized'), False),
    ('old v2 cannot gain fixed edit reason', ('m003-content-v2',1,1,'service_incomplete','fixed_edit_native_invalid'), False),
    ('incomplete missing reason rejected', ('m003-content-v5',1,1,'service_incomplete'), False),
    ('valid missing outcome rejected', ('m003-content-v5',1,1,None), False),
    ('non-incomplete with reason rejected', ('m003-content-v5',1,2,'review_passed','content_timeout'), False),
]
for name, args, expected in cases:
    check(name, valid_row(*args), expected)

for stage in ('planning','fixed_edit'):
    def metadata_ok(result, repair, reasons):
        return result == 'not_applicable' and repair is False and reasons == []
    check(stage + ' empty review metadata', metadata_ok('not_applicable',False,[]))
    check(stage + ' reason forbidden', metadata_ok('not_applicable',False,['forced_wording']), False)
    check(stage + ' review verdict forbidden', metadata_ok('pass',False,[]), False)
    check(stage + ' repair intention forbidden', metadata_ok('not_applicable',True,[]), False)

# Check local links and generated heading anchors only in the two owned docs.
links = 0
for p in DOCS:
    for raw in re.findall(r'\]\(([^)]+)\)', p.read_text()):
        raw = raw.strip('<>')
        if '://' in raw:
            continue
        path, _, anchor = raw.partition('#')
        target = (p.parent / path).resolve() if path else p
        links += 1
        check('link: ' + raw, target.exists() or target == OUT)
        if anchor and target.exists():
            body = target.read_text()
            anchors = re.findall(r'id="([^"]+)"', body)
            for h in re.findall(r'^#+ (.+)$', body, re.M):
                anchors.append(re.sub(r'[^\w\- ]','',h.lower()).replace(' ','-'))
            check('anchor: ' + anchor, anchor in anchors)

before = json.loads((M / 'technical/evidence/db03-before.json').read_text())
report = {
    'version': 'M003-DB-03', 'scope': 'static documents, source facts, finite semantic predicates only',
    'status': 'PASS' if all(c['pass'] for c in checks) else 'FAIL',
    'checks': checks, 'count': len(checks), 'local_links_checked': links,
    'three_valued_counterexamples': unknowns,
    'sources_sha256': source_hashes,
    'owned_documents': {str(p.relative_to(ROOT)): {'sha256':sha(p),'unicode_chars':len(p.read_text()),'utf8_bytes':len(p.read_bytes())} for p in DOCS},
    'before_two_docs_chars': sum(before[k]['before_chars'] for k in ('technical/database.md','handoffs/database.md')),
    'after_two_docs_chars': sum(len(p.read_text()) for p in DOCS),
    'tokens': 'unknown', 'runtime_input_usage': 'unknown',
    'not_run': ['PostgreSQL predicate execution','live DB read/write','migration or seed','Go/API tests','provider calls','browser/UI','quality/cost/performance','independent new-session handoff'],
    'unverified': ['target 0017 application and actual schema','legacy pipeline distribution','actual NULL anomalies','DB3-V01 through DB3-V06 runtime acceptance'],
}
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'checks':len(checks),'links':links,
                  'chars_before':report['before_two_docs_chars'],'chars_after':report['after_two_docs_chars'],
                  'failed':[c for c in checks if not c['pass']]},ensure_ascii=False,indent=2))
raise SystemExit(0 if report['status']=='PASS' else 1)
