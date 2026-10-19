import {createRequire} from 'node:module';import {mkdir,writeFile,copyFile} from 'node:fs/promises';
const require=createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');const {chromium}=require('@playwright/test');
const dir='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/design/pronunciation/evidence';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],external=[],cases=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4175/'))external.push(r.url())});
const assert=(v,m)=>{if(!v)throw new Error(m)};const test=async(name,fn)=>{try{cases.push({name,status:'PASS',observations:await fn()})}catch(e){cases.push({name,status:'FAIL',error:e.message})}};
const goto=async(query,view='formal')=>{await page.goto('http://127.0.0.1:4175/M002/design/pronunciation/'+view+'/?'+query);await page.waitForSelector('#app:not([aria-busy])');await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished))})};
const control=(word='wander')=>page.locator(`[data-pron-control][data-word="${word}"]`).first();const button=(word)=>control(word).locator('[data-pron-play]');
const wait=async(state,word='wander')=>page.waitForFunction(({state,word})=>document.querySelector(`[data-word="${word}"] [data-pron-play]`)?.dataset.playState===state,{state,word});
const contract=async()=>{
 const metrics=await page.evaluate(()=>{
  const controls=[...document.querySelectorAll('[data-pron-control]')];
  return {overflow:document.documentElement.scrollWidth-innerWidth,picker:document.querySelectorAll('#pron-page-401-picker [data-pron-control]').length,controls:controls.length,violations:controls.flatMap(el=>{
   const b=el.querySelector('[data-pron-play]'),r=b.getBoundingClientRect(),source=el.querySelector('[data-pron-source]');const issues=[];
   if(b.textContent.trim()||b.hasAttribute('title'))issues.push('visible action/state text or tooltip');
   if(!b.getAttribute('aria-label'))issues.push('missing accessible name');
   if(el.dataset.sourceCount==='1'&&(source||el.querySelector('[data-pron-menu-trigger]')))issues.push('single source label/menu');
   if(el.dataset.sourceCount!=='1'&&!source)issues.push('multiple sources missing choice');
   if(Math.abs(r.width-44)>.01||Math.abs(r.height-44)>.01)issues.push('not 44px');
   if(el.querySelector('[data-pron-label],[data-pron-caption],.pron-button-copy'))issues.push('old text nodes');
   return issues;
  }),local:[...document.querySelectorAll('[role="status"]')].every(el=>el.closest('[data-pron-control]'))};
 });
 assert(metrics.overflow===0,'horizontal overflow');assert(!metrics.picker,'picker audio');assert(metrics.local,'detached state');assert(metrics.violations.length===0,JSON.stringify(metrics.violations));return metrics;
};
for(const [view,width,lang] of [['result',1440,'zh'],['plan',390,'en'],['library',1440,'en'],['library',390,'zh'],['picker',390,'zh']])await test(`layout ${view} ${width} ${lang}`,async()=>{
 await page.setViewportSize({width,height:width===1440?1000:844});await goto(`page=${view}&lang=${lang}`);const result=await contract();assert(result.controls===(view==='picker'?0:6),'control count');
 if(view==='result'){await page.locator('.m003-result-meanings').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/R2-result-desktop.png'})}
 if(view==='library'&&width===390){await page.locator('.study-resources').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/R2-library-mobile.png'})}return result;
});
for(const scenario of ['dictionary','fallback','unavailable','gesture'])await test(`icon states ${scenario}`,async()=>{
 await goto(`page=library&lang=en&scenario=${scenario}`);const b=button();const before=await control().evaluate(el=>{const r=el.closest('[data-pron-item]').getBoundingClientRect();return {w:r.width,h:r.height}});
 const idle=await b.innerHTML();await b.click();await wait('preparing');assert(await b.innerHTML()!==idle,'no loading icon');await contract();
 const state=scenario==='unavailable'?'error':scenario==='gesture'?'gesture':'playing';await wait(state);await contract();
 const icon=await b.innerHTML();assert(icon!==idle,'no state icon');
 if(scenario==='gesture'){await b.click();await wait('playing');assert(await control().getAttribute('data-actual-source')==='browser','wrong fallback')}
 else if(scenario==='unavailable'){await b.click();await wait('preparing');await wait('error')}
 else{assert(await control().getAttribute('data-actual-source')===(scenario==='dictionary'?'dictionary':'browser'),'wrong actual source');await wait('complete');assert(await b.innerHTML()===idle,'completion did not restore speaker')}
 const after=await control().evaluate(el=>{const r=el.closest('[data-pron-item]').getBoundingClientRect();return {w:r.width,h:r.height}});assert(Math.abs(before.h-after.h)<.01&&Math.abs(before.w-after.w)<.01,'card moved');return {state,noVisibleText:true,stableBounds:true};
});
await test('explicit alternative source and keyboard menu',async()=>{
 await goto('page=plan&lang=zh&scenario=accent');await button('gentle').click();await wait('accent','gentle');await contract();await button('gentle').click();
 assert(await control('gentle').getAttribute('data-accent')==='en-GB','implicit accent switch');const menu=control('gentle').locator('.pron-menu');assert(await menu.isVisible(),'no choice menu');
 await menu.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished))});
 const bounds=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),c=el.parentElement.getBoundingClientRect();return {x:r.x,right:r.right,dy:r.y-c.bottom,position:getComputedStyle(el).position}});assert(bounds.x>=0&&bounds.right<=390&&Math.abs(bounds.dy-6)<.01&&bounds.position==='absolute','menu detached');
 await control('gentle').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/R2-plan-mobile-source-menu.png'});
 assert(await page.locator(':focus').getAttribute('data-pron-accent')==='en-US','alternative not focused');await page.keyboard.press('Enter');await wait('playing','gentle');assert(await control('gentle').locator('[data-pron-source]').textContent()==='美音','wrong source label');
 const trigger=control('gentle').locator('[data-pron-menu-trigger]');await trigger.click();await page.keyboard.press('Escape');assert(await trigger.evaluate(el=>el===document.activeElement),'focus not restored');await contract();return bounds;
});
await test('cross-word and restart preserve icon-only controls',async()=>{
 await goto('page=result&lang=en');await button().click();await button('gentle').click();await wait('playing','gentle');assert(await button().getAttribute('data-play-state')==='idle','old word active');await button('gentle').click();await wait('preparing','gentle');await wait('playing','gentle');assert(await page.locator('[data-play-state="playing"]').count()===1,'overlap');return await contract();
});
await test('320px long words',async()=>{await page.setViewportSize({width:320,height:800});await goto('page=library&lang=en&longwords=1');const result=await contract();assert(await page.locator('.pron-word-heading').evaluateAll(es=>es.every(el=>el.scrollWidth<=el.clientWidth)),'clipped heading');return result});
await test('reduced motion prototype',async()=>{await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await goto('lang=en','prototype');await button().click();await wait('preparing');assert(await button().locator('svg').evaluate(el=>getComputedStyle(el).animationName)==='none','loading motion');await wait('playing');assert(await button().locator('svg').evaluate(el=>getComputedStyle(el).animationName)==='none','playing motion');return await contract()});
await test('local design resources',async()=>{assert(!errors.length,JSON.stringify(errors));assert(!external.length,'external requests');return {errors,external}});
const report={version:'M002-UI-32-R2',timestamp:new Date().toISOString(),scope:'Targeted design revision verification; no real audio or production validation',pass:cases.filter(c=>c.status==='PASS').length,total:cases.length,cases};
await writeFile(dir+(report.pass===report.total?'/M002-UI-32-R2-browser.json':'/R2-browser-run-01-failed.json'),JSON.stringify(report,null,2)+'\n');await copyFile('/private/tmp/wordweave-m002-pronunciation-r2/check.mjs',dir+'/R2-check.mjs');console.log(JSON.stringify(report,null,2));await browser.close();process.exitCode=report.pass===report.total?0:1;
