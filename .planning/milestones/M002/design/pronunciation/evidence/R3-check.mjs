import {createRequire} from 'node:module';import {writeFile,copyFile} from 'node:fs/promises';
const require=createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');const {chromium}=require('@playwright/test');
const dir='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/design/pronunciation/evidence';const browser=await chromium.launch();const page=await browser.newPage();const cases=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
const assert=(v,m)=>{if(!v)throw new Error(m)};const test=async(name,fn)=>{try{cases.push({name,status:'PASS',observations:await fn()})}catch(e){cases.push({name,status:'FAIL',error:e.message})}};
const goto=async(query,view='formal')=>{await page.goto('http://127.0.0.1:4175/M002/design/pronunciation/'+view+'/?'+query);await page.waitForSelector('#app:not([aria-busy])');await page.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished)))};
const check=async()=>{
 const result=await page.evaluate(()=>{
  const elements=[...document.querySelectorAll('.pron-control,.pron-action,.pron-menu-trigger')];
  return {overflow:document.documentElement.scrollWidth-innerWidth,issues:elements.flatMap(el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect(),a=[];
   if(['Top','Bottom','Left','Right'].some(x=>parseFloat(s['padding'+x])!==0||parseFloat(s['margin'+x])!==0||parseFloat(s['border'+x+'Width'])!==0))a.push('spacing/frame');
   if(s.boxShadow!=='none'||s.backgroundColor!=='rgba(0, 0, 0, 0)')a.push('chrome');
   if(el.matches('.pron-action')&&(Math.abs(r.width-18)>.01||Math.abs(r.height-18)>.01||el.textContent.trim()))a.push('icon layout');
   if(el.matches('.pron-control')&&el.dataset.sourceCount==='1'&&el.querySelector('[data-pron-source]'))a.push('single source label');
   return a.map(x=>({class:el.className,issue:x}));
  }),pickerControls:document.querySelectorAll('#pron-page-401-picker [data-pron-control]').length,controls:[...document.querySelectorAll('.pron-control')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))};
 });assert(!result.overflow,'overflow');assert(!result.pickerControls,'picker audio');assert(!result.issues.length,JSON.stringify(result.issues));return result;
};
for(const [view,width,lang] of [['result',1440,'zh'],['plan',390,'en'],['library',390,'zh'],['library',320,'en']])await test(`${view} ${width} ${lang}`,async()=>{
 await page.setViewportSize({width,height:width===1440?1000:844});await goto(`page=${view}&lang=${lang}&longwords=${width===320?1:0}`);const r=await check();
 if(view==='result'){await page.locator('.m003-result-meanings').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/R3-result-desktop.png'})}
 if(view==='library'&&width===390){await page.locator('.study-resources').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/R3-library-mobile.png'})}return r;
});
await test('transparent hit area and no overlapping controls',async()=>{
 await page.setViewportSize({width:390,height:844});await goto('page=plan&lang=zh');const single=page.locator('[data-word="wander"] [data-pron-play]');await single.scrollIntoViewIfNeeded();const box=await single.boundingBox();await page.mouse.click(box.x-10,box.y+9);await page.waitForFunction(()=>document.querySelector('[data-word="wander"] [data-pron-play]').dataset.playState==='playing');
 const multi=page.locator('[data-word="gentle"]');await multi.scrollIntoViewIfNeeded();const metrics=await multi.evaluate(el=>{
  const a=el.querySelector('.pron-action'),m=el.querySelector('.pron-menu-trigger'),ar=a.getBoundingClientRect(),mr=m.getBoundingClientRect(),ap=getComputedStyle(a,'::before'),mp=getComputedStyle(m,'::before');return {aRight:ar.right-parseFloat(ap.right),mLeft:mr.left+parseFloat(mp.left),aWidth:ar.width-parseFloat(ap.left)-parseFloat(ap.right),aHeight:ar.height-parseFloat(ap.top)-parseFloat(ap.bottom),menuWidth:mr.width};
 });assert(metrics.aWidth>=24&&metrics.aHeight>=44,'small transparent target');assert(metrics.aRight<=metrics.mLeft+.01,'overlapping hits');
 await multi.locator('[data-pron-menu-trigger]').click();assert(await multi.locator('.pron-menu').isVisible(),'menu not clickable');await page.keyboard.press('Escape');assert(await multi.locator('[data-pron-menu-trigger]').evaluate(el=>el===document.activeElement),'focus not restored');return metrics;
});
await test('playing and error retain bare icon styling',async()=>{
 await goto('page=library&lang=zh&scenario=unavailable');await page.locator('[data-pron-play]').first().click();await page.waitForFunction(()=>document.querySelector('[data-pron-play]').dataset.playState==='error');await check();
 await goto('page=library&lang=zh');await page.locator('[data-pron-play]').first().click();await page.waitForFunction(()=>document.querySelector('[data-pron-play]').dataset.playState==='playing');return await check();
});
await test('prototype synchronized',async()=>{await goto('lang=en','prototype');return await check()});
await test('no resource errors',async()=>{assert(errors.length===0,JSON.stringify(errors));return {errors}});
const report={version:'M002-UI-32-R3',timestamp:new Date().toISOString(),scope:'Targeted border/spacing/layout revision, deterministic design only',pass:cases.filter(c=>c.status==='PASS').length,total:cases.length,cases};await writeFile(dir+(report.pass===report.total?'/M002-UI-32-R3-browser.json':'/R3-browser-run-01-failed.json'),JSON.stringify(report,null,2)+'\n');await copyFile('/private/tmp/wordweave-m002-pronunciation-r3/check.mjs',dir+'/R3-check.mjs');console.log(JSON.stringify(report,null,2));await browser.close();process.exitCode=report.pass===report.total?0:1;
