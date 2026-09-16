import { chromium, expect } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),origin='http://localhost:6001';
const checks=[],errors=[],requests=[],contexts=[];
const record=(id,actual,expected)=>checks.push({id,status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL',actual,expected});
const ready=async p=>{await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});};
const noOverflow=async(p,id)=>record(id,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
const context=async(browser,locale,width)=>{const c=await browser.newContext({locale,viewport:{width,height:1000}});contexts.push(c);c.setDefaultTimeout(15000);await c.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));c.on('request',r=>{if(r.url().startsWith(origin+'/api/'))requests.push({method:r.method(),path:new URL(r.url()).pathname});});return c;};
const get=async(c,path)=>{const r=await c.request.get(origin+path);if(r.status()!==200)throw Error('GET '+path+' returned '+r.status());return(await r.json()).data;};
async function loginUI(c,username,password){
 const p=await c.newPage();await p.goto(origin+'/login');await ready(p);
 await p.locator('input[autocomplete="username"]').fill(username);await p.locator('input[autocomplete="current-password"]').fill(password);
 const response=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/v1/auth/login'));
 await p.locator('button[type="submit"]').click();const r=await response;record(username+' login',r.status(),200);if(r.status()!==200)throw Error('Existing local test credentials failed: '+username);
 await p.waitForURL(url=>url.pathname!=='/login');await ready(p);return p;
}
async function logout(c){
 const bootstrap=await get(c,'/api/v1/bootstrap');
 const r=await c.request.post(origin+'/api/v1/auth/logout',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':bootstrap.csrf_token},data:{}});
 record('close own test session',r.status(),204);
}
const sql=q=>execFileSync('docker',['exec','wordweave_uat-postgres-1','psql','-U','postgres','-d','wordweave','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
const counts=()=>JSON.parse(sql("SELECT json_build_object('accounts',(SELECT count(*) FROM wordweave.accounts),'batches',(SELECT count(*) FROM wordweave.learning_batches),'models',(SELECT count(*) FROM wordweave.ai_models),'runs',(SELECT count(*) FROM wordweave.generation_runs),'active_runs',(SELECT count(*) FROM wordweave.generation_runs WHERE call_status='active'),'migration_count',(SELECT count(*) FROM wordweave.schema_migrations),'latest_version',(SELECT max(version) FROM wordweave.schema_migrations));"));
const deployment=JSON.parse(readFileSync(join(dir,'deployment.json'))),before=counts();
const browser=await chromium.launch();
try{
 for(const locale of ['en-US','zh-CN'])for(const width of [390,1440]){
  const c=await context(browser,locale,width),p=await c.newPage(),id=locale+' '+width;
  const home=await p.goto(origin+'/');record(id+' home HTTP',home.status(),200);await ready(p);
  record(id+' localized brand',await p.locator('.brand').first().innerText(),locale==='zh-CN'?'词涟':'WordWeave');await noOverflow(p,id+' home fits');
  for(const route of ['/review','/library']){
   await p.goto(origin+route);await ready(p);await expect(p.locator('.auth-gate')).toBeVisible();
   record(id+route+' stays on intent route',new URL(p.url()).pathname,route);
   record(id+route+' sign in and register',await p.locator('.auth-gate .inline-actions a').count(),2);
   const links=await p.locator('.auth-gate .inline-actions a').evaluateAll(a=>a.map(x=>({path:new URL(x.href).pathname,redirect:new URL(x.href).searchParams.get('redirect')})));
   record(id+route+' correct return intent',links,[{path:'/login',redirect:route},{path:'/register',redirect:route}]);
   record(id+route+' no failure',await p.locator('.app-error').count(),0);await noOverflow(p,id+route+' fits');
  }
  if(locale==='en-US')await p.screenshot({path:join(dir,'guest-library-'+width+'.png'),fullPage:true});
  await c.close();
 }
 const ac=await context(browser,'en-US',1440),ap=await loginUI(ac,'uat_admin','UatAdminPass6000!');
 const ab=await get(ac,'/api/v1/bootstrap'),al=ab.ui_locale||'en-US',labels=JSON.parse(readFileSync(join(root,'frontend/i18n/locales/'+al+'.json')));
 for(const route of ['/admin/models','/admin/plans','/admin/users']){
  await ap.goto(origin+route);await ready(ap);await expect(ap.locator('.page-title')).toBeVisible();
  record(route+' heading',await ap.locator('.page-heading .eyebrow').innerText(),labels.admin.title);
  record(route+' copy',await ap.locator('.page-description').innerText(),labels.admin[route.split('/').at(-1)+'Copy']);
  record(route+' no failure',await ap.locator('.app-error').count(),0);await noOverflow(ap,route+' fits');
 }
 const groups=(await get(ac,'/api/v1/admin/groups')).items;
 await ap.goto(origin+'/admin/plans');await ready(ap);record('four plan tabs',await ap.getByRole('tab').count(),4);
 for(let i=0;i<groups.length;i++){
  const g=groups[i];await ap.getByRole('tab').nth(i).click();
  const missing=g.models.length===0||g.allowed_lengths.length===0,paused=missing||g.rolling_24h_limit===0;
  record(g.code+' persisted warning visibility',await ap.locator('.admin-plan-warning').count(),paused?1:0);
  if(paused){
   record(g.code+' paused title',await ap.locator('.admin-plan-warning .notice-title').innerText(),labels.admin.planPaused);
   record(g.code+' paused copy',((await ap.locator('.admin-plan-warning').innerText()).replace(labels.admin.planPaused,'')).trim(),missing?labels.admin.planResumeOptions:'');
  }
  const gaps=await ap.locator('fieldset').evaluateAll(fs=>fs.map(f=>{const a=f.querySelector('legend').getBoundingClientRect(),b=f.querySelector('.checkbox-list,.chip-list').getBoundingClientRect();return Math.round((b.top-a.bottom)*100)/100;}));
  record(g.code+' 8px labels',gaps,[8,8]);
 }
 await ap.screenshot({path:join(dir,'admin-plans-1440.png'),fullPage:true});
 const list=await get(ac,'/api/v1/admin/users?username=uat_learner'),user=list.items.find(x=>x.username==='uat_learner');if(!user)throw Error('Dedicated learner fixture missing');
 const detail=await get(ac,'/api/v1/admin/users/'+user.id);
 record('new detail quota contract', ['limited','unlimited'].includes(detail.user.generation_quota?.kind),true);
 await ap.goto(origin+'/admin/users/'+encodeURIComponent(user.id)+'?q=uat_learner');await ready(ap);
 await expect(ap.locator('.user-detail-name')).toHaveText('uat_learner');
 record('user detail retains search',await ap.getByRole('search').count(),1);
 record('user detail no strict schema failure',await ap.locator('.app-error').count(),0);
 record('user detail return copy',await ap.locator('.admin-user-detail-toolbar a').innerText(),labels.admin.backToResults);
 const batchButtons=ap.locator('.admin-user-detail-grid .model-list .model-row button');
 await expect(ap.locator('.admin-user-detail-grid')).toBeVisible();
 if(await batchButtons.count()){
  const beforePath=new URL(ap.url()).pathname;await batchButtons.first().click();await expect(ap.locator('.reader-dialog')).toBeVisible();await expect(ap.locator('.reader-passage')).toBeVisible();
  record('reader remains detail path',new URL(ap.url()).pathname,beforePath);await ap.screenshot({path:join(dir,'admin-reader-1440.png'),fullPage:true});await ap.keyboard.press('Escape');await expect(ap.locator('.reader-dialog')).toHaveCount(0);record('reader closes to same detail',new URL(ap.url()).pathname,beforePath);
 }else{record('reader no-data accounted for',detail.user.learning_batch_count,0);}
 for(const width of [390,1440]){await ap.setViewportSize({width,height:1000});await noOverflow(ap,'user detail '+width+' fits');}
 record('plans unchanged by UAT smoke',(await get(ac,'/api/v1/admin/groups')).items,groups);
 await logout(ac);await ac.close();
 const lc=await context(browser,'en-US',1440),lp=await loginUI(lc,'uat_learner','UatLearnerPass6000!');
 for(const width of [390,1440]){
  await lp.setViewportSize({width,height:1000});
  await lp.goto(origin+'/library');await ready(lp);await expect(lp.locator('.stat-label')).toHaveCount(6);
  record('learner library '+width+' no failure',await lp.locator('.app-error').count(),0);await noOverflow(lp,'learner library '+width+' fits');
  await lp.screenshot({path:join(dir,'learner-library-'+width+'.png'),fullPage:true});
  await lp.goto(origin+'/review');await ready(lp);await expect(lp.locator('#review-start')).toBeVisible();await expect(lp.locator('#review-end')).toBeVisible();
  record('learner review '+width+' matching date heights',await lp.locator('#review-start, #review-end').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height)),[44,44]);
  record('learner review '+width+' no failure',await lp.locator('.app-error').count(),0);await noOverflow(lp,'learner review '+width+' fits');
 }
 await logout(lc);await lc.close();
}catch(e){checks.push({id:'smoke execution',status:'ERROR',error:String(e)});}
finally{
 for(const c of contexts)await c.close().catch(()=>{});await browser.close();
 record('no page runtime errors',errors,[]);
 const writes=requests.filter(r=>!['GET','HEAD','OPTIONS'].includes(r.method));
 record('no content/config/review/AI browser mutations',writes.filter(r=>!['/api/v1/auth/login','/api/v1/auth/logout'].includes(r.path)),[]);
 const after=counts();record('business data preserved',after,before);record('deployment data preserved',after,deployment.dataBefore);
 const current=JSON.parse(execFileSync('docker',['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'],{encoding:'utf8'}));
 record('paired images still deployed',current.slice(0,2).map(x=>x.Image),deployment.after.slice(0,2).map(x=>x.image));record('four services healthy',current.map(x=>x.State.Health?.Status),['healthy','healthy','healthy','healthy']);
 const totals={PASS:0,FAIL:0,ERROR:0};for(const check of checks)totals[check.status]++;
 writeFileSync(join(dir,'smoke-final-results.json'),JSON.stringify({date:new Date().toISOString(),agent:'qa-quinn',origin,engine:'Chromium',counts:totals,checks,realAICalls:0,productionChanges:0,businessDataAfter:after,credentialsVerified:checks.filter(c=>c.id.endsWith(' login')&&c.status==='PASS').map(c=>c.id.slice(0,-6))},null,2),{flag:'wx'});
 console.log(JSON.stringify({counts:totals,failures:checks.filter(c=>c.status!=='PASS')}));if(totals.FAIL||totals.ERROR)process.exitCode=1;
}
