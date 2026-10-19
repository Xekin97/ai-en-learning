import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(resolve('frontend/package.json'));
const {chromium}=require('@playwright/test');
const dir=dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch();
const page=await browser.newPage();
page.setDefaultTimeout(5000);
const cases=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
const assert=(value,message)=>{if(!value)throw new Error(message)};
const test=async(name,run)=>{try{cases.push({name,status:'PASS',observations:await run()})}catch(error){cases.push({name,status:'FAIL',error:error.message})}console.log(cases.at(-1).status+' '+name)};
const goto=async(query,view='formal',baseline=false)=>{
  await page.goto(`http://127.0.0.1:4175/M002/design/pronunciation/${baseline?'':'technical-alignment/'}${view}/?${query}`);
  await page.waitForSelector('#app:not([aria-busy])');
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished))});
};
const state=async(control,expected)=>{
  await control.locator(`[data-pron-play][data-play-state="${expected}"]`).waitFor();
};
const inspect=async()=>{
  const result=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-innerWidth,
    pickerControls:document.querySelectorAll('#pron-page-401-picker [data-pron-control]').length,
    issues:[...document.querySelectorAll('.pron-control,.pron-action,.pron-menu-trigger')].flatMap(el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect(),a=[];
      if(['Top','Bottom','Left','Right'].some(x=>parseFloat(s['padding'+x])!==0||parseFloat(s['margin'+x])!==0||parseFloat(s['border'+x+'Width'])!==0))a.push('spacing/frame');
      if(s.boxShadow!=='none'||s.backgroundColor!=='rgba(0, 0, 0, 0)')a.push('chrome');
      if(el.matches('.pron-action')&&(Math.abs(r.width-18)>.01||Math.abs(r.height-18)>.01||el.textContent.trim()))a.push('icon');
      if(el.matches('.pron-control')&&el.dataset.sourceCount==='1'&&el.querySelector('[data-pron-source]'))a.push('single label');
      return a;
    })
  }));
  assert(!result.overflow,'horizontal overflow');assert(!result.pickerControls,'picker audio');assert(!result.issues.length,JSON.stringify(result.issues));return result;
};
const cards=()=>page.locator('[data-pron-item]').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}}));
const compareCards=(before,after)=>{
  const delta=Math.max(...before.flatMap((r,i)=>Object.keys(r).map(k=>Math.abs(r[k]-after[i][k]))));
  assert(delta<=.01,`card layout shifted ${delta}px`);return delta;
};
const pixelDelta=async(before,after)=>{
  if(before.equals(after))return {differentPixels:0};
  return page.evaluate(async urls=>{
    const imgs=await Promise.all(urls.map(url=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=url})));
    if(imgs[0].width!==imgs[1].width||imgs[0].height!==imgs[1].height)return {differentPixels:Infinity};
    const canvas=document.createElement('canvas');canvas.width=imgs[0].width;canvas.height=imgs[0].height;
    const ctx=canvas.getContext('2d');
    const data=imgs.map(i=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(i,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data});
    let differentPixels=0,x1=canvas.width,y1=canvas.height,x2=0,y2=0;
    for(let i=0;i<data[0].length;i+=4)if([0,1,2,3].some(k=>data[0][i+k]!==data[1][i+k])){
      differentPixels++;const x=i/4%canvas.width,y=Math.floor(i/4/canvas.width);x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);
    }
    return {differentPixels,bounds:[x1,y1,x2,y2]};
  },[before,after].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));
};

for(const [view,width,lang] of [['result',1440,'zh'],['plan',390,'en'],['library',390,'zh'],['library',320,'en']])await test(`normal baseline unchanged: ${view}/${width}/${lang}`,async()=>{
  await page.setViewportSize({width,height:width===1440?1000:844});
  const query=`page=${view}&lang=${lang}&longwords=${width===320?1:0}`;
  await goto(query,'formal',true);const beforeCards=await cards();const before=await page.screenshot({fullPage:true,animations:'disabled'});
  await goto(query);const after=await page.screenshot({fullPage:true,animations:'disabled'});
  const delta=await pixelDelta(before,after);
  // Chromium rounds a handful of anti-aliased input-border pixels differently.
  // Geometry must be unchanged; allow at most 10 image pixels, not a percentage.
  assert(delta.differentPixels<=10,'normal screenshot differs from approved R3: '+JSON.stringify(delta));
  return {...delta,cardDelta:compareCards(beforeCards,await cards()),...await inspect()};
});

for(const [view,lang,lost,alternative] of [['plan','zh','en-GB','en-US'],['result','en','en-GB','en-US'],['library','zh','en-GB','en-US'],['plan','en','en-US','en-GB'],['result','zh','en-US','en-GB'],['library','en','en-US','en-GB']])await test(`single alternative explicit choice: ${view}/${lang}/${lost}`,async()=>{
  await page.setViewportSize({width:1440,height:1000});
  await goto(`page=${view}&lang=${lang}&scenario=accent&lost=${lost}&alternatives=${alternative}`);
  const control=page.locator('[data-pron-control]').first(),main=control.locator('[data-pron-play]');
  await main.scrollIntoViewIfNeeded();const before=await cards();
  await main.click();await state(control,'accent');
  const label=await main.getAttribute('aria-label');
  const expected=lang==='zh'?(lost==='en-US'?'美音':'英音'):(lost==='en-US'?'US':'UK');
  assert(label.includes(expected)&&label.includes('wander'),'wrong dynamic accent/word');
  assert(await control.getAttribute('data-accent')===lost,'silent accent switch');
  assert(await control.getAttribute('data-actual-source')==='','played without choice');
  assert(await control.locator('[data-pron-source]').count()===0,'persistent source label');
  assert(await control.locator('[data-pron-accent]').count()===1,'not exactly one actual alternative');
  assert(await main.getAttribute('aria-haspopup')==='menu','warning lacks menu semantics');
  await main.click();assert(await control.locator('.pron-menu').isVisible(),'warning cannot open menu');
  const choice=control.locator('[data-pron-accent]');
  assert(await choice.getAttribute('data-pron-accent')===alternative,'lost option remains');
  assert(await choice.evaluate(el=>el===document.activeElement),'menu focus missing');
  if(view==='result'&&lang==='zh')await page.screenshot({path:resolve(dir,'TA1-reverse-single-desktop.png')});
  await page.keyboard.press('Escape');
  assert(await main.evaluate(el=>el===document.activeElement),'Escape focus not on warning');
  assert(await control.getAttribute('data-actual-source')==='','Escape started playback');
  await main.click();await choice.click();await state(control,'playing');
  assert(await control.getAttribute('data-accent')===alternative,'explicit choice not applied');
  assert(await main.evaluate(el=>el===document.activeElement),'selection focus not restored');
  assert(await control.locator('[data-pron-source]').count()===0,'single label after selection');
  assert(await control.locator('.pron-menu').count()===0,'unneeded single-source menu remains');
  return {label,alternative,cardDelta:compareCards(before,await cards()),...await inspect()};
});

await test('zero alternatives: retry icon without empty menu',async()=>{
  await goto('page=result&lang=zh&scenario=accent&lost=en-US&alternatives=none');
  const control=page.locator('[data-pron-control]').first(),main=control.locator('[data-pron-play]');
  await main.click();await state(control,'error');
  assert(await control.locator('.pron-menu,[data-pron-menu-trigger]').count()===0,'empty menu');
  assert(await main.getAttribute('aria-haspopup')===null,'error pretends menu');
  await main.click();await state(control,'error');return await inspect();
});

await test('multiple alternatives and generic locale: keyboard, outside and Tab dismissal',async()=>{
  await goto('page=library&lang=en&scenario=accent&lost=neutral&alternatives=en-GB,en-US');
  const control=page.locator('[data-pron-control]').first(),main=control.locator('[data-pron-play]');
  await main.click();await state(control,'accent');assert((await main.getAttribute('aria-label')).includes('English'),'generic locale wrong');
  await main.click();const options=control.locator('[data-pron-accent]');assert(await options.count()===2,'actual alternatives missing');
  await page.keyboard.press('End');assert(await options.last().evaluate(el=>el===document.activeElement),'End');
  await page.keyboard.press('Home');assert(await options.first().evaluate(el=>el===document.activeElement),'Home');
  await page.keyboard.press('ArrowUp');assert(await options.last().evaluate(el=>el===document.activeElement),'ArrowUp wrap');
  await page.keyboard.press('Tab');await control.locator('.pron-menu').waitFor({state:'hidden'});
  await main.click();await page.locator('h1').click();await control.locator('.pron-menu').waitFor({state:'hidden'});
  await main.click();await options.last().click();await state(control,'playing');
  assert(await control.locator('[data-pron-source]').textContent()==='US','multiple actual choices label');
  assert(await control.locator('[data-pron-accent="neutral"]').count()===0,'failed option restored');
  return await inspect();
});

await test('320px long words and reduced motion: no overflow, stable cards and usable hit target',async()=>{
  await page.setViewportSize({width:320,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await goto('page=library&lang=en&longwords=1&scenario=accent&lost=en-US&alternatives=en-GB');
  const control=page.locator('[data-pron-control]').first(),main=control.locator('[data-pron-play]');
  await main.scrollIntoViewIfNeeded();const before=await cards();await main.click();await state(control,'accent');
  const hit=await main.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el,'::before');return {width:r.width-parseFloat(s.left)-parseFloat(s.right),height:r.height-parseFloat(s.top)-parseFloat(s.bottom)}});
  assert(hit.width>=44&&hit.height>=44,'warning hit target');
  await main.click();const box=await control.locator('.pron-menu').boundingBox();assert(box.x>=0&&box.x+box.width<=320,'menu off screen');
  await page.screenshot({path:resolve(dir,'TA1-library-single-mobile.png')});
  await page.keyboard.press('Escape');const delta=compareCards(before,await cards());
  await page.emulateMedia({reducedMotion:'no-preference'});return {hit,menu:box,cardDelta:delta,...await inspect()};
});

await test('prototype consumes same patch and preserves fixture across language switch',async()=>{
  await page.setViewportSize({width:1280,height:900});
  await goto('scenario=accent&lang=zh&lost=en-US&alternatives=en-GB','prototype');
  await page.getByRole('link',{name:'English',exact:true}).click();await page.waitForSelector('#app:not([aria-busy])');
  assert(page.url().includes('lost=en-US'),'language switch lost fixture');
  const control=page.locator('[data-pron-control]').first();await control.locator('[data-pron-play]').click();await state(control,'accent');
  assert((await control.locator('[data-pron-play]').getAttribute('aria-label')).includes('(US)'),'prototype stale copy');
  await control.locator('[data-pron-play]').click();assert(await control.locator('[data-pron-accent]').count()===1,'prototype stale options');
  await page.screenshot({path:resolve(dir,'TA1-prototype-single.png')});return await inspect();
});

await test('late preparing callback cancelled when another word starts; gesture retry retained',async()=>{
  await goto('page=result&lang=zh&scenario=accent');
  const controls=page.locator('[data-pron-control]');await controls.nth(0).locator('[data-pron-play]').click();await controls.nth(1).locator('[data-pron-play]').click();
  await state(controls.nth(1),'accent');await state(controls.nth(0),'idle');
  await goto('page=result&lang=en&scenario=gesture');const control=page.locator('[data-pron-control]').first();
  await control.locator('[data-pron-play]').click();await state(control,'gesture');await control.locator('[data-pron-play]').click();await state(control,'playing');return {cancelled:true,gestureRetry:true};
});
await test('resources and runtime errors',async()=>{assert(!errors.length,JSON.stringify(errors));return {errors}});
const report={version:'M002-UI-32-R3-TA1',timestamp:new Date().toISOString(),scope:'Deterministic design interaction only; no real audio or device validation',pass:cases.filter(c=>c.status==='PASS').length,total:cases.length,cases};
await writeFile(resolve(dir,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));await browser.close();process.exitCode=report.pass===report.total?0:1;
