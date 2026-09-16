import {checks,traces,check,client,candidate,valid,stats,setModel} from './helpers.mjs';
import {sql,quote,output,docker,prefix,backend,restart} from './setup.mjs';
const clients=[];
try{
 setModel(sql('SELECT id FROM wordweave.ai_models LIMIT 1;'));
 const visitor=await client(),learner=await client('qa096_recipient',true);clients.push(visitor,learner);
 const run=await valid(visitor,'L14/ordinary-claim-delete',candidate(['vulnerable'],['vulnerability']));if(!run.result)throw Error('Fixture');
 const claim=await visitor.api('POST',`/api/v1/generations/${run.started.run_id}/visitor-claim`,{}, {'x-generation-token':run.started.generation_token});if(claim.status!==200)throw Error('Claim');
 const saved=await learner.api('POST','/api/v1/visitor-claims/consume',{}, {'x-claim-token':claim.body.data.claim_token});const batch=saved.body.data?.batch_id;if(!batch)throw Error('Consume');
 const before=await learner.api('GET',`/api/v1/me/batches/${batch}`),calls=(await stats()).calls.length;
 const deleted=await learner.api('DELETE',`/api/v1/me/batches/${batch}`,{});
 const after=await learner.api('GET',`/api/v1/me/batches/${batch}`);
 await restart();const retry=await learner.api('DELETE',`/api/v1/me/batches/${batch}`,{});
 const row=JSON.parse(sql(`SELECT json_build_object('claim_status',status,'batch_present',EXISTS(SELECT 1 FROM wordweave.learning_batches WHERE id=consumed_batch_id),'same_owner',consumed_account_id=(SELECT owner_id FROM wordweave.learning_batches WHERE id=consumed_batch_id),'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=claim.run_id)) FROM wordweave.visitor_claims claim WHERE run_id=${quote(run.started.run_id)};`));
 const logs=docker(['logs',prefix+'-db']);
 const constraintEvidence=logs.split('\n').filter(x=>x.includes('violates check constraint "visitor_claims_state_consistent"')||x.includes('UPDATE ONLY "wordweave"."visitor_claims" SET "consumed_batch_id" = NULL'));
 check('L14/normal-owned-claim-preconditions',saved.status===200&&before.status===200&&row.same_owner&&row.drafts===0,{saved_status:saved.status,before_status:before.status,row});
 check('L14/claimed-batch-delete-204',deleted.status===204,{status:deleted.status,body:deleted.body});
 check('L14/deleted-batch-not-readable',after.status===404,{status:after.status});
 check('L14/restart-does-not-block-delete',retry.status===204||retry.status===404,{status:retry.status,body:retry.body});
 check('L14/no-extra-provider-call',(await stats()).calls.length===calls,{before:calls,after:(await stats()).calls.length});
 output('delete-claim-observation.json',{date:new Date().toISOString(),backend,run_id:run.started.run_id,batch_id:batch,original_delete:deleted,after_read_status:after.status,retry_delete:retry,row,constraint_evidence:constraintEvidence,token_recorded:false,time_manipulation:false,lock_barrier:false,real_model_calls:0});
 output('provider-observations.json',await stats());
}catch(e){checks.push({id:'delete-harness',status:'ERROR',error:String(e),stack:e.stack});process.exitCode=1;}
finally{for(const c of clients)await c.r.dispose();const counts=checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0});output('delete-claim-results.json',{date:new Date().toISOString(),counts,checks,traces});console.log(JSON.stringify({counts,failures:checks.filter(x=>x.status!=='PASS')}));if(counts.FAIL)process.exitCode=1;}
