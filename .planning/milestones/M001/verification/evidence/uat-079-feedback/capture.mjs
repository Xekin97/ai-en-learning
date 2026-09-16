import{chromium,webkit,expect}from'../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{dirname,join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../../..'),origin='http://localhost:6001',design='http://localhost:6010',checks=[],observations=[],pageErrors=[];
const sha=b=>createHash('sha256').update(b).digest('hex'),record=(id,actual,expected)=>checks.push({id,status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL',actual,expected});
const sourceFiles=['frontend/app/pages/login.vue','frontend/app/pages/register.vue','frontend/app/pages/account.vue','frontend/app/assets/css/application.css','frontend/i18n/locales/en-US.json','frontend/i18n/locales/zh-CN.json','.planning/milestones/M001/design/prototype/app.js','.planning/milestones/M001/design/prototype/i18n.js','.planning/milestones/M001/design/theme.css','.planning/workflow/state.yaml','.planning/workflow/history.yaml','.planning/agt/agents.yaml'];
const hashes=Object.fromEntries(sourceFiles.map(p=>[p,sha(readFileSync(join(root,p)))]));
const containerNames=['wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'];
const containers=()=>JSON.parse(execFileSync('docker',['inspect',...containerNames],{encoding:'utf8'})).map(c=>({name:c.Name,id:c.Id,image:c.Image,started:c.State.StartedAt,health:c.State.Health?.Status}));
const before=containers();
const settle=async p=>p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
const ready=async p=>{await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await settle(p);};
const texts=async(p,s)=>(await p.locator(s).allInnerTexts()).map(t=>t.replace(/\s+/gu,' ').trim());
const contexts=[];
async function ctx(browser,locale,width){const c=await browser.newContext({locale,viewport:{width,height:1000}});contexts.push(c);c.setDefaultTimeout(12000);c.on('page',p=>p.on('pageerror',e=>pageErrors.push(e.message)));await c.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);return c;}
async function proto(c,page,role,locale){const p=await c.newPage();await p.goto(design+'/prototype/?page='+page+'&role='+role+'&state=default&locale='+locale);await p.locator('main').waitFor();await p.locator('.prototype-tools').evaluate(n=>n.style.display='none');await settle(p);return p;}
const intent=async p=>p.locator('.auth-card').evaluate(card=>{const hint=card.querySelector('.auth-intent'),title=card.querySelector('h2'),box=card.getBoundingClientRect(),h=hint.getBoundingClientRect(),t=title.getBoundingClientRect(),s=getComputedStyle(hint);return{text:hint.textContent.trim(),beforeTitle:!!(hint.compareDocumentPosition(title)&Node.DOCUMENT_POSITION_FOLLOWING),firstChild:card.firstElementChild===hint,role:hint.getAttribute('role'),topWithinCard:h.top-box.top,titleTopWithinCard:t.top-box.top,style:{background:s.backgroundColor,color:s.color,padding:s.padding,margin:s.margin,borderRadius:s.borderRadius}};});
for(const[engine,type]of[['Chromium',chromium],['WebKit',webkit]]){
 const browser=await type.launch();
 try{
  for(const locale of['en-US','zh-CN'])for(const width of[390,1440]){
   const c=await ctx(browser,locale,width),p=await c.newPage(),d=await proto(c,'PAGE-007','visitor',locale),key=engine+'-'+locale+'-'+width;
   await p.goto(origin+'/review');await ready(p);await p.locator('.auth-gate .button-primary').click();await expect(p).toHaveURL(u=>u.pathname==='/login');await ready(p);
   await d.locator('.auth-gate [data-action=navigate][data-value=PAGE-003]').click();await settle(d);
   for(const mode of['login','register']){
    if(mode==='register'){await p.locator('.auth-alt a').click();await ready(p);await d.locator('.auth-alt [data-value=PAGE-002]').click();await settle(d);}
    const actual=await intent(p),expected=await intent(d);observations.push({case:key+'-'+mode,actual,expected});
    for(const field of['text','beforeTitle','firstChild','role','style'])record(key+' '+mode+' '+field,actual[field],expected[field]);
    record(key+' '+mode+' safe return intent',new URL(p.url()).searchParams.get('redirect'),'/review');
    for(const[name,page]of[['actual',p],['design',d]])await page.screenshot({path:join(dir,key+'-'+mode+'-'+name+'.png'),fullPage:true});
   }
   await c.close();
  }
  const c=await ctx(browser,'en-US',1440);
  const boot=await(await c.request.get(origin+'/api/v1/bootstrap')).json();
  const login=await c.request.post(origin+'/api/v1/auth/login',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':boot.data.csrf_token},data:{username:'uat_learner',password:'UatLearnerPass6000!',browser_ui_locale:'en-US'}});
  record(engine+' dedicated learner login',login.status(),200);if(login.status()!==200)throw Error('Dedicated learner login unavailable');
  const snapshot=await(await c.request.get(origin+'/api/v1/bootstrap')).json(),locale=snapshot.data.ui_locale;
  const p=await c.newPage(),d=await proto(c,'PAGE-009','learner',locale);await p.goto(origin+'/account');await ready(p);
  await p.locator('.settings-grid .card-footer .button-secondary').click();await d.locator('[data-action=change-password]').click();await expect(p.locator('dialog[open]')).toBeVisible();await expect(d.locator('dialog[open]')).toBeVisible();
  for(const width of[390,1440]){
   await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await settle(p);await settle(d);
   const key=engine+'-'+locale+'-'+width+'-password',actual={},expected={};
   for(const[field,sel]of[['title','dialog h2'],['labels','dialog .field-label'],['helpers','dialog .helper'],['notice','dialog .notice'],['buttons','dialog .dialog-footer button']]){
    actual[field]=await texts(p,sel);expected[field]=await texts(d,sel);record(key+' '+field,actual[field],expected[field]);
   }
   observations.push({case:key,actual,expected});
   for(const[name,page]of[['actual',p],['design',d]])await page.screenshot({path:join(dir,key+'-'+name+'.png'),fullPage:true});
  }
  await p.keyboard.press('Escape');await d.keyboard.press('Escape');
  const fresh=await(await c.request.get(origin+'/api/v1/bootstrap')).json();
  record(engine+' account locale preserved',fresh.data.ui_locale,locale);
  const logout=await c.request.post(origin+'/api/v1/auth/logout',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':fresh.data.csrf_token},data:{}});
  record(engine+' own-session logout',logout.status(),204);await c.close();
 }catch(e){checks.push({id:engine+' execution',status:'ERROR',error:String(e)});}
 finally{for(const c of contexts)await c.close().catch(()=>{});await browser.close();}
}
record('no source/design/workflow edits',Object.fromEntries(sourceFiles.map(p=>[p,sha(readFileSync(join(root,p)))])),hashes);
record('UAT deployment unchanged',containers(),before);record('no browser runtime errors',pageErrors,[]);
const counts={PASS:0,FAIL:0,ERROR:0};for(const c of checks)counts[c.status]++;
writeFileSync(join(dir,'results.json'),JSON.stringify({date:new Date().toISOString(),agent:'qa-quinn',purpose:'UAT feedback diagnosis, not fix or full re-verification',counts,checks,observations,baseline:{hashes,containers:before},realAICalls:0,passwordUpdates:0,accountLocaleUpdates:0,contentWrites:0},null,2),{flag:'wx'});
console.log(JSON.stringify({counts,failures:checks.filter(c=>c.status!=='PASS')}));if(counts.ERROR||counts.FAIL)process.exitCode=1;

