"""Freeze the proposed BE-03 contracts without approval or stage changes."""
from pathlib import Path
from datetime import datetime, timezone
import json
import hashlib
import tarfile

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M002'
E = M / 'technical/evidence'
manifest = E / 'M002-BE-03-manifest.json'
archive = E / 'M002-BE-03.tar.gz'
result = E / 'M002-BE-03-freeze-results.json'
assert not any(p.exists() for p in [manifest, archive, result]), 'Frozen outputs cannot be replaced'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def rel(p):
    return str(p.relative_to(ROOT))


inputs = json.loads((E / 'M002-BE-03-inputs.json').read_text())
report = json.loads((E / 'M002-BE-03-check.json').read_text())
assert report['status'] == 'PASS' and report['professional_reception'] == 'BACKEND_COMPLETED_PENDING_APPROVAL_AND_FRONTEND'
assert all((ROOT / p).is_file() and sha(ROOT / p) == h for p, h in inputs['protected_sha256'].items())
assert sha(ROOT / inputs['before_archive']['path']) == inputs['before_archive']['sha256']
sources = [M / p for p in ['technical/backend.md', 'technical/ai-integration.md',
           'handoffs/backend-architecture.md', 'changes/CR-004.md']]
sources += sorted((M / 'technical/api').glob('*.md'))
assert len(sources) == 11
evidence = [E / name for name in ['M002-BE-03-inputs.json', 'M002-BE-03-before.tar.gz',
            'M002-BE-03-contract-examples.json', 'verify-backend-cr004.py',
            'M002-BE-03-check-prior-1.json', 'M002-BE-03-administration-prior-1.md',
            'M002-BE-03-check.json', 'freeze-backend-cr004.py']]
items = [{'path': rel(p), 'sha256': sha(p), 'bytes': p.stat().st_size,
          'kind': 'source' if p in sources else 'evidence'} for p in sources + evidence]
with tarfile.open(archive, 'w:gz') as t:
    for p in sources + evidence:
        t.add(p, arcname=rel(p), recursive=False)
data = {
    'version': 'M002-BE-03', 'role': 'backend-alex', 'stage': 'technical-design',
    'status': 'awaiting_user_review', 'approved': False,
    'frozen_at': datetime.now(timezone.utc).isoformat(),
    'role_activation': 'TRANSITION-M002-014', 'revision_scope': 'M002-CR-004',
    'input_database': 'M002-DB-03', 'input_database_approval': 'TRANSITION-M002-014',
    'previous_approved_version': 'M002-BE-02', 'previous_approval': 'TRANSITION-M002-012',
    'blocking_alignment': None,
    'professional_reception': 'BACKEND_COMPLETED_PENDING_APPROVAL_AND_FRONTEND',
    'CR004_status': 'open_pending_backend_approval_and_frontend_reception',
    'CR003_status': 'design_closed_by_TRANSITION-M002-012_runtime_validation_pending',
    'sources': len(sources), 'evidence_files': len(evidence), 'files': items,
    'archive': {'path': rel(archive), 'sha256': sha(archive), 'bytes': archive.stat().st_size},
    'static_checks': len(report['checks']), 'static_status': report['status'],
    'verification_attempts': [
        {'report': rel(E / 'M002-BE-03-check-prior-1.json'), 'result': 'FAIL',
         'original_artifact': rel(E / 'M002-BE-03-administration-prior-1.md'),
         'reason': 'New API-206 anchor was before its heading, so section comparison included it in unchanged API-103. Moved anchor inside API-206; no API-103 behavior changed. Original artifact/report preserved.'},
        {'report': rel(E / 'M002-BE-03-check.json'), 'result': 'PASS', 'checks': len(report['checks'])}],
    'runtime_tests': False, 'database_connected': False, 'real_ai_calls': 0,
    'workflow_transition': False, 'application_modified': False, 'git_commit': None,
    'post_freeze_verification': rel(result)}
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
with tarfile.open(archive) as t:
    assert set(t.getnames()) == {item['path'] for item in items}
    for item in items:
        assert hashlib.sha256(t.extractfile(item['path']).read()).hexdigest() == item['sha256'] == sha(ROOT / item['path'])
assert all(sha(ROOT / p) == h for p, h in inputs['protected_sha256'].items())
frozen = {'version': 'M002-BE-03', 'status': 'PASS', 'manifest_sha256': sha(manifest),
          'archive_sha256': sha(archive), 'sources': len(sources), 'evidence_files': len(evidence),
          'members': len(items), 'all_current_and_archived_bytes_match': True,
          'protected_files_unchanged': len(inputs['protected_sha256']),
          'professional_reception': data['professional_reception'], 'CR004_status': 'open',
          'approved': False, 'workflow_transition': False, 'runtime_tests': False}
result.write_text(json.dumps(frozen, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(frozen, ensure_ascii=False))
