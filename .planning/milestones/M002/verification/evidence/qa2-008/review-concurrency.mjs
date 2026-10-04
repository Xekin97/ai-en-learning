import {readFileSync} from 'node:fs';
import {expect,start,stop,ok,call,sql,origin,out,dump,env} from './harness.mjs';
const fixture=JSON.parse(readFileSync(new URL('fixture.json',out))),browser=await start(),user=await browser.newContext(),results=[],samples=[];
const username=sql("SELECT username FROM wordweave.accounts WHERE id='"+fixture.userId+"'");
let range,active,oldAttempt;
async function test(id,name,fn){try{await fn();results.push({id,name,result:'PASS'});}catch(e){results.push({id,name,result:'FAIL',error:String(e)});}dump('review-results.json',{results,samples,realProviderCalls:0,localProviderCalls:0});console.log(id,results.at(-1).result);}
async function prepare(session){const a=(await ok(user,'/me/review-sessions/'+session.session_id+'/attempts','POST',{})).attempt;const b=(await ok(user,'/me/batches/'+a.batch_id)).batch;const occurrences=b.targets.flatMap(t=>t.occurrences).sort((a,b)=>a.start-b.start),blanks=a.passage.segments.filter(s=>s.kind==='blank');expect(a.words.length).toBe(1);expect(blanks.length).toBe(occurrences.length);return{a,body:{expected_revision:a.revision,words:a.words.map(w=>({question_id:w.question_id,answer:b.targets[0].entry})),passage:blanks.map((v,i)=>({blank_id:v.blank_id,answer:occurrences[i].surface}))}};}
async function headers(token){return{origin,'sec-fetch-site':'same-origin','x-csrf-token':(await ok(user,'/bootstrap')).csrf_token,...(token?{'X-Review-Attempt-Token':token}:{})};}
async function post(path,data,head){const r=await user.request.post(origin+'/api/v1'+path,{data,headers:head});return{status:r.status(),body:await r.json()};}
try{
 await ok(user,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 const day=sql('SELECT CURRENT_DATE::text');range={start_date:day,end_date:day,timezone:'UTC'};
 await test('B01','Participation updates future date preview but not an already-created range snapshot',async()=>{
  const before=await ok(user,'/me/review-range/preview?'+new URLSearchParams(range));expect(before).toEqual({batch_count:23,entry_count:23,empty:false});
  active=(await ok(user,'/me/review-sessions','POST',{mode:'range',...range})).session;expect(active.progress.total_batches).toBe(23);
  await ok(user,'/me/batches/'+fixture.ids[21],'PATCH',{participates_in_range_review:false});const after=await ok(user,'/me/review-range/preview?'+new URLSearchParams(range));expect(after.batch_count).toBe(22);expect((await ok(user,'/me/review-sessions/'+active.session_id)).session.progress.total_batches).toBe(23);
  const single=(await ok(user,'/me/review-sessions','POST',{mode:'single_batch',batch_id:fixture.ids[21]})).session;expect(single.progress.total_batches).toBe(1);expect(single.current_batch.batch_id).toBe(fixture.ids[21]);
  await ok(user,'/me/batches/'+fixture.ids[21],'PATCH',{participates_in_range_review:true});samples.push({id:'B01',before,after,fixedSessionTotal:23,singleBatchAllowed:true});
 });
 await test('B02','Two simultaneous submissions settle once and retries/readback never expose the comparison',async()=>{
  const single=(await ok(user,'/me/review-sessions','POST',{mode:'single_batch',batch_id:fixture.ids[21]})).session,{a,body}=await prepare(single),before=await ok(user,'/me/learning-summary'),growthBefore=await ok(user,'/me/growth'),head=await headers(a.attempt_token);
  const replies=await Promise.all([post('/me/review-attempts/'+a.attempt_id+'/submit',body,head),post('/me/review-attempts/'+a.attempt_id+'/submit',body,head)]);
  expect(replies.map(r=>r.status)).toEqual([200,200]);expect(replies.map(r=>r.body.data.outcome).sort()).toEqual(['already_submitted','submitted']);
  const fresh=replies.find(r=>r.body.data.outcome==='submitted').body.data,retry=replies.find(r=>r.body.data.outcome==='already_submitted').body.data;expect(fresh.receipt.successful).toBe(true);expect(retry.comparison).toBeUndefined();expect(retry.growth).toBeUndefined();expect(retry.receipt).toEqual(fresh.receipt);
  const after=await ok(user,'/me/learning-summary'),growthAfter=await ok(user,'/me/growth');expect(after.successful_review_count).toBe(before.successful_review_count+1);expect(growthAfter.mastered_total).toBe(growthBefore.mastered_total+1);expect(fresh.session.progress).toEqual({completed_batches:1,total_batches:1,successful_batches:1,unsuccessful_batches:0,skipped_batches:0});
  const read=await ok(user,'/me/review-attempts/'+a.attempt_id);expect(read.state).toBe('submitted');expect(read.comparison).toBeUndefined();expect(read.attempt).toBeUndefined();
  const again=await post('/me/review-attempts/'+a.attempt_id+'/submit',body,head);expect(again.status).toBe(200);expect(again.body.data.outcome).toBe('already_submitted');expect(again.body.data.comparison).toBeUndefined();expect((await ok(user,'/me/learning-summary')).successful_review_count).toBe(after.successful_review_count);
  samples.push({id:'B02',attempt:a.attempt_id,outcomes:replies.map(r=>r.body.data.outcome),receipt:fresh.receipt,summaryBefore:before,summaryAfter:after,masteredBefore:growthBefore.mastered_total,masteredAfter:growthAfter.mastered_total,repeatWithoutComparison:true});
 });
 await test('B03','Two simultaneous replacements yield one new range and reject the stale replacement',async()=>{
  active=(await ok(user,'/me/review-sessions/active-range')).session;oldAttempt=(await prepare(active)).a;const version=(await ok(user,'/me/review-sessions/'+active.session_id)).session_revision,body={confirmed:true,expected_session_revision:version,range},head=await headers();
  const replies=await Promise.all([post('/me/review-sessions/'+active.session_id+'/replace',body,head),post('/me/review-sessions/'+active.session_id+'/replace',body,head)]);expect(replies.map(r=>r.status).sort()).toEqual([201,409]);const conflict=replies.find(r=>r.status===409);expect(conflict.body.code).toBe('session_replaced');
  const created=replies.find(r=>r.status===201).body.data.session;expect((await ok(user,'/me/review-sessions/'+active.session_id)).session.status).toBe('abandoned');expect((await ok(user,'/me/review-sessions/active-range')).session.session_id).toBe(created.session_id);
  samples.push({id:'B03',oldSession:active.session_id,newSession:created.session_id,statuses:replies.map(r=>r.status),conflict:conflict.body.code});active=created;
 });
 await test('B04','A real submit-versus-replace race has one winner and no duplicate completion',async()=>{
  const {a,body}=await prepare(active),version=(await ok(user,'/me/review-sessions/'+active.session_id)).session_revision,head=await headers(a.attempt_token),before=await ok(user,'/me/learning-summary');
  const [submitted,replaced]=await Promise.all([post('/me/review-attempts/'+a.attempt_id+'/submit',body,head),post('/me/review-sessions/'+active.session_id+'/replace',{confirmed:true,expected_session_revision:version,range},head)]);
  const after=await ok(user,'/me/learning-summary');
  if(submitted.status===200){expect(replaced.status).toBe(409);expect(replaced.body.code).toBe('revision_conflict');expect(after.successful_review_count).toBe(before.successful_review_count+1);expect((await ok(user,'/me/review-sessions/active-range')).session.session_id).toBe(active.session_id);}
  else{expect(submitted.status).toBe(409);expect(submitted.body.code).toBe('session_replaced');expect(replaced.status).toBe(201);expect(after.successful_review_count).toBe(before.successful_review_count);active=replaced.body.data.session;}
  samples.push({id:'B04',attempt:a.attempt_id,submitStatus:submitted.status,submitCode:submitted.body.code??submitted.body.data.outcome,replaceStatus:replaced.status,replaceCode:replaced.body.code??'created',successfulBefore:before.successful_review_count,successfulAfter:after.successful_review_count});
 });
 await test('B05','Replacement-first rejects old start/submit/restart and preserves minimal readback',async()=>{
  active=(await ok(user,'/me/review-sessions/active-range')).session;const {a,body}=await prepare(active),version=(await ok(user,'/me/review-sessions/'+active.session_id)).session_revision;
  const replaced=await ok(user,'/me/review-sessions/'+active.session_id+'/replace','POST',{confirmed:true,expected_session_revision:version,range});const before=await ok(user,'/me/learning-summary');
  const start=await call(user,'/me/review-sessions/'+active.session_id+'/attempts','POST',{}),submit=await post('/me/review-attempts/'+a.attempt_id+'/submit',body,await headers(a.attempt_token)),restart=await call(user,'/me/review-attempts/'+a.attempt_id+'/restart','POST',{expected_revision:a.revision});
  for(const reply of [start,submit,restart]){expect(reply.status).toBe(409);expect(reply.body.code).toBe('session_replaced');}
  const read=await ok(user,'/me/review-attempts/'+a.attempt_id);expect(read.state).toBe('restarted');expect(read.comparison).toBeUndefined();expect(read.attempt).toBeUndefined();expect(await ok(user,'/me/learning-summary')).toEqual(before);
  samples.push({id:'B05',oldSession:active.session_id,newSession:replaced.session.session_id,rejections:[start,submit,restart].map(r=>({status:r.status,code:r.body.code})),readState:read.state});
 });
}finally{dump('review-results.json',{results,samples,localProviderCalls:0,realProviderCalls:0});await stop(browser);}
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
