// AC-218 / AC-220 only. Run through run.py against a disposable local stack.
import {readFileSync} from 'node:fs';
import {expect,start,stop,login,ok,call,sql,origin,out,dump,ready,instrument,env,work,t} from './harness.mjs';
import {raw,parse,stream,runCall,terminal} from './api-support.mjs';
import {startProvider} from './provider-fixed.mjs';

const names = {
  T1:'Cancel, blank rejection, ordinary save failure and explicit retry',
  T2:'Saved title survives re-login and UI language; preset uses one title',
  T3:'Migrated and paused batches can be renamed; same-preset copies are isolated',
  T4:'Deletion and session invalidation while editing reject save without false success',
};
const results = Object.entries(names).map(([id,name])=>({id,name,result:'NOT_EXECUTED'}));
const samples=[],runtime=[],requests=[];
let action='SETUP',browser,provider,admin,learner,page,presetId,normalId,deleteId,siblingA,siblingB,owner;
const username='qa_title_'+Date.now();
const legacy=JSON.parse(readFileSync(work+'/legacy-fixture.json'));
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const tr=(lang,key)=>copy.static[lang+'.'+key]??copy.templates[lang+'.'+key];
const batch=c=>async id=>(await ok(c,'/me/batches/'+id)).batch;
const fingerprint=id=>sql(`SELECT md5(to_jsonb(b)::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const immutable=id=>sql(`SELECT md5((to_jsonb(b)-'title'-'title_revision')::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const saveResponse=(p,id)=>p.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/v1/me/batches/'+id);
function flush(){dump('results.json',{results,samples,runtime,requests,localProviderCalls:provider?.calls??0,realProviderCalls:0});}
async function track(c){
  const p=await c.newPage();instrument(p,runtime,()=>action);
  p.on('request',r=>{
    const path=new URL(r.url()).pathname;
    if(r.method()==='PATCH'&&path.startsWith('/api/v1/me/batches/')){
      const body=r.postDataJSON();
      if(Object.hasOwn(body??{},'title'))requests.push({action,path,kind:'title',title:body.title});
    }
  });
  return p;
}
async function detail(c,id){page=await track(c);await page.goto(origin+'/library/'+id);await ready(page);await expect(page.locator('#saved-batch-title')).toBeVisible();return page;}
async function edit(p,value,lang='en'){
  await p.getByRole('button',{name:tr(lang,'l.title.edit'),exact:true}).click();
  await expect(p.locator('#batch-title')).toBeFocused();
  await p.locator('#batch-title').fill(value);
}
async function save(p,id,value,lang='en'){
  const response=saveResponse(p,id);
  await p.locator('.batch-title-editor').getByRole('button',{name:tr(lang,'l.title.save'),exact:true}).click();
  expect((await response).status()).toBe(200);
  await expect(p.locator('#saved-batch-title')).toHaveText(value);
  await expect(p.locator('#toast')).toHaveText(tr(lang,'l.title.saved'));
}
async function test(id,fn){
  action=id;const result=results.find(x=>x.id===id),n=provider.calls;
  try{
    await fn();
    expect(provider.calls).toBe(n);
    expect(runtime.filter(x=>x.action===id&&x.kind==='pageerror')).toEqual([]);
    result.result='PASS';
  }catch(e){
    result.result='FAIL';result.error=String(e);
    await page?.screenshot({path:new URL(id+'-failure.png',out).pathname,fullPage:true}).catch(()=>{});
  }
  flush();console.log(id,result.result,result.error??'');
}
async function generate(c,path,input,words){
  provider.words=words;provider.lang='en';provider.mode='valid';
  const s=await stream(c,path,input);await s.done;terminal(s,'validated');
  const response=await runCall(s,c,'/save');expect(response.status()).toBe(201);
  return (await response.json()).data.batch_id;
}
async function uiLogin(p,name){
  await p.goto(origin+'/login');await ready(p);
  await p.locator('input[autocomplete="username"]').fill(name);
  await p.locator('input[type="password"]').fill(env.ADMIN_PASSWORD);
  await p.locator('form button[type="submit"]').click();
  await expect(p).not.toHaveURL(/\/login(?:[?#]|$)/);
  await ready(p);
}

try{
  flush();provider=await startProvider();browser=await start();
  admin=await browser.newContext({locale:'en-US',reducedMotion:'reduce'});
  learner=await browser.newContext({locale:'en-US',reducedMotion:'reduce'});
  await login(admin);
  const credential=await ok(admin,'/admin/openrouter-credential');
  await ok(admin,'/admin/openrouter-credential','PUT',{api_key:'qa-title-local-only',confirmed:true,expected_revision:credential.revision});
  const model=await ok(admin,'/admin/models','POST',{display_name:'Title QA local model',description:'Isolated QA provider',openrouter_model_id:'provider/integration'});
  await ok(admin,'/admin/models/'+model.model.id+'/enable','POST',{expected_revision:model.revision});
  const groups=await ok(admin,'/admin/groups'),basic=groups.items.find(x=>x.code==='basic');
  await ok(admin,'/admin/groups/basic','PUT',{expected_revision:groups.revision,priority:basic.priority,max_entries:5,rolling_24h_limit:50,model_ids:[model.model.id],allowed_lengths:['short']});
  owner=(await ok(learner,'/auth/register','POST',{username,password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'})).actor.id;
  const config={model_id:model.model.id,meaning_language:'en',scenario:'story',length:'short',entries:['learn']};
  normalId=await generate(learner,'/generations/stream',config,config.entries);
  deleteId=await generate(learner,'/generations/stream',config,config.entries);
  const preset=await ok(admin,'/admin/presets','POST',{title:'One shared preset',configuration:{...config,entries:['learn','weave','book']}});
  presetId=preset.preset.id;provider.words=['learn','weave','book'];
  const preview=await raw(admin,'/admin/presets/'+presetId+'/previews/stream','POST',{draft_version:preset.preset.draft_version});
  expect(preview.status()).toBe(200);
  expect(parse(await preview.text()).filter(x=>x.event==='preview.validated')).toHaveLength(1);
  const draft=await ok(admin,'/admin/presets/'+presetId);
  await ok(admin,'/admin/presets/'+presetId+'/publish','POST',{draft_version:draft.preset.draft_version,expected_revision:draft.revision,confirmed:true});
  const published=(await ok(learner,'/presets/'+presetId)).preset;
  const input={published_version:published.published_version};
  siblingA=await generate(learner,'/presets/'+presetId+'/generations/stream',input,['learn','weave','book']);
  siblingB=await generate(learner,'/presets/'+presetId+'/generations/stream',input,['learn','weave','book']);
  dump('fixture.json',{owner,normalId,deleteId,presetId,siblingA,siblingB,legacy});

  await test('T1',async()=>{
    const p=await detail(learner,normalId),before=await batch(learner)(normalId),hash=fingerprint(normalId);
    const count=()=>requests.filter(x=>x.action==='T1').length;
    await edit(p,'Discard this draft');
    await p.locator('.batch-title-editor').getByRole('button',{name:t('cancel'),exact:true}).click();
    await expect(p.locator('#saved-batch-title')).toHaveText(before.title);
    expect(fingerprint(normalId)).toBe(hash);expect(count()).toBe(0);
    await edit(p,'   ');
    await p.locator('.batch-title-editor button[type="submit"]').click();
    await expect(p.locator('.batch-title-editor [role="alert"]')).toHaveText(t('l.title.empty'));
    expect(fingerprint(normalId)).toBe(hash);expect(count()).toBe(0);
    await p.locator('#batch-title').fill('A title worth keeping');
    const pattern='**/api/v1/me/batches/'+normalId;let injected=0;
    const failure=async route=>{
      if(route.request().method()==='PATCH'){
        injected++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'temporarily_unavailable',message:'Injected local QA failure'})});
      }else await route.continue();
    };
    await p.route(pattern,failure);
    try{
      await p.locator('.batch-title-editor button[type="submit"]').click();
      await expect(p.locator('.batch-title-editor [role="alert"]')).toBeVisible();
      await expect(p.locator('#batch-title')).toHaveValue('A title worth keeping');
      await expect(p.locator('.batch-title-editor button[type="submit"]')).toBeEnabled();
      await expect(p.locator('#toast')).not.toHaveText(t('l.title.saved'));
      expect(fingerprint(normalId)).toBe(hash);
      // A bounded observation after the mutation has settled, not a timeout-based success assertion.
      await p.waitForTimeout(300);expect(injected).toBe(1);expect(count()).toBe(1);
      await p.screenshot({path:new URL('T1-retry-preserved.png',out).pathname});
    }finally{await p.unroute(pattern,failure);}
    await save(p,normalId,'A title worth keeping');
    const after=await batch(learner)(normalId);
    expect(after.title).toBe('A title worth keeping');
    expect(BigInt(after.title_revision)).toBe(BigInt(before.title_revision)+1n);
    expect(count()).toBe(2);samples.push({action,cancelWrites:0,blankWrites:0,injected503:1,explicitRetryWrites:1});
    await p.close();
  });

  await test('T2',async()=>{
    let p=await detail(learner,normalId);
    await edit(p,'同一个标题 · Same title');await save(p,normalId,'同一个标题 · Same title');
    await ok(learner,'/auth/logout','POST',{});await uiLogin(p,username);
    await p.goto(origin+'/library/'+normalId);await ready(p);
    await expect(p.locator('#saved-batch-title')).toHaveText('同一个标题 · Same title');
    await p.locator('.locale-switch select').first().selectOption('zh-CN');
    await expect(p.getByRole('button',{name:tr('zh','l.title.edit'),exact:true})).toBeVisible();
    await expect(p.locator('#saved-batch-title')).toHaveText('同一个标题 · Same title');
    await p.reload();await ready(p);await expect(p.locator('#saved-batch-title')).toHaveText('同一个标题 · Same title');
    await p.locator('.locale-switch select').first().selectOption('en-US');
    await expect(p.getByRole('button',{name:t('l.title.edit'),exact:true})).toBeVisible();await p.close();
    p=page=await track(admin);await p.goto(origin+'/admin/presets');await ready(p);
    await p.locator('.admin-record').filter({hasText:'One shared preset'}).click();
    await expect(p.locator('.preset-title-field input')).toHaveCount(1);
    await p.locator('.preset-title-field input').fill('预设标题 · One preset title');
    const saved=p.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/v1/admin/presets/'+presetId);
    await p.getByRole('button',{name:t('save.draft'),exact:true}).click();
    const response=await saved;expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).not.toHaveProperty('description');
    for(const locale of ['zh-CN','en-US']){
      await p.locator('.locale-switch select').first().selectOption(locale);
      const lang=locale==='zh-CN'?'zh':'en';
      await expect(p.getByRole('button',{name:tr(lang,'save.draft'),exact:true})).toBeVisible();
      await expect(p.locator('.preset-title-field input')).toHaveValue('预设标题 · One preset title');
      await expect(p.locator('form input[name*="description" i],form textarea')).toHaveCount(0);
      await expect(p.locator('form label').filter({hasText:/description|说明/i})).toHaveCount(0);
    }
    const current=await ok(admin,'/admin/presets/'+presetId);
    expect(current.preset.title).toBe('预设标题 · One preset title');
    expect((await ok(learner,'/presets/'+presetId)).preset).toEqual(published);
    await p.screenshot({path:new URL('T2-single-preset-title.png',out).pathname});await p.close();
    samples.push({action,relogin:true,locales:['zh-CN','en-US'],presetTitleFields:1,descriptionFields:0});
  });

  await test('T3',async()=>{
    expect(legacy.verification).toBe('migrated_with_content_unchanged');
    const old=await browser.newContext({locale:'en-US',reducedMotion:'reduce'});
    try{
      await ok(old,'/auth/login','POST',{username:legacy.username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
      const original=immutable(legacy.batch),p=await detail(old,legacy.batch);
      await expect(p.locator('#saved-batch-title')).toHaveText('learn');
      await edit(p,'From my earlier studies');await save(p,legacy.batch,'From my earlier studies');
      expect(immutable(legacy.batch)).toBe(original);
      expect((await batch(old)(legacy.batch)).title).toBe('From my earlier studies');
      await p.screenshot({path:new URL('T3-migrated-title.png',out).pathname});
    }finally{await old.close();}
    const p=await detail(learner,siblingA);
    await p.locator('.library-check input').uncheck();
    await expect.poll(async()=>(await batch(learner)(siblingA)).participates_in_range_review).toBe(false);
    const original=immutable(siblingA),other=fingerprint(siblingB),pub=(await ok(learner,'/presets/'+presetId)).preset;
    await edit(p,'My private version');await save(p,siblingA,'My private version');
    expect(immutable(siblingA)).toBe(original);expect(fingerprint(siblingB)).toBe(other);
    expect((await batch(learner)(siblingA)).participates_in_range_review).toBe(false);
    expect((await ok(learner,'/presets/'+presetId)).preset).toEqual(pub);
    await p.reload();await ready(p);await expect(p.locator('#saved-batch-title')).toHaveText('My private version');
    await expect(p.locator('.library-check input')).not.toBeChecked();await p.close();
    samples.push({action,migratedBatch:legacy.batch,pausedBatch:siblingA,unchangedSibling:siblingB,unchangedPreset:presetId});
  });

  await test('T4',async()=>{
    let p=await detail(learner,deleteId);await edit(p,'Must not restore deleted content');
    await ok(learner,'/me/batches/'+deleteId,'DELETE');
    const response=saveResponse(p,deleteId);
    await p.locator('.batch-title-editor button[type="submit"]').click();expect((await response).status()).toBe(404);
    await expect(p.locator('.batch-title-editor [role="alert"]')).toBeVisible();
    await expect(p.locator('#toast')).not.toHaveText(t('l.title.saved'));
    expect(sql(`SELECT count(*) FROM wordweave.learning_batches WHERE id='${deleteId}'`)).toBe('0');
    await p.reload();await ready(p);await expect(p.locator('#saved-batch-title')).toHaveCount(0);
    await expect(p.getByText(t('l.unavailable'),{exact:true})).toBeVisible();await p.close();
    p=await detail(learner,normalId);const hash=fingerprint(normalId);await edit(p,'Must not persist after session expiry');
    // Invalidate the real server-side sessions while this tab retains the open editor.
    sql(`DELETE FROM wordweave.account_sessions WHERE account_id='${owner}'`);
    await p.locator('.batch-title-editor button[type="submit"]').click();
    await expect(p.locator('.auth-gate')).toBeVisible();
    await expect(p.locator('#batch-title')).toHaveCount(0);
    await expect(p.locator('#toast')).not.toHaveText(t('l.title.saved'));
    expect(fingerprint(normalId)).toBe(hash);
    expect((await call(learner,'/me/batches/'+normalId,'PATCH',{title:'Denied direct request',expected_title_revision:'1'})).status).toBe(401);
    expect(fingerprint(normalId)).toBe(hash);
    await p.screenshot({path:new URL('T4-session-invalidated.png',out).pathname});
    samples.push({action,deletedBatchStatus:404,expiredSessionStatus:401,noResurrection:true,noTitleWrite:true});await p.close();
  });
}catch(e){
  results.push({id:'SETUP',name:'Isolated fixture and application startup',result:'FAIL',error:String(e)});
  console.log('SETUP',String(e));
}finally{
  flush();await stop(browser);await provider?.close();
  if(results.some(x=>x.result!=='PASS'))process.exitCode=1;
}
