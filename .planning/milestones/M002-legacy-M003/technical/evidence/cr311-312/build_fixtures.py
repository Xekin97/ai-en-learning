"""Finite synthetic contract examples only; never calls app, DB or model."""
from pathlib import Path
import json,re,copy
root=Path(__file__).resolve().parents[2]; out=root/'fixtures/cr311-312'; out.mkdir(exist_ok=True)
def write(name,v):(out/name).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
policy={'version':'m003-native-policy-v1','scope':'logical_request','max_calls':2,'editable':False}
service={'native_validation':True,'content_review_enabled':True,'content_repair_limit':1}
snapshot={'configuration_revision':'fixture-revision','effective_plan':{'code':'pro','origin':'base'},'content_service':service,'native_correction_policy':policy}
def result(text):
 targets=[]
 for entry,meaning in [('art','艺术'),('go','去')]:
  hint='modern art' if entry=='art' else 'go home'; start=hint.index(entry)
  targets.append({'entry':entry,'entry_meaning':meaning,'hint_phrase':hint,'hint_blanks':[{'start':start,'end':start+len(entry)}], 'occurrences':[{'surface':entry,'start':m.start(),'end':m.end()} for m in re.finditer(r'\b'+entry+r'\b',text)]})
 return {'passage':text,'tags':['日常'],'targets':targets}
class Stream:
 def __init__(self,name,preview=False):
  self.name=name;self.ns='preview' if preview else 'generation';self.wire=[];self.checkpoints=[];self.rev=0;self.work='';self.shown='';self.id='';self.v=0;self.mode='';self.number=0
  if preview:self.emit('started',contract_version='m003-stream-v6',stream_id='stream-'+name,preview_run_id='run-'+name,preview_token='fixture-not-a-real-token',draft_version='fixture-draft',preview_content_mode='enhanced',content_service=service,native_correction_policy=policy)
  else:self.emit('started',contract_version='m003-stream-v6',stream_id='stream-'+name,run_id='run-'+name,generation_token='fixture-not-a-real-token',snapshot=snapshot)
  self.emit('progress',phase='planning');self.emit('plan_item',plan_id='plan-'+name,meaning_language='zh',item={'kind':'scene','text':'朋友去看艺术作品。'})
  for entry in ('art','go'):self.emit('plan_item',plan_id='plan-'+name,meaning_language='zh',item={'kind':'word_use','entry':entry,'form':entry,'sense':'暂定本篇用法','phrase':'modern art' if entry=='art' else 'go home'})
  self.emit('progress',phase='composing');self.emit('activity',activity='writing')
 def emit(self,e,**data):self.wire.append({'event':self.ns+'.'+e,'data':{'seq':len(self.wire)+1,**data}})
 def cp(self,label):self.checkpoints.append({'after_seq':len(self.wire),'label':label,'published':self.shown,'working':self.work,'rev':self.rev,'can_save':False})
 def begin(self,mode,v):
  self.number+=1;self.id=self.name+'-d'+str(self.number);self.v=v;self.mode=mode;self.work=self.shown
  self.emit('draft',action='begin',draft_id=self.id,content_version=v,mode=mode,base_rev=self.rev)
 def splice(self,at,delete,insert):
  parts=[insert[i:i+2048] for i in range(0,len(insert),2048)] or ['']
  for i,p in enumerate(parts):
   d=delete if i==0 else 0
   self.emit('edit',draft_id=self.id,content_version=self.v,base_rev=self.rev,rev=self.rev+1,at=at,delete_count=d,insert=p,source='retained' if self.mode=='restore' else 'provider');self.rev+=1
   self.work=self.work[:at]+p+self.work[at+d:];at+=len(p)
   if self.mode=='initial':self.shown=self.work
 def para(self,index):
  self.emit('draft',action='paragraph_complete',draft_id=self.id,content_version=self.v,base_rev=self.rev,paragraph_index=index);self.shown=self.work
 def complete(self,count):
  self.emit('draft',action='body_complete',draft_id=self.id,content_version=self.v,base_rev=self.rev,body_length=len(self.work),paragraph_count=count);self.shown=self.work
 def discard(self):
  self.emit('draft',action='discard',draft_id=self.id,content_version=self.v,base_rev=self.rev);self.work=self.shown
 def initial(self,text,count=3):
  cut=text.index(' ')+1;self.begin('initial',1);self.splice(0,0,text[:cut]);self.cp('initial first safe word immediately visible');self.splice(len(self.work),0,text[cut:]);self.complete(count);self.cp('initial body complete, private metadata/validation still pending')
 def valid(self,outcome='review_passed',v=None):
  self.emit('progress',phase='finalizing');v=v or self.v
  extra={'preview_run_id':'run-'+self.name,'draft_version':'fixture-draft','preview_content_mode':'enhanced','usage':{'provider_calls':4,'input_tokens':None,'output_tokens':None,'cost_usd':None,'unknown_calls':4,'invocation_unknown_calls':0,'not_invoked_calls':0}} if self.ns=='preview' else {'run_id':'run-'+self.name}
  # Copy the authoritative pre-existing UsageSummary shape for preview.
  if self.ns=='preview':
   base=json.loads((root/'fixtures/stream-v5/preview-basic.json').read_text());extra['usage']=next(x['data']['usage'] for x in base['wire'] if x['event']=='preview.validated')
  self.emit('validated',**extra,final_content_version=v,result=result(self.shown),content_outcome=outcome,completion_notice='content_review_incomplete' if outcome=='service_incomplete' else None)
 def save(self,ac,notes):
  write(self.name+'.json',{'fixture_version':'M003-BE-08','contract_version':'m003-stream-v6','synthetic':True,'coverage':ac,'request':{'entries':['art','go'],'meaning_language':'zh'},'wire':self.wire,'checkpoints':self.checkpoints,'notes':notes})
old='We see art.\n\nWe go home.\n\nThe art stays.'
# Shorter replacement, half paragraph no public update, last metadata delayed.
a=Stream('shorter');a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);a.cp('new half paragraph buffered on server; all three old paragraphs remain')
new1='We enjoy art.\n\n';a.splice(0,len('We see art.\n\n'),new1);a.cp('replacement edit staged; no incomplete paragraph exposed');a.para(0);a.cp('first complete changed paragraph replaces only first old paragraph')
a.splice(len(new1),len(a.work)-len(new1),'We go together.');a.cp('short final paragraph and deletion staged; old tail remains visible');a.complete(2);a.cp('body complete trims old tail; tags/targets not yet complete; no save');a.valid();a.save(['AC-325','AC-326','AC-327'],['No source model time is claimed. Mid-body pause means no event.'])
# Same first paragraph no edit; larger reconstructed body.
a=Stream('longer-unchanged');a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);a.para(0);a.cp('unchanged paragraph boundary; no edit/no highlight');p1='We see art.\n\n';p2='We go to the art fair.\n\n';a.splice(len(p1),len('We go home.\n\n'),p2);a.para(1)
p3='We go back.\n\n';a.splice(len(p1+p2),len('The art stays.'),p3);a.para(2);a.splice(len(a.work),0,'We remember art.');a.complete(4);a.valid();a.save(['AC-325','AC-326'],['Ordinal correspondence, no semantic paragraph matching.'])
# One >16KiB paragraph, Unicode, no extra paragraph constraint.
a=Stream('large-paragraph');a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);large='🎨 We study art and go slowly. '+('A useful sentence. '*1100)+'\n\n';a.splice(0,len('We see art.\n\n'),large);a.cp('more than 16KiB staged across <=2048-codepoint edits; old whole draft remains');a.para(0);a.splice(len(large),len(a.work)-len(large),'We go home.');a.complete(2);a.valid();a.save(['AC-325','AC-327'],['No long paragraph rejection; no artificial model paragraph splitting.'])
# Continuation same V after completed replacement, plus private field correction.
a=Stream('continuation');a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);base='We see art and go.';a.splice(0,len(a.work),base);a.complete(1);a.emit('activity',activity='writing');a.begin('append',2);a.splice(len(a.work),0,'\n\nWe go to learn art.');a.cp('same V continuation staged, previous whole body still readable');a.complete(2);a.emit('activity',activity='improving');a.cp('field/annotation correction and review private; no new draft/edit');a.valid();a.save(['AC-325','AC-328'],['No extra visible draft for clean-invariant native corrections.'])
# Real safe Unicode/CRLF projection, final paragraph no trailing blank line.
a=Stream('unicode-crlf');a.initial('🎨 We see art.\r\n \t\r\nWe go home.',2);a.emit('activity',activity='improving');a.begin('replace',2);text='🎨 We enjoy art.\r\n \t\r\nWe go home.';a.splice(0,len(a.work),text);a.complete(2);a.valid();a.save(['AC-325','AC-327'],['Codepoints, CRLF separator unchanged; split surrogate/annotation source vectors in boundaries.json.'])
# Q02 lower version: body incomplete OR metadata failure after body closed.
for after_body in (False,True):
 a=Stream('q02-after-body' if after_body else 'q02-mid-draft');a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);a.splice(0,len('We see art.\n\n'),'We enjoy art.\n\n');a.para(0)
 if after_body:a.splice(len('We enjoy art.\n\n'),len(a.work)-len('We enjoy art.\n\n'),'We go outside.');a.complete(2);a.cp('body complete but malformed later targets; not lastValid')
 else:a.splice(len('We enjoy art.\n\n'),len('We go home.\n\n'),'We go slowly.\n\n');a.cp('network interrupts during uncommitted paragraph fragments')
 a.discard();a.begin('restore',1);a.splice(0,len(a.work),old);a.cp('retained restore staged, no new provider text');a.complete(3);a.valid('service_incomplete',1);a.save(['AC-325','AC-327','AC-328'],['lastValid is full initial package, not published mixed text.'])
for kind in ('cancelled','failed','pending'):
 a=Stream(kind);a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);a.splice(0,len('We see art.\n\n'),'We enjoy art.\n\n');a.cp('uncommitted paragraph must never become visible on interruption');a.discard()
 if kind=='cancelled':a.emit('cancelled',quota_refunded=False)
 elif kind=='failed':a.emit('failed',code='schema_error',quota_refunded=True,retryable=True,request_id='fixture-request')
 else:a.emit('settlement_pending',code='settlement_unconfirmed',request_id='fixture-request')
 a.save(['AC-328'],['failed fixture assumes no internal valid package despite complete visible body; pending cannot imply refund/success.'])
a=Stream('preview',True);a.initial(old);a.emit('activity',activity='improving');a.begin('replace',2);a.splice(0,len(a.work),'We enjoy art and go home.');a.complete(1);a.valid();a.save(['AC-325','AC-327','AC-328'],['preview namespace uses preview token/version/usage, no user charge fields.'])
# Candidate finite universe.
text=(root.parent/'product/data-assets.md').read_text();rows=text.split('本轮唯一目录')[1].split('共41项')[0];blocked=[]
for row in rows.splitlines():
 if ',' in row:blocked+= [x.strip() for x in row.split('|')[2].split(',')]
assert len(blocked)==41
write('candidates.json',{'blocked_entries':blocked,'case_variants':[x.upper() for x in blocked],'eligible_controls':['art','go','theater','another'],'source_universe':blocked+[x.upper() for x in blocked]+['art','go','theater','another'],'search_the_expected':['theater','another'],'starvation_query':'a','starvation_limit':3,'starvation_expected':['art','another','theater'],'existing_selected_allowed':['the'],'random_no_candidates_reason':'no_candidates','source_hash_changed':False})
write('boundaries.json',{'source_vectors':[{'chunks':['{"passage":"🎨 art(ar','t) and go(go).\\n\\nNext ', 'art(art) is here.","tags":', '["日常"],"targets":{} }'],'clean_body':'🎨 art and go.\n\nNext art is here.','body_closed_chunk':1,'whole_candidate_valid':False},{'chunks':['{"passage":"\\uD83C','\\uDFA8 art(art) and go(go)."',' ,"tags":BROKEN}'],'clean_body':'🎨 art and go.','body_closed_chunk':1,'whole_candidate_valid':False}], 'must_reject_or_reconcile':['duplicate seq with different data','seq gap','old draft id','wrong base_rev','edit after body_complete','paragraph_index skip','provider version decrease','old stream/epoch callback','activity after finalizing','body_length mismatch','uncommitted fragments at EOF','surrogate incomplete at EOF','unterminated annotation at EOF'], 'exact_duplicate_last_frame':'ignore idempotently','heartbeat':'no seq/no activity/no paragraph update'})
files=sorted(x.name for x in out.glob('*.json') if x.name!='index.json')
write('index.json',{'version':'M003-BE-08','status':'synthetic_design_inputs_only','api':'../../api/generation.md#cr312-wire','files':files,'application_tests_run':False,'real_model_calls':0,'unimplemented':True})
