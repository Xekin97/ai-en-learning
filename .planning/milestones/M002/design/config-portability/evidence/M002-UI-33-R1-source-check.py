import hashlib,json,re
from pathlib import Path
root=Path('.')
scope=root/'.planning/milestones/M002/design/config-portability'
vendor=scope/'formal/vendor'
pairs=[]
for milestone in ('M002','M003'):
    base=vendor/milestone
    for frozen in sorted(base.rglob('*')):
        if not frozen.is_file(): continue
        rel=frozen.relative_to(base)
        original=root/'.planning/milestones'/milestone/rel
        def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
        pairs.append({'vendor':str(frozen),'original':str(original),'vendor_sha256':sha(frozen),'original_sha256':sha(original) if original.exists() else None,'equal':original.exists() and sha(frozen)==sha(original)})
theme=(scope/'theme.css').read_text()
fixture=json.loads((scope/'fixtures/admin-safe.json').read_text())
checks={
 'all_vendor_files_equal_original':all(x['equal'] for x in pairs),
 'vendor_file_count':len(pairs),
 'theme_has_no_root_selector':not re.search(r'(^|})\s*:root\s*\{',theme),
 'theme_has_no_body_selector':not re.search(r'(^|})\s*body(?:[\s.{:#])',theme),
 'theme_has_no_global_btn_rule':not re.search(r'(^|})\s*\.btn\s*\{',theme),
 'model_baseline_counts':(len(fixture['models']['providers']),sum(len(x['models']) for x in fixture['models']['providers'])),
 'plan_baseline':[(x['code'],x['limit'],x['maxEntries'],x['review']) for x in fixture['plans']['items']],
 'item_baseline':[(x['name'],x['price'],x['status']) for x in fixture['items']['items']],
 'growth_baseline':fixture['growth']['checkin'],
}
checks['passed']=checks['all_vendor_files_equal_original'] and checks['vendor_file_count']==74 and checks['theme_has_no_root_selector'] and checks['theme_has_no_body_selector'] and checks['theme_has_no_global_btn_rule'] and checks['model_baseline_counts']==(3,4) and checks['plan_baseline']==[('visitor',0,2,0),('basic',10,8,0),('pro',10,8,1),('plus',None,8,1)] and checks['item_baseline']==[('补签卡',30,'listed'),('额外生成次数卡',50,'listed'),('模型探索卡',80,'listed'),('高级计划体验卡',120,'listed')] and checks['growth_baseline']=={'base':5,'step':1,'cap':10,'xp':10,'masteryXp':5}
out={'version':'M002-UI-33-R1','purpose':'prove byte-identical inherited sources and local-only styling','checks':checks,'sources':pairs,'adapter_files':['formal/boot.js','formal/enhancer.js','controller.js','theme.css','copy.json','fixtures/admin-safe.json']}
(scope/'evidence/M002-UI-33-R1-source-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
if not checks['passed']: raise SystemExit(1)
