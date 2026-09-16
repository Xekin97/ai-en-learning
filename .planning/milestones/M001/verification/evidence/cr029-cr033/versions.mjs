import{execFileSync}from'node:child_process';import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,login,api,ready,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('versions'),network='ww-qa-065';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),env=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
const oldfront='sha256:68470b6ea1e94dd7e83ed6028e28116bb0ef3abbe2d84a3a67f862f341e29804';
const oldback=docker(['image','inspect','wordweave_uat-backend:latest','--format','{{.Id}}']);
if(!oldback.startsWith('sha256:b704e386cafd'))throw Error('Unexpected baseline backend');
const common=JSON.parse(docker(['inspect','ww-qa-065-backend']))[0].Config.Env.flatMap(s=>['-e',s]);
docker(['run','-d','--name','ww-qa-065-oldbackend','--network',network,'--label','wordweave.qa=065',...common,oldback]);
for(const[name,img,backend]of[['oldfront-new','wordweave-frontend:cr028-final','ww-qa-065-backend'],['oldfront-old',oldfront,'ww-qa-065-oldbackend'],['newfront-old','wordweave-frontend:cr029-cr033-check','ww-qa-065-oldbackend']])docker(['run','-d','--name','ww-qa-065-'+name,'--network',network,'--label','wordweave.qa=065','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://'+backend+':8080',img]);
async function pair(front,back){
 const own=JSON.parse(docker(['inspect','ww-qa-065-nginx']))[0];if(own.Config.Labels['wordweave.qa']!=='065')throw Error('Not owned');
 docker(['stop','ww-qa-065-nginx']);docker(['rm','ww-qa-065-nginx']);
 docker(['run','-d','--name','ww-qa-065-nginx','--network',network,'--label','wordweave.qa=065','-p','127.0.0.1:6101:8080',...env({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:back,BACKEND_PORT:'8080',FRONTEND_HOST:front,FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/api/v1/bootstrap')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('pair not ready');
}
const b=await chromium.launch();
try{
 for(const[name,front,back,error]of[['old-new','ww-qa-065-oldfront-new','ww-qa-065-backend',true],['new-old','ww-qa-065-newfront-old','ww-qa-065-oldbackend',true],['old-old rollback','ww-qa-065-oldfront-old','ww-qa-065-oldbackend',false],['new-new','ww-qa-065-frontend','ww-qa-065-backend',false]]){
 await pair(front,back);const c=await b.newContext();c.setDefaultTimeout(8000);const token=await login(c,'qa065_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage();
 try{
 await p.goto(origin+'/admin/users/'+f.users.qa065_other);await ready(p);
 if(error){await expect(p.locator('.app-error')).toBeVisible();out.record(name+' SSR fails closed',await p.locator('.definition-list dd').count(),0);}
 else{await expect(p.locator('.definition-list dd')).toHaveCount(4);out.record(name+' paired SSR',true,true);}
 await p.goto(origin+'/admin/users?q=qa065_other');await ready(p);await p.locator('.admin-user-result a').first().click();
 if(error){await expect(p.locator('.app-error')).toBeVisible();out.record(name+' client fails closed',await p.locator('.definition-list dd').count(),0);}
 else{await expect(p.locator('.definition-list dd')).toHaveCount(4);out.record(name+' paired client',true,true);}
 }catch(e){out.error(name,e);}finally{await c.close();}
 }
 await pair('ww-qa-065-oldfront-old','ww-qa-065-oldbackend');const c=await b.newContext();const token=await login(c,'qa065_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage();
 await p.goto(origin+'/admin/users?q=qa065_other');await ready(p);await p.locator('.admin-user-result a').first().click();await expect(p.locator('.definition-list dd')).toHaveCount(4);
 await pair('ww-qa-065-frontend','ww-qa-065-backend');
 await p.locator('.admin-user-detail-toolbar a').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);await p.locator('.admin-user-result a').first().click();await expect(p.locator('.app-error')).toBeVisible();out.record('resident old tab does not accept v1.4',await p.locator('.definition-list dd').count(),0);
 await p.reload();await ready(p);await expect(p.locator('.definition-list dd')).toHaveCount(4);out.record('resident tab refresh recovers new pair',true,true);await c.close();
}catch(e){out.error('version execution',e);}finally{await pair('ww-qa-065-frontend','ww-qa-065-backend');await b.close();out.save();}

