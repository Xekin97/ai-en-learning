import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{request,dir,login,api,sql,quote,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('final-checks'),c=await request.newContext(),wrapped={request:c,addCookies:async()=>{}};
try{
 const token=await login(wrapped,'qa065_admin'),before=sql('SELECT role,group_code FROM wordweave.accounts WHERE id='+quote(f.users.qa065_admin));
 const change=await api(wrapped,'PUT','/api/v1/admin/users/'+f.users.qa065_admin+'/group',token,{group_code:'pro',confirmed:true});
 out.record('admin target is not a changeable learner',change.status,404);out.record('admin role unchanged',sql('SELECT role,group_code FROM wordweave.accounts WHERE id='+quote(f.users.qa065_admin)),before);
 const b=await api(wrapped,'GET','/api/v1/admin/users/'+f.users.qa065_other);out.record('final fixed new pair quota',b.body.data.user.generation_quota,{kind:'limited',remaining:0});
 out.record('no provider credential',sql('SELECT count(*) FROM wordweave.openrouter_credentials'),'0');
 writeFileSync(join(dir,'pre-cleanup-data.json'),JSON.stringify({accountCount:Number(sql('SELECT count(*) FROM wordweave.accounts')),batchCount:Number(sql('SELECT count(*) FROM wordweave.learning_batches')),reviewSessionCount:Number(sql('SELECT count(*) FROM wordweave.review_sessions')),syntheticRunCount:Number(sql('SELECT count(*) FROM wordweave.generation_runs')),providerCredentials:Number(sql('SELECT count(*) FROM wordweave.openrouter_credentials')),providerBaseURL:'disabled local port 9',actualGenerationHTTPCalls:0},null,2));
}finally{await c.dispose();out.save();}

