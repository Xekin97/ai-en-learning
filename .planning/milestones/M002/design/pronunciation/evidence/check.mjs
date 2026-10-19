import {createRequire} from 'node:module';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
const require=createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');
const {chromium}=require('@playwright/test');
const dir='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/design/pronunciation/evidence';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],external=[],cases=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4175/'))external.push(r.url())});
const base='http://127.0.0.1:4175/M002/design/pronunciation/';
const assert=(v,msg)=>{if(!v)throw new Error(msg)};
const test=async(name,fn)=>{try{cases.push({name,status:'PASS',observations:await fn()})}catch(e){cases.push({name,status:'FAIL',error:e.message})}};
const goto=async(query,view='formal')=>{await page.goto(base+view+'/?'+query);await page.waitForSelector('#app:not([aria-busy])');};
const button=(word='wander')=>page.locator(`[data-pron-control][data-word="${word}"] [data-pron-play]`).first();
const waitState=async(state,word='wander')=>page.waitForFunction(({state,word})=>document.querySelector(`[data-pron-control][data-word="${word}"] [data-pron-play]`)?.dataset.playState===state,{state,word});
const bounds=async()=>page.locator('[data-pron-item]').evaluateAll(cards=>cards.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height}}));
const sameBounds=(a,b)=>a.length===b.length&&a.every((r,i)=>Math.abs(r.width-b[i].width)<0.01&&Math.abs(r.height-b[i].height)<0.01);
const allLocal=async()=>page.evaluate(()=>[...document.querySelectorAll('[role="status"]')].every(el=>el.closest('[data-pron-control]')));
for(const width of [1440,390])for(const view of ['picker','plan','result','library']) {
 await test(`layout ${view} ${width}`,async()=>{
  await page.setViewportSize({width,height:width===390?844:1000});
  await goto(`page=${view}&lang=${width===390?'en':'zh'}`);
  const counts={picker:await page.locator('#pron-page-401-picker [data-pron-control]').count(),total:await page.locator('[data-pron-control]').count()};
  assert(counts.picker===0,'picker contains playback');assert(counts.total===(view==='picker'?0:6),'wrong control count');
  assert(await allLocal(),'detached live status');assert(await page.locator('.pron-status-card,.pron-status-slot').count()===0,'detached card');
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,small:[...document.querySelectorAll('[data-pron-play],[data-pron-menu-trigger]')].filter(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44}).length,ids:[...document.querySelectorAll('[id]')].map(el=>el.id)}));
  assert(metrics.overflow===0,'horizontal overflow');assert(metrics.small===0,'small touch target');assert(new Set(metrics.ids).size===metrics.ids.length,'duplicate id');
  if(width===1440&&view==='picker')await page.screenshot({path:dir+'/picker-desktop.png'});
  if(width===1440&&view==='result'){await page.locator('#pron-page-402-result').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/result-desktop.png'});}
  return {counts,overflow:metrics.overflow,minTouch:44};
 });
}
for(const scenario of ['dictionary','fallback','gesture','unavailable','accent'])await test(`local states ${scenario}`,async()=>{
 await page.setViewportSize({width:390,height:844});await goto(`page=library&lang=en&scenario=${scenario}`);
 const word=scenario==='accent'?'gentle':'wander';const b=button(word);const before=await bounds();
 await b.click();await waitState('preparing',word);
 const firstState=scenario==='unavailable'?'error':scenario==='gesture'?'gesture':scenario==='accent'?'accent':'playing';
 await waitState(firstState,word);assert(sameBounds(before,await bounds()),'card dimensions changed');
 const caption=await b.locator('[data-pron-caption]').textContent();
 const overflow=await b.locator('.pron-button-copy').evaluate(el=>el.scrollWidth>el.clientWidth);
 assert(!overflow,'control text overflow');
 if(scenario==='unavailable'){
  assert(await b.locator('[data-pron-label]').textContent()==='Retry','retry not local');
  await page.locator('.study-resources').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/library-mobile-error.png'});
  await b.click();await waitState('preparing');await waitState('error');
 } else {
  if(scenario==='gesture'||scenario==='accent'){await b.click();await waitState('playing',word)}
  const actual=await b.locator('[data-pron-caption]').textContent();
  assert(actual.includes(scenario==='dictionary'?'Dictionary':'Browser'),'wrong actual source');
  if(scenario==='accent')assert(actual.includes('US'),'replacement accent omitted');
  await waitState('complete',word);assert(sameBounds(before,await bounds()),'completion changed geometry');
 }
 assert(await allLocal(),'status outside control');return {firstState,caption,geometryStable:true};
});
await test('cross-word cancellation and same-word restart',async()=>{
 await goto('page=plan&lang=zh');await button().click();await button('gentle').click();await waitState('playing','gentle');
 assert(await button().getAttribute('data-play-state')==='idle','old word did not reset');
 await button('gentle').click();await waitState('preparing','gentle');await waitState('playing','gentle');
 assert(await page.locator('[data-play-state="playing"]').count()===1,'overlap');return {old:'idle',new:'playing',replay:'restarts'};
});
await test('keyboard local menu and long-word mobile plan',async()=>{
 await goto('page=plan&lang=en&longwords=1');
 const control=page.locator('[data-word="pronunciation"]');const trigger=control.locator('[data-pron-menu-trigger]');
 await trigger.focus();await page.keyboard.press('Enter');
 const menu=control.locator('.pron-menu');assert(await menu.isVisible(),'menu not open');
 await page.keyboard.press('ArrowDown');assert(await page.locator(':focus').getAttribute('data-pron-accent')==='en-US','arrow navigation');
 const {r,cr}=await menu.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));const r=el.getBoundingClientRect(),c=el.parentElement.getBoundingClientRect();return {r:{x:r.x,y:r.y,width:r.width,height:r.height},cr:{x:c.x,y:c.y,width:c.width,height:c.height}}});
 assert(r.x>=0&&r.x+r.width<=390,'menu outside viewport');assert(Math.abs(r.y-cr.y-cr.height-6)<1,'menu detached from control');
 await control.scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/plan-mobile-menu.png'});
 await page.keyboard.press('Escape');assert(await trigger.evaluate(el=>el===document.activeElement),'focus not restored');assert(!await menu.isVisible(),'menu remains');
 await trigger.click();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await waitState('playing','pronunciation');
 assert(await control.getAttribute('data-accent')==='en-US','selection not updated');return {menuWidth:r.width,anchored:true,escapeFocus:true};
});
await test('320px retained-entry long words',async()=>{
 await page.setViewportSize({width:320,height:800});await goto('page=library&lang=en&longwords=1');
 const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,clipped:[...document.querySelectorAll('.pron-word-heading')].filter(el=>el.scrollWidth>el.clientWidth).map(el=>el.textContent)}));
 assert(metrics.overflow===0&&metrics.clipped.length===0,JSON.stringify(metrics));return metrics;
});
await test('reduced motion prototype',async()=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await goto('lang=zh','prototype');
 await button().click();await waitState('playing');assert(await button().locator('svg').evaluate(el=>getComputedStyle(el).animationName)==='none','animation active');
 assert(await page.locator('[data-pron-control]').count()===3&&await allLocal(),'prototype mismatch');return {motion:'none',controls:3};
});
await test('source isolation',async()=>{assert(errors.length===0,JSON.stringify(errors));assert(external.length===0,'external requests');return {errors,externalRequests:external.length}});
const report={version:'M002-UI-32-R1',scope:'Design browser inspection only; no audio/API/production verification',timestamp:new Date().toISOString(),pass:cases.filter(x=>x.status==='PASS').length,total:cases.length,cases,errors,externalRequests:external};
const failed=cases.some(x=>x.status==='FAIL');
await writeFile(dir+(failed?'/browser-run-02-failed.json':'/M002-UI-32-R1-browser.json'),JSON.stringify(report,null,2)+'\n');
await copyFile('/private/tmp/wordweave-m002-pronunciation-r1/check.mjs',dir+'/check.mjs');
console.log(JSON.stringify(report,null,2));await browser.close();process.exitCode=failed?1:0;
