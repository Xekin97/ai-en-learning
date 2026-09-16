// Independent QA098 HTTP tests; no developer test imports or production edits.
import {spawn} from 'node:child_process';
import {checks,traces,check,client,candidate,valid,save,review,cleanse,stats,enqueue,setModel} from './helpers.mjs';
import {sql,quote,output,docker,prefix,restart} from './setup.mjs';
const clients=[],tokens=[],observations=[];let owner,other,admin,visitor;
const fresh=async(name,login=false)=>{const c=await client(name,login);clients.push(c);return c;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const consume=(c,t)=>c.api('POST','/api/v1/visitor-claims/consume',{}, {'x-claim-token':t});
const action=(c,r,op)=>c.api('POST',`/api/v1/generations/${r.started.run_id}/${op}`,{}, {'x-generation-token':r.started.generation_token});
const del=(c,b,extra={})=>c.api('DELETE',`/api/v1/me/batches/${b}`,{},extra);
const detail=(c,b)=>c.api('GET',`/api/v1/me/batches/${b}`);
const summary=async c=>(await c.api('GET','/api/v1/me/learning-summary')).body.data;
const state=r=>JSON.parse(sql(`SELECT json_build_object('meter',json_build_object('status',call_status,'disposition',disposition,'charged',quota_charged,'counted',counts_toward_cumulative,'credited',credited_account_id),'claims',(SELECT count(*) FROM wordweave.visitor_claims WHERE run_id=r.id),'batches',(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=r.id),'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id)) FROM wordweave.generation_runs r WHERE id=${quote(r.started.run_id)};`));
const related=b=>Object.fromEntries(['batch_targets','passage_occurrences','hint_occurrences','review_session_batches','review_session_targets','review_results'].map(t=>[t,Number(sql(`SELECT count(*) FROM wordweave.${t} WHERE batch_id=${quote(b)};`))]));
const poll=async(fn,label)=>{for(let i=0;i<60;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,80));}throw Error('Timed out '+label);};
const activity=()=>JSON.parse(sql("SELECT coalesce(json_agg(json_build_object('pid',pid,'wait',wait_event,'query',left(query,600))),'[]') FROM pg_stat_activity WHERE datname='qa098' AND usename='wordweave_app' AND wait_event_type='Lock';"));
async function hold(statement){
 const child=spawn('docker',['exec','-i','-e','PGAPPNAME=qa098_hold',prefix+'-db','psql','-U','postgres','-d','qa098','-XAt','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let error='';child.stderr.on('data',x=>error+=x);child.stdout.on('data',()=>{});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',c=>c===0?resolve():reject(Error('Barrier '+error)));});
 child.stdin.write('BEGIN;\n'+statement+';\n');
 try{await poll(()=>sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='qa098_hold' AND state='idle in transaction';")==='1','barrier acquired');}catch(e){child.stdin.end('ROLLBACK;\n');await done;throw e;}
 return async()=>{child.stdin.end('COMMIT;\n');await done;};
}
async function make(c,id){
 const x=candidate(['vulnerable'],['vulnerability']);x.passage='Vulnerability and vulnerable communities face vulnerabilities.'+x.passage;
 x.targets[0].hint_phrase='vulnerability in vulnerable communities with vulnerabilities';x.targets[0].hint_forms=['vulnerability'];
 const r=await valid(c,id,x);if(!r.result)throw Error('Fixture failed '+id);tokens.push(r.started.generation_token);return r;
}
async function claimed(id,c=owner){
 const r=await make(visitor,id),cl=await action(visitor,r,'visitor-claim');if(cl.status!==200)throw Error('Claim setup '+cl.status);
 const token=cl.body.data.claim_token;tokens.push(token);
 const ttl=Number(sql(`SELECT extract(epoch FROM expires_at-created_at) FROM wordweave.visitor_claims WHERE run_id=${quote(r.started.run_id)};`));
 check(id+'/active-ttl',ttl>1790&&ttl<=1801,{seconds:ttl});
 const calls=(await stats()).calls.length,before=await summary(c),a=await consume(c,token),b=await consume(c,token),batch=a.body.data?.batch_id;
 check(id+'/consume-idempotent',a.status===200&&b.status===200&&!!batch&&batch===b.body.data?.batch_id,{statuses:[a.status,b.status],batch});
 check(id+'/one-credit-no-call',(await summary(c)).generation_count===before.generation_count+1&&(await stats()).calls.length===calls,{before:before.generation_count,after:(await summary(c)).generation_count,calls});
 if(!batch)throw Error('No batch '+id);return {r,token,batch};
}
async function absent(x,id){
 const read=await detail(owner,x.batch),retry=await consume(owner,x.token),rebind=await consume(other,x.token),create=await owner.api('POST','/api/v1/me/review-sessions',{mode:'single_batch',batch_id:x.batch});
 const found=await owner.api('GET','/api/v1/me/batches?entry=vulnerable'),s=state(x.r);
 check(id+'/inaccessible',read.status===404&&retry.status===404&&rebind.status===404&&create.status===404&&!found.body.data?.items?.some(b=>b.id===x.batch),{read:read.status,retry:retry.status,rebind:rebind.status,create:create.status,search:found.status});
 check(id+'/no-resurrection',s.claims===0&&s.batches===0&&s.drafts===0&&Object.values(related(x.batch)).every(n=>n===0),{state:s,related:related(x.batch)});
}
try{
 admin=await fresh('qa098_admin',true);owner=await fresh('qa098_owner4');other=await fresh('qa098_other4');visitor=await fresh();
 let a=await admin.api('PUT','/api/v1/admin/openrouter-credential',{api_key:'qa098-synthetic-never-real',confirmed:true});if(a.status!==200)throw Error('Synthetic credential setup');
 const existing=sql("SELECT id FROM wordweave.ai_models WHERE provider_model_id='qa/synthetic';");
 if(existing)a={body:{data:{model:{id:existing}}}};
 else a=await admin.api('POST','/api/v1/admin/models',{display_name:'QA098 synthetic',description:'Disposable claimed batch deletion fixture',openrouter_model_id:'qa/synthetic'});
 const model=a.body.data?.model?.id;if(!model)throw Error('Model setup');setModel(model);
 const probe=candidate(['learn','vulnerable'],['learned','vulnerability']);probe.targets[0].hint_phrase='learning through learning after we learned';probe.targets[0].hint_forms=['learning','learned'];
 await enqueue({id:'enable-current-v3-probe',candidate:probe});a=await admin.api('POST',`/api/v1/admin/models/${model}/enable`,{});if(a.status!==200)throw Error('Enable setup '+JSON.stringify(a));
 for(const group of ['basic','visitor']){a=await admin.api('PUT','/api/v1/admin/groups/'+group,{rolling_24h_limit:100,max_entries:5,allowed_lengths:['short'],model_ids:[model]});if(a.status!==200)throw Error('Group setup');}
 console.log('Synthetic configuration ready; beginning natural HTTP deletion chain.');
 const main=await claimed('D01/natural'),control=await claimed('D01/unaffected-control'),before=state(main.r),controlBefore=state(control.r);
 const sid=await review(owner,main.batch,main.r.result,'D01/review-before-delete');
 const today=new Date().toISOString().slice(0,10),range=await owner.api('POST','/api/v1/me/review-sessions',{mode:'range',start_date:today,end_date:today,timezone:'UTC'}),rid=range.body.data?.session_id;
 check('D03/range-setup',range.status===201&&!!rid&&sql(`SELECT count(*) FROM wordweave.review_session_batches WHERE session_id=${quote(rid)};`)==='2',{status:range.status,rid});
 const childBefore=related(main.batch);check('D01/related-data-present',Object.values(childBefore).every(n=>n>0),childBefore);
 for(const [id,c,headers,expected] of [['visitor',visitor,{},401],['admin',admin,{},403],['wrong-owner',other,{},404],['missing-csrf',owner,{'x-csrf-token':''},403],['bad-csrf',owner,{'x-csrf-token':'invalid'},403],['foreign-origin',owner,{origin:'https://foreign.invalid'},403]]){
  a=await del(c,main.batch,headers);check('D02/'+id,a.status===expected,{status:a.status,expected,body:a.body});
  check('D02/'+id+'-no-mutation',same(state(main.r),before)&&same(related(main.batch),childBefore),state(main.r));
 }
 const sumBefore=await summary(owner),calls=(await stats()).calls.length,t=performance.now();a=await del(owner,main.batch);
 check('D01/delete-204-empty',a.status===204&&a.bytes===0,{status:a.status,bytes:a.bytes,elapsed_ms:Math.round(performance.now()-t),request_id:a.headers['x-request-id']});
 if(a.status!==204)throw Error('Natural deletion failed; dependent checks not valid');
 await absent(main,'D01');check('D01/meter-unchanged',same(state(main.r).meter,before.meter)&&(await summary(owner)).generation_count===sumBefore.generation_count&&(await stats()).calls.length===calls,{before:sumBefore,after:await summary(owner),meter:state(main.r).meter,calls});
 check('D01/unrelated-claim-unchanged',same(state(control.r),controlBefore)&&(await consume(owner,control.token)).body.data?.batch_id===control.batch,state(control.r));
 check('D03/single-session-deleted',(await owner.api('GET',`/api/v1/me/review-sessions/${sid}`)).status===404,{});
 check('D03/nonempty-range-retained',(await owner.api('GET',`/api/v1/me/review-sessions/${rid}`)).status===200&&sql(`SELECT count(*) FROM wordweave.review_session_batches WHERE session_id=${quote(rid)};`)==='1',{});
 check('D02/delete-retry-404',(await del(owner,main.batch)).status===404,{});
 await restart();await absent(main,'D01/after-restart');check('D01/control-survives-restart',(await consume(owner,control.token)).body.data?.batch_id===control.batch,{});
 check('D03/delete-last-range-batch',(await del(owner,control.batch)).status===204,{});
 check('D03/empty-range-deleted',(await owner.api('GET',`/api/v1/me/review-sessions/${rid}`)).status===404&&sql(`SELECT count(*) FROM wordweave.review_sessions WHERE id=${quote(rid)};`)==='0',{});
 const ordinary=await make(owner,'D03/ordinary'),ordinaryBatch=await save(owner,ordinary),ordinaryBefore=state(ordinary);
 a=await del(owner,ordinaryBatch);check('D03/ordinary-delete',a.status===204&&a.bytes===0&&same(state(ordinary).meter,ordinaryBefore.meter),{status:a.status,state:state(ordinary)});
 await restart();check('D03/ordinary-cannot-resave',(await action(owner,ordinary,'save')).status===404&&state(ordinary).batches===0,{});
 console.log('Natural deletion/permissions completed; checking atomic rollback and races.');
 const roll=await claimed('D04/rollback'),rollBefore=state(roll.r),rollChildren=related(roll.batch),release=await hold(`SELECT id FROM wordweave.learning_batches WHERE id=${quote(roll.batch)} FOR UPDATE`);let deletion;
 try{
  deletion=del(owner,roll.batch);const wait=await poll(()=>activity().find(x=>x.query.includes('DELETE FROM wordweave.learning_batches')),'delete blocked after claim mutation');
  observations.push({id:'D04/transaction-cancel',wait,visible_before_cancel:state(roll.r)});
  const cancelled=sql(`SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE pid=${Number(wait.pid)} AND datname='qa098' AND usename='wordweave_app' AND query LIKE '%DELETE FROM wordweave.learning_batches%';`);
  a=await deletion;check('D04/injected-error-observed',cancelled==='t'&&a.status===500,{cancelled,status:a.status,expected_fault:'Explicit cancellation of this test HTTP delete SQL in disposable QA098 database'});
 }finally{await release();}
 check('D04/full-rollback',same(state(roll.r),rollBefore)&&same(related(roll.batch),rollChildren)&&(await detail(owner,roll.batch)).status===200&&(await consume(owner,roll.token)).body.data?.batch_id===roll.batch,{before:rollBefore,after:state(roll.r)});
 check('D04/retry-delete-succeeds',(await del(owner,roll.batch)).status===204,{});await absent(roll,'D04');
 for(const order of ['delete-first','claim-first']){
  const x=await claimed('D05/'+order),meter=state(x.r).meter,unlock=await hold(order==='delete-first'?`SELECT id FROM wordweave.learning_batches WHERE id=${quote(x.batch)} FOR UPDATE`:`SELECT id FROM wordweave.visitor_claims WHERE run_id=${quote(x.r.started.run_id)} FOR UPDATE`);let d,c;
  try{
   if(order==='delete-first'){d=del(owner,x.batch);await poll(()=>activity().some(q=>q.query.includes('DELETE FROM wordweave.learning_batches')),'delete reaches batch');c=consume(owner,x.token);await poll(()=>activity().some(q=>q.query.includes('WHERE token_hash=$1 FOR UPDATE')),'retry waits for claim');}
   else{c=consume(owner,x.token);await poll(()=>activity().some(q=>q.query.includes('WHERE token_hash=$1 FOR UPDATE')),'retry first');d=del(owner,x.batch);await poll(()=>activity().length>=2,'delete queued behind retry');}
   observations.push({id:'D05/'+order,waiting:activity()});
  }finally{await unlock();}
  const responses=await Promise.all([d,c]);check('D05/'+order+'-linearized',responses[0].status===204&&responses[1].status===(order==='delete-first'?404:200)&&(responses[1].status!==200||responses[1].body.data?.batch_id===x.batch),{statuses:responses.map(x=>x.status)});
  await absent(x,'D05/'+order);check('D05/'+order+'-meter',same(state(x.r).meter,meter),state(x.r));
 }
 for(let i=0;i<8;i++){
  const x=await claimed('D05/natural-race-'+i),before=state(x.r).meter,calls=(await stats()).calls.length;
  const result=await Promise.all([consume(owner,x.token),del(owner,x.batch),del(owner,x.batch)]);
  check('D05/natural-race-'+i,[200,404].includes(result[0].status)&&same(result.slice(1).map(x=>x.status).sort(),[204,404])&&(result[0].status!==200||result[0].body.data?.batch_id===x.batch),{statuses:result.map(x=>x.status)});
  await absent(x,'D05/race-'+i);check('D05/race-'+i+'-meter',same(state(x.r).meter,before)&&(await stats()).calls.length===calls,state(x.r));
 }
 console.log('Rollback and races completed; checking retention and startup cleanup.');
 const retained=await claimed('D06/retained'),expired=await claimed('D06/expired');
 sql(`UPDATE wordweave.visitor_claims SET created_at=clock_timestamp()-interval '24 hours 20 minutes',expires_at=clock_timestamp()-interval '23 hours 50 minutes',consumed_at=clock_timestamp()-interval '23 hours 59 minutes' WHERE run_id=${quote(retained.r.started.run_id)}; UPDATE wordweave.visitor_claims SET created_at=clock_timestamp()-interval '25 hours 20 minutes',expires_at=clock_timestamp()-interval '24 hours 50 minutes',consumed_at=clock_timestamp()-interval '25 hours' WHERE run_id=${quote(expired.r.started.run_id)};`);
 check('D06/time-fixtures-consistent',sql(`SELECT bool_and(created_at<consumed_at AND consumed_at<expires_at) FROM wordweave.visitor_claims WHERE run_id IN (${quote(retained.r.started.run_id)},${quote(expired.r.started.run_id)});`)==='t',{});
 const retainedMeter=state(retained.r).meter,expiredMeter=state(expired.r).meter;
 const unlock=await hold(`SELECT id FROM wordweave.visitor_claims WHERE run_id=${quote(expired.r.started.run_id)} FOR UPDATE`);
 try{observations.push({id:'D06/cleanup-locked',restart:await restart()});check('D06/cleanup-skips-lock',state(expired.r).claims===1,state(expired.r));}finally{await unlock();}
 check('D06/under24h-retry',(await consume(owner,retained.token)).body.data?.batch_id===retained.batch&&state(retained.r).claims===1,state(retained.r));
 await restart();await poll(()=>state(expired.r).claims===0,'expired claim cleaned');
 check('D06/expired-cleaned-batch-retained',(await consume(owner,expired.token)).status===404&&(await detail(owner,expired.batch)).status===200&&state(expired.r).batches===1&&same(state(expired.r).meter,expiredMeter),state(expired.r));
 check('D06/under24h-still-retained',state(retained.r).claims===1&&same(state(retained.r).meter,retainedMeter)&&(await detail(owner,retained.batch)).status===200,state(retained.r));
 check('D06/expired-batch-owner-delete',(await del(owner,expired.batch)).status===204,{});
 check('D06/explicit-delete-exception',(await del(owner,retained.batch)).status===204,{});await absent(retained,'D06/explicit-delete');
 const active=await make(visitor,'D06/active-ttl-control'),activeClaim=await action(visitor,active,'visitor-claim');tokens.push(activeClaim.body.data.claim_token);
 await restart();check('D06/active-retained',state(active).claims===1&&state(active).drafts===1,state(active));
 sql(`UPDATE wordweave.visitor_claims SET created_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE run_id=${quote(active.started.run_id)};`);
 await restart();await poll(()=>state(active).claims===0,'active claim expired cleanup');check('D06/active-expiry-unchanged',(await consume(owner,activeClaim.body.data.claim_token)).status===404&&state(active).batches===0,state(active));
 await action(visitor,active,'discard');await absent(main,'D06/final-restart-no-resurrection');
 const logs=docker(['logs',prefix+'-backend']);check('D07/no-secret-log',!tokens.some(t=>t&&logs.includes(t))&&!logs.includes('qa098-synthetic-never-real'),{checked_tokens:tokens.length});
 check('D07/no-active-generation',sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';")==='0',{});
 const provider=await stats();output('provider-observations.json',provider);check('D07/no-fixtures-left',provider.queued===0,{calls:provider.calls.length,queued:provider.queued});
 check('D07/no-unexpected-error-log',!logs.split('\n').some(l=>l.includes('"level":"ERROR"')&&!l.includes('canceling statement due to user request')),{error_lines:logs.split('\n').filter(l=>l.includes('"level":"ERROR"')).length});
}catch(e){checks.push({id:'QA098/harness-completion',status:'ERROR',error:String(e),stack:e.stack});process.exitCode=1;}
finally{
 for(const c of clients)await c.r.dispose();
 const counts=checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0});
 output('api-results.json',{date:new Date().toISOString(),agent:'qa-quinn',counts,checks,traces,observations,real_model_calls:0,expected_injected_http_500:1,scope:'Independent HTTP candidate097; same-version restart; synthetic DB row locks and timestamp fixtures only'});
 console.log(JSON.stringify({counts,failures:checks.filter(x=>x.status!=='PASS')}));if(counts.FAIL)process.exitCode=1;
}
