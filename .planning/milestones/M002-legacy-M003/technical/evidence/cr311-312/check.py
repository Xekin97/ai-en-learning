"""Bounded design/fixture checks; not application or independent QA."""
from pathlib import Path
import json,hashlib,tarfile,re
here=Path(__file__).resolve().parent; root=here.parents[2]; technical=root/'technical'; fixture=technical/'fixtures/cr311-312'
checks=[]
def ok(name,value):
 assert value,name
 checks.append(name)
manifest=json.loads((here/'before-manifest.json').read_text())
with tarfile.open(here/'before.tar.gz') as t:
 for p,h in manifest.items():ok('snapshot '+p,hashlib.sha256(t.extractfile(p).read()).hexdigest()==h['sha256'])
c=json.loads((fixture/'candidates.json').read_text());blocked=set(c['blocked_entries'])
ok('41 unique exact entries',len(blocked)==41)
product=(root/'product/data-assets.md').read_text();rows=product.split('本轮唯一目录')[1].split('共41项')[0];actual=[]
for line in rows.splitlines():
 if ',' in line:actual.extend(x.strip() for x in line.split('|')[2].split(','))
ok('entire DATA307 equality',blocked==set(actual))
eligible=[x for x in c['source_universe'] if x.lower() not in blocked]
ok('same entire search/random candidate eligibility',set(eligible)==set(c['eligible_controls']))
ok('all uppercase blocked',all(x.lower() in blocked for x in c['case_variants']))
search=lambda q,limit:sorted((x for x in eligible if q in x.lower()),key=lambda x:(not x.lower().startswith(q),len(x),x))[:limit]
ok('search substring controls',search('the',2)==c['search_the_expected']);ok('filter before limit full result',search('a',3)==c['starvation_expected'])
for path in sorted(fixture.glob('*.json')):
 data=json.loads(path.read_text())
 if 'wire' not in data:continue
 working=shown='';rev=0;draft=None;mode=None;complete=False;seen=set();terminal=False;finalizing=False;v=0
 checkpoints={x['after_seq']:x for x in data['checkpoints']}
 for seq,frame in enumerate(data['wire'],1):
  d=frame['data'];event=frame['event'].split('.')[1]
  ok(path.stem+' seq '+str(seq),d['seq']==seq and not terminal)
  if event=='draft':
   ok(path.stem+' draft base '+str(seq),d['base_rev']==rev)
   if d['action']=='begin':
    ok(path.stem+' fresh id '+str(seq),d['draft_id'] not in seen)
    seen.add(d['draft_id']);draft=d['draft_id'];mode=d['mode'];v=d['content_version'];complete=False;working=shown
   else:
    ok(path.stem+' identity '+str(seq),d['draft_id']==draft and d['content_version']==v)
    if d['action']=='body_complete':
     ok(path.stem+' body length '+str(seq),len(working)==d['body_length'] and not complete)
     count=len(re.split(r'(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)',working))
     ok(path.stem+' paragraph count '+str(seq),count==d['paragraph_count']);shown=working;complete=True
    elif d['action']=='paragraph_complete':ok(path.stem+' publish mode '+str(seq),mode in ('replace','append') and not complete);shown=working
    elif d['action']=='discard':working=shown;complete=True
  elif event=='edit':
   ok(path.stem+' edit shape '+str(seq),set(d)=={'seq','draft_id','content_version','base_rev','rev','at','delete_count','insert','source'})
   ok(path.stem+' edit identity/revision '+str(seq),d['draft_id']==draft and d['content_version']==v and not complete and not finalizing and d['base_rev']==rev and d['rev']==rev+1)
   ok(path.stem+' bounded edit '+str(seq),len(d['insert'])<=2048 and 0<=d['at']<=len(working) and 0<=d['delete_count']<=len(working)-d['at'])
   at=d['at'];working=working[:at]+d['insert']+working[at+d['delete_count']:];rev+=1
   if mode=='initial':shown=working
  elif event=='progress' and d['phase']=='finalizing':finalizing=True
  elif event=='validated':
   ok(path.stem+' final exact body',complete and finalizing and d['result']['passage']==shown)
   for target in d['result']['targets']:
    ok(path.stem+' final offsets '+target['entry'],bool(target['occurrences']) and all(shown[x['start']:x['end']]==x['surface'] for x in target['occurrences']))
   terminal=True
  elif event in ('failed','cancelled','settlement_pending'):terminal=True
  if seq in checkpoints:
   cp=checkpoints[seq];ok(path.stem+' checkpoint '+str(seq),cp['published']==shown and cp['working']==working and cp['rev']==rev and cp['can_save'] is False)
 ok(path.stem+' terminal provided',terminal)
# Check touched current documents' relative links, excluding historical external/fragment-only paths.
for p in manifest:
 body=(root/p).read_text()
 for link in re.findall(r'\]\(([^)]+)\)',body):
  target=link.split('#')[0]
  if target and not target.startswith(('http','/')):ok('relative link '+p+' '+target,((root/p).parent/target).exists() or ((root/p).parent/target).resolve()==(here/'check.json'))
for p in ('changes/CR-311.md','changes/CR-312.md'):ok(p+' remains open','status: open' in (root/p).read_text())
repo=root.parents[2]
ok('persisted pipeline remains v5','PipelineVersion       = "m003-content-v5"' in (repo/'backend/internal/entitlement/service.go').read_text())
ok('DB exact v5 predicates retained',(repo/'backend/db/migrations/0017_m003_content_review.sql').read_text().count("pipeline_version_snapshot = 'm003-content-v5'")==2)
artifacts={p:{'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest(),'characters':len((root/p).read_text())} for p in manifest}
report={'status':'PASS','check_count':len(checks),'checks':checks,'method':'python3 technical/evidence/cr311-312/check.py; finite static assertions only','artifacts':artifacts,'input_tokens':'unknown','runtime_input':'unknown','scope_limits':['not application implementation','not Go/SQL/browser/model tests','not independent QA','not new-session handoff test','not UI approval'],'CR311':'open/unimplemented','CR312':'open/unimplemented'}
(here/'check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'PASS','checks':len(checks),'fixture_files':len(list(fixture.glob('*.json')))}))
