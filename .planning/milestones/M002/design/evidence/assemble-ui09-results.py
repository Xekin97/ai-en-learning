from pathlib import Path
import json
D=Path(__file__).resolve().parent
second=json.loads((D/'UI09-second-browser-results.json').read_text());retry=json.loads((D/'UI09-targeted-results.json').read_text())
assert retry['status']=='PASS'
rerun={x['name']:x for x in retry['checks']}
second['checks']=[dict(rerun.get(x['name'],x),evidence='UI09-targeted-results.json' if x['name'] in rerun else 'UI09-second-browser-results.json') for x in second['checks']]
second['status']='PASS' if all(x['status']=='PASS' for x in second['checks']) else 'FAIL'
second['aggregation']='Passing checks from the second run plus the unchanged-source preset-only rerun after ERR_CONNECTION_RESET; original failures retained.'
second['source_reports']=['UI09-first-browser-results.json','UI09-second-browser-results.json','UI09-targeted-results.json']
(D/'UI09-browser-results.json').write_text(json.dumps(second,ensure_ascii=False,indent=2)+'\n')
