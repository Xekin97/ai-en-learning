"""Build synthetic design fixtures; never run a provider or application pipeline."""
from pathlib import Path
import json,re
P=Path(__file__).resolve().parents[1]/'fixtures/stream-v4';V='M003-BE-04';C='m003-stream-v4'
def write(n,x): (P/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
old=json.loads((P.parent/'stream-v3/packages.json').read_text());packs={}
def package(text,meaning3=False):
 out={'passage':text,'tags':['社区','园艺'],'targets':[]}
 for e,m,h in zip(['garden','learn','share'],['花园；园圃','学习；学会','分享；分担' if meaning3 else '分享；共同使用'],['a quiet garden','learn a new skill','share a task']):
  start=h.index(e);out['targets'].append({'entry':e,'entry_meaning':m,'hint_phrase':h,'hint_blanks':[{'start':start,'end':start+len(e)}],'occurrences':[{'surface':z.group(),'start':z.start(),'end':z.end()} for z in re.finditer(r'\b'+e+r'\b',text)]})
 return out
for k,x in old['packages'].items(): packs[k]=package(x['passage'].replace('On Saturday,','On Saturday, Zoë saw a 🌱 sign near the gate. Then').replace('Mei','Zoë'),k=='v3')
base,tail=packs['v1']['passage'].split(' Before leaving,',1);tail='Before leaving,'+tail
packs['native']=package(base+'\n\n'+tail)
write('packages.json',{'fixture_version':V,'minimum_words':50,'entries':['garden','learn','share'],'packages':packs,'note':'Synthetic content; no model quality or latency claim.'})
policy={'version':'m003-native-policy-v1','scope':'logical_request','max_calls':2,'editable':False}
def service(n): return {'native_validation':True,'content_review_enabled':bool(n),'content_repair_limit':n}
def snapshot(n): return {'configuration_revision':'fixture-revision-4','effective_plan':{'code':'pro' if n else 'basic','origin':'base'},'content_service':service(n),'native_correction_policy':policy}
def chunks(text):
 first=min(len(text),text.find(' ',text.find(' ')+1)+1)
 if first<=0:first=min(12,len(text))
 out=[text[:first]];cur=first
 while cur<len(text):
  end=min(cur+32,len(text))
  if end<len(text):
   space=text.rfind(' ',cur+12,end)
   if space>cur:end=space+1
  out.append(text[cur:end]);cur=end
 return out
class F:
 def __init__(self,name,n,preview=False):
  self.name=name;self.n=n;self.preview=preview;self.prefix='preview.' if preview else 'generation.';self.run='fixture-'+name;self.stream='stream-'+name;self.rev=0;self.text='';self.draft=None;self.wire=[];self.play=[];self.trace=[];self.status=[];self.deletions=[]
  if preview: kw=dict(preview_run_id=self.run,preview_token='fixture-not-a-real-token',draft_version='fixture-current-draft',preview_content_mode='enhanced',content_service=service(1),native_correction_policy=policy)
  else: kw=dict(run_id=self.run,generation_token='fixture-not-a-real-token',snapshot=snapshot(n))
  self.add('started',250,contract_version=C,stream_id=self.stream,**kw);self.add('progress',200,phase='composing')
 def add(self,event,delay=100,**data):
  self.wire.append({'event':self.prefix+event,'data':{'seq':len(self.wire)+1,**data}});self.play.append({'after_ms':delay})
 def edit(self,draft,ver,delta,kind='append',delay=90):
  before=self.text
  if kind in ('switch','restore'):
   at=0
   while at<min(len(before),len(delta)) and before[at]==delta[at]:at+=1
   delete=len(before)-at;insert=delta[at:]
  else: at=len(before);delete=0;insert=delta
  source='retained' if kind=='restore' else 'provider'
  self.add('edit',delay,draft_id=draft,content_version=ver,base_rev=self.rev,rev=self.rev+1,at=at,delete_count=delete,insert=insert,source=source)
  self.rev+=1;self.text=before[:at]+insert+before[at+delete:];self.draft=draft
  self.trace.append({'wire_seq':len(self.wire),'kind':kind,'safe_input':delta,'result_text_length':len(self.text)})
  if delete:self.deletions.append({'wire_seq':len(self.wire),'deleted_code_points':delete,'inserted_code_points':len(insert),'source':source})
 def draft_stream(self,key,ver,draft,partial=None,delay=500):
  text=packs[key]['passage'];text=text[:partial] if partial else text
  for i,part in enumerate(chunks(text)):self.edit(draft,ver,part,'switch' if i==0 else 'append',delay if i==0 else 90)
 def final(self,key,ver,out):
  self.add('progress',350,phase='finalizing')
  d=dict(final_content_version=ver,result=packs[key],content_outcome=out,completion_notice='content_review_incomplete' if out=='service_incomplete' else None)
  if self.preview:d.update(preview_run_id=self.run,draft_version='fixture-current-draft',preview_content_mode='enhanced',usage={'logical_runs':1,'provider_calls':4,'input_tokens':None,'output_tokens':None,'cost':None,'unknown_calls':4,'invocation_unknown_calls':0,'not_invoked_calls':0})
  else:d['run_id']=self.run
  self.add('validated',200,**d)
 def status_response(self,state,key=None,ver=None,out=None):
  d={'contract_version':C,'run_id':self.run,'status':state,'snapshot':snapshot(self.n),'final_content_version':ver,'result':packs[key] if key else None,'can_save':state=='valid','quota_refunded':state=='failed','content_outcome':out if state=='valid' else (None if state=='active' else state),'completion_notice':'content_review_incomplete' if out=='service_incomplete' else None}
  self.status.append({'after_ms':400,'http_status':200,'body':{'data':d,'meta':{'request_id':'fixture-status'}}})
 def save(self,key=None,ver=None,out=None,state='complete',transport='eof_after_terminal',repairs=0,notes=[]):
  write(self.name+'.json',{'fixture_version':V,'contract_version':C,'wire':self.wire,'playback':self.play,'transport_end':transport,'status_responses':self.status,'expected':{'ui_state':state,'final_package':key,'final_content_version':ver,'completion_notice':'content_review_incomplete' if out=='service_incomplete' else None,'can_save':state=='complete' and not self.preview,'deletion_frames':self.deletions,'resources_before_terminal':False},'internal_evidence':{'N':self.n,'actual_content_repairs':repairs,'source_trace':self.trace,'notes':notes,'scope':'Synthetic safe-provider input substitutes only; not recorded live tokens or latency.'}})
  files.append(self.name+'.json')
files=[]
f=F('basic',0);f.draft_stream('v1',1,'d-basic');f.final('v1',1,'basic');f.save('v1',1,'basic')
f=F('paid-no-rewrite',1);f.draft_stream('v1',1,'d-paid');f.final('v1',1,'review_passed');f.play[-2]['after_ms']=950;f.save('v1',1,'review_passed',notes=['No edit during internal review; existing draft remains.'])
f=F('rewrite-once',1);f.draft_stream('v1',1,'d-first');f.draft_stream('v2',2,'d-second',delay=1100);f.final('v2',2,'repaired_passed');f.save('v2',2,'repaired_passed',repairs=1)
f=F('rewrite-twice-recover',2);f.draft_stream('v1',1,'d-first');f.draft_stream('v2',2,'d-second',delay=900);f.draft_stream('v3',3,'d-third',partial=182,delay=900);f.edit('d-retained',2,packs['v2']['passage'],'restore',650);f.final('v2',2,'service_incomplete');f.status_response('valid','v2',2,'service_incomplete');f.save('v2',2,'service_incomplete',repairs=2,notes=['Second rewrite interrupts after real partial V3; latest complete valid V2 is restored; content_transport_error.'])
f=F('native-continuation',0)
for i,part in enumerate(chunks(base)):f.edit('d-native-initial',1,part,'switch' if i==0 else 'append',450 if i==0 else 90)
for i,part in enumerate(chunks(tail)):f.edit('d-native-continuation',1,('\n\n' if i==0 else '')+part,'continuation' if i==0 else 'append',950 if i==0 else 90)
f.final('native',1,'basic');f.play[-2]['after_ms']=850;f.save('native',1,'basic',notes=['Shared basic budget: one continuation plus one annotations-only correction. Correction preserves clean text and emits no edit; copied provider prose is not displayed again.'])
f=F('pending-status',0);f.draft_stream('v1',1,'d-pending');f.add('progress',200,phase='finalizing');f.add('settlement_pending',200,code='settlement_unconfirmed',request_id='fixture-pending');f.status_response('active');f.status_response('valid','v1',1,'basic');f.save('v1',1,'basic',transport='eof_after_pending')
f=F('eof-unknown',1);f.draft_stream('v1',1,'d-eof',partial=173);f.status_response('active');f.save(state='pending',transport='unexpected_eof')
f=F('cancelled',1);f.draft_stream('v1',1,'d-cancel',partial=142);f.add('cancelled',300,quota_refunded=False);f.status_response('cancelled');f.save(state='cancelled')
f=F('no-valid-failure',0);f.draft_stream('v1',1,'d-failed',partial=164);f.add('failed',450,code='protocol_error',quota_refunded=True,retryable=True,request_id='fixture-failed');f.status_response('failed');f.save(state='failed',notes=['Incomplete/invalid first candidate: no lastValid, clear partial; not Q02 success.'])
f=F('preview-rewrite',1,True);f.draft_stream('v1',1,'d-preview-first');f.draft_stream('v2',2,'d-preview-second',delay=850);f.final('v2',2,'repaired_passed');f.save('v2',2,'repaired_passed',state='preview_complete_needs_current_draft_check',repairs=1)
write('index.json',{'fixture_version':V,'contract_version':C,'files':files,'packages':'packages.json','wire_shape':'wire[] = {event,data}; data is exact SSE JSON, without an envelope','edit_unit':'Unicode code point; use incremental code point count, not UTF-16 string.length','playback':'playback[i].after_ms schedules wire[i]; synthetic only, never a production latency claim','source_trace':'internal_evidence.source_trace gives synthetic safe provider fragments and retained snapshots; UI must not use it to drive state','display_allowlist':['rendered draft after edit','progress.phase','validated.result','validated.completion_notice','failed.code','quota_refunded'],'not_for_display':['draft_id','content_version','base_rev','rev','seq','at','delete_count','source','internal_evidence','expected','snapshot.content_service.content_repair_limit']})
print('Wrote',len(files),'scenarios;',sum(len(json.loads((P/x).read_text())['wire']) for x in files),'wire events')
