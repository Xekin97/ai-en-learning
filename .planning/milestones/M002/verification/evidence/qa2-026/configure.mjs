import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { existingConfiguration } from './source-config.mjs';
const {request}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const out=new URL('./',import.meta.url),origin='http://127.0.0.1:3302';
const work=readFileSync('/tmp/wordweave-m002-integrated-current','utf8');
const source=existingConfiguration(), steps=[];
const env=JSON.parse(readFileSync(work+'/env.json'));
if(env.OPENROUTER_BASE_URL!=='http://127.0.0.1:38084')throw Error('Already switched or unexpected environment');
const client=await request.newContext({timeout:180000});
async function api(path,method='GET',data){
  const headers={origin,'sec-fetch-site':'same-origin'};
  if(method!=='GET')headers['x-csrf-token']=(await (await client.get(origin+'/api/v1/bootstrap')).json()).data.csrf_token;
  const response=await client.fetch(origin+'/api/v1'+path,{method,data,headers});
  const json=response.status()===204?null:await response.json();
  if(!response.ok())throw Error(path+' HTTP '+response.status()+' '+(json?.code??''));
  return json?.data;
}
try{
  await api('/auth/login','POST',{username:'admin_review',password:'ReviewLocal2026!',browser_ui_locale:'zh-CN'});
  const before=await api('/admin/models');
  const mock=before.items.find(m=>m.openrouter_model_id==='provider/integration');
  if(!mock)throw Error('Expected local mock model not found');
  const backup=execFileSync('/opt/homebrew/opt/postgresql@18/bin/pg_dump',[env.APP_DATABASE_URL,'--format=custom','--no-owner','--no-acl','--table=wordweave.openrouter_credentials','--table=wordweave.ai_models','--table=wordweave.group_models'],{stdio:['ignore','pipe','pipe']});
  writeFileSync(work+'/real-provider-backup/configuration.dump',backup,{mode:0o600});
  await api('/admin/models/'+mock.id+'/disable','POST',{expected_revision:before.revision});
  steps.push({step:'disable-local-model',result:'PASS'});
  const runtime=JSON.parse(readFileSync(work+'/processes.json'));
  const backend=runtime.processes.find(p=>p.name==='backend');
  if(!execFileSync('ps',['-p',String(backend.pid),'-o','command='],{encoding:'utf8'}).includes(backend.identity))throw Error('Backend identity changed');
  env.OPENROUTER_BASE_URL=source.endpoint;
  writeFileSync(work+'/env.json',JSON.stringify(env),{mode:0o600});chmodSync(work+'/env.json',0o600);
  process.kill(backend.pid,'SIGTERM');
  for(let i=0;i<100;i++){
    let alive=true;try{process.kill(backend.pid,0);}catch{alive=false;}
    if(!alive)break;
    if(i===99)throw Error('Old backend failed to stop');
    await new Promise(r=>setTimeout(r,100));
  }
  // Existing binary and original environment/secrets are retained; only provider URL changes.
  const {openSync,closeSync}=await import('node:fs');const fd=openSync(work+'/backend.log','a');
  const child=spawn(work+'/wordweave',[],{cwd:process.cwd(),env,detached:true,stdio:['ignore',fd,fd]});child.unref();closeSync(fd);
  backend.pid=child.pid;runtime.mode='production frontend + real Go/Postgres + direct OpenRouter';
  delete runtime.real_provider_calls;
  writeFileSync(work+'/processes.json',JSON.stringify(runtime,null,2)+'\n');
  for(let i=0;i<100;i++){
    try{await api('/bootstrap');break;}catch{if(i===99)throw Error('Backend health failed');await new Promise(r=>setTimeout(r,150));}
  }
  const cred=await api('/admin/openrouter-credential');
  await api('/admin/openrouter-credential','PUT',{api_key:source.key,confirmed:true,expected_revision:cred.revision});
  steps.push({step:'real-credential-and-endpoint',result:'PASS',endpoint:source.endpoint});
  const models=[...source.models].sort((a,b)=>Number(b.provider_model==='minimax/minimax-m3')-Number(a.provider_model==='minimax/minimax-m3'));
  const enabled=[];
  for(let index=0;index<models.length;index++){
    const model=models[index];let saved;
    if(index===0){
      const current=await api('/admin/models/'+mock.id);
      saved=await api('/admin/models/'+mock.id,'PATCH',{display_name:model.name,description:model.description,openrouter_model_id:model.provider_model,expected_revision:current.revision});
    }else saved=await api('/admin/models','POST',{display_name:model.name,description:model.description,openrouter_model_id:model.provider_model});
    const modelStep={step:'enable-real-model',provider_model:model.provider_model,id:saved.model.id,compatibility_probe:true};
    // One normal model-enable probe each, no learner generation or evaluation batch.
    try{await api('/admin/models/'+saved.model.id+'/enable','POST',{expected_revision:saved.revision});modelStep.result='PASS';enabled.push(saved.model.id);}
    catch(error){modelStep.result='FAIL';modelStep.error=error.message;}
    steps.push(modelStep);writeFileSync(new URL('configuration-progress.json',out),JSON.stringify({steps},null,2)+'\n');
    console.log(JSON.stringify(modelStep));
  }
  if(!enabled.length)throw Error('No real model passed the built-in compatibility check');
  const groups=await api('/admin/groups');
  for(const group of groups.items.filter(g=>g.models.some(m=>m.id===mock.id))){
    const current=await api('/admin/groups');const g=current.items.find(x=>x.code===group.code);
    await api('/admin/groups/'+g.code,'PUT',{expected_revision:current.revision,priority:g.priority,max_entries:g.max_entries,rolling_24h_limit:g.rolling_24h_limit,
      allowed_lengths:g.allowed_lengths,model_ids:[...new Set([...g.models.map(m=>m.id),...enabled])]});
  }
  const after={models:await api('/admin/models'),groups:await api('/admin/groups'),credentialConfigured:(await api('/admin/openrouter-credential')).credential.configured};
  writeFileSync(new URL('configuration-result.json',out),JSON.stringify({result:steps.some(s=>s.result==='FAIL')?'PARTIAL':'PASS',steps,after,learnerGenerationCalls:0,qualityBatch:false},null,2)+'\n');
  console.log('Configuration complete; no learner generation or quality batch executed.');
}catch(error){
  writeFileSync(new URL('configuration-failure.json',out),JSON.stringify({error:error.message,steps},null,2)+'\n');
  console.error(error.message);process.exitCode=1;
}finally{await client.dispose();}
