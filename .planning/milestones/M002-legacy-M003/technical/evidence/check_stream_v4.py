#!/usr/bin/env python3
"""Bounded BE04 design check: synthetic wire only, not a production reducer."""
from pathlib import Path
import json,re,copy,hashlib
T=Path(__file__).resolve().parents[1];R=T.parent;F=T/'fixtures/stream-v4';V='M003-BE-04';C='m003-stream-v4'
def need(x,msg):
 if not x: raise AssertionError(msg)
def load(p): return json.loads(p.read_text())
index=load(F/'index.json');corpus=load(F/'packages.json');packages=corpus['packages']
docs=[T/'backend.md',T/'ai-integration.md',*(T/'api'/x for x in ['index.md','generation.md','administration.md','presets.md']),R/'handoffs/backend-architecture.md']
schemas={}
for fn in ['generation.md','presets.md']:
 for event,shape in re.findall(r'^\| ((?:generation|preview)\.[a-z_]+) \| `([^`]+)` \|$',(T/'api'/fn).read_text(),re.M):schemas[event]=set(re.findall(r'([a-z_]+):',shape))
need(len(schemas)==14,'seven event types per namespace')
def check_package(p):
 need(set(p)=={'passage','tags','targets'},'Result fields');need(len(p['passage'].split())>=50,'synthetic minimum length')
 need([t['entry'] for t in p['targets']]==corpus['entries'],'exact ordered targets')
 for t in p['targets']:
  need(set(t)=={'entry','entry_meaning','hint_phrase','hint_blanks','occurrences'},'Target fields')
  need(bool(t['entry_meaning']) and bool(t['occurrences']),'target resources')
  for o in t['occurrences']:
   need(set(o)=={'surface','start','end'} and p['passage'][o['start']:o['end']]==o['surface']==t['entry'],'code-point occurrence')
  for b in t['hint_blanks']:need(t['hint_phrase'][b['start']:b['end']]==t['entry'],'hint offset')
for p in packages.values():check_package(p)
class Reducer:
 def __init__(self,n):
  self.n=n;self.seq=0;self.last=None;self.rev=0;self.text='';self.draft=None;self.version=0;self.seen=set();self.state='idle';self.final=None;self.notice=None;self.save=False;self.prefix=None;self.run=None
 def apply(self,e):
  name,d=e['event'],e['data']
  need(name in schemas and set(d)==schemas[name],'exact documented wire schema')
  if d['seq']==self.seq:
   need(e==self.last,'conflicting duplicate');return 'duplicate_noop'
  need(type(d['seq']) is int and d['seq']==self.seq+1,'seq gap/late')
  need(self.state not in {'complete','failed','cancelled','pending','preview_complete_needs_current_draft_check'},'event after close')
  kind=name.split('.')[1]
  if kind=='started':
   need(self.seq==0 and d['contract_version']==C,'started once/version');self.prefix=name.split('.')[0];self.run=d['run_id' if self.prefix=='generation' else 'preview_run_id'];self.state='accepted'
   need(bool(d['stream_id']),'stream identity')
   policy=d['snapshot'] if self.prefix=='generation' else d
   need(policy['content_service']=={'native_validation':True,'content_review_enabled':self.n>0,'content_repair_limit':self.n},'accepted N')
  else:need(self.prefix==name.split('.')[0] and self.seq>0,'namespace/start')
  if kind=='progress':
   if d['phase']=='composing':need(self.state=='accepted','composing once');self.state='composing'
   else:need(d['phase']=='finalizing' and self.draft is not None,'finalizing source');self.state='finalizing'
  elif kind=='edit':
   need(self.state in {'composing','draft'},'edit active phase')
   need(type(d['base_rev']) is int and d['base_rev']==self.rev and d['rev']==self.rev+1,'revision')
   at,delete=d['at'],d['delete_count'];need(type(at) is int and type(delete) is int and 0<=at<=len(self.text) and 0<=delete<=len(self.text)-at,'splice range')
   need(type(d['content_version']) is int and 1<=d['content_version']<=self.n+1,'business version range')
   new=d['draft_id']!=self.draft
   if new:need(d['draft_id'] not in self.seen,'old draft reused')
   if d['source']=='provider':
    need(len(d['insert'])<=2048 and d['content_version']>=self.version,'provider bound/version')
    if not new:need(d['content_version']==self.version and at==len(self.text) and delete==0 and bool(d['insert']),'same draft tail append')
   else:need(d['source']=='retained' and new and self.draft is not None,'retained source')
   need(delete or d['insert'] or new,'no fake progress')
   need(not re.search(r'<[A-Za-z/!?]|\([a-z_]+\)',d['insert']),'no raw markup/annotation in fixture')
   self.text=self.text[:at]+d['insert']+self.text[at+delete:];self.rev=d['rev'];self.draft=d['draft_id'];self.version=d['content_version'];self.seen.add(self.draft);self.state='draft'
  elif kind=='validated':
   need(self.state=='finalizing','validated order');need(d['run_id' if self.prefix=='generation' else 'preview_run_id']==self.run,'run identity')
   need(self.text==d['result']['passage'],'stream/final exact text');self.valid(d)
  elif kind in {'failed','cancelled'}:
   if self.prefix=='generation':need(d['quota_refunded'] is (kind=='failed'),'refund')
   self.text='';self.final=None;self.state=kind;self.save=False
  elif kind=='settlement_pending':need(d['code']=='settlement_unconfirmed','pending');self.state='pending';self.save=False
  self.seq=d['seq'];self.last=copy.deepcopy(e)
 def valid(self,d):
  check_package(d['result']);need(1<=d['final_content_version']<=self.n+1,'final version')
  out=d['content_outcome'];need(out in {'basic','review_passed','repaired_passed','limit_finalized','service_incomplete'},'outcome')
  need((out=='basic')==(self.n==0),'policy/outcome');need(d['completion_notice']==('content_review_incomplete' if out=='service_incomplete' else None),'notice')
  if self.final is not None:need(self.final==d['result'] and self.notice==d['completion_notice'],'terminal conflict')
  self.final=d['result'];self.text=d['result']['passage'];self.notice=d['completion_notice'];self.version=d['final_content_version'];self.state='complete' if self.prefix=='generation' else 'preview_complete_needs_current_draft_check';self.save=self.prefix=='generation'

def check(f):
 need(f['fixture_version']==V and f['contract_version']==C,'fixture version');n=f['internal_evidence']['N'];need(0<=n<=2 and f['internal_evidence']['actual_content_repairs']<=2,'bounded synthetic depth')
 need(len(f['wire'])==len(f['playback']),'one timing hint per frame');r=Reducer(n);trace={x['wire_seq']:x for x in f['internal_evidence']['source_trace']};deletions=[];edits=0
 for e,play in zip(f['wire'],f['playback']):
  need(set(play)=={'after_ms'} and 0<=play['after_ms']<=2000,'bounded synthetic playback');before=r.text;r.apply(e);d=e['data']
  if e['event'].endswith('.edit'):
   edits+=1;t=trace[d['seq']]
   target=t['safe_input'] if t['kind'] in {'switch','restore'} else before+t['safe_input']
   need(r.text==target and len(r.text)==t['result_text_length'],'real synthetic source projection')
   if t['kind']=='continuation':need(t['safe_input'].startswith('\n\n'),'explicit continuation baseline')
   if t['kind']=='restore':need(r.text in [p['passage'] for p in packages.values()] and d['source']=='retained','restore valid package')
   if d['delete_count']:deletions.append({'wire_seq':d['seq'],'deleted_code_points':d['delete_count'],'inserted_code_points':len(d['insert']),'source':d['source']})
   need(not r.save and r.final is None,'draft no resources or save')
 need(edits>=3,'must contain genuine multi-frame example')
 if f['transport_end']=='unexpected_eof':need(r.state=='draft','EOF before terminal');r.state='pending';r.save=False
 for q in f['status_responses']:
  need(q['http_status']==200 and set(q['body'])=={'data','meta'},'status envelope');d=q['body']['data']
  need(d['contract_version']==C and d['run_id']==r.run,'status identity');need(set(d)=={'contract_version','run_id','status','snapshot','final_content_version','result','can_save','quota_refunded','content_outcome','completion_notice'},'status exact fields')
  if d['status']=='valid':r.valid(d);r.save=d['can_save'];need(not d['quota_refunded'],'valid charge')
  elif d['status']=='active':
   need(d['result'] is None and d['content_outcome'] is None and d['final_content_version'] is None and not d['can_save'],'active not complete')
   if r.final is None:r.state='pending';r.save=False
  else:need(d['status']==r.state and d['result'] is None and not d['can_save'] and d['quota_refunded'] is (r.state=='failed'),'failure status')
 ex=f['expected'];need(r.state==ex['ui_state'] and r.save==ex['can_save'] and r.notice==ex['completion_notice'],'final UI')
 need(r.final==(packages[ex['final_package']] if ex['final_package'] else None),'atomic final package');need(deletions==ex['deletion_frames'],'visible deletion/replacement frames');need(not ex['resources_before_terminal'],'no draft learning resources')
 return edits,deletions
fixtures=[load(F/x) for x in index['files']];results=[check(x) for x in fixtures]
# Idempotent duplicate: same frame cannot append twice.
r=Reducer(0)
for e in fixtures[0]['wire'][:4]:r.apply(e)
before=(r.text,r.rev,r.seq);need(r.apply(fixtures[0]['wire'][3])=='duplicate_noop' and before==(r.text,r.rev,r.seq),'duplicate idempotence')
negative=[]
for label,mut in [
 ('seq_gap',lambda f:f['wire'][3]['data'].__setitem__('seq',99)),
 ('wrong_base_revision',lambda f:f['wire'][3]['data'].__setitem__('base_rev',99)),
 ('out_of_bounds_splice',lambda f:f['wire'][3]['data'].__setitem__('at',99999)),
 ('same_draft_overwrite',lambda f:f['wire'][3]['data'].__setitem__('at',0)),
 ('mixed_final_package',lambda f:f['wire'][-1]['data']['result'].__setitem__('passage','Wrong article')),
 ('missing_failure_notice',lambda f:f['wire'][-1]['data'].__setitem__('completion_notice','content_review_incomplete')),
]:
 bad=copy.deepcopy(fixtures[0]);mut(bad)
 try:check(bad)
 except (AssertionError,KeyError):negative.append(label)
 else:raise AssertionError('negative accepted: '+label)
# Unicode fixture includes astral character, ensuring code-point and UTF-16 lengths differ.
s=packages['v1']['passage'];need('🌱' in s and len(s)!=len(s.encode('utf-16-le'))//2,'astral Unicode coverage')
need(1<=100<=99+1 and not (1<=101<=99+1),'N99 static version bounds')
links=0
for p in docs:
 text=p.read_text();need('version: '+V in text,'seven current document versions')
 for link in re.findall(r'\]\(([^)]+)\)',text):
  if '://' in link or link.startswith('#'):continue
  target=(p.parent/link.split('#')[0].strip('<>')).resolve();need(target.exists() or target==T/'evidence/stream-v4-check.json','local link '+link);links+=1
preserve=load(T/'evidence/stream-v4-preservation.json');repo=R.parents[2]
for name,digest in preserve['baseline_sha256'].items():need(hashlib.sha256((repo/name).read_bytes()).hexdigest()==digest,'protected changed: '+name)
paths=[*docs,*sorted(F.glob('*.json')),Path(__file__).resolve(),T/'evidence/build_stream_v4_fixtures.py']
report={'version':V,'contract_version':C,'status':'PASS','scope':'bounded static design/fixture check, not production or performance test','scenario_count':len(fixtures),'wire_event_count':sum(len(f['wire']) for f in fixtures),'edit_count':sum(x[0] for x in results),'delete_or_replace_frames':sum(len(x[1]) for x in results),'pure_delete_frames':sum(y['inserted_code_points']==0 for x in results for y in x[1]),'duplicate_last_frame':'NOOP','negative_mutations_rejected':negative,'local_link_targets_checked':links,'protected_hashes_unchanged':len(preserve['baseline_sha256']),'unicode':'code-point splice with astral character','N99':'static version range only; no >2 repair flow','runtime_tokens':'unknown','not_run':['Go application','database','live provider','browser prototype','load test','UAT3302'],'current_document_characters':sum(len(p.read_text()) for p in docs),'source_sha256':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
(T/'evidence/stream-v4-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['status','scenario_count','wire_event_count','edit_count','delete_or_replace_frames','pure_delete_frames','negative_mutations_rejected','protected_hashes_unchanged']},ensure_ascii=False))
