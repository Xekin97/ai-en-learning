"""Read-only scoped source/link checks, run from product root. No app tests."""
import hashlib
import json
import re
import sys
from pathlib import Path

base = Path('.planning/milestones/M002')
out = base / 'technical/pronunciation/evidence/frontend-alignment'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
inputs = json.loads((out / 'input-manifest.json').read_text())
ignored = set(inputs['control_files']) - {'.planning/workflow/history.yaml'} if '--submitted' in sys.argv else set()
issues = [p for p, h in inputs['files'].items() if p not in ignored and sha(p) != h]
checks = [{'input_hashes': len(inputs['files']), 'unchanged_except_submission_controls': not issues}]
for name in [
    'design/pronunciation/technical-alignment/evidence/delivery-manifest.json',
    'technical/pronunciation/evidence/frontend/delivery-manifest.json',
    'technical/pronunciation/evidence/backend/delivery-manifest.json',
    'technical/pronunciation/evidence/database-delivery-manifest.json',
]:
    data = json.loads((base / name).read_text())
    wrong = [p for group in ['files', 'reused_files'] for p, h in data.get(group, {}).items() if sha(p) != h]
    issues.extend(wrong)
    checks.append({'manifest': name, 'unchanged': not wrong})

baseline = json.loads((base / 'design/pronunciation/copy.json').read_text())
patch = json.loads((base / 'design/pronunciation/technical-alignment/copy.json').read_text())
merged = {**baseline['static'], **baseline['templates'], **patch['static'], **patch['templates']}
for lang in ['zh', 'en']:
    key = f'{lang}.pron.accentUnavailable'
    assert merged[key] == patch['templates'][key] and merged[key] != baseline['static'][key]
    assert set(re.findall(r'\{([^}]+)\}', merged[key])) == {'word', 'accent'}
checks.append({'copy_overlay': 'PASS', 'variables': ['word', 'accent'], 'languages': ['zh', 'en']})

planned = []; count = 0
for file in [base / 'technical/pronunciation/frontend-alignment.md', base / 'handoffs/pronunciation-frontend-alignment.md']:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        if target.startswith(('http:', 'https:', '#')): continue
        count += 1
        resolved = (file.parent / target.split('#')[0]).resolve()
        if resolved.exists(): continue
        if '--submitted' not in sys.argv and resolved.parent == out.resolve() and resolved.name in ['static-check.json', 'delivery-manifest.json']:
            planned.append(resolved.name)
        else: issues.append(f'Broken link: {file} → {target}')
checks.append({'local_links': count, 'pending_submission_files': sorted(set(planned))})
intake = json.loads((out / 'intake.json').read_text())
if intake['pass'] != intake['total'] or intake['errors']: issues.append('Intake failed')
checks.append({'intake_pass': intake['pass'], 'intake_total': intake['total'], 'live_audio_verified': False})
if '--submitted' in sys.argv:
    manifest = json.loads((out / 'delivery-manifest.json').read_text())
    wrong = [p for group in ['files', 'reused_files'] for p, h in manifest[group].items() if sha(p) != h]
    if sha(manifest['archive']) != manifest['archive_sha256']: wrong.append('archive')
    issues.extend(wrong)
    checks.append({'delivery_sources': len(manifest['files']), 'unchanged': not wrong})
print(json.dumps({'version': 'M002-FE-PRON-01-TA1', 'status': 'FAIL' if issues else 'PASS', 'checks': checks, 'issues': issues}, ensure_ascii=False, indent=2))
sys.exit(bool(issues))
