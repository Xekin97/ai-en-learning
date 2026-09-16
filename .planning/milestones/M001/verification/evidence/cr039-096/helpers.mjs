// Reused QA094 HTTP/SSE/review helpers only; no old-version matrix or runner is included.
import {request} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dir,root,prefix,origin,sql,quote,docker,output,waitReady} from './setup.mjs';
const checks=[], traces=[];const pass='Qa096SyntheticOnly!';let model;
const check=(id,condition,actual)=>{checks.push({id,status:condition?'PASS':'FAIL',actual});if(!condition)console.log('FAIL '+id+' '+JSON.stringify(actual));};
const stats=async()=>await(await fetch('http://127.0.0.1:6198/qa/stats')).json();
export const enqueue=async item=>{await fetch('http://127.0.0.1:6198/qa/queue',{method:'POST',body:JSON.stringify(item)});};
const filler=' The local team discussed a practical plan for the community. Everyone had time to listen carefully, ask questions, and share useful ideas. A clear record helped residents follow the discussion and compare possible approaches. The meeting ended calmly, with an agreement to gather more information before making a final decision about the project.';
const meanings={learn:'To acquire knowledge through experience',vulnerable:'Easily harmed or affected by danger',sustainable:'Able to continue without exhausting resources',prevalent:'Widespread in a particular place or period',ambiguous:'Open to more than one interpretation',coherent:'Logical and consistent',alleviate:'To make suffering less severe',undermine:'To weaken gradually',facilitate:'To make a process easier',deteriorate:'To become worse over time',perceive:'To notice or become aware of something'};
const candidate=(entries,forms=entries)=>({passage:forms.join(', ')+'.'+filler,tags:['Community'],targets:entries.map((e,i)=>({source_entry:e,contextual_meaning:meanings[e]??'A useful expression in this discussion',hint_phrase:forms[i]+' during a discussion',passage_forms:[forms[i]],hint_forms:[forms[i]]}))});
function cleanse(v){if(Array.isArray(v))return v.map(cleanse);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['generation_token','attempt_token','csrf_token','claim_token'].includes(k)).map(([k,x])=>[k,cleanse(x)]));return v;}
async function client(name,admin=false,base=origin){
 const c={r:await request.newContext(),csrf:'',base};
 c.api=async(method,path,data,extra={})=>{const r=await c.r.fetch(c.base+path,{method,headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':c.csrf,...extra},...(data===undefined?{}:{data}),timeout:60000});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}return {status:r.status(),body};};
 let b=await c.api('GET','/api/v1/bootstrap');c.csrf=b.body.data.csrf_token;
 if(name){b=await c.api('POST','/api/v1/auth/'+(admin?'login':'register'),admin?{username:name,password:pass,browser_ui_locale:'en-US'}:{username:name,password:pass,password_confirmation:pass,ui_locale:'en-US'});if(![200,201].includes(b.status))throw Error('Auth setup '+b.status);c.csrf=b.body.data.csrf_token;}
 return c;
}
async function stream(c,id,cand,options={}){
 await enqueue({id,candidate:cand,...options.fixture});const before=(await stats()).calls.length;
 const t=performance.now();const r=await c.api('POST','/api/v1/generations/stream',{model_id:model,meaning_language:options.language??'en',scenario:options.scenario??'discussion',length:options.length??'short',entries:options.entries??cand.targets.map(x=>x.source_entry)});
 const events=typeof r.body==='string'?r.body.split(/\n\n/).filter(x=>x.includes('event:')).map(block=>({event:block.match(/event: ([^\n]+)/)?.[1],data:JSON.parse(block.match(/data: (.*)/)?.[1]??'{}')})):[];
 const terminal=events.find(x=>['generation.validated','generation.failed','generation.cancelled'].includes(x.event));const started=events.find(x=>x.event==='generation.started')?.data;
 const after=(await stats()).calls.length;const run={id,http:r.status,terminal:terminal?.event,result:terminal?.data?.result,failure:terminal?.data,started,elapsed_ms:Math.round(performance.now()-t),deltas:events.filter(x=>x.event==='passage.delta').map(x=>x.data.text).join('')};
 check(id+'/single-call',after-before===1,{before,after});traces.push(cleanse(run));
 return run;
}
async function valid(c,id,cand,options={}){const r=await stream(c,id,cand,options);check(id+'/valid',r.terminal==='generation.validated',{terminal:r.terminal,http:r.http,failure:r.terminal==='generation.failed'?r.failure:undefined});if(r.result)check(id+'/stream-exact',r.deltas===cand.passage,{equal:r.deltas===cand.passage});return r;}
async function invalid(c,id,cand,fixture={},options={}){
 const r=await stream(c,id,cand,{fixture,...options});check(id+'/rejected',r.terminal==='generation.failed'&&r.failure.quota_refunded===true,{terminal:r.terminal,failure:r.failure});
 if(r.started){const run=JSON.parse(sql(`SELECT json_build_object('status',call_status,'charged',quota_charged,'counted',counts_toward_cumulative,'drafts',(SELECT count(*) FROM wordweave.generation_drafts d WHERE d.run_id=r.id)) FROM wordweave.generation_runs r WHERE id=${quote(r.started.run_id)};`));check(id+'/atomic-refund',run.charged===false&&run.counted===false&&run.drafts===0,run);const saved=await c.api('POST',`/api/v1/generations/${r.started.run_id}/save`,{}, {'x-generation-token':r.started.generation_token});check(id+'/unsaveable',saved.status>=400,{status:saved.status});}
 return r;
}
async function save(c,r){const p=`/api/v1/generations/${r.started.run_id}/save`,h={'x-generation-token':r.started.generation_token};const a=await c.api('POST',p,{},h),b=await c.api('POST',p,{},h);check(r.id+'/save-idempotent',[200,201].includes(a.status)&&[200,201].includes(b.status)&&a.body.data?.batch_id===b.body.data?.batch_id,{first:a.status,second:b.status,same:a.body.data?.batch_id===b.body.data?.batch_id});return a.body.data?.batch_id;}
async function review(c,batchId,result,label){
 const session=await c.api('POST','/api/v1/me/review-sessions',{mode:'single_batch',batch_id:batchId});const sid=session.body.data?.session_id;if(!sid)throw Error('Review session '+JSON.stringify(session));
 let r=await c.api('POST',`/api/v1/me/review-sessions/${sid}/attempts`,{});let state=r.body.data;const aid=state.attempt_id,token=state.attempt_token;
 const action=async data=>{const a=await c.api('POST',`/api/v1/me/review-attempts/${aid}/actions`,{action_id:randomUUID(),item_id:state.item.item_id,...data},{'x-review-attempt-token':token});return a.body.data;};
 while(state.item?.stage==='spelling'){
  const target=result.targets.find(x=>x.contextual_meaning===state.item.contextual_meaning);if(!target)throw Error('Missing expected meaning oracle');
  check(label+'/hint-all-'+target.entry,state.item.hint.segments.filter(x=>x.kind==='blank').length===target.hint_blanks.length,{actual:state.item.hint.segments,expected_blank_count:target.hint_blanks.length});
  check(label+'/spelling-safe-'+target.entry,Object.keys(state.item).sort().join(',')==='contextual_meaning,hint,item_id,stage'&&!JSON.stringify(state.item.hint).includes('"surface"'),Object.keys(state.item));
  const surface=target.occurrences.find(x=>x.surface.toLowerCase()!==target.entry.toLowerCase())?.surface;
  if(surface){const bad=await action({action:'answer',answer:surface});check(label+'/original-required-'+target.entry,bad.outcome==='retry',bad.outcome);state=bad;}
  state=await action({action:'answer',answer:' '+target.entry.toUpperCase()+' '});
 }
 if(state.item?.stage!=='passage_cloze')throw Error('Not at passage '+JSON.stringify(state));
 const expected=result.targets.flatMap(t=>t.occurrences.map(o=>({...o,entry:t.entry}))).sort((a,b)=>a.start-b.start);
 const blanks=state.item.passage_segments.filter(x=>x.kind==='blank');const groups=new Map();let aligned=blanks.length===expected.length;
 blanks.forEach((b,i)=>{const e=expected[i];if(!e){aligned=false;return;}if(groups.has(e.entry)&&groups.get(e.entry)!==b.group_key)aligned=false;groups.set(e.entry,b.group_key);if(Object.keys(b).sort().join(',')!=='blank_id,group_key,kind')aligned=false;});
 check(label+'/all-gaps-groups',aligned&&new Set(groups.values()).size===result.targets.length,{gaps:blanks.length,expected:expected.length,groups:groups.size});
 let cursor=0;let reconstruct='';for(const s of state.item.passage_segments){if(s.kind==='text')reconstruct+=s.text;else reconstruct+=expected[cursor++]?.surface??'';}
 check(label+'/cloze-exact',reconstruct===result.passage,{equal:reconstruct===result.passage});
 const originalItem=state.item;const bad=await action({action:'answer',answers:blanks.map(b=>({blank_id:b.blank_id,answer:'qa_wrong'}))});check(label+'/retry-no-answer',bad.outcome==='retry'&&JSON.stringify(originalItem)===JSON.stringify(bad.item),{outcome:bad.outcome,item_stable:JSON.stringify(originalItem)===JSON.stringify(bad.item)});state=bad;
 const answer={action_id:randomUUID(),item_id:state.item.item_id,action:'answer',answers:blanks.map((b,i)=>({blank_id:b.blank_id,answer:expected[i].surface}))};
 const end=await c.api('POST',`/api/v1/me/review-attempts/${aid}/actions`,answer,{'x-review-attempt-token':token});const replay=await c.api('POST',`/api/v1/me/review-attempts/${aid}/actions`,answer,{'x-review-attempt-token':token});
 check(label+'/complete-on-surface',end.body.data?.outcome==='session_completed'&&end.body.data?.batch_result?.successful===true,cleanse(end.body.data));
 check(label+'/action-idempotent',JSON.stringify(end.body.data)===JSON.stringify(replay.body.data),{same:JSON.stringify(end.body.data)===JSON.stringify(replay.body.data)});
 traces.push({id:label,session_id:sid,passage_item:cleanse(originalItem),completion:cleanse(end.body.data)});return sid;
}

export {checks,traces,check,stats,client,candidate,valid,invalid,save,review,cleanse};
export const setModel=id=>model=id;
