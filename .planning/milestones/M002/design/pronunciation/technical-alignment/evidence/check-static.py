"""Run from the product root; read-only. --submitted also checks final manifest links."""
import hashlib
import json
import re
import sys
from pathlib import Path

root = Path.cwd()
scope = Path('.planning/milestones/M002/design/pronunciation/technical-alignment')
handoff = Path('.planning/milestones/M002/handoffs/pronunciation-uiux-alignment.md')
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
issues = []
checks = []
manifests = [
    '.planning/milestones/M002/design/pronunciation/evidence/M002-UI-32-R3-source-manifest.json',
    '.planning/milestones/M002/technical/pronunciation/evidence/frontend/delivery-manifest.json',
    '.planning/milestones/M002/technical/pronunciation/evidence/database-delivery-manifest.json',
    '.planning/milestones/M002/technical/pronunciation/evidence/backend/delivery-manifest.json',
    '.planning/milestones/M002/reviews/evidence/cr313-verification-entry-131/implementation-before.json',
]
for name in manifests:
    data = json.loads(Path(name).read_text())['files']
    if isinstance(data, list):
        data = {x['path']: x['sha256'] for x in data}
    wrong = [p for p, expected in data.items() if not Path(p).exists() or sha(p) != expected]
    checks.append({'manifest': name, 'count': len(data), 'unchanged': not wrong})
    issues.extend(wrong)

inputs = json.loads((scope / 'evidence/input-manifest.json').read_text())
ignored = set(inputs['control_files']) - {'.planning/workflow/history.yaml'} if '--submitted' in sys.argv else set()
wrong = [p for p, expected in inputs['files'].items() if p not in ignored and sha(p) != expected]
checks.append({'input_files_unchanged': not wrong, 'intentionally_updated_controls': sorted(ignored)})
issues.extend(wrong)

links = 0
planned = []
for file in [*scope.glob('*.md'), handoff]:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        if target.startswith(('http:', 'https:', '#')):
            continue
        path = (file.parent / target.split('#')[0]).resolve()
        links += 1
        if not path.exists():
            if path == (root / scope / 'evidence/delivery-manifest.json') and '--submitted' not in sys.argv:
                planned.append(str(path.relative_to(root)))
            else:
                issues.append(f'{file}: broken link {target}')
checks.append({'local_links': links, 'deferred_manifest_links': sorted(set(planned))})

copy = json.loads((scope / 'copy.json').read_text())
assert copy['static'] == {}
assert set(copy['templates']) == {'zh.pron.accentUnavailable','en.pron.accentUnavailable'}
assert all('{word}' in v and '{accent}' in v for v in copy['templates'].values())
report = json.loads((scope / 'evidence/browser-report.json').read_text())
if report['pass'] != report['total']:
    issues.append('browser checks not all passed')
checks.append({'browser_pass': report['pass'], 'browser_total': report['total']})
if '--submitted' in sys.argv:
    manifest = json.loads((scope / 'evidence/delivery-manifest.json').read_text())
    wrong = [p for group in ['files','reused_files'] for p, expected in manifest[group].items() if sha(p) != expected]
    if sha(manifest['archive']) != manifest['archive_sha256']:
        wrong.append('delivery archive')
    issues.extend(wrong)
    checks.append({'submitted_sources': len(manifest['files']), 'reused_sources': len(manifest['reused_files']), 'unchanged': not wrong})
print(json.dumps({'version':'M002-UI-32-R3-TA1','status':'PASS' if not issues else 'FAIL','checks':checks,'issues':issues},ensure_ascii=False,indent=2))
sys.exit(bool(issues))
