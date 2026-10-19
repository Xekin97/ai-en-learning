#!/usr/bin/env python3
"""Bounded BE05 contract check; synthetic fixtures, no application/provider execution."""
from pathlib import Path
import json,re,copy,hashlib
T=Path(__file__).resolve().parents[1];R=T.parent;F=T/'fixtures/stream-v5';V='M003-BE-05';C='m003-stream-v5'
def need(x,msg):
 if not x:raise AssertionError(msg)
def load(p):return json.loads(p.read_text())
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
index=load(F/'index.json');packs=load(F/'packages.json')['packages'];docs=[T/'backend.md',T/'ai-integration.md',*[T/'api'/n for n in ['index.md','generation.md','administration.md','presets.md']],R/'handoffs/backend-architecture.md']
schemas={}
for n in ['generation.md','presets.md']:
 for event,shape in re.findall(r'^\| ((?:generation|preview)\.[a-z_]+) \| `([^`]+)` \|$',(T/'api'/n).read_text(),re.M):schemas[event]=set(re.findall(r'([a-z_]+):',shape))
need(len(schemas)==16,'8 documented events per namespace')
def package(p,entries):
 need(set(p)=={'passage','tags','targets'} and len(p['passage'].split())>=50,'Result/length')
 need([x['entry'] for x in p['targets']]==entries,'exact ordered targets')
 for t in p['targets']:
  need(set(t)=={'entry','entry_meaning','hint_phrase','hint_blanks','occurrences'} and t['entry_meaning'] and t['occurrences'],'Target')
  for o in t['occurrences']:need(set(o)=={'surface','start','end'} and p['passage'][o['start']:o['end']]==o['surface']==t['entry'],'Unicode final offset')
  for b in t['hint_blanks']:need(set(b)=={'start','end'} and t['hint_phrase'][b['start']:b['end']]==t['entry'],'hint offset')
def check(f):
 need(f['fixture_version']==V and f['contract_version']==C,'version');ev=f['internal_evidence'];n=ev['N'];entries=f['request']['entries'];lang=f['request']['meaning_language'];bound=1 if n==0 else n+2
 need(n in [0,1,2] and ev['actual_content_repairs']<=2,'bounded flow');need(len(f['wire'])==len(f['playback']),'playback pairing')
 if ev['planning_complete']:
  p=ev['validated_plan'];need(set(p)=={'scene','participants','fixed_facts','beats','word_uses'},'Plan keys');need(len(p['word_uses'])==len(entries) and {x['entry'] for x in p['word_uses']}==set(entries),'dynamic selected coverage')
  need(2<=len(p['beats'])<=4 and len(p['fixed_facts'])<=5 and 1<=len(p['participants'])<=12,'plan bounds')
  for x in p['word_uses']:need(set(x)=={'entry','form','meaning','phrase','role'} and all(x.values()),'full use')
  need(digest(p)==ev['plan_sha256'] and ev['writer_input']['scene_plan']==p,'actual full writer plan same object data')
  need(ev['writer_input']['task']['entries']==entries and ev['writer_input']['task']['meaning_language']=={'zh':'Chinese','en':'English','ja':'Japanese'}[lang],'writer task language/entries')
 else:need(ev['writer_input'] is None and ev['validated_plan'] is None and len(ev['calls'])==1,'failed plan no writer/skip')
 if ev['initial_native_check'] is not None and not ev['initial_native_check']['valid']:
  need(not any(x['version']==1 for x in ev['valid_packages']),'invalid first never lastValid')
 calls=ev['calls'];stages=[x['call_stage'] for x in calls];need(stages[0]=='planning' and stages.count('planning')==1,'one plan')
 need(sum(x['call_stage']=='content_repair' for x in calls)==ev['actual_content_repairs'],'actual conditional repairs')
 need(stages.count('fixed_edit')<=1 and stages.count('generation')<=1 and stages.count('technical_repair')<=2,'independent budget')
 need(all(x['provider_invoked'] is True and x['call_no']==i+1 for i,x in enumerate(calls)),'synthetic actual send')
 versions={'planning':'m003-plan-v1','generation':'m003-draft-v3','fixed_edit':'m003-fixed-edit-v1','technical_repair':'m003-native-v1','content_review':'m003-review-v2','content_repair':'m003-rewrite-v3'}
 for c in calls:
  need(c['prompt_version']==versions[c['call_stage']],'prompt version')
  if c['call_stage']=='generation':need(c['input_plan_sha256']==ev['plan_sha256'],'writer consumed plan digest')
 if n==0:need(not any(s in stages for s in ['fixed_edit','content_review','content_repair']),'N0 includes plan, no enhanced tasks')
 if 'fixed_edit' in stages:
  i=stages.index('fixed_edit');need(stages[:i]==['planning','generation'],'editor unconditional before repairs/review');need(ev['initial_native_check']['technical_calls_before_fixed_edit']==0 and ev['initial_native_check']['editor_eligible'],'no technical recovery before editor')
 if 'content_review' in stages:need('fixed_edit' in stages and stages.index('fixed_edit')<stages.index('content_review'),'mandatory editor before Review')
 full=[c for c in calls if c['call_stage'] in ['generation','fixed_edit','content_repair']]
 need([c['content_version'] for c in full]==list(range(1,len(full)+1)),'business version separate from N')
 seq=rev=0;text='';draft=None;v=0;seen=set();state='idle';prefix=None;run=None;planid=None;previews=[];hide=False;final=None;notice=None;save=False;deletes=[];edits=0;phase=None
 trace={x['wire_seq']:x for x in ev['source_trace']};last=None
 for e,timing in zip(f['wire'],f['playback']):
  name,d=e['event'],e['data'];kind=name.split('.')[1];need(name in schemas and set(d)==schemas[name],'exact wire fields '+name);need(type(d['seq']) is int,'integer seq')
  if d['seq']==seq:need(e==last,'duplicate conflict');continue
  need(d['seq']==seq+1 and state not in ['complete','failed','cancelled','pending','preview_complete_needs_current_draft_check'],'order/terminal');need(set(timing)=={'after_ms'} and 0<=timing['after_ms']<=2000,'synthetic timing')
  if kind=='started':
   need(seq==0 and d['contract_version']==C and d['stream_id'],'started');prefix=name.split('.')[0];run=d['run_id' if prefix=='generation' else 'preview_run_id'];pol=d['snapshot'] if prefix=='generation' else d
   need(pol['content_service']=={'native_validation':True,'content_review_enabled':n>0,'content_repair_limit':n},'snapshot')
   if prefix=='preview':need(d['preview_content_mode']==('enhanced' if n else 'basic'),'preview mode')
   state='accepted'
  else:need(name.startswith(prefix+'.') and seq>0,'namespace')
  if kind=='progress':
   if d['phase']=='planning':need(state=='accepted','planning real stage');state='planning'
   elif d['phase']=='composing':need(state=='planning' and ev['planning_complete'],'validated plan before writer');state='composing'
   else:need(d['phase']=='finalizing' and state=='draft','finalizing order');state='finalizing'
   phase=d['phase']
  elif kind=='plan_item':
   need(state=='planning' and d['meaning_language']==lang,'plan before body/language');need(planid is None or planid==d['plan_id'],'plan identity');planid=d['plan_id'];x=d['item'];need(x['kind'] in ['scene','word_use'],'kind')
   need(set(x)==({'kind','text'} if x['kind']=='scene' else {'kind','entry','form','sense','phrase'}),'safe projection keys')
   key='scene' if x['kind']=='scene' else x['entry'];need(key not in [z[0] for z in previews],'no repeated plan entry')
   if x['kind']=='word_use':need(x['entry'] in entries and x['sense'] and x['phrase'],'selected preview');need('entry_meaning' not in x,'temporary not final')
   if ev['planning_complete']:
    p=ev['validated_plan']
    if x['kind']=='scene':need(x['text']==p['scene'],'actual completed scene')
    else:
     use=next(y for y in p['word_uses'] if y['entry']==x['entry']);need((x['form'],x['sense'],x['phrase'])==(use['form'],use['meaning'],use['phrase']),'actual completed word item')
   previews.append((key,x))
  elif kind=='edit':
   need(state in ['composing','draft'],'edit phase');need(d['base_rev']==rev and d['rev']==rev+1,'rev');at,delete=d['at'],d['delete_count'];need(type(at) is int and type(delete) is int and 0<=at<=len(text) and 0<=delete<=len(text)-at,'Unicode range')
   need(type(d['content_version']) is int and 1<=d['content_version']<=bound,'V bound');new=d['draft_id']!=draft
   if new:need(d['draft_id'] not in seen,'draft identity reuse')
   if d['source']=='provider':
    need(len(d['insert'])<=2048 and d['content_version']>=v,'provider source/version')
    if not new:need(d['content_version']==v and at==len(text) and delete==0 and d['insert'],'same draft append')
   else:need(d['source']=='retained' and new,'retained identity')
   before=text;text=text[:at]+d['insert']+text[at+delete:];rev=d['rev'];draft=d['draft_id'];v=d['content_version'];seen.add(draft);state='draft';previews=[];hide=True;edits+=1
   z=trace[d['seq']];need(text==(z['safe_input'] if z['kind'] in ['switch','restore'] else before+z['safe_input']) and len(text)==z['result_text_length'],'real synthetic delta source')
   if d['source']=='retained':
    valid=[x for x in ev['valid_packages'] if x['after_seq']<d['seq']];need(valid and text==packs[valid[-1]['package']]['passage'] and v==valid[-1]['version'],'restore latest complete valid package')
   if delete:deletes.append({'wire_seq':d['seq'],'deleted_code_points':delete,'inserted_code_points':len(d['insert']),'source':d['source']})
   need(not save and final is None,'partial no learning/save')
  elif kind=='validated':
   need(state=='finalizing' and d['result']['passage']==text and d['final_content_version']==v,'final text/version atomic');need(d['run_id' if prefix=='generation' else 'preview_run_id']==run,'run');final=d;state='complete' if prefix=='generation' else 'preview_complete_needs_current_draft_check';save=prefix=='generation'
  elif kind in ['failed','cancelled']:
   if prefix=='generation':need(d['quota_refunded'] is (kind=='failed'),'refund')
   state=kind;text='';previews=[];save=False
  elif kind=='settlement_pending':need(d['code']=='settlement_unconfirmed','pending');state='pending';save=False
  seq=d['seq'];last=copy.deepcopy(e)
 if f['transport_end']=='unexpected_eof':need(state=='draft','EOF source');state='pending';save=False
 for q in f['status_responses']:
  need(q['http_status']==200 and set(q['body'])=={'data','meta'},'status envelope');d=q['body']['data'];need(d['contract_version']==C and d['run_id' if prefix=='generation' else 'preview_run_id']==run,'status identity')
  common={'contract_version','status','final_content_version','result','content_outcome','completion_notice'}
  need(set(d)==common|({'run_id','snapshot','can_save','quota_refunded'} if prefix=='generation' else {'preview_run_id','draft_version','preview_content_mode','usage'}),'status exact shape')
  if d['status']=='valid':
   if final:need(final['result']==d['result'] and final['content_outcome']==d['content_outcome'] and final['completion_notice']==d['completion_notice'] and final['final_content_version']==d['final_content_version'],'idempotent terminal status')
   final=d;state='complete' if prefix=='generation' else 'preview_complete_needs_current_draft_check';save=d['can_save'] if prefix=='generation' else False;previews=[]
  elif d['status']=='active':need(d['result'] is None and d['content_outcome'] is None and d['final_content_version'] is None,'active no draft snapshot');state='pending';save=False
  else:need(state==d['status'] and d['result'] is None,'failure status')
 if final:
  package(final['result'],entries);out=final['content_outcome'];notice=final['completion_notice'];need(1<=final['final_content_version']<=bound,'final bound');need((out=='basic')==(n==0),'N outcome');need(notice==('content_review_incomplete' if out=='service_incomplete' else None),'persistent notice')
  need(ev['valid_packages'] and final['result']==packs[ev['valid_packages'][-1]['package']] and final['final_content_version']==ev['valid_packages'][-1]['version'],'lastValid atomic final')
  if out=='review_passed':need('fixed_edit' in stages and ev['actual_content_repairs']==0 and final['final_content_version']==2,'fixed editor success')
  if out=='repaired_passed':need(ev['actual_content_repairs']>0,'conditional repair')
  if out=='service_incomplete':need(ev['content_stop_reason'] in ['content_timeout','content_rate_limited','content_transport_error','content_protocol_error','content_review_invalid','fixed_edit_native_invalid','repair_native_invalid'],'Q02 reason')
  # The temporary specific sense cannot silently become the final general entry meaning.
  if ev['planning_complete']:
   for use in ev['validated_plan']['word_uses']:need(use['meaning']!=next(x['entry_meaning'] for x in final['result']['targets'] if x['entry']==use['entry']),'provisional/final distinction')
 ex=f['expected'];need(state==ex['ui_state'] and save==ex['can_save'] and notice==ex['completion_notice'],'UI state/save')
 need((final['result'] if final else None)==(packs[ex['final_package']] if ex['final_package'] else None),'expected final');need(deletes==ex['deletion_frames'],'actual delete frames');need(not ex['resources_before_terminal'] and ex['plan_hidden_on_first_edit'] and (hide or edits==0),'temporary UI')
 if ev['planning_complete']:need(edits>=3,'multi-frame body')
 return edits,len(deletes),sum(x['inserted_code_points']==0 for x in deletes)
fixtures=[load(F/n) for n in index['files']];results=[check(f) for f in fixtures]
# finite corruption checks targeted at new plan/editor contract and inherited edit reducer.
negative=[]
def mutation(name,base,fn):
 bad=copy.deepcopy(fixtures[base]);fn(bad)
 try:check(bad)
 except (AssertionError,KeyError,StopIteration):negative.append(name)
 else:raise AssertionError('accepted mutation '+name)
mutation('writer_receives_summary_not_full_plan',0,lambda f:f['internal_evidence']['writer_input'].__setitem__('scene_plan',{'scene':'summary'}))
mutation('wrong_plan_language',0,lambda f:f['wire'][2]['data'].__setitem__('meaning_language','ja'))
mutation('temporary_field_presented_as_final',0,lambda f:f['wire'][3]['data']['item'].__setitem__('entry_meaning','bad'))
mutation('editor_missing',1,lambda f:f['internal_evidence']['calls'].__setitem__(2,{**f['internal_evidence']['calls'][2],'call_stage':'content_repair'}))
mutation('editor_uses_basic_before_fixed_edit',1,lambda f:f['internal_evidence']['initial_native_check'].__setitem__('technical_calls_before_fixed_edit',1))
mutation('version_derived_from_k_plus_one',1,lambda f:f['wire'][-1]['data'].__setitem__('final_content_version',1))
mutation('Q02_notice_erased',5,lambda f:f['wire'][-1]['data'].__setitem__('completion_notice',None))
mutation('seq_gap',0,lambda f:f['wire'][8]['data'].__setitem__('seq',100))
mutation('Unicode_splice_wrong_rev',0,lambda f:f['wire'][8]['data'].__setitem__('base_rev',100))
# Exact adjacent frame duplicate must not append twice.
dup=copy.deepcopy(fixtures[0]);dup['wire'].insert(9,copy.deepcopy(dup['wire'][8]));dup['playback'].insert(9,{'after_ms':0});check(dup)
need({f['request']['meaning_language'] for f in fixtures}=={'zh','en','ja'},'three languages')
need({len(f['request']['entries']) for f in fixtures}=={2,3},'non-hardcoded selected count')
need(99+2==101 and 2*99+6==204,'N99 static only');need(any('🌱' in p['passage'] and len(p['passage'])!=len(p['passage'].encode('utf-16-le'))//2 for p in packs.values()),'Unicode astral coverage')
links=0
for p in docs:
 s=p.read_text();need('version: '+V in s,'seven BE05 versions')
 for link in re.findall(r'\]\(([^)]+)\)',s):
  if '://' in link or link.startswith('#'):continue
  target=(p.parent/link.split('#')[0].strip('<>')).resolve();need(target.exists() or target==T.resolve()/'evidence/stream-v5-check.json','link '+str(p)+' '+link);links+=1
preserve=load(T/'evidence/stream-v5-preservation.json');repo=R.parents[2]
for n,h in preserve['baseline_sha256'].items():need(hashlib.sha256((repo/n).read_bytes()).hexdigest()==h,'protected changed '+n)
paths=docs+sorted(F.glob('*.json'))+[Path(__file__).resolve(),T/'evidence/build_stream_v5_fixtures.py']
report={'version':V,'contract_version':C,'status':'PASS','scope':'bounded synthetic contract checks only; not application/research/provider/load test','scenario_count':len(fixtures),'wire_event_count':sum(len(f['wire']) for f in fixtures),'edit_count':sum(x[0] for x in results),'delete_or_replace_frames':sum(x[1] for x in results),'pure_delete_frames':sum(x[2] for x in results),'plan_projection_languages':['zh','en','ja'],'selected_entry_counts':[2,3],'negative_mutations_rejected':negative,'adjacent_duplicate':'NOOP','protected_hashes_unchanged':len(preserve['baseline_sha256']),'local_link_targets_checked':links,'N99':'static version101/call204 only; max synthetic conditional repairs2','not_run':['application Go','DB/migration','live provider','new quality batch','browser','load test','UAT3302'],'source_sha256':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
(T/'evidence/stream-v5-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['status','scenario_count','wire_event_count','edit_count','negative_mutations_rejected','protected_hashes_unchanged']},ensure_ascii=False))
