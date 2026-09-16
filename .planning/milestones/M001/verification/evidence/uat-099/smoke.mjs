// Deployment smoke only; never generate, probe, save, delete, start review or edit settings.
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium,expect} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {dir,origin,names,target,frontend,output,same,data,privateData,models,inspect,safe,assertAuthority} from './helpers.mjs';
assertAuthority();
if(existsSync(join(dir,'smoke-results.json')))throw Error('Smoke receipt exists; no automatic retry');
const deployment=JSON.parse(readFileSync(join(dir,'deployment.json')));
if(deployment.status!=='PASS'||inspect()[1].Image!==target)throw Error('Candidate not deployed successfully');
const before=data(),secretBefore=privateData(),modelsBefore=models();
const checks=[],requests=[],pageErrors=[],blocked=[],contexts=[],loggedIn=new Set();
const record=(id,actual,expected=true)=>checks.push({id,status:same(actual,expected)?'PASS':'FAIL',actual,expected});
const mutations=new Set(['/api/v1/auth/login','/api/v1/auth/logout']);
const ready=async page=>{await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await page.evaluate(()=>document.fonts.ready);};
const browser=await chromium.launch();
async function context(){
 const c=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai'});contexts.push(c);c.setDefaultTimeout(15000);
 await c.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);
 c.on('page',p=>p.on('pageerror',e=>pageErrors.push(e.message)));
 c.on('request',r=>{if(r.url().startsWith(origin+'/api/'))requests.push({method:r.method(),path:new URL(r.url()).pathname});});
 await c.route('**/api/v1/**',async route=>{const r=route.request(),path=new URL(r.url()).pathname;if(!['GET','HEAD','OPTIONS'].includes(r.method())&&!mutations.has(path)){blocked.push({method:r.method(),path});await route.abort('blockedbyclient');}else await route.continue();});
 return c;
}
async function get(c,path){const r=await c.request.get(origin+path);if(r.status()!==200)throw Error(`GET ${path.split('?')[0]} status ${r.status()}`);return (await r.json()).data;}
async function login(c,username,password,label){
 const p=await c.newPage();await p.goto(origin+'/login');await ready(p);
 await p.locator('input[autocomplete="username"]').fill(username);await p.locator('input[autocomplete="current-password"]').fill(password);
 const response=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/v1/auth/login'));
 await p.locator('button[type="submit"]').click();const r=await response;record(label+' original credentials accepted',r.status(),200);
 if(r.status()!==200)throw Error(label+' credentials rejected; no reset attempted');
 loggedIn.add(c);await p.waitForURL(u=>u.pathname!=='/login');await ready(p);return p;
}
async function logout(c){
 if(!loggedIn.has(c))return;
 const boot=await get(c,'/api/v1/bootstrap');
 const r=await c.request.post(origin+'/api/v1/auth/logout',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':boot.csrf_token},data:{}});
 record('Own temporary login session logout', [r.status(),(await r.body()).length,r.headers()['content-type']??null,r.headers()['cache-control']], [204,0,null,'no-store']);
 if(r.status()===204)loggedIn.delete(c);
}
async function pageCheck(p,path,selector){
 const response=await p.goto(origin+path);await ready(p);await expect(p.locator(selector).first()).toBeVisible();
 record(path+' HTTP/render/app errors/overflow',[response.status(),await p.locator('.app-error').count(),await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)],[200,0,true]);
}
try{
 record('Deployment data baseline retained',same(before,deployment.dataAfter));
 for(const path of ['/health/live','/health/ready','/']){const r=await fetch(origin+path,{signal:AbortSignal.timeout(10000)});record(path+' proxy status',r.status,200);if(path==='/')record('Home server-rendered brand',(await r.text()).includes('WordWeave'));}
 const guest=await context(),p=await guest.newPage();
 await pageCheck(p,'/','.hero-title');
 await pageCheck(p,'/create','.studio-grid');
 const vocabulary=await get(guest,'/api/v1/vocabulary/search?q=vulnerable');record('Frozen lexicon search',vocabulary.items.some(x=>x.entry==='vulnerable'));
 const guestOptions=await get(guest,'/api/v1/generation-options');record('Guest generation options readable',Array.isArray(guestOptions.models)&&typeof guestOptions.availability.can_generate==='boolean');
 output('options-observation.json',{date:new Date().toISOString(),guest:{models:guestOptions.models.map(m=>({id:m.id,name:m.name})),availability:guestOptions.availability},note:'Read only; existing model/group permissions preserved. A disabled deterministic model does not grant a usable guest model.'});
 for(const path of ['/review','/library']){
  await pageCheck(p,path,'.auth-gate');record(path+' guest stays on intended route',new URL(p.url()).pathname,path);
  await p.locator('.auth-gate .button-primary').click();await expect(p).toHaveURL(u=>u.pathname==='/login'&&u.searchParams.get('redirect')===path);await ready(p);
  record(path+' sign-in intent visible',await p.locator('.auth-intent').isVisible());
 }
 const admin=await context(),ap=await login(admin,'uat_admin','UatAdminPass6000!','Administrator');
 await pageCheck(ap,'/admin/models','.model-list');record('All preserved model rows visible',await ap.locator('.model-list .model-row').count(),modelsBefore.length);
 const found=await get(admin,'/api/v1/admin/users?username=uat_learner');record('Admin read-only user lookup',found.items.some(u=>u.username==='uat_learner'));
 await logout(admin);
 const learner=await context(),lp=await login(learner,'uat_learner','UatLearnerPass6000!','Learner');
 await pageCheck(lp,'/library','.page-title');
 await pageCheck(lp,'/create','.studio-grid');
 const options=await get(learner,'/api/v1/generation-options'),enabled=modelsBefore.filter(m=>m.enabled).map(m=>m.id).sort();
 record('Learner sees existing enabled real models',options.models.map(m=>m.id).sort(),enabled);
 record('Learner permitted to generate without submitting',options.availability.can_generate);
 await lp.locator('#word-search').fill('vulnerable');await expect(lp.locator('#word-search-results')).toBeVisible();
 record('Live vocabulary dropdown rendered',await lp.locator('#word-search-results').innerText().then(s=>s.includes('vulnerable')));
 await lp.screenshot({path:join(dir,'learner-create-1440.png'),fullPage:true});
 output('learner-options-observation.json',{date:new Date().toISOString(),models:options.models.map(m=>({id:m.id,name:m.name})),availability:options.availability,meaningLanguages:options.meaning_languages,scenarios:options.scenarios,lengths:options.lengths,maxEntries:options.max_entries});
 await logout(learner);
}catch(e){checks.push({id:'UAT099 smoke execution',status:'ERROR',error:e.message});}
finally{
 for(const c of [...loggedIn])await logout(c).catch(()=>checks.push({id:'Own-session cleanup',status:'ERROR',error:'Cleanup failed; original sessions not touched'}));
 for(const c of contexts)await c.close().catch(()=>{});await browser.close();
 const after=data(),secretAfter=privateData(),containers=inspect();
 record('No browser runtime errors',pageErrors,[]);record('No unexpected mutation attempts',blocked,[]);
 record('No generation/probe requests',requests.filter(r=>/generations|probe/.test(r.path)),[]);
 record('All scoped public data preserved',same(after,before));record('Preserved password and provider credential material',secretAfter.passwords===secretBefore.passwords&&secretAfter.credentials===secretBefore.credentials);
 record('Original sessions retained; own new sessions removed',secretAfter.sessions===secretBefore.sessions&&after.counts.sessions===before.counts.sessions&&loggedIn.size===0);
 record('No real generation or model configuration change',after.counts.runs===before.counts.runs&&same(models(),modelsBefore));
 record('Candidate pair remains deployed',containers.slice(0,2).map(c=>c.Image),[frontend,target]);
 record('All services healthy',containers.map(c=>c.State.Health?.Status),['healthy','healthy','healthy','healthy']);
 record('Non-backend containers unchanged',[0,2,3].every(i=>same(safe(containers[i]),deployment.after[i])));
 const counts={PASS:0,FAIL:0,ERROR:0};for(const c of checks)counts[c.status]++;
 output('smoke-results.json',{date:new Date().toISOString(),agent:'qa-quinn',origin,scope:'Single-viewport non-destructive deployment smoke, not full-site regression or real-model quality',counts,checks,requestSummary:{browserAPIRequests:requests.length,forbiddenMutationAttempts:blocked.length,realModelCalls:0,newLoginSessions:2,remainingNewLoginSessions:loggedIn.size},dataBefore:before,dataAfter:after,actualModel:'not_observed',usage:'not_observed'});
 console.log(JSON.stringify({counts,dataPreserved:same(after,before),originalSessionsPreserved:secretAfter.sessions===secretBefore.sessions,realModelCalls:0}));if(counts.FAIL||counts.ERROR)process.exitCode=1;
}
