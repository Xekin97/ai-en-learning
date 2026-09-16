// Fresh real browser zoom captures; original fullPage/Axe artifacts remain untouched.
import { chromium, expect } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { origin, dir, login } from './real-stack.mjs';
const results=[];
for (const locale of ['en-US','zh-CN']) {
 const profile=mkdtempSync(join(tmpdir(),'wordweave-dev071-zoom-scroll-'));
 const extension=join(dir,'zoom-extension');
 const row={locale,profile,result:'PASS',captures:[]};
 const c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,locale,timezoneId:'Asia/Shanghai',args:['--window-size=1440,1000','--disable-extensions-except='+extension,'--load-extension='+extension]});
 try {
  await login(c,'dev071_old',locale);
  const p=await c.newPage();
  await p.goto(origin+'/review');
  await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
  const worker=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');
  row.actualTabZoom=await worker.evaluate(async origin=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith(origin+'/review'));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},origin);
  expect(row.actualTabZoom).toBe(2);
  await expect.poll(()=>p.evaluate(()=>innerWidth)).toBeLessThan(1081);
  const cdp=await c.newCDPSession(p);
  row.browser=await cdp.send('Browser.getVersion');
  async function record(label,scroll) {
   await p.evaluate(scroll=>{document.activeElement?.blur();window.scrollTo({top:scroll,behavior:'instant'});},scroll);
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const metrics=await p.evaluate(()=>{
    const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
    return {innerWidth,innerHeight,devicePixelRatio,scrollY,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight,visualViewport:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale},active:document.activeElement?.tagName,header:box('header'),card:box('.range-editor .card'),count:box('.range-count'),start:box('#review-start'),end:box('#review-end')};
   });
   expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
   expect(metrics.start.h).toBe(44);expect(metrics.end.h).toBe(44);expect(metrics.start.w).toBe(metrics.end.w);
   expect(metrics.count.y-metrics.card.bottom).toBe(24);
   expect(metrics.count.h).toBe(96);
   const prefix='zoom-scroll-'+locale+'-'+label;
   await p.screenshot({path:join(dir,prefix+'-viewport.png'),fullPage:false});
   const native=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
   writeFileSync(join(dir,prefix+'-compositor.png'),Buffer.from(native.data,'base64'),{flag:'wx'});
   row.captures.push({label,metrics,viewport:prefix+'-viewport.png',compositor:prefix+'-compositor.png'});
  }
  await record('empty-bottom',await p.evaluate(()=>document.documentElement.scrollHeight));
  
  await p.locator('#review-start').fill('2026-08-10');
  await p.locator('#review-end').fill('2026-08-10');
  await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','ready');
  await expect(p.locator('.range-count .count-number')).toHaveText('3');
  await record('ready-bottom',await p.evaluate(()=>document.documentElement.scrollHeight));
  const axe=await new AxeBuilder({page:p}).include('main').analyze();
  row.axeSeriousCritical=axe.violations.filter(v=>['serious','critical'].includes(v.impact));
  expect(row.axeSeriousCritical).toEqual([]);
  row.afterAxe=await p.evaluate(()=>({active:document.activeElement?.outerHTML?.slice(0,200),scrollY,innerWidth,innerHeight}));
  
 }catch(e){row.result='FAIL';row.error=String(e.stack||e);}
 finally{await c.close();}
 results.push(row);console.log(JSON.stringify({locale,result:row.result,captures:row.captures.length,error:row.error}));
}
writeFileSync(join(dir,'zoom-scroll-results.json'),JSON.stringify({at:new Date().toISOString(),results},null,2)+'\n',{flag:'wx'});
if(results.some(r=>r.result!=='PASS'))process.exitCode=1;
