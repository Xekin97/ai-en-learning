from pathlib import Path
import json, hashlib, tarfile, datetime, subprocess

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M002'
E = M / 'technical/evidence'
manifest = E / 'M002-FE-02-manifest.json'
archive = E / 'M002-FE-02.tar.gz'
result = E / 'M002-FE-02-freeze-results.json'
assert not any(p.exists() for p in [manifest, archive, result]), 'Never overwrite frozen evidence'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p): return str(p.relative_to(ROOT))
inputs = json.loads((E / 'M002-FE-02-inputs.json').read_text())
report = json.loads((E / 'M002-FE-02-check.json').read_text())
contract = json.loads((E / 'M002-FE-02-contract-check.json').read_text())
assert report['status'] == contract['status'] == 'PASS'
assert report['semantic_contract_alignment'] == 'ALIGNED_PENDING_REVIEW'
assert all((ROOT / f['path']).is_file() and sha(ROOT / f['path']) == f['sha256'] for f in inputs['protected_files'])
sources = [ROOT / p for p in inputs['allowed_source_changes']]
known = {f['path'] for f in inputs['protected_files']} | set(inputs['allowed_source_changes'])
files = set(subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0'))
new = sorted(p for p in files - known if p and (ROOT / p).is_file())
assert all(p.startswith(rel(E) + '/') for p in new), new
evidence = [ROOT / p for p in new]
allfiles = sources + evidence
items = [dict(path=rel(p), sha256=sha(p), bytes=p.stat().st_size, kind='source' if p in sources else 'evidence') for p in allfiles]
with tarfile.open(archive, 'w:gz') as t:
    for p in allfiles: t.add(p, arcname=rel(p), recursive=False)
data = {
    'version': 'M002-FE-02', 'status': 'awaiting_user_review', 'approved': False,
    'role': 'frontend-bob', 'role_activation': 'TRANSITION-M002-015',
    'frozen_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'inputs': {'product': 'M002-PRODUCT-03', 'design': 'M002-UI-22-H01', 'database': 'M002-DB-03', 'backend': 'M002-BE-03'},
    'revision_scope': 'M002-CR-004 / FE2-G01, FE2-G02, FE2-G03',
    'contract_alignment': 'ALIGNED_PENDING_REVIEW', 'blocking_contract_gaps': [],
    'professional_reception': 'FRONTEND_COMPLETED_PENDING_APPROVAL_AND_GATE',
    'CR004_status': 'open_pending_frontend_approval_and_formal_gate',
    'CR003_status': 'design_closed_by_TRANSITION-M002-012_runtime_validation_pending',
    'sources': len(sources), 'evidence_files': len(evidence), 'files': items,
    'archive': {'path': rel(archive), 'sha256': sha(archive), 'bytes': archive.stat().st_size},
    'verification_attempts': [
        {'report': rel(E / 'M002-FE-02-contract-check-prior-1.json'), 'status': 'FAIL', 'checks': 15, 'reason': 'Invalid decimal Amount invoked BigInt after regex rejection; guarded conversion. Original script retained.'},
        {'report': rel(E / 'M002-FE-02-contract-check-prior-2.json'), 'status': 'PASS', 'checks': 15, 'followup': 'Extended the same guard to cap/base relation and added invalid form-value cases.'},
        {'report': rel(E / 'M002-FE-02-contract-check.json'), 'status': 'PASS', 'checks': 15},
        {'report': rel(E / 'M002-FE-02-check-prior-1.json'), 'status': 'PASS', 'checks': 25, 'followup': 'Added exact application models/components to affected trace rows and removed obsolete preset description wording in frontend trace.'},
        {'report': rel(E / 'M002-FE-02-check.json'), 'status': 'PASS', 'checks': 25}
    ],
    'prototype_reception': {'version': 'M002-FE-01', 'report': rel(E / 'M002-FE-01-prototype.json'), 'checks': 56, 'reused_not_rerun': True, 'design_bytes_unchanged': True, 'scope': 'Reduced-motion prototype entry checks only; no production or animation verification'},
    'production_tests': False, 'browser_tests_this_revision': False, 'database_connected': False,
    'real_ai_calls': 0, 'stage_transition': False, 'application_modified': False, 'git_commit': None,
    'post_freeze_verification': rel(result)
}
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
with tarfile.open(archive, 'r:gz') as t:
    assert set(t.getnames()) == {f['path'] for f in items}
    assert all(hashlib.sha256(t.extractfile(f['path']).read()).hexdigest() == f['sha256'] == sha(ROOT / f['path']) for f in items)
assert all(sha(ROOT / f['path']) == f['sha256'] for f in inputs['protected_files'])
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip() == inputs['head']
result.write_text(json.dumps({
    'version': 'M002-FE-02', 'status': 'PASS', 'manifest_sha256': sha(manifest),
    'archive_sha256': sha(archive), 'members': len(items), 'all_current_and_archived_bytes_match': True,
    'protected_files_unchanged': len(inputs['protected_files']), 'contract_alignment': 'ALIGNED_PENDING_REVIEW',
    'workflow_transition': False, 'production_tests': False
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': 'PASS', 'sources': len(sources), 'evidence': len(evidence), 'members': len(items), 'archive_sha256': sha(archive), 'manifest_sha256': sha(manifest)}))
