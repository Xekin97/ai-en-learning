import {randomUUID} from 'node:crypto';
import {checks,traces,check,client,candidate,valid,invalid,review,cleanse,stats,enqueue,setModel} from './helpers.mjs';
import {sql,quote,output,docker,prefix,origin,restart} from './setup.mjs';
const clients=[],allTokens=[];let model;
const fresh=async(name,admin=false)=>{const c=await client(name,admin);clients.push(c);return c;};
const make=async(c,id)=>{const x=candidate(['vulnerable'],['vulnerability']);x.passage='Vulnerability and vulnerable communities face vulnerabilities.'+x.passage;x.targets[0].hint_phrase='vulnerability in vulnerable communities with vulnerabilities';x.targets[0].hint_forms=['vulnerability'];const r=await valid(c,id,x);if(!r.result)throw Error('Fixture not validated '+id);allTokens.push(r.started.generation_token);return r;};
const action=(c,r,name,token=r.started.generation_token)=>c.api('POST',`/api/v1/generations/${r.started.run_id}/${name}`,{},token===null?{}:{'x-generation-token':token});
const consume=(c,token)=>c.api('POST','/api/v1/visitor-claims/consume',{}, {'x-claim-token':token});
const detail=r=>JSON.parse(sql(`SELECT json_build_object('status',call_status,'disposition',disposition,'charged',quota_charged,'counted',counts_toward_cumulative,'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id),'batches',(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=r.id)) FROM wordweave.generation_runs r WHERE id=${quote(r.started.run_id)};`));
const snapshot=r=>JSON.parse(sql(`SELECT json_build_object('payload_md5',md5(payload::text),'expires_at',expires_at,'token_hash_md5',md5(access_token_hash::text)) FROM wordweave.generation_drafts WHERE run_id=${quote(r.started.run_id)};`));
const expire=r=>sql(`UPDATE wordweave.generation_drafts SET validated_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE run_id=${quote(r.started.run_id)};`);
const summary=async c=>(await c.api('GET','/api/v1/me/learning-summary')).body.data;
const stable=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const poll=async(fn,label)=>{for(let i=0;i<60;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out '+label);};
async function controlled(c,id,disconnect=false){
 const fixture=candidate(['vulnerable'],['vulnerability']);await enqueue({id,candidate:fixture,delayMs:100,chunks:[1]});
 const cookies=(await c.r.storageState()).cookies.map(x=>x.name+'='+x.value).join('; ');
 const response=await fetch(origin+'/api/v1/generations/stream',{method:'POST',headers:{cookie:cookies,origin,'sec-fetch-site':'same-origin','x-csrf-token':c.csrf,'content-type':'application/json'},body:JSON.stringify({model_id:model,entries:['vulnerable'],meaning_language:'en',scenario:'discussion',length:'short'})});
 if(response.status!==200)throw Error('Controlled stream setup '+response.status);
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',started;
 while(!started){const x=await reader.read();if(x.done)throw Error('No stream start');text+=decoder.decode(x.value,{stream:true});const match=text.match(/event: generation.started\ndata: ([^\n]+)\n\n/);if(match)started=JSON.parse(match[1]);}
 allTokens.push(started.generation_token);const r={started};
 check(id+'/active-unsaveable',(await action(c,r,'save')).status===404,detail(r));
 if(disconnect){await reader.cancel();await poll(()=>detail(r).status==='stream_failed',id);}
 else{const a=await action(c,r,'cancel');check(id+'/cancel-accepted',a.status===200,{status:a.status});while(!(await reader.read()).done){}}
 const d=detail(r);check(id+'/terminal-unsaveable',(await action(c,r,'save')).status===404&&d.batches===0&&d.drafts===0,d);
 check(id+'/accounting',disconnect?(!d.charged&&!d.counted):(d.charged&&d.counted),d);
}
async function run(){
 const resume=process.argv.includes('--resume-setup');
 const admin=await fresh('qa096_admin',true),learner=await fresh('qa096_learner',resume),other=await fresh('qa096_other',resume);let response;
 if(resume){check('SETUP/resume-before-learning',sql('SELECT count(*) FROM wordweave.generation_runs;')==='0',{});model=sql('SELECT id FROM wordweave.ai_models LIMIT 1;');}
 else{
  check('SETUP/no-inference',(await stats()).calls.length===0,{calls:(await stats()).calls.length});
  response=await admin.api('PUT','/api/v1/admin/openrouter-credential',{api_key:'qa096-synthetic-never-real',confirmed:true});if(response.status!==200)throw Error('Synthetic configuration');
  response=await admin.api('POST','/api/v1/admin/models',{display_name:'QA096 synthetic',description:'Disposable lifecycle test fixture',openrouter_model_id:'qa/synthetic'});model=response.body.data?.model?.id;
 }
 if(!model)throw Error('Model setup');setModel(model);
 const probe=candidate(['learn','vulnerable'],['learned','vulnerability']);probe.targets[0].hint_phrase='learning through learning after we learned';probe.targets[0].hint_forms=['learning','learned'];
 await enqueue({id:'current-protocol-probe-repeated-hint',candidate:probe});response=await admin.api('POST',`/api/v1/admin/models/${model}/enable`,{});if(response.status!==200)throw Error('Synthetic enable '+JSON.stringify(response));
 for(const group of ['basic','visitor']){response=await admin.api('PUT','/api/v1/admin/groups/'+group,{rolling_24h_limit:100,max_entries:5,allowed_lengths:['short'],model_ids:[model]});if(response.status!==200)throw Error('Group setup');}
 const run=await make(learner,'L01/restart-save'),snap=snapshot(run),calls=(await stats()).calls.length,beforeSummary=await summary(learner);
 const firstRestart=await restart();check('L01/restart-real-process',firstRestart.before!==firstRestart.after,firstRestart);
 check('L01/snapshot-unchanged',stable(snapshot(run),snap),{before:snap,after:snapshot(run)});
 for(const [name,c,token] of [['wrong-owner',other,run.started.generation_token],['missing-token',learner,null],['tampered-token',learner,'X'+run.started.generation_token.slice(1)],['bad-format',learner,'bad-token']]){
  for(const op of ['save','discard']){const a=await action(c,run,op,token);check('L02/'+name+'/'+op,a.status===404,{status:a.status});}
 }
 check('L02/rejected-no-mutation',stable(snapshot(run),snap)&&detail(run).batches===0,detail(run));
 response=await action(learner,run,'save');const batch=response.body.data?.batch_id;check('L01/save-201',response.status===201&&Boolean(batch),{status:response.status,batch});
 const secondRestart=await restart();response=await action(learner,run,'save');check('L01/retry-after-second-restart',response.status===200&&response.body.data?.batch_id===batch,{status:response.status,same:response.body.data?.batch_id===batch,restart:secondRestart});
 check('L01/single-atomic-batch',detail(run).drafts===0&&detail(run).batches===1&&detail(run).disposition==='saved',detail(run));
 check('L01/no-call-no-count-repeat',(await stats()).calls.length===calls&&(await summary(learner)).generation_count===beforeSummary.generation_count,{calls:(await stats()).calls.length,summary:await summary(learner)});
 for(const [name,c,token] of [['wrong-owner',other,run.started.generation_token],['missing-token',learner,null],['tampered',learner,'X'+run.started.generation_token.slice(1)]])check('L02/saved-'+name,(await action(c,run,'save',token)).status===404,{status:(await action(c,run,'save',token)).status});
 const batchDetail=await learner.api('GET',`/api/v1/me/batches/${batch}`);check('L03/exact-saved-resource',batchDetail.body.data?.batch?.passage===run.result.passage&&stable(batchDetail.body.data?.batch?.targets,run.result.targets),{status:batchDetail.status});
 const search=await learner.api('GET','/api/v1/me/batches?entry=vulnerable');check('L03/search-owned-batch',search.body.data?.items?.some(x=>x.id===batch),{status:search.status});
 check('L03/other-cannot-read',(await other.api('GET',`/api/v1/me/batches/${batch}`)).status===404,{});
 await review(learner,batch,run.result,'L03/two-stage-derived-review');
 check('L03/discard-saved-no-deletion',(await action(learner,run,'discard')).status===204&&detail(run).batches===1,detail(run));
 response=await learner.api('DELETE',`/api/v1/me/batches/${batch}`,{});check('L03/delete-batch',response.status===204,{status:response.status});
 await restart();check('L03/delete-no-resurrection',(await action(learner,run,'save')).status===404&&detail(run).batches===0,detail(run));
 const abandoned=await make(learner,'L04/discard');await restart();response=await action(learner,abandoned,'discard');await restart();const again=await action(learner,abandoned,'discard');check('L04/discard-restart-idempotent',response.status===204&&again.status===204&&detail(abandoned).drafts===0&&detail(abandoned).batches===0,detail(abandoned));
 check('L04/discard-cannot-save',(await action(learner,abandoned,'save')).status===404&&detail(abandoned).counted,detail(abandoned));
 const expired=await make(learner,'L05/expiry');expire(expired);for(const op of ['save','discard']){response=await action(learner,expired,op);check('L05/expired-'+op,response.status===410,{status:response.status});}check('L05/expiry-no-batch',detail(expired).batches===0,detail(expired));
 const terminal=await make(learner,'L05/terminal');await action(learner,terminal,'save');sql(`UPDATE wordweave.generation_runs SET started_at=clock_timestamp()-interval '2 hours',completed_at=clock_timestamp()-interval '61 minutes' WHERE id=${quote(terminal.started.run_id)};`);check('L05/terminal-expiry',(await action(learner,terminal,'save')).status===410,detail(terminal));
 const parallel=await make(learner,'L06/concurrent-save'),cross=await make(learner,'L06/cross-run');check('L02/cross-run-token',(await action(learner,parallel,'save',cross.started.generation_token)).status===404,detail(parallel));
 const saved=await Promise.all(Array.from({length:8},()=>action(learner,parallel,'save')));check('L06/eight-save-single-batch',saved.filter(x=>x.status===201).length===1&&saved.filter(x=>x.status===200).length===7&&new Set(saved.map(x=>x.body.data?.batch_id)).size===1&&detail(parallel).batches===1,{statuses:saved.map(x=>x.status),state:detail(parallel)});
 for(let i=0;i<4;i++){const r=await make(learner,'L06/save-discard-'+i),s=await Promise.all([action(learner,r,'save'),action(learner,r,'discard')]),d=detail(r);check('L06/save-discard-atomic-'+i,s[1].status===204&&((s[0].status===201&&d.batches===1&&d.disposition==='saved')||(s[0].status===404&&d.batches===0&&d.disposition==='abandoned'))&&d.drafts===0,{statuses:s.map(x=>x.status),state:d});}
 const bad=candidate(['vulnerable'],['banana']);await invalid(learner,'L07/invalid',bad);await invalid(learner,'L07/provider-failed',candidate(['vulnerable'],['vulnerability']),{httpError:503});
 await controlled(learner,'L07/cancel');
 // Gateway intentionally continues its upstream request; native disconnect is not an oracle here.
 const visitor=await fresh(),visitorOther=await fresh(),recipient=await fresh('qa096_recipient');
 const guest=await make(visitor,'L08/claim-restart'),guestSnapshot=snapshot(guest);await restart();check('L08/guest-snapshot-intact',stable(snapshot(guest),guestSnapshot),{});
 for(const [name,c,token] of [['wrong-visitor',visitorOther,guest.started.generation_token],['wrong-token',visitor,'bad-token']])check('L08/'+name,(await action(c,guest,'visitor-claim',token)).status===404,{});
 check('L08/guest-cannot-direct-save',(await action(visitor,guest,'save')).status===403,{});
 const claim=await action(visitor,guest,'visitor-claim');if(claim.status!==200)throw Error('Claim setup '+claim.status);const token=claim.body.data.claim_token;allTokens.push(token);await restart();
 check('L08/claim-wrong-token',(await consume(recipient,'bad-token')).status===404,{});
 const claimCalls=(await stats()).calls.length,claimBefore=await summary(recipient),claimed=await consume(recipient,token),claimedBatch=claimed.body.data?.batch_id;
 await restart();const claimRetry=await consume(recipient,token);check('L08/claim-restart-idempotent',claimed.status===200&&claimRetry.status===200&&Boolean(claimedBatch)&&claimedBatch===claimRetry.body.data?.batch_id&&detail(guest).batches===1,{statuses:[claimed.status,claimRetry.status],state:detail(guest)});
 check('L08/claim-accounting',(await stats()).calls.length===claimCalls&&(await summary(recipient)).generation_count===claimBefore.generation_count+1,{summary:await summary(recipient),calls:(await stats()).calls.length});
 check('L08/claim-cannot-rebind',(await consume(other,token)).status===404,{});
 await review(recipient,claimedBatch,guest.result,'L08/claimed-two-stage-review');
 const guestExpire=await make(visitor,'L09/claim-draft-expired');const expClaim=await action(visitor,guestExpire,'visitor-claim');expire(guestExpire);response=await consume(recipient,expClaim.body.data.claim_token);check('L09/claim-valid-draft-expired',response.status===410&&detail(guestExpire).batches===0,{status:response.status,state:detail(guestExpire)});
 const claimExpire=await make(visitor,'L09/claim-expired');const exp2=await action(visitor,claimExpire,'visitor-claim');sql(`UPDATE wordweave.visitor_claims SET expires_at=clock_timestamp()-interval '1 second' WHERE run_id=${quote(claimExpire.started.run_id)};`);response=await consume(recipient,exp2.body.data.claim_token);check('L09/claim-expired',response.status===410&&detail(claimExpire).batches===0,{status:response.status});
 const claimedDiscard=await make(visitor,'L09/claim-abandoned');const cd=await action(visitor,claimedDiscard,'visitor-claim');await action(visitor,claimedDiscard,'discard');check('L09/abandoned-claim-unsaveable',(await consume(recipient,cd.body.data.claim_token)).status===404&&detail(claimedDiscard).batches===0,detail(claimedDiscard));
 const claimConcurrent=await make(visitor,'L10/consume-concurrent');const cc=await action(visitor,claimConcurrent,'visitor-claim');const consumed=await Promise.all(Array.from({length:6},()=>consume(recipient,cc.body.data.claim_token)));check('L10/six-consumes-one-batch',consumed.every(x=>x.status===200)&&new Set(consumed.map(x=>x.body.data?.batch_id)).size===1&&detail(claimConcurrent).batches===1,{statuses:consumed.map(x=>x.status),state:detail(claimConcurrent)});
 output('provider-observations.json',await stats());
 const logs=docker(['logs',prefix+'-backend']);check('L11/log-secrets-redacted',!allTokens.some(x=>logs.includes(x))&&!logs.includes('qa096-synthetic-never-real'),{checked_tokens:allTokens.length});
 output('suite-context.json',{model,learner:'qa096_learner',visitor:'new anonymous context required',password:'public synthetic fixture defined in helpers.mjs',real_model_calls:0});
}
try{await run();}catch(e){checks.push({id:'harness-completion',status:'ERROR',error:String(e),stack:e.stack});process.exitCode=1;}
finally{
 for(const c of clients)await c.r.dispose();
 const counts=checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0});
 output('api-results.json',{date:new Date().toISOString(),agent:'qa-quinn',real_model_calls:0,counts,checks,traces});
 console.log(JSON.stringify({counts,failures:checks.filter(x=>x.status!=='PASS')}));if(counts.FAIL)process.exitCode=1;
}
