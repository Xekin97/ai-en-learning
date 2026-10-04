from pathlib import Path
import json
E=Path(__file__).resolve().parent
a=json.loads((E/'UI10-first-browser-results.json').read_text());b=json.loads((E/'UI10-targeted-results.json').read_text());assert b['status']=='PASS'
retest={x['name']:x for x in b['checks']}
a['checks']=[dict(retest.get(x['name'],x),evidence='UI10-targeted-results.json' if x['name'] in retest else 'UI10-first-browser-results.json') for x in a['checks']]
a['layouts']=b['layouts'];a['axe']=b['axe'];a['status']='PASS' if all(x['status']=='PASS' for x in a['checks']) else 'FAIL';a['aggregation']='Passing home/navigation/motion checks from initial run; affected shape/layout/axe checks rerun after documented fixes. Original failures retained.'
a['source_reports']=['UI10-first-browser-results.json','UI10-targeted-results.json']
(E/'UI10-browser-results.json').write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
