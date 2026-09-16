import{request,api,origin,password,recorder}from'./lib.mjs';
const out=recorder('seed'),c=await request.newContext();
const b=await(await c.get(origin+'/api/v1/bootstrap')).json();
const r=await api({request:c},'POST','/api/v1/auth/register',b.data.csrf_token,{username:'qa081_diag',password,password_confirmation:password,ui_locale:'en-US'});
out.record('independent diagnostic learner registered',r.status,201);await c.dispose();out.save();

