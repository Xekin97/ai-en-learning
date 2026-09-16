import {checks,traces,check,client,candidate,valid,setModel,stats} from './suite.mjs';
import {sql,quote,output,docker,prefix,origin,waitReady} from './setup.mjs';
setModel(sql('SELECT id FROM wordweave.ai_models LIMIT 1;'));
try {
 const c=await client('qa094_learner',true);const r=await valid(c,'C39-15/same-v3-restart-control',candidate(['vulnerable'],['vulnerability']));
 const query=`SELECT json_build_object('drafts',count(*),'payload_md5',min(md5(payload::text)),'expires_at',min(expires_at)) FROM wordweave.generation_drafts WHERE run_id=${quote(r.started.run_id)};`;
 const before=JSON.parse(sql(query));const calls=(await stats()).calls.length;
 if(sql("SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active';")!=='0')throw Error('Refuse restart with active QA generation');
 if(docker(['inspect','--format','{{index .Config.Labels "wordweave.qa"}}',prefix+'-backend'])!=='cr039-094')throw Error('Wrong restart target');
 docker(['restart',prefix+'-backend']);await waitReady(origin+'/api/v1/bootstrap');
 const saved=await c.api('POST',`/api/v1/generations/${r.started.run_id}/save`,{}, {'x-generation-token':r.started.generation_token});const after=JSON.parse(sql(query));
 check('C39-15/valid-draft-after-same-image-restart',[200,201].includes(saved.status),{status:saved.status,draft_before:before,draft_after:after});
 check('C39-16/restart-no-provider-call',(await stats()).calls.length===calls,{calls_before:calls,calls_after:(await stats()).calls.length});
 check('C39-15/stored-draft-intact',before.drafts===1&&before.payload_md5===after.payload_md5,{equal:before.payload_md5===after.payload_md5});
 output('restart-observation.json',{before,after,http_status:saved.status,problem:saved.body,run_id:r.started.run_id,token_recorded:false,container:prefix+'-backend',actual_uat_changed:false});
 await c.r.dispose();
} catch(e){checks.push({id:'restart-harness',status:'ERROR',error:String(e)});process.exitCode=1;}
finally{output('restart-results.json',{date:new Date().toISOString(),checks,traces,counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0})});console.log(JSON.stringify({checks}));}
