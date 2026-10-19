import hashlib
import json
import re
from pathlib import Path

root = Path('.')
scope = root / '.planning/milestones/M002/design/config-portability'
vendor = scope / 'formal/vendor'
pairs = []

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for milestone in ('M002', 'M003'):
    for frozen in sorted((vendor / milestone).rglob('*')):
        if not frozen.is_file():
            continue
        original = root / '.planning/milestones' / milestone / frozen.relative_to(vendor / milestone)
        pairs.append({
            'vendor': str(frozen),
            'original': str(original),
            'equal': original.exists() and sha(frozen) == sha(original),
            'sha256': sha(frozen),
        })

theme = (scope / 'theme.css').read_text()
enhancer = (scope / 'formal/enhancer.js').read_text()
r2_manifest_path = scope / 'evidence/M002-UI-33-R2-source-manifest.json'
r2_archive_path = scope / 'evidence/M002-UI-33-R2-source.tar.gz'
r2_manifest = json.loads(r2_manifest_path.read_text())

checks = {
    'vendor_file_count': len(pairs),
    'all_vendor_files_equal_original': all(pair['equal'] for pair in pairs),
    'priority_css_is_scoped': 'body.m003-page #priority-editor:modal{' in theme and not re.search(r'(^|})\s*#priority-editor\s*\{', theme),
    'priority_close_precedes_show_modal': enhancer.index('if (dialog.open) dialog.close();') < enhancer.index('dialog.showModal();'),
    'priority_uses_real_modal': 'dialog.showModal();' in enhancer,
    'priority_draft_captured_and_restored': 'readPriorityDraft' in enhancer and 'restorePriorityDraft(dialog);' in enhancer,
    'priority_tab_focus_is_constrained': "if (event.key !== 'Tab') return;" in enhancer,
    'priority_escape_reuses_inherited_close': "dialog.addEventListener('cancel'" in enhancer and "close-priority-editor" in enhancer,
    'priority_close_returns_to_opener': "[data-action=\"open-priority-editor\"]')?.focus" in enhancer,
    'r2_archive_preserved': r2_archive_path.exists() and sha(r2_archive_path) == r2_manifest['archive']['sha256'],
    'r2_manifest_preserved': r2_manifest_path.exists(),
}
checks['passed'] = checks['vendor_file_count'] == 74 and all(value for key, value in checks.items() if key not in ('vendor_file_count', 'passed'))
out = {
    'version': 'M002-UI-33-R3',
    'purpose': 'prove the priority modal correction is a scoped formal adapter change and preserves frozen vendor and R2 history',
    'checks': checks,
    'sources': pairs,
    'modified_current_sources': [
        'formal/enhancer.js',
        'formal/boot.js',
        'formal/index.html',
        'theme.css',
        'copy.json',
        'controller.js',
        'prototype/index.html',
        'design-spec.md',
        'interactions.md',
        'responsive-accessibility.md',
        '../../handoffs/config-portability-uiux.md',
    ],
}
(scope / 'evidence/M002-UI-33-R3-source-check.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
if not checks['passed']:
    raise SystemExit(1)
