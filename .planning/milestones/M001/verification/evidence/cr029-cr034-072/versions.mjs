import{execFileSync}from'node:child_process';import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,login,api,ready,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('versions'),network='ww-qa-072';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),env=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
const oldfront='sha256:68470b6ea1e94dd7e83ed6028e28116bb0ef3abbe2d84a3a67f862f341e29804';
const oldback=docker(['image','inspect','wordweave_uat-backend:latest','--format','{{.Id}}']);
if(!oldback.startsWith('sha256:b704e386cafd'))throw Error('Unexpected baseline backend');
const common=JSON.parse(docker(['inspect','ww-qa-072-backend']))[0].Config.Env.flatMap(s=>['-e',s]);
docker(['run','-d','--name','ww-qa-072-oldbackend','--network',network,'--label','wordweave.qa=072',...common,oldback]);
for(const[name,img,backend]of[['oldfront-new',oldfront,'ww-qa-072-backend'],['oldfront-old',oldfront,'ww-qa-072-oldbackend'],['newfront-old','sha256:1326b841346634992f1d6a9228e909d39e987efc2f04e986d446a2573a0ff5e7','ww-qa-072-oldbackend']])docker(['run','-d','--name','ww-qa-072-'+name,'--network',network,'--label','wordweave.qa=072','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://'+backend+':8080',img]);
async function pair(front,back){
 const own=JSON.parse(docker(['inspect','ww-qa-072-nginx']))[0];if(own.Config.Labels['wordweave.qa']!=='072')throw Error('Not owned');
 docker(['stop','ww-qa-072-nginx']);docker(['rm','ww-qa-072-nginx']);
 docker(['run','-d','--name','ww-qa-072-nginx','--network',network+'-edge','--label','wordweave.qa=072','-p','127.0.0.1:6101:8080',...env({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:back,BACKEND_PORT:'8080',FRONTEND_HOST:front,FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
 docker(['network','connect',network,'ww-qa-072-nginx']);docker(['restart','ww-qa-072-nginx']);
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/api/v1/bootstrap')).ok&&(await fetch(origin+'/')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('pair not ready');
}
const b=await chromium.launch();
try{
 for(const[name,front,back,error]of[['old-new','ww-qa-072-oldfront-new','ww-qa-072-backend',true],['new-old','ww-qa-072-newfront-old','ww-qa-072-oldbackend',true],['old-old rollback','ww-qa-072-oldfront-old','ww-qa-072-oldbackend',false],['new-new','ww-qa-072-frontend','ww-qa-072-backend',false]]){
 await pair(front,back);const c=await b.newContext();c.setDefaultTimeout(8000);const token=await login(c,'qa072_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage();
 try{
 await p.goto(origin+'/admin/users/'+f.users.qa072_other);await ready(p);
 if(error){await expect(p.locator('.app-error')).toBeVisible();out.record(name+' SSR fails closed',await p.locator('.definition-list dd').count(),0);}
 else{await expect(p.locator('.definition-list dd')).toHaveCount(4);out.record(name+' paired SSR',true,true);}
 await p.goto(origin+'/admin/users?q=qa072_other');await ready(p);await p.locator('.admin-user-result a').first().click();
 if(error){await expect(p.locator('.app-error')).toBeVisible();out.record(name+' client fails closed',await p.locator('.definition-list dd').count(),0);}
 else{await expect(p.locator('.definition-list dd')).toHaveCount(4);out.record(name+' paired client',true,true);}
 }catch(e){out.error(name,e);}finally{await c.close();}
 }
 await pair('ww-qa-072-oldfront-old','ww-qa-072-oldbackend');const c=await b.newContext();const token=await login(c,'qa072_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage();
 await p.goto(origin+'/admin/users?q=qa072_other');await ready(p);await p.locator('.admin-user-result a').first().click();await expect(p.locator('.definition-list dd')).toHaveCount(4);
 await pair('ww-qa-072-frontend','ww-qa-072-backend');
 await p.locator('.admin-user-detail-toolbar a').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);await p.locator('.admin-user-result a').first().click();out.record('resident old tab retains old cached detail until explicit refresh',await p.locator('.definition-list dd').count(),4);
 await p.reload();await ready(p);await expect(p.locator('.definition-list dd')).toHaveCount(4);out.record('resident tab refresh recovers new pair',true,true);await c.close();
}catch(e){out.error('version execution',e);}finally{await pair('ww-qa-072-frontend','ww-qa-072-backend');await b.close();out.save();}


