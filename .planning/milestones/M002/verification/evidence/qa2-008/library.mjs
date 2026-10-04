import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {expect,start,stop,login,ok,call,sql,origin,out,t,dump,ready,instrument,randomUUID,env} from './harness.mjs';
let providerEntry='learn';let calls=0,action='SETUP';const results=[],samples=[],runtime=[];
const passage='A thoughtful student learns(learn) by building a steady learning(learn) routine through daily reading and discussion. Each morning the student reviews a few ideas, connects them with practical examples, and writes a short reflection. Friends later compare their observations, ask clear questions, and share useful explanations about what they learned(learn). This patient practice makes new knowledge easier to remember and apply with confidence.';
const provider=createServer(async(req,res)=>{if(req.url==='/models'){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'provider/integration',supported_parameters:['structured_outputs']}]}));return;}if(req.url!=='/chat/completions'){res.writeHead(404);res.end();return;}let body='';for await(const c of req)body+=c;calls++;const probe=JSON.parse(body).messages.some(m=>m.content.includes('fixed compatibility probe'));const candidate={passage:passage+(probe?' The group also discussed vulnerability(vulnerable) with empathy.':''),tags:['study'],targets:{learn:{entry_meaning:'gain knowledge through study',hint_phrase:'learning(learn) through learned(learn) examples while learning(learn)'}}};if(!probe&&providerEntry==='book'){candidate.passage=passage.replaceAll('(learn)','')+' A useful book(book) provides clear examples for the next lesson.';candidate.targets={book:{entry_meaning:'a written collection of pages',hint_phrase:'a useful book(book)'}};}if(probe)candidate.targets.vulnerable={entry_meaning:'open to harm',hint_phrase:'vulnerable(vulnerable) communities'};res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(candidate)}}]})+'\n\ndata: [DONE]\n\n');});
await new Promise(r=>provider.listen(38082,'127.0.0.1',r));
const browser=await start(),admin=await browser.newContext(),user=await browser.newContext(),other=await browser.newContext(),page=await user.newPage();instrument(page,runtime,()=>action);
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json')),tr=(lang,k)=>copy.static[lang+'.'+k]??copy.templates[lang+'.'+k];
async function test(id,name,fn){action=id;try{await fn();results.push({id,name,result:'PASS'});}catch(e){results.push({id,name,result:'FAIL',error:String(e)});await page.screenshot({path:new URL(id+'-failure.png',out).pathname,fullPage:true}).catch(()=>{});}dump('library-results.json',{results,localProviderCalls:calls,realProviderCalls:0});console.log(id,results.at(-1).result);}
async function raw(c,path,method,data,extra={}){const headers={origin,'sec-fetch-site':'same-origin',...extra};if(method!=='GET')headers['x-csrf-token']=(await ok(c,'/bootstrap')).csrf_token;return c.request.fetch(origin+'/api/v1'+path,{method,data,headers});}
let userId,modelId,otherId,ids=[],deletedId,otherBatch;
const register=async(c,name)=>(await ok(c,'/auth/register','POST',{username:'qa8_'+name+'_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'})).actor.id;
async function generate(c,entry='learn'){providerEntry=entry;const r=await raw(c,'/generations/stream','POST',{model_id:modelId,meaning_language:'en',scenario:'story',length:'short',entries:[entry]});expect(r.status()).toBe(200);const events=(await r.text()).split('\n\n').filter(x=>x.startsWith('event:')).map(x=>{const lines=x.split('\n');return{event:lines[0].slice(7),data:JSON.parse(lines.find(x=>x.startsWith('data:')).slice(6))}});expect(events.filter(x=>/^generation\.(validated|failed|cancelled)$/.test(x.event)).map(x=>x.event)).toEqual(['generation.validated']);const s=events.find(x=>x.event==='generation.started').data;const saved=await raw(c,'/generations/'+s.run_id+'/save','POST',{}, {'X-Generation-Token':s.generation_token});expect(saved.status()).toBe(201);return(await saved.json()).data.batch_id;}
const statKeys=['generation_count','unique_learned_entries','participating_batches','paused_batches','successful_review_count','batches_ever_reviewed_successfully'];
const uiStats=()=>page.locator('.library-stats dd').evaluateAll(els=>els.map(el=>Number(el.textContent)));
const stats=async()=>{const s=await ok(user,'/me/learning-summary');return statKeys.map(k=>s[k]);};
async function locale(lang){await ok(user,'/me/ui-locale','PUT',{ui_locale:lang==='en'?'en-US':'zh-CN'});}
async function open(lang,width,entry='') {await locale(lang);await page.setViewportSize({width,height:900});await page.goto(origin+'/library'+(entry?'?entry='+entry:''));await ready(page);await expect(page.locator('.library-row')).toHaveCount(entry==='book'?3:20);}
async function search(lang,entry,enter=false) {
 const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me/batches'&&r.request().method()==='GET');
 await page.getByRole('searchbox').fill(entry);
 if(enter)await page.getByRole('searchbox').press('Enter');else await page.getByRole('button',{name:tr(lang,'l.searchAction'),exact:true}).click();
 expect((await wait).status()).toBe(200);await expect(page.getByRole('searchbox')).toBeFocused();await expect(page.getByRole('searchbox')).toBeInViewport();
}
async function toggle(id,value,lang) {
 const box=page.locator('[data-batch="'+id+'"]').getByRole('checkbox'),before=await stats();
 await expect(box).toBeChecked({checked:!value});
 const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me/batches/'+id&&r.request().method()==='PATCH');
 await box.click();const response=await wait;expect(response.status()).toBe(200);const patch=await response.json();
 await expect(box).toBeEnabled();await expect(box).toBeChecked({checked:value});await expect(box).toBeFocused();await expect(box).toBeInViewport();
 const after=await stats();await expect.poll(uiStats).toEqual(after);
 expect(after[2]).toBe(before[2]+(value?1:-1));expect(after[3]).toBe(before[3]+(value?-1:1));
 expect(after.filter((_,i)=>i!==2&&i!==3)).toEqual(before.filter((_,i)=>i!==2&&i!==3));
 expect((await ok(user,'/me/batches/'+id)).batch.participates_in_range_review).toBe(value);
 samples.push({action,lang,id,before,after,ui:await uiStats(),patch:patch.data,focused:true});
}
try {
 await login(admin);const cred=await ok(admin,'/admin/openrouter-credential');await ok(admin,'/admin/openrouter-credential','PUT',{api_key:'qa8-local-only-key',confirmed:true,expected_revision:cred.revision});
 const m=await ok(admin,'/admin/models','POST',{display_name:'QA08 local provider',description:'Disposable test data',openrouter_model_id:'provider/integration'});modelId=m.model.id;await ok(admin,'/admin/models/'+modelId+'/enable','POST',{expected_revision:m.revision});
 const g=await ok(admin,'/admin/groups'),basic=g.items.find(x=>x.code==='basic');await ok(admin,'/admin/groups/basic','PUT',{expected_revision:g.revision,priority:basic.priority,max_entries:5,rolling_24h_limit:60,model_ids:[modelId],allowed_lengths:['short']});
 sql("UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0) ON CONFLICT(level_no) DO NOTHING; INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES(CURRENT_DATE-60,1,1,7,1) ON CONFLICT(effective_day) DO NOTHING");
 userId=await register(user,'library');otherId=await register(other,'other');
 for(let i=0;i<24;i++)ids.push(await generate(user,i<21?'learn':'book'));
 deletedId=await generate(user);otherBatch=await generate(other);await ok(user,'/me/batches/'+deletedId,'DELETE',{});await ok(user,'/me/batches/'+ids[1],'PATCH',{participates_in_range_review:false});
 const longId=ids[20],longTitle='A reading journal about patient practice, shared discoveries, and thoughtful stories that stay with us';
 const detail=(await ok(user,'/me/batches/'+longId)).batch;await ok(user,'/me/batches/'+longId,'PATCH',{title:longTitle,expected_title_revision:detail.title_revision});
 dump('fixture.json',{userId,otherId,modelId,ids,deletedId,otherBatch,longId,longTitle,initialStats:await stats()});
 const proto=await browser.newPage();for(const width of [320,1440]){await proto.setViewportSize({width,height:900});await proto.goto('http://127.0.0.1:4186/prototype/?page=library&lang=en');await proto.waitForTimeout(650);await proto.screenshot({path:new URL('prototype-'+width+'.png',out).pathname});}await proto.close();
 await test('K01','CR014 search/Enter/empty/clear return focus; full statistics survive filtering',async()=>{
  for(const lang of ['en','zh'])for(const width of [320,390,768,1440]){
   await open(lang,width);const baseline=await stats();await search(lang,'book');await expect(page.locator('.library-row')).toHaveCount(3);expect(await uiStats()).toEqual(baseline);
   await search(lang,'word',true);await expect(page.locator('.library-row')).toHaveCount(0);await expect(page.getByText(tr(lang,'l.noresults'),{exact:true})).toBeVisible();
   const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/me/batches');await page.getByRole('button',{name:tr(lang,'l.clear'),exact:true}).click();await wait;
   await expect(page.locator('.library-row')).toHaveCount(20);await expect(page.getByRole('searchbox')).toBeFocused();await expect(page.getByRole('searchbox')).toHaveValue('');
   expect(await uiStats()).toEqual(baseline);samples.push({action,lang,width,filteredRows:3,unfilteredLoadedRows:20,fullLibraryTotal:baseline[2]+baseline[3],searchClearFocus:true});
  }
 });
 await test('K02','CR014 load-more focuses first of four new titles and preserves prior order',async()=>{
  for(const lang of ['en','zh'])for(const width of [320,390,768,1440]){
   await open(lang,width);const old=await page.locator('.library-row').evaluateAll(rows=>rows.map(x=>x.dataset.batch));await page.getByRole('button',{name:tr(lang,'l.more'),exact:true}).click();await expect(page.locator('.library-row')).toHaveCount(24);
   const firstNew=page.locator('[data-batch="'+ids[20]+'"] h2 a');await expect(firstNew).toBeFocused();await expect(firstNew).toBeInViewport();
   expect(await page.locator('.library-row').evaluateAll(rows=>rows.map(x=>x.dataset.batch))).toEqual(ids);expect(old).toEqual(ids.slice(0,20));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   samples.push({action,lang,width,newCount:4,firstNew:ids[20],focus:true});await page.screenshot({path:new URL('K02-'+lang+'-'+width+'.png',out).pathname});
  }
 });
 await test('K03','CR014/015 filtered and unfiltered bidirectional participation uses full-library counts',async()=>{
  for(const lang of ['en','zh'])for(const width of [320,390,768,1440]){
   await open(lang,width,'book');await toggle(ids[21],false,lang);await toggle(ids[21],true,lang);await expect(page.locator('.library-row')).toHaveCount(3);await expect(page.getByRole('searchbox')).toHaveValue('book');
   await open(lang,width);await toggle(ids[0],false,lang);await toggle(ids[0],true,lang);await expect(page.locator('.library-row')).toHaveCount(20);
   await page.screenshot({path:new URL('K03-'+lang+'-'+width+'.png',out).pathname});
  }
 });
 await test('K04','CR012 regression: filtered return by page-link and browser history keeps position and 21 rows',async()=>{
  for(const [lang,width] of [['en',390],['zh',1440]])for(const history of [false,true]){
   await open(lang,width,'LEARN');await page.getByRole('button',{name:tr(lang,'l.more'),exact:true}).click();await expect(page.locator('.library-row')).toHaveCount(21);
   const link=page.locator('[data-batch="'+longId+'"] h2 a');await link.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);const before=await page.evaluate(()=>scrollY);await link.click();await expect(page.locator('.batch-title')).toHaveText(longTitle);
   if(history)await page.goBack();else await page.getByRole('link',{name:tr(lang,'l.backLibrary'),exact:true}).click();await expect(page.locator('.library-row')).toHaveCount(21);await page.waitForTimeout(700);
   await expect(link).toBeFocused();await expect(link).toBeInViewport();await expect(page.getByRole('searchbox')).toHaveValue('LEARN');const after=await page.evaluate(()=>scrollY);expect(Math.abs(after-before)).toBeLessThan(3);samples.push({action,lang,width,history,before,after});
  }
 });
 await test('K05','Shared detail participation updates the cached list summary on return',async()=>{
  await open('en',1440);await page.locator('[data-batch="'+ids[0]+'"] h2 a').click();await expect(page.locator('.batch-detail')).toBeVisible();
  const before=await stats(),box=page.locator('.batch-detail').getByRole('checkbox');await box.click();await expect(box).toBeEnabled();await expect(box).not.toBeChecked();await expect(box).toBeFocused();
  const after=await stats();expect(after[2]).toBe(before[2]-1);await page.getByRole('link',{name:t('l.backLibrary'),exact:true}).click();await expect(page.locator('.library-row')).toHaveCount(20);await expect.poll(uiStats).toEqual(after);
  await toggle(ids[0],true,'en');samples.push({action,before,after});
 });
 await test('K06','PATCH network failure retains confirmed state and successful retry restores focus/stats',async()=>{
  await open('en',390,'book');const box=page.locator('[data-batch="'+ids[21]+'"]').getByRole('checkbox'),before=await stats();
  const pattern='**/api/v1/me/batches/'+ids[21];await page.route(pattern,r=>r.request().method()==='PATCH'?r.abort('failed'):r.continue());await box.click();await expect(box).toBeEnabled();await expect(box).toBeChecked();await expect(box).toBeFocused();expect(await uiStats()).toEqual(before);expect(await stats()).toEqual(before);await expect(page.locator('.app-error')).toBeVisible();await page.unroute(pattern);
  await toggle(ids[21],false,'en');await expect(page.locator('.app-error')).toHaveCount(0);await toggle(ids[21],true,'en');
 });
 await test('K07','A failed summary read keeps the committed checkbox and recovers by search',async()=>{
  await open('en',1440,'book');const box=page.locator('[data-batch="'+ids[21]+'"]').getByRole('checkbox'),before=await stats();
  await page.route('**/api/v1/me/learning-summary',r=>r.abort('failed'));await box.click();await expect(box).toBeEnabled();await expect(box).not.toBeChecked();await expect(box).toBeFocused();await expect(page.locator('.app-error')).toBeVisible();expect(await uiStats()).toEqual(before);const after=await stats();expect(after[2]).toBe(before[2]-1);
  await page.unroute('**/api/v1/me/learning-summary');await search('en','book');await expect.poll(uiStats).toEqual(after);await expect(page.locator('.app-error')).toHaveCount(0);await toggle(ids[21],true,'en');samples.push({action,before,after});
 });
 await test('K08','An older real summary response cannot overwrite the newer second mutation',async()=>{
  await open('en',1440,'book');const baseline=await stats();let release,arrived;const held=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);let n=0;
  await page.route('**/api/v1/me/learning-summary',async r=>{const response=await r.fetch();if(++n===1){arrived();await held;}await r.fulfill({response});});
  try {
   const first=page.locator('[data-batch="'+ids[21]+'"]').getByRole('checkbox'),second=page.locator('[data-batch="'+ids[22]+'"]').getByRole('checkbox');
   await first.click();await seen;await expect(first).toBeDisabled();await second.click();await expect(second).toBeEnabled();await expect(second).not.toBeChecked();await expect.poll(uiStats).toEqual(await stats());
   const latest=await stats();expect(latest[2]).toBe(baseline[2]-2);release();await expect(first).toBeEnabled();await page.waitForTimeout(250);expect(await uiStats()).toEqual(latest);samples.push({action,baseline,latest,oldResponseReleased:true});
  } finally {release();await page.unroute('**/api/v1/me/learning-summary');}
  await toggle(ids[21],true,'en');await toggle(ids[22],true,'en');
 });
 await test('K09','A pending old load-more does not append or take focus after a new search',async()=>{
  await open('en',1440);let release,arrived;const held=new Promise(r=>release=r),seen=new Promise(r=>arrived=r);
  const pattern='**/api/v1/me/batches?**';await page.route(pattern,async r=>{if(!new URL(r.request().url()).searchParams.has('cursor'))return r.continue();const response=await r.fetch();arrived();await held;await r.fulfill({response});});
  try {await page.getByRole('button',{name:t('l.more'),exact:true}).click();await seen;await search('en','book');await expect(page.locator('.library-row')).toHaveCount(3);release();await page.waitForTimeout(350);await expect(page.locator('.library-row')).toHaveCount(3);await expect(page.getByRole('searchbox')).toBeFocused();expect(await page.locator('.library-row').evaluateAll(rows=>rows.map(x=>x.dataset.batch))).toEqual(ids.slice(21));}
  finally{release();await page.unroute(pattern);}
 });
 await test('K10','UI18 exact six labels/order, local accessibility and no unexpected runtime errors',async()=>{
  await open('zh',1440);expect(await page.locator('.library-stats dt').allTextContents()).toEqual(['generated','words','participating','paused','successes','successfulbatches'].map(k=>tr('zh','l.stat.'+k)));
  const order=await page.locator('.library-page').evaluate(el=>['.page-head','.library-stats','.library-toolbar','.library-list'].map(s=>el.querySelector(s).getBoundingClientRect().top));expect(order.every((v,i)=>i===0||v>order[i-1])).toBe(true);
  const Axe=createRequire(process.cwd()+'/frontend/package.json')('@axe-core/playwright').default,scan=await new Axe({page}).include('.library-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();dump('axe.json',{violations:scan.violations});expect(scan.violations).toEqual([]);
  expect(runtime.filter(e=>e.kind==='pageerror'||!(['K06','K07'].includes(e.action)&&e.text==='Failed to load resource: net::ERR_FAILED'))).toEqual([]);await page.screenshot({path:new URL('K10-zh-1440.png',out).pathname});
 });
} catch(e){results.push({id:'SETUP',result:'FAIL',error:String(e)});console.log(String(e));}
finally{dump('library-results.json',{results,samples,runtime,localProviderCalls:calls,realProviderCalls:0});await stop(browser);await new Promise(r=>provider.close(r));console.log(JSON.stringify(results,null,2));if(results.some(x=>x.result==='FAIL'))process.exitCode=1;}
