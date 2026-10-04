"""Freeze the proposed DB-03 delivery without approving or switching roles."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import tarfile

ROOT = Path(__file__).resolve().parents[5]
M = ROOT / '.planning/milestones/M002'
E = M / 'technical/evidence'
manifest = E / 'M002-DB-03-manifest.json'
archive = E / 'M002-DB-03.tar.gz'
result = E / 'M002-DB-03-freeze-results.json'
assert not any(p.exists() for p in [manifest, archive, result]), 'Frozen outputs already exist'


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def rel(p):
    return str(p.relative_to(ROOT))


inputs = json.loads((E / 'M002-DB-03-inputs.json').read_text())
report = json.loads((E / 'M002-DB-03-check.json').read_text())
assert report['status'] == 'PASS' and report['professional_reception'] == 'PARTIAL_DBA_PROPOSAL_CR004_OPEN'
assert all((ROOT / p).is_file() and sha(ROOT / p) == h for p, h in inputs['protected_sha256'].items())
assert sha(ROOT / inputs['before_archive']['path']) == inputs['before_archive']['sha256']
sources = [ROOT / p for p in inputs['allowed_source_changes']]
evidence = [E / name for name in [
    'M002-DB-03-inputs.json', 'M002-DB-03-before.tar.gz',
    'verify-database-cr004.py', 'M002-DB-03-check.json', 'freeze-database-cr004.py']]
members = sources + evidence
source_hashes = {rel(p): sha(p) for p in sources}
evidence_hashes = {rel(p): sha(p) for p in evidence}
with tarfile.open(archive, 'w:gz') as t:
    for p in members:
        t.add(p, arcname=rel(p), recursive=False)
data = {
    'version': 'M002-DB-03', 'owner': 'dba-diana', 'stage': 'technical-design',
    'status': 'awaiting_user_review', 'approved': False,
    'created_at': datetime.now(timezone.utc).isoformat(),
    'scope': 'M002-CR-004 / DB2-R10–11; FE2-G01 storage, FE2-G02 transactions; FE2-G03 backend pending',
    'role_activation': 'TRANSITION-M002-013',
    'prior_approved_version': 'M002-DB-02', 'prior_approval': 'TRANSITION-M002-011',
    'input_product': 'M002-PRODUCT-03', 'input_design': 'M002-UI-22-H01',
    'backend_reception_input': 'M002-BE-02', 'frontend_reception_input': 'M002-FE-01',
    'source_sha256': source_hashes, 'evidence_sha256': evidence_hashes,
    'archive': rel(archive), 'archive_sha256': sha(archive),
    'static_checks': len(report['checks']), 'static_status': report['status'],
    'CR004_status': 'open_partial_dba_proposal_pending_approval_backend_frontend_reception',
    'CR003_status': 'design_reception_closed_by_TRANSITION-M002-012_runtime_tests_pending',
    'future_db_tests_run': False, 'application_tests_run': False,
    'application_modified': False, 'database_modified': False,
    'workflow_controls_modified': False, 'role_switched': False,
    'real_ai_calls': 0, 'git_commit': None, 'post_freeze_verification': rel(result)}
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
with tarfile.open(archive) as t:
    assert set(t.getnames()) == set(source_hashes) | set(evidence_hashes)
    for p, h in {**source_hashes, **evidence_hashes}.items():
        assert hashlib.sha256(t.extractfile(p).read()).hexdigest() == h == sha(ROOT / p)
assert all(sha(ROOT / p) == h for p, h in inputs['protected_sha256'].items())
frozen = {
    'version': 'M002-DB-03', 'status': 'PASS',
    'manifest_sha256': sha(manifest), 'archive_sha256': sha(archive),
    'sources': len(sources), 'evidence_files': len(evidence), 'members': len(members),
    'all_current_and_archived_bytes_match': True,
    'protected_files_unchanged': len(inputs['protected_sha256']),
    'professional_reception': 'PARTIAL_DBA_PROPOSAL_CR004_OPEN',
    'approved': False, 'workflow_transition': False,
    'database_tests': False, 'application_tests': False}
result.write_text(json.dumps(frozen, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(frozen, ensure_ascii=False))
