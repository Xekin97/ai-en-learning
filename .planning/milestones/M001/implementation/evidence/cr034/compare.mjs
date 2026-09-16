import { chromium, webkit, expect } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import { origin, dir, login } from './real-stack.mjs';
const design='http://127.0.0.1:6010/prototype/';
const results=[],extras=[];
const rules={
  '.range-editor':['gridTemplateColumns','gap'],
  '.range-editor .card-header':['padding'],
  '.range-editor .card-body':['padding'],
  '.range-editor .card-footer':['padding'],
  '.date-range':['gap','gridTemplateColumns'],
  '#review-start':['height','width','padding','fontFamily','fontSize','backgroundColor','borderRadius'],
  '#review-end':['height','width','padding','fontFamily','fontSize','backgroundColor','borderRadius'],
  '.range-count':['height','width','minHeight','flexDirection','gap','backgroundColor'],
  '.range-count .count-number':['fontSize','fontFamily','color'],
  '.range-count .helper':['fontSize','lineHeight','color','margin'],
  '.range-feedback':['marginTop'],
};
async function metrics(page, extra={}) {
  return page.evaluate(rules=>Object.fromEntries(Object.entries(rules).map(([selector,keys])=>{
    const n=document.querySelector(selector);if(!n)throw Error('Missing '+selector);
    const style=getComputedStyle(n);return [selector,Object.fromEntries(keys.map(key=>[key,style[key]]))];
  })),{...rules,...extra});
}
let browser=await chromium.launch();
try{
for(const locale of ['en-US','zh-CN']){
  const context=await browser.newContext();await login(context,'dev034_empty',locale);
  const app=await context.newPage(),prototype=await browser.newPage();
  await prototype.addInitScript(()=>localStorage.clear());
  let mode='empty';
  await app.route('**/me/review-range/preview?*',async route=>{
    if(mode==='error')await route.fulfill({status:500,json:{error:{code:'INTERNAL_ERROR'}}});
    else if(mode==='loading')await new Promise(resolve=>setTimeout(resolve,1000)).then(()=>route.continue()).catch(()=>{});
    else await route.continue();
  });
  for(const width of [320,390,560,561,720,1080,1081,1280,1440]){
    await app.setViewportSize({width,height:1000});await prototype.setViewportSize({width,height:1000});
    for(const state of ['empty','invalid','error']){
      mode=state;await app.goto(origin+'/review');
      if(state==='invalid'){await expect(app.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');await app.locator('#review-start').fill('');}
      await expect(app.locator('.range-editor')).toHaveAttribute('data-range-preview',state==='error'?'failed':state);
      await prototype.goto(design+'?page=PAGE-007&role=learner&locale='+locale+'&state='+({empty:'empty-library',invalid:'date-missing',error:'preview-error'}[state]));
      await prototype.locator('.range-editor').waitFor();
      const extra=state==='empty'?{'.range-feedback .empty-state':['padding','minHeight','backgroundColor'],'.range-feedback h2':['fontSize','color'],'.range-feedback .inline-actions':['gap','marginTop','flexDirection']}
        :state==='error'?{'.range-feedback .notice':['padding','gap','color','backgroundColor'],'.range-feedback .notice-title':['fontSize','fontWeight','color']}:{};
      const actual=await metrics(app,extra),expected=await metrics(prototype,extra),diff=[];
      for(const[selector,props]of Object.entries(expected))for(const[key,value]of Object.entries(props))if(actual[selector][key]!==value)diff.push({selector,key,actual:actual[selector][key],expected:value});
      for(const selector of ['.range-editor .card-header','.range-editor .card-footer','.range-count','.range-feedback','#range-date-error']){
        const text=async p=>(await p.locator(selector).innerText()).replace(/\s+/g,' ').trim();
        const a=await text(app),e=await text(prototype);if(a!==e)diff.push({selector,key:'copy',actual:a,expected:e});
      }
      if(state==='empty'&&[390,1440].includes(width)){
        await app.screenshot({path:join(dir,'app-'+locale+'-'+width+'.png'),fullPage:true});
        await prototype.screenshot({path:join(dir,'design-'+locale+'-'+width+'.png'),fullPage:true});
      }
      results.push({locale,width,state,result:diff.length?'FAIL':'PASS',diff,actual,expected});
    }
  }
  await context.close();await prototype.close();
}
}finally{await browser.close();}
writeFileSync(join(dir,'comparison-results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({comparison:results.length,failed:results.filter(r=>r.result==='FAIL').map(({locale,width,state,diff})=>({locale,width,state,diff}))}));

for(const [type,name]of [[chromium,'chromium'],[webkit,'webkit']]){
  browser=await type.launch();
  try{
    for(const [timezone,now,from,to]of [
      ['Asia/Shanghai','2026-09-05T16:30:00Z','2026-08-31','2026-09-06'],
      ['America/Los_Angeles','2026-03-09T07:30:00Z','2026-03-03','2026-03-09'],
      ['UTC','2024-03-01T00:30:00Z','2024-02-24','2024-03-01']
    ]){
      const c=await browser.newContext({timezoneId:timezone,viewport:{width:390,height:844}});
      await login(c,'dev034_empty');const p=await c.newPage();await p.clock.setFixedTime(new Date(now));
      const requests=[],errors=[];p.on('request',r=>{if(r.url().includes('/review-range/preview'))requests.push(new URL(r.url()));});
      p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/hydration.*mismatch/i.test(m.text()))errors.push(m.text());});
      await p.goto(origin+'/review');await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
      await expect(p.locator('#review-start')).toHaveValue(from);await expect(p.locator('#review-end')).toHaveValue(to);
      expect(requests.length).toBe(1);expect(requests[0].searchParams.get('timezone')).toBe(timezone);
      const node=await p.locator('#review-start').elementHandle();
      await p.locator('.locale-switch select').selectOption('zh-CN');await expect(p.locator('.range-editor .card-title')).toHaveText('选择日期范围');
      expect(await p.locator('#review-start').evaluate((n,old)=>n===old,node)).toBe(true);expect(requests.length).toBe(1);
      await p.locator('#review-start').focus();await p.keyboard.press('Tab');
      const axe=await new AxeBuilder({page:p}).analyze();expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
      expect(errors).toEqual([]);extras.push({browser:name,timezone,now,from,to,result:'PASS',previewRequests:requests.length,axeSeriousCritical:0});await c.close();
    }
  }finally{await browser.close();}
}
// Real browser tab zoom via Chrome extension API, not CSS zoom or viewport emulation.
const profile=mkdtempSync(join(tmpdir(),'wordweave-dev034-zoom-'));
const extension=join(dir,'zoom-extension');
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,args:['--window-size=1440,1000','--disable-extensions-except='+extension,'--load-extension='+extension]});
try{
 await login(context,'dev034_empty');const p=await context.newPage();await p.goto(origin+'/review');await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.includes('/review'));await chrome.tabs.setZoom(tab.id,2);return await chrome.tabs.getZoom(tab.id);});
 expect(zoom).toBe(2);await p.waitForTimeout(150);
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await p.locator('#review-start').fill('2026-08-01');await p.locator('#review-end').fill('2026-08-31');
 await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
 await p.screenshot({path:join(dir,'actual-browser-zoom-200.png'),fullPage:true});
 extras.push({browser:'headed Chromium',actualTabZoom:zoom,result:'PASS',profile});
}finally{await context.close();}
writeFileSync(join(dir,'browser-extra-results.json'),JSON.stringify({at:new Date().toISOString(),results:extras},null,2));
console.log(JSON.stringify({browserExtra:extras}));
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
