import {request} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dir,root,prefix,origin,sql,quote,docker,output,startOld,waitReady} from './setup.mjs';
const checks=[], traces=[];const pass='Qa094SyntheticOnly!';let model;
const check=(id,condition,actual)=>{checks.push({id,status:condition?'PASS':'FAIL',actual});if(!condition)console.log('FAIL '+id+' '+JSON.stringify(actual));};
const stats=async()=>await(await fetch('http://127.0.0.1:6195/qa/stats')).json();
export const enqueue=async item=>{await fetch('http://127.0.0.1:6195/qa/queue',{method:'POST',body:JSON.stringify(item)});};
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
async function run(){
 const admin=await client('qa094_admin',true),learner=await client('qa094_learner');
 check('startup/no-calls',(await stats()).calls.length===0,await stats());
 let r=await admin.api('PUT','/api/v1/admin/openrouter-credential',{api_key:'qa094-synthetic-never-real',confirmed:true});if(r.status!==200)throw Error('Synthetic credential '+JSON.stringify(r));
 r=await admin.api('POST','/api/v1/admin/models',{display_name:'QA094 synthetic',description:'Isolated provider fixture',openrouter_model_id:'qa/synthetic'});model=r.body.data.model.id;
 const probe=candidate(['learn','vulnerable'],['learned','vulnerability']);probe.targets[0].hint_phrase='learning through learning after we learned';probe.targets[0].hint_forms=['learning','learned'];
 await enqueue({id:'probe-v3',candidate:probe});r=await admin.api('POST',`/api/v1/admin/models/${model}/enable`,{});check('C39-16/probe',r.status===200&&r.body.data?.model?.enabled===true,{status:r.status,enabled:r.body.data?.model?.enabled});
 check('C39-16/probe-call-count',(await stats()).calls.length===1,{calls:(await stats()).calls.length});
 for(const group of ['basic','visitor']){r=await admin.api('PUT','/api/v1/admin/groups/'+group,{rolling_24h_limit:100,max_entries:12,allowed_lengths:['short','medium','long','xlong'],model_ids:[model]});if(r.status!==200)throw Error('Synthetic group setup '+JSON.stringify(r));}
 // Reduce ONLY this disposable database, preserving all original IDs for restoration.
 sql("CREATE TABLE public.qa094_vocab_backup AS TABLE wordweave.vocabulary_entries; DELETE FROM wordweave.vocabulary_entries WHERE entry <> 'vulnerable';");
 check('C39-03/single-entry-db',sql('SELECT count(*) FROM wordweave.vocabulary_entries;')==='1',{entries:sql('SELECT count(*) FROM wordweave.vocabulary_entries;')});
 const one=candidate(['vulnerable'],['vulnerability']);one.passage='🧵 İ: Vulnerability, vulnerabilities and VULNERABLE communities. vulnerability. Misvulnerable vulnerable2 vulnerable\u0301 are boundary sentinels. Quazzleflorp remains ordinary prose.'+filler;one.targets[0].hint_phrase='vulnerability in vulnerable communities with vulnerabilities';one.targets[0].hint_forms=['vulnerability'];
 const before=(await stats()).calls.length;const illegal=await learner.api('POST','/api/v1/generations/stream',{model_id:model,meaning_language:'en',scenario:'discussion',length:'short',entries:['vulnerability']});check('C39-01/input-blocked',illegal.status===422&&(await stats()).calls.length===before,{status:illegal.status,calls_unchanged:(await stats()).calls.length===before});
 const main=await valid(learner,'C39-03-08-11',one,{fixture:{escapeEmoji:true}});if(!main.result)throw Error('Core valid candidate failed');
 check('C39-08/exact-forms',JSON.stringify(main.result.targets[0].occurrences.map(x=>x.surface))===JSON.stringify(['Vulnerability','vulnerabilities','VULNERABLE','vulnerability']),main.result.targets[0].occurrences);
 check('C39-11/codepoints',main.result.targets.every(t=>t.occurrences.every(o=>Array.from(one.passage).slice(o.start,o.end).join('')===o.surface)),main.result.targets[0].occurrences);
 check('C39-17/public-shape',Object.keys(main.result.targets[0]).sort().join(',')==='contextual_meaning,entry,hint_blanks,hint_phrase,occurrences',Object.keys(main.result.targets[0]));
 const mainBatch=await save(learner,main);await review(learner,mainBatch,main.result,'C39-14');
 sql("INSERT INTO wordweave.vocabulary_entries OVERRIDING SYSTEM VALUE SELECT * FROM public.qa094_vocab_backup WHERE entry <> 'vulnerable'; DROP TABLE public.qa094_vocab_backup;");
 check('C39-01/restored-synthetic-vocabulary',sql('SELECT count(*) FROM wordweave.vocabulary_entries;')==='13860',{count:sql('SELECT count(*) FROM wordweave.vocabulary_entries;')});
 const s2=JSON.parse(readFileSync(join(dir,'../ai-quality-gpt-oss-090/quality-AQ090-S2.json'))).sample.partial_passage;
 const restored=candidate(['sustainable','prevalent','vulnerable','ambiguous','coherent'],['sustainable','prevalent','vulnerability','ambiguous','coherent']);restored.passage=s2;
 output('reconstructed-s2.json',{provenance:'Exact observed AQ090-S2 passage; ALL tags, meanings, hints and mappings synthesized by QA094. NOT the unobserved original candidate.',candidate:restored});
 const s2run=await valid(learner,'C39-18/AQ090-S2-reconstructed',restored,{length:'long',scenario:'news'});if(s2run.result){check('C39-08/sustainability-autoscanned',s2run.result.targets[0].occurrences.some(x=>x.surface==='sustainability'),s2run.result.targets[0].occurrences);await save(learner,s2run);}
 const ten=candidate(['alleviate','undermine','facilitate','deteriorate','perceive','sustainable','prevalent','vulnerable','ambiguous','coherent']);ten.passage=[...ten.targets].reverse().map(x=>x.source_entry).join(', ')+'.'+filler;await valid(learner,'C39-10-18/ten-interleaved',ten);
 for(const [entry,form] of [['learn','learnt'],['agree','agreed'],['die','dying'],['prefer','preferred'],["coup d'etat","coups d'etat"]])await valid(learner,'C39-04/'+entry,candidate([entry],[form]));
 for(const [entry,form] of [['vulnerable','banana'],['learn','study'],['vulnerable','vulnerabled'],['read','readed'],['child','childs'],['agree','agreeed'],['prefer','prefered'],['vulnerable','vulnerableness']])await invalid(learner,'C39-05/'+form,candidate([entry],[form]));
 const simple=candidate(['vulnerable'],['vulnerability']);
 for(const [name,mutate] of [['missing',x=>delete x.targets[0].passage_forms],['empty',x=>x.targets[0].passage_forms=[]],['null',x=>x.targets[0].hint_forms=null],['number',x=>x.targets[0].passage_forms=5],['null-item',x=>x.targets[0].passage_forms=[null]],['unknown',x=>x.targets[0].proof='trust me'],['case-key',x=>{x.targets[0].Passage_Forms=x.targets[0].passage_forms;delete x.targets[0].passage_forms;}],['over-limit',x=>x.targets[0].passage_forms=Array(129).fill('vulnerability')]]){const c=structuredClone(simple);mutate(c);await invalid(learner,'C39-07/'+name,c);}
 await invalid(learner,'C39-07/duplicate-key',simple,{raw:JSON.stringify(simple).replace('"tags":','"tags":["First"],"tags":')});
 await invalid(learner,'C39-07/trailing',simple,{raw:JSON.stringify(simple)+'{}'});
 const dup=structuredClone(simple);dup.targets[0].passage_forms=['vulnerability','VULNERABILITY','vulnerability'];await valid(learner,'C39-08/case-dedup',dup);
 const wrong=structuredClone(simple);wrong.targets[0].passage_forms.push('vulnerabilities');await invalid(learner,'C39-09/absent-other-form',wrong);
 const injected=structuredClone(simple);injected.targets[0].passage_forms.push('banana');await invalid(learner,'C39-09/one-bad-among-good',injected);
 await invalid(learner,'C39-10/shared-spans',candidate(['learn','learning'],['learning','learning']));
 const shifted=structuredClone(ten);shifted.targets.reverse();await invalid(learner,'C39-10/resource-order',shifted,{}, {entries:ten.targets.map(x=>x.source_entry)});
 const huge=structuredClone(simple);huge.passage=('vulnerability. '+('Ordinary discussion continues calmly. '.repeat(4000))).trimEnd();await valid(learner,'C39-18/large-xlong',huge,{length:'xlong',fixture:{chunks:[16384]}});
 // Visitor handoff uses the validated snapshot with no second provider call.
 const visitor=await client();const guestRun=await valid(visitor,'C39-14/visitor',simple);const claim=await visitor.api('POST',`/api/v1/generations/${guestRun.started.run_id}/visitor-claim`,{}, {'x-generation-token':guestRun.started.generation_token});
 const count=(await stats()).calls.length;const recipient=await client('qa094_claim');const cp='/api/v1/visitor-claims/consume',ch={'x-claim-token':claim.body.data.claim_token};const ca=await recipient.api('POST',cp,{},ch),cb=await recipient.api('POST',cp,{},ch);
 check('C39-14/claim-idempotent',ca.body.data?.batch_id===cb.body.data?.batch_id&&Boolean(ca.body.data?.batch_id)&&(await stats()).calls.length===count,{first:ca.status,second:cb.status,no_call:(await stats()).calls.length===count});
 if(ca.body.data?.batch_id)await review(recipient,ca.body.data.batch_id,guestRun.result,'C39-14/claimed-review');
 // Actual old artifact, started ONLY inside the isolated cluster and only when no requests are active.
 startOld();await waitReady('http://127.0.0.1:6196/health/ready');
 const v2=await client();v2.base='http://127.0.0.1:6196';let login=await v2.api('POST','/api/v1/auth/login',{username:'qa094_learner',password:pass,browser_ui_locale:'en-US'});v2.csrf=login.body.data.csrf_token;
 const legacyDetail=await v2.api('GET',`/api/v1/me/batches/${mainBatch}`);check('C39-15/v3-read-old-image',legacyDetail.body.data?.batch?.passage===main.result.passage&&JSON.stringify(legacyDetail.body.data?.batch?.targets)===JSON.stringify(main.result.targets),{status:legacyDetail.status,positions_equal:JSON.stringify(legacyDetail.body.data?.batch?.targets)===JSON.stringify(main.result.targets)});
 await review(v2,mainBatch,main.result,'C39-15/old-image-review');
 const oldCandidate=candidate(['learn'],['learned']);oldCandidate.targets.forEach(x=>{delete x.passage_forms;delete x.hint_forms;});const oldRun=await valid(v2,'C39-15/v2-draft',oldCandidate);if(oldRun.result){const imported=await save(learner,oldRun);await review(learner,imported,oldRun.result,'C39-15/v2-draft-v3-save');}
 const fresh=await valid(learner,'C39-15/v3-draft',simple);if(fresh.result){const imported=await save(v2,fresh);await review(v2,imported,fresh.result,'C39-15/v3-draft-v2-save');}
 output('browser-input.json',{model,batch_id:mainBatch,result:main.result,username:'qa094_learner'});
 output('provider-observations.json',await stats());
 const logs=docker(['logs',prefix+'-backend']);output('log-check.json',{contains_candidate_fields:/passage_forms|hint_forms|source_entry|RelationProof/.test(logs),contains_fixture_prose:logs.includes('Quazzleflorp')||logs.includes('vulnerableness'),contains_synthetic_key:logs.includes('qa094-synthetic-never-real'),mapping_reasons:logs.split('\n').filter(x=>x.includes('mapping_')||x.includes('passage_occurrence_collision')).map(x=>JSON.parse(x))});
 check('C39-17/log-redaction',!(/passage_forms|hint_forms|Quazzleflorp|vulnerableness|qa094-synthetic-never-real/.test(logs)),{safe:true});
 const schema=(await stats()).calls[0].schema?.schema?.properties?.targets?.items;check('C39-07/provider-schema',schema?.additionalProperties===false&&schema?.required?.includes('passage_forms')&&schema?.required?.includes('hint_forms'),schema);
 for(const c of [admin,learner,visitor,recipient,v2])await c.r.dispose();
}
export {checks,traces,check,stats,client,candidate,valid,invalid,save,review,cleanse};
export const setModel=id=>model=id;
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await run();}catch(e){checks.push({id:'harness-completion',status:'ERROR',error:String(e),stack:e.stack});console.error(e);process.exitCode=1;}
 finally{output('api-results.json',{date:new Date().toISOString(),agent:'qa-quinn',counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0}),checks,traces});console.log(JSON.stringify({counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0})}));}
}
