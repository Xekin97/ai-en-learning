import {readFileSync} from 'node:fs';
import {chromium,firefox,webkit,expect,start,stop,ok,call,sql,origin,out,dump,ready,env} from './harness.mjs';
import {stream,runCall,terminal} from './api-support.mjs';
import {startProvider} from './provider-fixed.mjs';
const f=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const tr=(lang,k)=>copy.static[lang+'.'+k]??copy.templates[lang+'.'+k];
const runtime=[],results=[],samples=[],responses=[];
let action='setup',browser,page,provider,allowed=[];
const hash=id=>sql(`SELECT md5(to_jsonb(b)::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const username=sql(`SELECT username FROM wordweave.accounts WHERE id='${f.owner}'`);
const model=sql("SELECT id FROM wordweave.ai_models WHERE display_name='Title QA local model'");
const persist=()=>dump('results.json',{results,samples,runtime,responses,localProviderCalls:provider?.calls??0,realProviderCalls:0});
function capture(p){
 p.setDefaultTimeout(12000);
 p.on('pageerror',e=>runtime.push({action,kind:'pageerror',text:e.message}));
 p.on('console',m=>{if(['warning','error'].includes(m.type()))runtime.push({action,kind:m.type(),text:m.text(),url:m.location().url});});
 p.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/me/batches/'))responses.push({action,path:new URL(r.url()).pathname,method:r.request().method(),status:r.status()});});
}
async function test(id,fn){
 action=id;allowed=[];
 try{
  await fn();await page.evaluate(()=>new Promise(requestAnimationFrame));
  const unexpected=runtime.filter(e=>e.action===action).filter(e=>{
   const status=e.text.match(/^Failed to load resource: the server responded with a status of (\d{3})\b/)?.[1];
   return !(e.kind==='error'&&status&&allowed.some(a=>a.status===Number(status)&&e.url===origin+a.path));
  });
  expect(unexpected).toEqual([]);results.push({id,result:'PASS'});
 }catch(e){results.push({id,result:'FAIL',error:String(e)});await page?.screenshot({path:new URL(id+'-failure.png',out).pathname}).catch(()=>{});}
 persist();console.log(id,results.at(-1).result,results.at(-1).error??'');
}
async function open(c,id,lang){
 await page?.close();page=await c.newPage();capture(page);
 await page.goto(origin+'/library/'+id);await ready(page);
 await expect(page.locator('#saved-batch-title')).toBeVisible();
 if(!await page.getByRole('button',{name:tr(lang,'l.title.edit'),exact:true}).count()){
  await page.getByRole('button',{name:tr(lang==='en'?'zh':'en','language'),exact:true}).click();
 }
 await expect(page.getByRole('button',{name:tr(lang,'l.title.edit'),exact:true})).toBeVisible();
}
async function edit(value,lang){
 await page.getByRole('button',{name:tr(lang,'l.title.edit'),exact:true}).click();
 await expect(page.locator('#batch-title')).toBeFocused();await page.locator('#batch-title').fill(value);
}
async function save(id,status){
 const response=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/v1/me/batches/'+id);
 await page.locator('.batch-title-editor button[type="submit"]').click();expect((await response).status()).toBe(status);
}
try{
 provider=await startProvider();
 for(const [label,engine,lang,width] of [['chromium-en',chromium,'en',1440],['chromium-zh',chromium,'zh',390],['firefox-en',firefox,'en',1440],['webkit-zh',webkit,'zh',390]]){
  browser=await start(engine);const c=await browser.newContext({locale:lang==='en'?'en-US':'zh-CN',viewport:{width,height:960},reducedMotion:'reduce'});
  await ok(c,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:lang==='en'?'en-US':'zh-CN'});
  await test(label+'-failure-retry-cancel',async()=>{
   await open(c,f.siblingB,lang);const before=hash(f.siblingB),original=await page.locator('#saved-batch-title').innerText();
   await edit('Discard this title',lang);
   await page.locator('.batch-title-editor button[type="button"]').click();
   await expect(page.locator('#saved-batch-title')).toHaveText(original);expect(hash(f.siblingB)).toBe(before);
   await edit('   ',lang);await page.locator('.batch-title-editor button[type="submit"]').click();
   await expect(page.locator('.batch-title-editor [role="alert"]')).toHaveText(tr(lang,'l.title.empty'));
   expect(responses.filter(r=>r.action===action&&r.method==='PATCH')).toEqual([]);
   const value=label+' · Keep my title';await page.locator('#batch-title').fill(value);
   const pattern='**/api/v1/me/batches/'+f.siblingB;allowed.push({path:'/api/v1/me/batches/'+f.siblingB,status:503});
   await page.route(pattern,async route=>route.request().method()==='PATCH'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({type:'https://wordweave.example/problems/temporarily-unavailable',title:'Temporarily unavailable',status:503,code:'temporarily_unavailable',detail:'Local development failure',request_id:'cr016-valid-problem'})}):route.continue());
   try{
    await save(f.siblingB,503);await expect(page.locator('.batch-title-editor [role="alert"]')).toHaveText(tr(lang,'failed'));
    await expect(page.locator('#batch-title')).toBeEnabled();await expect(page.locator('#batch-title')).toHaveValue(value);await expect(page.locator('#batch-title')).toBeFocused();
    expect(hash(f.siblingB)).toBe(before);await expect(page.locator('#toast')).not.toHaveText(tr(lang,'l.title.saved'));
    const geometry=await page.locator('.batch-title-editor').evaluate(el=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,inputY:el.querySelector('input').getBoundingClientRect().y,hintY:el.querySelector('.field-help').getBoundingClientRect().y,errorY:el.querySelector('[role=alert]').getBoundingClientRect().y,buttonsY:el.querySelector('.actions').getBoundingClientRect().y}));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width);expect(geometry.inputY).toBeLessThan(geometry.hintY);expect(geometry.hintY).toBeLessThan(geometry.errorY);expect(geometry.errorY).toBeLessThan(geometry.buttonsY);
    samples.push({action,geometry,focused:true,inputRetained:true,databaseUnchanged:true});
    await page.screenshot({path:new URL(label+'-failure-focus.png',out).pathname});
   }finally{await page.unroute(pattern);}
   await save(f.siblingB,200);await expect(page.locator('#saved-batch-title')).toHaveText(value);await expect(page.locator('#toast')).toHaveText(tr(lang,'l.title.saved'));
   expect((await ok(c,'/me/batches/'+f.siblingB)).batch.title).toBe(value);
   expect(responses.filter(r=>r.action===action&&r.method==='PATCH').map(r=>r.status)).toEqual([503,200]);
  });
  await test(label+'-conflict',async()=>{
   await open(c,f.siblingB,lang);await edit('Local draft after conflict',lang);
   const old=(await ok(c,'/me/batches/'+f.siblingB)).batch;
   await ok(c,'/me/batches/'+f.siblingB,'PATCH',{title:'Changed in another tab',expected_title_revision:old.title_revision});
   const before=hash(f.siblingB);allowed.push({path:'/api/v1/me/batches/'+f.siblingB,status:409});await save(f.siblingB,409);
   await expect(page.locator('#batch-title')).toHaveValue('Local draft after conflict');await expect(page.locator('#batch-title')).toBeFocused();
   await expect(page.locator('.batch-title-editor [role="alert"]')).toContainText(tr(lang,'l.title.failed'));
   await expect(page.locator('.batch-title-editor [role="alert"]')).toContainText('Changed in another tab');expect(hash(f.siblingB)).toBe(before);
   await save(f.siblingB,200);await expect(page.locator('#saved-batch-title')).toHaveText('Local draft after conflict');
   expect((await ok(c,'/me/batches/'+f.siblingB)).batch.title).toBe('Local draft after conflict');
  });
  await test(label+'-deleted',async()=>{
   const s=await stream(c,'/generations/stream',{model_id:model,meaning_language:'en',scenario:'story',length:'short',entries:['learn']});await s.done;terminal(s,'validated');
   const response=await runCall(s,c,'/save');expect(response.status()).toBe(201);const id=(await response.json()).data.batch_id;
   await open(c,id,lang);await edit('Do not resurrect',lang);await ok(c,'/me/batches/'+id,'DELETE',{});
   allowed.push({path:'/api/v1/me/batches/'+id,status:404});await save(id,404);
   await expect(page.locator('.batch-title-editor [role="alert"]')).toBeVisible();await expect(page.locator('#toast')).not.toHaveText(tr(lang,'l.title.saved'));
   expect(sql(`SELECT count(*) FROM wordweave.learning_batches WHERE id='${id}'`)).toBe('0');await page.reload();await ready(page);
   await expect(page.locator('#saved-batch-title')).toHaveCount(0);await expect(page.getByText(tr(lang,'l.unavailable'),{exact:true})).toBeVisible();
   samples.push({action,saveStatus:404,deletedBatch:id,notResurrected:true});
  });
  await test(label+'-expired-session',async()=>{
   await open(c,f.normalId,lang);const before=hash(f.normalId);await edit('No write after expiry',lang);
   sql(`DELETE FROM wordweave.account_sessions WHERE account_id='${f.owner}'`);
   await page.locator('.batch-title-editor button[type="submit"]').click();await expect(page.locator('.auth-gate')).toBeVisible();
   await expect(page.locator('#batch-title')).toHaveCount(0);await expect(page.locator('#toast')).not.toHaveText(tr(lang,'l.title.saved'));
   expect(hash(f.normalId)).toBe(before);expect((await call(c,'/me/batches/'+f.normalId,'PATCH',{title:'Denied',expected_title_revision:'1'})).status).toBe(401);expect(hash(f.normalId)).toBe(before);
   expect(runtime.filter(e=>e.action===action)).toEqual([]);
   await page.screenshot({path:new URL(label+'-expired-session.png',out).pathname});samples.push({action,writeStatus:401,loginGateVisible:true,databaseUnchanged:true,runtimeErrors:0});
  });
  await stop(browser);browser=undefined;page=undefined;
 }
}catch(e){results.push({id:'SETUP',result:'FAIL',error:String(e)});console.log('SETUP',String(e));}
finally{persist();await stop(browser);await provider?.close();if(results.length!==16||results.some(x=>x.result!=='PASS'))process.exitCode=1;}
