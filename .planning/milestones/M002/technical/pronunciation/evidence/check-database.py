"""Static submission checks only; never connects to a database or audio provider."""
from pathlib import Path
import hashlib
import json
import re
import tarfile
from urllib.parse import unquote

import yaml

ROOT = Path(__file__).resolve().parents[6]
SCOPE = ROOT / '.planning/milestones/M002/technical/pronunciation'
RECEIPTS = ROOT / '.planning/milestones/M002/reviews/evidence/pronunciation-database-submission-133'
checks = []


def check(name, passed, count=None):
    item = {'check': name, 'passed': bool(passed)}
    if count is not None:
        item['count'] = count
    checks.append(item)


def read_json(path):
    return json.loads((ROOT / path).read_text())


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def verify_files(name, files):
    check(name, all((ROOT / p).is_file() and sha(p) == h for p, h in files.items()), len(files))


inputs = read_json(SCOPE / 'evidence/database-inputs.json')
verify_files('read_only_inputs_unchanged', inputs['files'])
accepted = read_json('.planning/milestones/M002/reviews/evidence/pronunciation-design-acceptance-20261016/acceptance.json')
check('accepted_design_manifest_hash', sha(accepted['source_manifest']) == accepted['source_manifest_sha256'])
design = read_json(accepted['source_manifest'])
verify_files('accepted_R3_sources_unchanged', design['files'])
check('accepted_R3_archive_unchanged', sha(accepted['source_archive']) == accepted['source_archive_sha256'])
legacy = read_json('.planning/milestones/M003/design/pronunciation/evidence/M003-UI-14-source-manifest.json')
verify_files('historical_pronunciation_sources_unchanged', legacy['files'])
implementation = read_json('.planning/milestones/M002/reviews/evidence/cr313-verification-entry-131/implementation-before.json')
verify_files('implementation_baseline_unchanged', {v['path']: v['sha256'] for v in implementation['files']})

docs = [SCOPE / 'database.md', ROOT / '.planning/milestones/M002/handoffs/pronunciation-database.md']
links = []
for path in docs:
    content = path.read_text()
    frontmatter = yaml.safe_load(content.split('---', 2)[1])
    check(f'{path.name}:submitted_not_approved', frontmatter['version'] == 'M002-DB-PRON-01' and frontmatter['status'] == 'awaiting_user_review')
    for href in re.findall(r'\]\(([^)]+)\)', content):
        if href.startswith(('http://', 'https://', '#')):
            continue
        target = path.parent / unquote(href.split('#', 1)[0])
        links.append(target.is_file())
check('local_document_links_resolve', all(links), len(links))

with tarfile.open(RECEIPTS / 'before-controls.tar.gz') as archive:
    before = {member.name: archive.extractfile(member).read() for member in archive.getmembers() if member.isfile()}
state = yaml.safe_load((ROOT / '.planning/workflow/state.yaml').read_text())
prior = yaml.safe_load(before['.planning/workflow/state.yaml'])
check('same_stage_role_transition', all(state[k] == prior[k] for k in ['milestone', 'stage', 'active_role', 'active_agent', 'last_transition', 'profile', 'agt_revision']))
check('history_unchanged', (ROOT / '.planning/workflow/history.yaml').read_bytes() == before['.planning/workflow/history.yaml'])
check('prior_database_approval_retained', prior['database_work'] in state['retained_database_work'] and prior['database_submission'] in state['retained_database_submissions'])
check('prior_accepted_technical_scope_retained', state['retained_technical_work'] == prior['retained_technical_work'])
check('other_technical_roles_pending', all(state['technical_work']['roles'][role]['status'] == 'pending' for role in ['backend-architect/base', 'frontend-architect/base']))
check('current_submission_awaits_review', state['database_submission']['approved'] is False and state['database_submission']['status'] == 'awaiting_user_review')
check('no_new_business_questions_or_changes', state['pending_user_decisions'] == prior['pending_user_decisions'] == [] and state['open_change_requests'] == prior['open_change_requests'] == [])
check('accepted_UAT_record_preserved', state['uat_work'] == prior['uat_work'])
project = yaml.safe_load((ROOT / '.planning/agt/project.yaml').read_text())
prior_project = yaml.safe_load(before['.planning/agt/project.yaml'])
uat_keys = [key for key in prior_project['milestone'] if key.startswith('current_uat')]
check('UAT_access_and_runtime_references_preserved', all(project['milestone'][k] == prior_project['milestone'][k] for k in uat_keys), len(uat_keys))
check('milestone_closeout_not_approved', project['milestone']['milestone_closeout_status'] == 'not_approved')

report = {
    'version': 'M002-DB-PRON-01',
    'status': 'PASS' if all(c['passed'] for c in checks) else 'FAIL',
    'checks': checks,
    'runtime_tests': False,
    'database_operations': False,
    'real_audio_verified': False,
    'limits': ['Static documentation/source preservation checks only.', 'DB401-V1 through DB401-V6 and OPEN-401 through OPEN-403 remain unverified.'],
}
(SCOPE / 'evidence/database-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['status'] == 'PASS' else 1)
