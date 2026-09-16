import {checks,traces,check,stats,client,candidate,valid,invalid,save,review,setModel,enqueue,cleanse} from './suite.mjs';
import {sql,quote,output,docker,prefix,origin} from './setup.mjs';
const model=sql('SELECT id FROM wordweave.ai_models LIMIT 1;');setModel(model);
try{
 const current=await client('qa094_learner',true),old=await client('qa094_learner',true);old.base='http://127.0.0.1:6196';
 const entries=['alleviate','undermine','facilitate','deteriorate','perceive','sustainable','prevalent','vulnerable','ambiguous','coherent'];const shifted=candidate(entries);shifted.targets.reverse();
 await invalid(current,'C39-10/resource-order-corrected',shifted,{}, {entries});
 const simple=candidate(['vulnerable'],['vulnerability']),huge=structuredClone(simple);huge.passage=('vulnerability. '+('Ordinary discussion continues calmly. '.repeat(4000))).trimEnd();await valid(current,'C39-18/large-xlong-corrected',huge,{length:'xlong',fixture:{chunks:[16384]}});
 // Original spelling fixture succeeds on originating process, isolating cross-image registry loss.
 const v2=candidate(['learn'],['learned']);v2.targets.forEach(t=>{delete t.passage_forms;delete t.hint_forms;});
 const r2=await valid(old,'C39-15/v2-new-control',v2);const db2=sql(`SELECT payload->>'validator_version' FROM wordweave.generation_drafts WHERE run_id=${quote(r2.started.run_id)};`);
 const cross2=await current.api('POST',`/api/v1/generations/${r2.started.run_id}/save`,{}, {'x-generation-token':r2.started.generation_token});check('C39-15/v2-to-v3-draft-save',cross2.status===201||cross2.status===200,{status:cross2.status,stored_version:db2});
 const b2=await save(old,r2);if(b2){const detail=await current.api('GET',`/api/v1/me/batches/${b2}`);check('C39-15/v2-saved-v3-read',detail.status===200&&detail.body.data.batch.passage===v2.passage,{status:detail.status});await review(current,b2,r2.result,'C39-15/v2-saved-v3-review');}
 const r3=await valid(current,'C39-15/v3-new-control',simple);const cross3=await old.api('POST',`/api/v1/generations/${r3.started.run_id}/save`,{}, {'x-generation-token':r3.started.generation_token});check('C39-15/v3-to-v2-draft-save',cross3.status===201||cross3.status===200,{status:cross3.status});
 const b3=await save(current,r3);if(b3)await review(old,b3,r3.result,'C39-15/v3-saved-v2-review-control');
 output('browser-input.json',{model,batch_id:b3,result:r3.result,username:'qa094_learner'});
 // Observe cancellation and passive disconnect over the real proxy SSE stream.
 const cookies=(await current.r.storageState()).cookies.map(c=>c.name+'='+c.value).join('; ');
 for(const mode of ['cancel','disconnect']){
  await enqueue({id:'C39-13/'+mode,candidate:simple,chunks:[25],delayMs:60});const startCalls=(await stats()).calls.length;
  const abort=new AbortController();const response=await fetch(origin+'/api/v1/generations/stream',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':current.csrf,'content-type':'application/json',cookie:cookies},body:JSON.stringify({model_id:model,meaning_language:'en',scenario:'discussion',length:'short',entries:['vulnerable']}),signal:abort.signal});
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',started;
  while(!started){const {value,done}=await reader.read();if(done)throw Error('No started event');buffer+=decoder.decode(value,{stream:true});const m=buffer.match(/event: generation.started\ndata: ([^\n]+)\n/);if(m)started=JSON.parse(m[1]);}
  if(mode==='cancel'){const a=await current.api('POST',`/api/v1/generations/${started.run_id}/cancel`,{}, {'x-generation-token':started.generation_token});check('C39-13/cancel-endpoint',a.body.data?.status==='cancelled'&&a.body.data?.quota_refunded===false,cleanse(a.body));while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});}check('C39-13/cancel-terminal',buffer.includes('event: generation.cancelled')&&!buffer.includes('event: generation.validated'),{cancelled:buffer.includes('event: generation.cancelled')});}
  else abort.abort();
  await new Promise(r=>setTimeout(r,1800));
  const row=JSON.parse(sql(`SELECT json_build_object('status',call_status,'charged',quota_charged,'counted',counts_toward_cumulative,'drafts',(SELECT count(*) FROM wordweave.generation_drafts d WHERE d.run_id=g.id)) FROM wordweave.generation_runs g WHERE id=${quote(started.run_id)};`));
  check('C39-13/'+mode+'-settlement',row.drafts===0&&(mode==='cancel'?row.status==='user_cancelled'&&row.charged&&row.counted:row.charged===false&&row.counted===false&&row.status!=='active'),row);
  check('C39-13/'+mode+'-no-retry',(await stats()).calls.length===startCalls+1,{calls:(await stats()).calls.length-startCalls});
 }
 // Prompt schema and safe typed diagnostics, collected only from this synthetic backend.
 const all=await stats();output('provider-observations.json',all);const schema=all.calls[0].schema.schema.properties.targets.items;
 check('C39-07/provider-schema',schema.additionalProperties===false&&schema.required.includes('passage_forms')&&schema.required.includes('hint_forms'),schema);
 const logs=docker(['logs',prefix+'-backend']);const unsafe=/passage_forms|hint_forms|Quazzleflorp|vulnerableness|qa094-synthetic-never-real/.test(logs);check('C39-17/log-redaction',!unsafe,{unsafe});
 output('log-check.json',{unsafe,mapping_reasons:logs.split('\n').filter(x=>x.includes('mapping_')||x.includes('passage_occurrence_collision')).map(x=>JSON.parse(x))});
 await current.r.dispose();await old.r.dispose();
}catch(e){checks.push({id:'supplement-harness',status:'ERROR',error:String(e),stack:e.stack});console.error(e);process.exitCode=1;}
finally{output('supplement-results.json',{date:new Date().toISOString(),counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0}),checks,traces});console.log(JSON.stringify({counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0})}));}
