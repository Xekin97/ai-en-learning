import {spawn} from 'node:child_process';
import {checks,traces,check,client,candidate,valid,stats,setModel} from './helpers.mjs';
import {sql,quote,output,docker,prefix,restart} from './setup.mjs';
const clients=[],observations=[];
const fresh=async(name)=>{const c=await client(name,!!name);clients.push(c);return c;};
const make=async(c,id)=>{const r=await valid(c,id,candidate(['vulnerable'],['vulnerability']));if(!r.result)throw Error('Fixture validation');return r;};
const action=(c,r,op)=>c.api('POST',`/api/v1/generations/${r.started.run_id}/${op}`,{}, {'x-generation-token':r.started.generation_token});
const consume=(c,t)=>c.api('POST','/api/v1/visitor-claims/consume',{}, {'x-claim-token':t});
const poll=async(fn,label)=>{for(let i=0;i<50;i++){if(fn())return;await new Promise(r=>setTimeout(r,80));}throw Error('Lock observation timeout '+label);};
const activity=()=>JSON.parse(sql("SELECT coalesce(json_agg(json_build_object('pid',pid,'wait',wait_event,'query',left(query,170))),'[]') FROM pg_stat_activity WHERE datname='qa096' AND usename='wordweave_app' AND wait_event_type='Lock';"));
const state=r=>JSON.parse(sql(`SELECT json_build_object('disposition',disposition,'drafts',(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id),'batches',(SELECT count(*) FROM wordweave.learning_batches WHERE generation_run_id=r.id)) FROM wordweave.generation_runs r WHERE id=${quote(r.started.run_id)};`));
async function hold(statement){
 const child=spawn('docker',['exec','-i','-e','PGAPPNAME=qa096_hold',prefix+'-db','psql','-U','postgres','-d','qa096','-XAt','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let err='';child.stderr.on('data',x=>err+=x);child.stdout.on('data',()=>{});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',c=>c===0?resolve():reject(Error('Lock holder '+err)));});
 child.stdin.write('BEGIN;\n'+statement+';\n');
 await poll(()=>sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='qa096_hold' AND state='idle in transaction';")==='1','holder acquired');
 return async()=>{child.stdin.end('COMMIT;\n');await done;};
}
try{
 setModel(sql('SELECT id FROM wordweave.ai_models LIMIT 1;'));
 const learner=await fresh('qa096_learner'),recipient=await fresh('qa096_recipient'),visitor=await fresh();
 // Control: delaying INSERT with the same barrier must not cause an artificial deadlock.
 const control=await make(learner,'L12/ordered-control'),release=await hold('LOCK TABLE wordweave.learning_batches IN ACCESS EXCLUSIVE MODE');let save,discard;
 try{save=action(learner,control,'save');await poll(()=>activity().some(x=>x.query.includes('INSERT INTO wordweave.learning_batches')),'save insert');discard=action(learner,control,'discard');await poll(()=>activity().length>=2,'discard waiting');observations.push({id:'ordered-control',waiting:activity()});}finally{await release();}
 const ordered=await Promise.all([save,discard]);check('L12/ordered-control-no-500',ordered[0].status===201&&ordered[1].status===204,{statuses:ordered.map(x=>x.status),state:state(control)});
 for(let i=0;i<2;i++){
  const r=await make(visitor,'L12/claim-discard-'+i),cl=await action(visitor,r,'visitor-claim');if(cl.status!==200)throw Error('Claim setup');
  const end=await hold('LOCK TABLE wordweave.learning_batches IN ACCESS EXCLUSIVE MODE');let consumeRequest,discardRequest,waiting;
  try{consumeRequest=consume(recipient,cl.body.data.claim_token);await poll(()=>activity().some(x=>x.query.includes('INSERT INTO wordweave.learning_batches')),'claim insert');discardRequest=action(visitor,r,'discard');await poll(()=>activity().length>=2,'discard draft lock');waiting=activity();}finally{await end();}
  const responses=await Promise.all([consumeRequest,discardRequest]),d=state(r);const observation={id:'claim-discard-'+i,run_id:r.started.run_id,waiting,responses,state:d};observations.push(observation);
  check('L12/claim-discard-no-server-error-'+i,responses.every(x=>x.status<500),observation);
  check('L12/claim-discard-atomic-'+i,d.drafts===0&&((d.disposition==='saved'&&d.batches===1)||(d.disposition==='abandoned'&&d.batches===0)),d);
 }
 // The real startup cleanup should skip a run lock, then clean it after release.
 const expired=await make(learner,'L13/cleanup-lock');sql(`UPDATE wordweave.generation_drafts SET validated_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE run_id=${quote(expired.started.run_id)};`);
 const end=await hold(`SELECT id FROM wordweave.generation_runs WHERE id=${quote(expired.started.run_id)} FOR UPDATE`);
 try{await restart();check('L13/cleanup-skips-locked-run',state(expired).drafts===1, state(expired));}finally{await end();}
 await restart();await poll(()=>state(expired).drafts===0,'cleanup released run');check('L13/cleanup-removes-expired',state(expired).drafts===0&&state(expired).disposition==='abandoned',state(expired));
 output('provider-observations.json',await stats());
}catch(e){checks.push({id:'concurrency-harness',status:'ERROR',error:String(e),stack:e.stack});process.exitCode=1;}
finally{
 for(const c of clients)await c.r.dispose();
 const counts=checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0});
 output('concurrency-results.json',{date:new Date().toISOString(),counts,checks,traces,observations,real_model_calls:0,barrier_scope:'Temporary transaction lock in disposable QA database only; no schema or source changes'});
 console.log(JSON.stringify({counts,failures:checks.filter(x=>x.status!=='PASS')}));if(counts.FAIL)process.exitCode=1;
}
