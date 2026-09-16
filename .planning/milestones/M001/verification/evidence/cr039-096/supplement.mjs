import {checks,traces,check,client,candidate,valid,stats,enqueue,setModel} from './helpers.mjs';
import {sql,quote,output,docker,prefix,restart} from './setup.mjs';
const clients=[],tokens=[];
const fresh=async(name,login=false)=>{const c=await client(name,login);clients.push(c);return c;};
const action=(c,r,op)=>c.api('POST',`/api/v1/generations/${r.started.run_id}/${op}`,{}, {'x-generation-token':r.started.generation_token});
const consume=(c,t)=>c.api('POST','/api/v1/visitor-claims/consume',{}, {'x-claim-token':t});
const make=async(c,id)=>{const r=await valid(c,id,candidate(['vulnerable'],['vulnerability']));if(!r.result)throw Error('Fixture validation');tokens.push(r.started.generation_token);return r;};
const batchCount=r=>Number(sql(`SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=${quote(r.started.run_id)};`));
try{
 const model=sql('SELECT id FROM wordweave.ai_models LIMIT 1;');setModel(model);
 const learner=await fresh('qa096_learner',true),recipient=await fresh('qa096_recipient',true),visitor=await fresh();
 const before=sql('SELECT count(*) FROM wordweave.generation_runs;'),calls=(await stats()).calls.length;
 await enqueue({id:'L07R/provider-failed',httpError:503});
 const failed=await learner.api('POST','/api/v1/generations/stream',{model_id:model,entries:['vulnerable'],meaning_language:'en',scenario:'discussion',length:'short'});
 const row=JSON.parse(sql("SELECT json_build_object('id',id,'status',call_status,'charged',quota_charged,'counted',counts_toward_cumulative,'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id),'batches',(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=r.id)) FROM wordweave.generation_runs r ORDER BY started_at DESC LIMIT 1;"));
 check('L07R/upstream-unavailable-contract',failed.status===503&&failed.body.code==='generation_unavailable',{status:failed.status,code:failed.body.code});
 check('L07R/refunded-no-resource',Number(sql('SELECT count(*) FROM wordweave.generation_runs;'))===Number(before)+1&&row.status==='provider_failed'&&!row.charged&&!row.counted&&row.drafts===0&&row.batches===0&&(await stats()).calls.length===calls+1,row);
 const r=await make(visitor,'L08R/guest-rejection');const denied=await action(visitor,r,'save');check('L08R/authentication-required',denied.status===401&&denied.body.code==='authentication_required'&&batchCount(r)===0,{status:denied.status,code:denied.body.code});
 const c=await action(visitor,r,'visitor-claim'),token=c.body.data?.claim_token;if(!token)throw Error('Claim setup');tokens.push(token);
 sql(`UPDATE wordweave.visitor_claims SET created_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE run_id=${quote(r.started.run_id)};`);
 const expired=await consume(recipient,token);check('L09R/expired-claim',expired.status===410&&batchCount(r)===0,{status:expired.status});
 const abandoned=await make(visitor,'L09R/abandoned'),ac=await action(visitor,abandoned,'visitor-claim');await action(visitor,abandoned,'discard');const no=await consume(recipient,ac.body.data.claim_token);check('L09R/abandoned-claim-unsaveable',no.status===404&&batchCount(abandoned)===0,{status:no.status});
 const parallel=await make(visitor,'L10/parallel'),pc=await action(visitor,parallel,'visitor-claim');const arr=await Promise.all(Array.from({length:6},()=>consume(recipient,pc.body.data.claim_token)));check('L10/six-consumes-one-batch',arr.every(x=>x.status===200)&&new Set(arr.map(x=>x.body.data?.batch_id)).size===1&&batchCount(parallel)===1,{statuses:arr.map(x=>x.status)});
 const different=await make(visitor,'L10/different-recipients'),dc=await action(visitor,different,'visitor-claim');const competition=await Promise.all([consume(recipient,dc.body.data.claim_token),consume(learner,dc.body.data.claim_token)]);check('L10/only-first-recipient',competition.filter(x=>x.status===200).length===1&&competition.filter(x=>x.status===404).length===1&&batchCount(different)===1,{statuses:competition.map(x=>x.status)});
 const deletion=await recipient.api('DELETE',`/api/v1/me/batches/${arr[0].body.data.batch_id}`,{});await restart();const repeat=await consume(recipient,pc.body.data.claim_token);check('L10/deleted-claim-does-not-resurrect',deletion.status===204&&batchCount(parallel)===0,{delete_status:deletion.status,retry_status:repeat.status,batches:batchCount(parallel)});
 const logs=docker(['logs',prefix+'-backend']);check('L11/log-redaction',!tokens.some(t=>logs.includes(t))&&!logs.includes('qa096-synthetic-never-real'),{checked_tokens:tokens.length});
 output('provider-observations.json',await stats());
}catch(e){checks.push({id:'supplement-harness',status:'ERROR',error:String(e),stack:e.stack});process.exitCode=1;}
finally{for(const c of clients)await c.r.dispose();const counts=checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0});output('supplement-results.json',{date:new Date().toISOString(),counts,checks,traces,real_model_calls:0,method_corrections:['API general errors specify guest 401 authentication_required and upstream unavailable 503 generation_unavailable','Expired claim fixture moves both created_at and expires_at; preserves DB expiry_after_create constraint'],original_results_preserved:true});console.log(JSON.stringify({counts,failures:checks.filter(x=>x.status!=='PASS')}));if(counts.FAIL)process.exitCode=1;}
