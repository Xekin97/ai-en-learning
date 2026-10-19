"""Finite synthetic BE05 design corpus. No provider/application execution."""
from pathlib import Path
import json,re,hashlib
T=Path(__file__).resolve().parents[1];P=T/'fixtures/stream-v5';P.mkdir(exist_ok=True)
V='M003-BE-05';C='m003-stream-v5'
def write(n,x): (P/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
old=json.loads((T/'fixtures/stream-v4/packages.json').read_text())['packages'];packs={}
meanings={'zh':['花园；园圃','学习；学会','分享；共同使用'],'en':['a place where plants are grown','to gain knowledge or a skill','to use or enjoy something with others'],'ja':['花や野菜を育てる庭','知識や技能を身につける','他の人と分け合う']}
for lang in ['zh','en','ja']:
 for key,p in old.items():
  q=json.loads(json.dumps(p));q['tags']={'zh':['园艺','社区'],'en':['gardening','community'],'ja':['園芸','地域']}[lang]
  for i,t in enumerate(q['targets']):t['entry_meaning']=meanings[lang][i]
  packs[key+'-'+lang]=q
packs['v4-zh']=json.loads(json.dumps(packs['v1-zh']))
packs['basic-two-ja']=json.loads(json.dumps(packs['v1-ja']));packs['basic-two-ja']['targets']=packs['basic-two-ja']['targets'][:2]
write('packages.json',{'fixture_version':V,'minimum_words':50,'packages':packs,'note':'Synthetic final resources, not measured quality/latency; temporary plan senses are separate.'})
policy={'version':'m003-native-policy-v1','scope':'logical_request','max_calls':2,'editable':False}
def service(n):return {'native_validation':True,'content_review_enabled':n>0,'content_repair_limit':n}
def snap(n):return {'configuration_revision':'fixture-revision-5','effective_plan':{'code':'pro' if n else 'basic','origin':'base'},'content_service':service(n),'native_correction_policy':policy}
def chunks(text):
 out=[];cur=0
 while cur<len(text):
  end=min(cur+(12 if not out else 31),len(text));space=text.rfind(' ',cur+1,end)
  if space>cur and end<len(text):end=space+1
  out.append(text[cur:end]);cur=end
 return out

def plan(lang,entries):
 scenes={'zh':'邻居在社区花园一起播种，并向新来的志愿者示范。','en':'Neighbours plant seeds in a community garden and show a new volunteer how to help.','ja':'近所の人が共同菜園で種をまき、新しいボランティアに作業を教える。'}
 senses={'zh':['本篇指居民共同照料的花圃','本篇指学会播种方法','本篇指一起分担园艺工作'],'en':['the community planting space in this scene','to acquire the skill of sowing seeds here','to divide the gardening work here'],'ja':['この場面で住民が手入れする花壇','ここでは種まきの方法を覚えること','ここでは庭仕事を分担すること']}
 phrases=['a community garden','learn to sow seeds','share the work'];allentries=['garden','learn','share'];roles={'zh':'与邻居合作照料花圃。','en':'Part of the neighbours working together on the planting task.','ja':'近所の人と一緒に菜園の作業を行う。'}
 return {'scene':scenes[lang],'participants':[{'id':'Zoe','role':'a new volunteer'},{'id':'neighbours','role':'garden volunteers'}],'fixed_facts':['The neighbours work in a shared garden.'],'beats':['The volunteers prepare the soil.','They show Zoe how to plant seeds.','They divide the remaining work.'],'word_uses':[{'entry':e,'form':e,'meaning':senses[lang][allentries.index(e)],'phrase':phrases[allentries.index(e)],'role':roles[lang]} for e in entries]}
versions={'planning':'m003-plan-v1','generation':'m003-draft-v3','fixed_edit':'m003-fixed-edit-v1','content_review':'m003-review-v2','content_repair':'m003-rewrite-v3','technical_repair':'m003-native-v1'}
files=[]
class F:
 def __init__(self,name,n,lang='zh',preview=False,entries=None):
  self.name=name;self.n=n;self.lang=lang;self.preview=preview;self.entries=entries or ['garden','learn','share'];self.prefix='preview.' if preview else 'generation.';self.run='fixture-'+name;self.planid='plan-'+name;self.plan=plan(lang,self.entries);self.text='';self.rev=0;self.wire=[];self.play=[];self.trace=[];self.calls=[];self.valid=[];self.status=[];self.deletions=[];self.writer=None;self.lastkey=None;self.lastver=None;self.mode='enhanced' if n else 'basic';self.draft_count=0;self.native1=None
  if preview:d={'preview_run_id':self.run,'preview_token':'fixture-not-a-real-token','draft_version':'fixture-current-draft','preview_content_mode':self.mode,'content_service':service(n),'native_correction_policy':policy}
  else:d={'run_id':self.run,'generation_token':'fixture-not-a-real-token','snapshot':snap(n)}
  self.add('started',100,contract_version=C,stream_id='stream-'+name,**d)
 def add(self,event,delay=90,**data):self.wire.append({'event':self.prefix+event,'data':{'seq':len(self.wire)+1,**data}});self.play.append({'after_ms':delay})
 def call(self,stage,ver=None,**extra):self.calls.append({'call_no':len(self.calls)+1,'call_stage':stage,'prompt_version':versions[stage],'provider_invoked':True,'content_version':ver,**extra})
 def planning(self,fail=False):
  self.call('planning');self.add('progress',150,phase='planning')
  self.add('plan_item',350,plan_id=self.planid,meaning_language=self.lang,item={'kind':'scene','text':self.plan['scene']})
  for x in self.plan['word_uses'][:1 if fail else len(self.entries)]:self.add('plan_item',180,plan_id=self.planid,meaning_language=self.lang,item={'kind':'word_use','entry':x['entry'],'form':x['form'],'sense':x['meaning'],'phrase':x['phrase']})
  if fail:self.plan_complete=False;return
  self.plan_complete=True;self.writer={'task':{'entries':self.entries,'meaning_language':{'zh':'Chinese','en':'English','ja':'Japanese'}[self.lang],'scenario':'story','minimum_words':50,'target_words':60},'scene_plan':self.plan};self.planhash=digest(self.plan)
 def edit(self,draft,ver,fragment,kind='append',delay=90):
  before=self.text
  if kind in ['switch','restore']:
   at=0
   while at<min(len(before),len(fragment)) and before[at]==fragment[at]:at+=1
   delete=len(before)-at;insert=fragment[at:]
  else:at=len(before);delete=0;insert=fragment
  self.add('edit',delay,draft_id=draft,content_version=ver,base_rev=self.rev,rev=self.rev+1,at=at,delete_count=delete,insert=insert,source='retained' if kind=='restore' else 'provider');self.rev+=1;self.text=before[:at]+insert+before[at+delete:]
  self.trace.append({'wire_seq':len(self.wire),'kind':kind,'safe_input':fragment,'result_text_length':len(self.text)})
  if delete:self.deletions.append({'wire_seq':len(self.wire),'deleted_code_points':delete,'inserted_code_points':len(insert),'source':'retained' if kind=='restore' else 'provider'})
 def body(self,key,ver,stage,valid=True,partial=None):
  self.call(stage,ver,**({'input_plan_sha256':self.planhash} if stage=='generation' else {}))
  if stage=='generation':self.add('progress',100,phase='composing')
  self.draft_count+=1;draft='d-'+self.name+'-'+str(self.draft_count);body=packs[key]['passage'];body=body[:partial] if partial else body
  for i,c in enumerate(chunks(body)):self.edit(draft,ver,c,'switch' if i==0 else 'append',500 if i==0 else 85)
  if stage=='generation':self.native1={'valid':valid and partial is None,'technical_calls_before_fixed_edit':0,'editor_eligible':partial is None,'diagnostic_codes':[] if valid else ['missing_target_metadata']}
  if valid and partial is None:self.mark(key,ver)
 def mark(self,key,ver):self.lastkey=key;self.lastver=ver;self.valid.append({'after_seq':len(self.wire),'version':ver,'package':key})
 def review(self,ver,result='pass'):self.call('content_review',ver,review_result=result,repair_requested=result=='issues')
 def restore(self):self.draft_count+=1;self.edit('d-'+self.name+'-retained',self.lastver,packs[self.lastkey]['passage'],'restore',600)
 def usage(self):return {'logical_runs':1,'provider_calls':len(self.calls),'input_tokens':None,'output_tokens':None,'cost':None,'unknown_calls':len(self.calls),'invocation_unknown_calls':0,'not_invoked_calls':0}
 def final(self,out):
  self.add('progress',650,phase='finalizing');d={'final_content_version':self.lastver,'result':packs[self.lastkey],'content_outcome':out,'completion_notice':'content_review_incomplete' if out=='service_incomplete' else None}
  if self.preview:d.update(preview_run_id=self.run,draft_version='fixture-current-draft',preview_content_mode=self.mode,usage=self.usage())
  else:d['run_id']=self.run
  self.add('validated',120,**d)
 def failure(self,code='schema_error'):
  d={'code':code,'retryable':True,'request_id':'fixture-failure'}
  if not self.preview:d['quota_refunded']=True
  self.add('failed',350,**d)
 def status_response(self,state,out=None):
  valid=state=='valid';d={'contract_version':C,'status':state,'final_content_version':self.lastver if valid else None,'result':packs[self.lastkey] if valid else None,'content_outcome':out if valid else (None if state=='active' else state),'completion_notice':'content_review_incomplete' if out=='service_incomplete' else None}
  if self.preview:d.update(preview_run_id=self.run,draft_version='fixture-current-draft',preview_content_mode=self.mode,usage=self.usage())
  else:d.update(run_id=self.run,snapshot=snap(self.n),can_save=valid,quota_refunded=state=='failed')
  self.status.append({'after_ms':350,'http_status':200,'body':{'data':d,'meta':{'request_id':'fixture-status'}}})
 def save(self,out=None,state=None,transport='eof_after_terminal',stop=None,notes=None):
  state=state or ('preview_complete_needs_current_draft_check' if self.preview else 'complete');completed=state in ['complete','preview_complete_needs_current_draft_check'];k=sum(c['call_stage']=='content_repair' for c in self.calls)
  write(self.name+'.json',{'fixture_version':V,'contract_version':C,'request':{'entries':self.entries,'meaning_language':self.lang},'wire':self.wire,'playback':self.play,'transport_end':transport,'status_responses':self.status,'expected':{'ui_state':state,'final_package':self.lastkey if completed else None,'final_content_version':self.lastver if completed else None,'completion_notice':'content_review_incomplete' if out=='service_incomplete' else None,'can_save':state=='complete','deletion_frames':self.deletions,'resources_before_terminal':False,'plan_hidden_on_first_edit':True},'internal_evidence':{'N':self.n,'actual_content_repairs':k,'planning_complete':self.plan_complete,'validated_plan':self.plan if self.plan_complete else None,'plan_sha256':getattr(self,'planhash',None),'writer_input':self.writer,'calls':self.calls,'initial_native_check':self.native1,'valid_packages':self.valid,'content_stop_reason':stop,'source_trace':self.trace,'notes':notes or [],'scope':'Synthetic provider fragments/plan objects only; not live tokens, latency, quality or application execution.'}});files.append(self.name+'.json')

f=F('basic',0);f.planning();f.body('v1-zh',1,'generation');f.final('basic');f.save('basic')
f=F('enhanced-edited-pass',1,'en');f.planning();f.body('v1-en',1,'generation');f.body('v2-en',2,'fixed_edit');f.review(2);f.final('review_passed');f.save('review_passed')
f=F('rewrite-once',1);f.planning();f.body('v1-zh',1,'generation');f.body('v2-zh',2,'fixed_edit');f.review(2,'issues');f.body('v3-zh',3,'content_repair');f.review(3);f.final('repaired_passed');f.save('repaired_passed')
f=F('rewrite-twice',2);f.planning();f.body('v1-zh',1,'generation');f.body('v2-zh',2,'fixed_edit');f.review(2,'issues');f.body('v3-zh',3,'content_repair');f.review(3,'issues');f.body('v4-zh',4,'content_repair');f.review(4);f.final('repaired_passed');f.save('repaired_passed')
f=F('rewrite-recovery',1);f.planning();f.body('v1-zh',1,'generation');f.body('v2-zh',2,'fixed_edit');f.review(2,'issues');f.body('v3-zh',3,'content_repair',False,160);f.restore();f.final('service_incomplete');f.status_response('valid','service_incomplete');f.save('service_incomplete',stop='content_transport_error')
f=F('edit-fault-retains-first',1);f.planning();f.body('v1-zh',1,'generation');f.body('v2-zh',2,'fixed_edit',False);f.restore();f.final('service_incomplete');f.status_response('valid','service_incomplete');f.save('service_incomplete',stop='fixed_edit_native_invalid',notes=['Editor completed provider output, but Candidate targets schema is invalid and outside native correction whitelist. V2 never lastValid; restore complete V1 with persistent notice.'])
f=F('invalid-first-edit-fails',1);f.planning();f.body('v1-zh',1,'generation',False);f.body('v2-zh',2,'fixed_edit',False,160);f.failure('provider_unavailable');f.status_response('failed');f.save(state='failed',notes=['First complete safe Candidate lacks target metadata; eligible for fixed editor but never lastValid. Editor transport failure cannot deliver partial.'])
f=F('invalid-first-edit-rescues',1,'ja');f.planning();f.body('v1-ja',1,'generation',False);f.body('v2-ja',2,'fixed_edit');f.review(2);f.final('review_passed');f.save('review_passed',notes=['No technical repair before unconditional editor; schema/native-invalid complete draft rescued.'])
f=F('planning-fails',0);f.planning(True);f.failure('schema_error');f.status_response('failed');f.save(state='failed',notes=['Safe completed preview items existed; complete plan missing selected entries, no writer/skip/retry.'])
f=F('pending-status',0);f.planning();f.body('v1-zh',1,'generation');f.add('progress',150,phase='finalizing');f.add('settlement_pending',150,code='settlement_unconfirmed',request_id='fixture-pending');f.status_response('active');f.status_response('valid','basic');f.save('basic',transport='eof_after_pending')
f=F('eof-unknown',1);f.planning();f.body('v1-zh',1,'generation',False,164);f.status_response('active');f.save(state='pending',transport='unexpected_eof')
f=F('cancelled',0);f.planning();f.body('v1-zh',1,'generation',False,145);f.add('cancelled',300,quota_refunded=False);f.status_response('cancelled');f.save(state='cancelled')
f=F('native-continuation',0);f.planning();base,tail=packs['native-zh']['passage'].split('\n\n');f.call('generation',1,input_plan_sha256=f.planhash);f.add('progress',100,phase='composing')
for i,c in enumerate(chunks(base)):f.edit('native-initial',1,c,'switch' if i==0 else 'append')
f.call('technical_repair',1)
for i,c in enumerate(chunks(tail)):f.edit('native-continuation',1,('\n\n' if i==0 else '')+c,'continuation' if i==0 else 'append',500 if i==0 else 85)
f.call('technical_repair',1);f.mark('native-zh',1);f.final('basic');f.save('basic',notes=['One real continuation plus one annotation-only correction; correction keeps clean body unchanged and does not rebroadcast it.'])
f=F('preview-basic',0,'ja',True,['garden','learn']);f.planning();f.body('basic-two-ja',1,'generation');f.final('basic');f.status_response('valid','basic');f.save('basic')
f=F('preview-enhanced',1,'en',True);f.planning();f.body('v1-en',1,'generation');f.body('v2-en',2,'fixed_edit');f.review(2);f.final('review_passed');f.status_response('valid','review_passed');f.save('review_passed')
write('index.json',{'fixture_version':V,'contract_version':C,'files':files,'packages':'packages.json','wire_shape':'wire[] = {event,data}; data exact SSE JSON without envelope','edit_unit':'Unicode code point; not UTF-16 string.length','playback':'after_ms synthetic scheduling only, no latency claim','display_allowlist':['plan_item.item provisional scene/sense/phrase','reduced draft text','progress.phase','validated.result','completion_notice','failed.code','quota_refunded'],'not_for_display':['internal_evidence','expected','calls','content_version','draft_id','plan_id','seq','rev','N'],'prototype_contract':'Auto-consume wire; first edit hides all temporary plan cards; no reconstructed typing from final package; preview completion requires separate current draft/mode/run check.'})
print('Wrote',len(files),'scenarios',sum(len(json.loads((P/x).read_text())['wire']) for x in files),'wire events')
