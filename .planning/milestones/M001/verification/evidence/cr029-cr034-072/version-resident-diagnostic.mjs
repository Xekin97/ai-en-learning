import{execFileSync}from'node:child_process';import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,login,api,ready,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('version-resident-diagnostic'),network='ww-qa-072';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim(),env=obj=>Object.entries(obj).flatMap(([k,v])=>['-e',k+'='+v]);
const oldfront='sha256:68470b6ea1e94dd7e83ed6028e28116bb0ef3abbe2d84a3a67f862f341e29804';
const oldback=docker(['image','inspect','wordweave_uat-backend:latest','--format','{{.Id}}']);
if(!oldback.startsWith('sha256:b704e386cafd'))throw Error('Unexpected baseline backend');
const common=JSON.parse(docker(['inspect','ww-qa-072-backend']))[0].Config.Env.flatMap(s=>['-e',s]);

async function pair(front,back){
 const own=JSON.parse(docker(['inspect','ww-qa-072-nginx']))[0];if(own.Config.Labels['wordweave.qa']!=='072')throw Error('Not owned');
 docker(['stop','ww-qa-072-nginx']);docker(['rm','ww-qa-072-nginx']);
 docker(['run','-d','--name','ww-qa-072-nginx','--network',network+'-edge','--label','wordweave.qa=072','-p','127.0.0.1:6101:8080',...env({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:back,BACKEND_PORT:'8080',FRONTEND_HOST:front,FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
 docker(['network','connect',network,'ww-qa-072-nginx']);docker(['restart','ww-qa-072-nginx']);
 for(let i=0;i<50;i++){try{if((await fetch(origin+'/api/v1/bootstrap')).ok&&(await fetch(origin+'/')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('pair not ready');
}
const b=await chromium.launch();try{
 await pair('ww-qa-072-oldfront-old','ww-qa-072-oldbackend');
 const c=await b.newContext();c.setDefaultTimeout(10000);const token=await login(c,'qa072_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage(),networkEvents=[];
 p.on('response',r=>{if(r.request().resourceType()==='document'||r.url().includes('/api/v1/admin/users/'))networkEvents.push({url:r.url(),status:r.status(),type:r.request().resourceType()});});
 await p.goto(origin+'/admin/users?q=qa072_other');await ready(p);await p.locator('.admin-user-result a').first().click();await expect(p.locator('.definition-list dd')).toHaveCount(4);
 await pair('ww-qa-072-frontend','ww-qa-072-backend');
 await p.locator('.admin-user-detail-toolbar a').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);await p.locator('.admin-user-result a').first().click();
 await expect(p).toHaveURL(u=>u.pathname==='/admin/users/'+f.users.qa072_other);
 await p.waitForTimeout(300);
 const before={url:p.url(),text:await p.locator('main').innerText(),details:await p.locator('.definition-list dd').allInnerTexts()};
 out.record('old resident observed projection must not imply new release',before.details.length===0||before.details.length===4,true);
 console.log(JSON.stringify({before}));
 await p.reload();await ready(p);await p.waitForTimeout(300);const after={url:p.url(),text:await p.locator('main').innerText(),details:await p.locator('.definition-list dd').allInnerTexts()};console.log(JSON.stringify({after,networkEvents}));
 out.record('explicit reload has v1.4 detail',after.details.length,4);
 await p.screenshot({path:join(dir,'screenshots','resident-reload-diagnostic.png')});
 const fresh=await b.newContext();await login(fresh,'qa072_admin');const p2=await fresh.newPage();await p2.goto(origin+'/admin/users/'+f.users.qa072_other);await ready(p2);out.record('fresh paired detail',await p2.locator('.definition-list dd').count(),4);
 await c.close();await fresh.close();
}catch(e){out.error('resident diagnostic',e);}finally{await pair('ww-qa-072-frontend','ww-qa-072-backend');await b.close();out.save();}

