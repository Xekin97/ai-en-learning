"""Submission consistency only, not an application or acoustic test."""
from pathlib import Path
import hashlib, json, re, tarfile, datetime, yaml

root = Path.cwd()
base = Path('.planning/milestones/M002')
evidence = base / 'technical/pronunciation/evidence/backend-followup'
review = base / 'reviews/evidence/pronunciation-backend-followup-submission-138'
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = []

def check(name, passed, detail=None):
    checks.append({'name': name, 'pass': bool(passed), 'detail': detail})

manifests = [
    base / 'technical/pronunciation/evidence/backend/delivery-manifest.json',
    base / 'technical/pronunciation/evidence/frontend/delivery-manifest.json',
    base / 'technical/pronunciation/evidence/frontend-alignment/delivery-manifest.json',
    base / 'design/pronunciation/evidence/M002-UI-32-R3-source-manifest.json',
]
frozen = {}
for manifest in manifests:
    data = json.loads(manifest.read_text())
    for field in ('files', 'reused_files'):
        frozen.update(data.get(field, {}))
    if data.get('archive'):
        frozen[data['archive']] = data['archive_sha256']
bad = [p for p, sha in frozen.items() if not Path(p).exists() or digest(Path(p)) != sha]
check('frozen_BE_FE_R3_TA1_sources_and_archives', not bad, {'checked': len(frozen), 'mismatches': bad})

docs = [base/'technical/pronunciation/backend-followup.md', base/'technical/pronunciation/api/browser-speech.md', base/'handoffs/pronunciation-backend-followup.md', base/'changes/CR-316.md']
late = {(root/evidence/'delivery-manifest.json').resolve(), (root/evidence/'static-check.json').resolve()}
bad_links = []
for doc in docs:
    for link in re.findall(r'\]\(([^)]+)\)', doc.read_text()):
        if re.match(r'^[a-z]+://|^#', link):
            continue
        path = (doc.parent/link.split('#')[0]).resolve()
        if path not in late and not path.exists():
            bad_links.append({'document': str(doc), 'target': link})
check('local_document_links', not bad_links, bad_links)

state = yaml.safe_load(Path('.planning/workflow/state.yaml').read_text())
project = yaml.safe_load(Path('.planning/agt/project.yaml').read_text())['milestone']
decision = json.loads((evidence/'scope-decision.json').read_text())
probe = json.loads((evidence/'probe.json').read_text())
fallback = json.loads((evidence/'fallback-probe.json').read_text())
check('current_entry_and_confirmed_B', state['current_handoff'] == str(docs[2]) == project['current_handoff'] and decision['user_answer'] == 'B．首版仅使用浏览器朗读' and not state['pending_user_decisions'])
check('no_stage_exit_or_implementation', state['stage']=='technical-design' and state['active_agent']=='backend-alex' and state['last_transition']['id']=='TRANSITION-M002-138' and state['status']=='awaiting_user_review' and project['current_implementation_status']=='not_started_for_pronunciation')
check('scope_change_not_fake_verification', state['backend_submission']['closed_by_scope_change']==['OPEN-401'] and state['backend_submission']['open_items']==['OPEN-402','OPEN-403'] and state['open_change_requests']==['CR-316'] and not state['backend_submission']['release_ready'])
check('observed_desktop_speech_start_end', probe['speech']['outcome']=='ended' and any(x['event']=='start' for x in probe['speech']['events']) and not probe['humanListening'] and not probe['applicationVerification'], probe['speech'])
check('old_fallback_evidence_preserved_as_research', fallback['result']['outcome']=='ended' and not fallback['humanListening'] and not fallback['applicationVerification'], fallback['result'])
check('real_probe_conditions', not probe['mock'] and not probe['tlsBypass'] and not probe['usesPersonalBrowserProfile'])
with tarfile.open(review/'before-submission.tar.gz') as archive:
    old_state = yaml.safe_load(archive.extractfile('.planning/workflow/state.yaml').read())
    check('workflow_history_and_transition_unchanged', archive.extractfile('.planning/workflow/history.yaml').read() == Path('.planning/workflow/history.yaml').read_bytes() and old_state['last_transition']==state['last_transition'])
check('required_artifacts_exist', all(Path(p).exists() for p in state['required_artifacts']))

result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'version':'M002-BE-PRON-02', 'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL', 'scope':'Document/state consistency and frozen evidence checks, not application or human listening acceptance', 'checks':checks}
(evidence/'static-check.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'status': result['status'], 'checks': len(checks), 'failures':[c for c in checks if not c['pass']]}, ensure_ascii=False))
raise SystemExit(0 if result['status']=='PASS' else 1)
