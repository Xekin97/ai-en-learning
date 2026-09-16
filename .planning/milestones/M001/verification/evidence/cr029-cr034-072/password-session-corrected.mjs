import{readFileSync}from'node:fs';import{join}from'node:path';
import{chromium,expect,dir,origin,ready,login,api,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'range-fixtures.json'))),out=recorder('password-session-corrected'),b=await chromium.launch();
try{
 const admin=await b.newContext(),token=await login(admin,'qa072_admin');
 const contexts=[];
 for(let n=0;n<2;n++){const c=await b.newContext(),bs=await(await c.request.get(origin+'/api/v1/bootstrap')).json();const r=await c.request.post(origin+'/api/v1/auth/login',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':bs.data.csrf_token},data:{username:f.users.password.username,password:'Qa072ChangedOnly!',browser_ui_locale:'en-US'}});out.record('initial login '+n,r.status(),200);out.record('protected account before reset '+n,(await c.request.get(origin+'/api/v1/me/account')).status(),200);contexts.push(c);}
 const reset=await api(admin,'PUT','/api/v1/admin/users/'+f.users.password.id+'/password',token,{new_password:'Qa072SecondResetOnly!',new_password_confirmation:'Qa072SecondResetOnly!',confirmed:true});out.record('reset204',reset.status,204);
 for(const[c,i]of contexts.map((c,i)=>[c,i])){out.record('protected old session401 '+i,(await c.request.get(origin+'/api/v1/me/account')).status(),401);await c.close();}await admin.close();
}catch(e){out.error('password corrected endpoint execution',e);}finally{await b.close();out.save();}

