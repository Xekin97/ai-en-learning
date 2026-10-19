import hashlib,json,re
from pathlib import Path
root=Path('.')
scope=root/'.planning/milestones/M002/design/config-portability'
vendor=scope/'formal/vendor'
pairs=[]
for milestone in ('M002','M003'):
  for frozen in sorted((vendor/milestone).rglob('*')):
    if not frozen.is_file(): continue
    original=root/'.planning/milestones'/milestone/frozen.relative_to(vendor/milestone)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    pairs.append({'vendor':str(frozen),'original':str(original),'equal':original.exists() and sha(frozen)==sha(original),'sha256':sha(frozen)})
theme=(scope/'theme.css').read_text()
boot=(scope/'formal/boot.js').read_text()
enhancer=(scope/'formal/enhancer.js').read_text()
checks={
 'vendor_file_count':len(pairs),
 'all_vendor_files_equal_original':all(x['equal'] for x in pairs),
 'local_theme_only':not re.search(r'(^|})\s*(?::root|body|\.btn)\s*\{',theme),
 'boot_captures_formal_host_before_base':boot.index('const formalHost = new URL(location.href)') < boot.index("document.head.prepend(baseElement)"),
 'boot_replace_state_uses_captured_path':'formalHost.pathname + formalHost.search + formalHost.hash' in boot,
 'enhancer_uses_absolute_formal_path':"const formalPath = new URL('./', import.meta.url).pathname" in enhancer,
 'enhancer_capture_navigation':"document.addEventListener('click', keepScopedNavigationInFormalHost, true)" in enhancer,
 'growth_category_is_dynamic':"optab:itemsettings' ? 'items' : 'growth'" in enhancer,
 'r1_archive_preserved':(scope/'evidence/M002-UI-33-R1-source.tar.gz').exists(),
 'r1_manifest_preserved':(scope/'evidence/M002-UI-33-R1-source-manifest.json').exists()
}
checks['passed']=checks['vendor_file_count']==74 and all(v for k,v in checks.items() if k not in ('vendor_file_count','passed'))
out={'version':'M002-UI-33-R2','purpose':'prove navigation fix is adapter-only and vendor/R1 evidence remains intact','checks':checks,'sources':pairs,'modified_current_sources':['formal/boot.js','formal/enhancer.js','formal/index.html','controller.js','copy.json','theme.css','prototype/index.html','prototype/prototype.js','design-spec.md','interactions.md','responsive-accessibility.md']}
(scope/'evidence/M002-UI-33-R2-source-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
if not checks['passed']: raise SystemExit(1)
