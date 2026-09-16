import{request,origin,password,api,recorder,dir}from'./lib.mjs';import{writeFileSync}from'node:fs';import{join}from'node:path';
const out=recorder('account-api'),responses=[],contexts=[];const context=async()=>{const r=await request.newContext();contexts.push(r);return{request:r};};
const bootstrap=async c=>(await(await c.request.get(origin+'/api/v1/bootstrap')).json()).data;
const visitor=await context(),current=await context(),other=await context(),admin=await context(),fresh=await context();const body={current_password:password,new_password:'Qa081ApiUpdatedOnly!',new_password_confirmation:'Qa081ApiUpdatedOnly!'},user='qa081_api_contract';
async function call(id,c,method,path,token,data,expected){const r=await api(c,method,path,token,data);out.record(id+' status',r.status,expected);out.record(id+' no-store',r.headers['cache-control'],'no-store');responses.push({id,status:r.status,headers:{'content-type':r.headers['content-type'],'cache-control':r.headers['cache-control']},problem:r.status>=400?r.body:null});return r;}
try{
 await call('visitor account',visitor,'GET','/api/v1/me/account',undefined,undefined,401);await call('visitor password',visitor,'PUT','/api/v1/me/password',(await bootstrap(visitor)).csrf_token,body,401);
 await call('register fixture',current,'POST','/api/v1/auth/register',(await bootstrap(current)).csrf_token,{username:user,password,password_confirmation:password,ui_locale:'en-US'},201);
 await call('second session',other,'POST','/api/v1/auth/login',(await bootstrap(other)).csrf_token,{username:user,password,browser_ui_locale:'en-US'},200);
 await call('admin login',admin,'POST','/api/v1/auth/login',(await bootstrap(admin)).csrf_token,{username:'qa081_admin',password,browser_ui_locale:'en-US'},200);
 await call('admin password forbidden',admin,'PUT','/api/v1/me/password',(await bootstrap(admin)).csrf_token,body,403);
 const token=(await bootstrap(current)).csrf_token;
 await call('missing csrf',current,'PUT','/api/v1/me/password',undefined,body,403);
 await call('unknown field',current,'PUT','/api/v1/me/password',token,{...body,role:'admin'},400);
 await call('mismatch',current,'PUT','/api/v1/me/password',token,{...body,new_password_confirmation:'Mismatch081Only!'},422);
 await call('too short',current,'PUT','/api/v1/me/password',token,{...body,new_password:'short',new_password_confirmation:'short'},422);
 const invalid=await call('wrong current',current,'PUT','/api/v1/me/password',token,{...body,current_password:'Incorrect081Only!'},422);
 out.record('generic current field failure no credentials echoed',JSON.stringify(invalid.body).includes(password)||JSON.stringify(invalid.body).includes('Incorrect081Only!'),false);
 await call('all failed requests preserve other session',other,'GET','/api/v1/me/account',undefined,undefined,200);
 const response=await current.request.put(origin+'/api/v1/me/password',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':token},data:body});
 out.record('success204',response.status(),204);out.record('success empty response bytes',(await response.body()).length,0);out.record('success no content type',response.headers()['content-type']??null,null);out.record('success no-store',response.headers()['cache-control'],'no-store');
 await call('current retained',current,'GET','/api/v1/me/account',undefined,undefined,200);await call('other revoked',other,'GET','/api/v1/me/account',undefined,undefined,401);
 await call('old secret invalid',fresh,'POST','/api/v1/auth/login',(await bootstrap(fresh)).csrf_token,{username:user,password,browser_ui_locale:'en-US'},401);
 await call('new secret accepted',fresh,'POST','/api/v1/auth/login',(await bootstrap(fresh)).csrf_token,{username:user,password:body.new_password,browser_ui_locale:'en-US'},200);
}catch(e){out.error('API execution',e);}finally{for(const c of contexts)await c.dispose();}
writeFileSync(join(dir,'account-api-responses.json'),JSON.stringify(responses,null,2),{flag:'wx'});out.save();

