// Focused follow-up after keyboard-diagnostic.json reproduced the same default Tab behavior in production and prototype.
import { chromium, webkit, expect } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { origin, dir, login } from './real-stack.mjs';
const suites=[],guests=[],zoom=[],runtimeErrors=[];
const problem={type:'about:blank',title:'Internal server error',status:500,code:'internal_error',detail:'Synthetic preview failure.',request_id:'dev071-interaction'};
async function status(p,s){await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview',s);}
async function geometry(p){
 const r=await p.evaluate(()=>{
  const rect=n=>{const x=n.getBoundingClientRect();return {x:x.x,y:x.y,width:x.width,height:x.height,bottom:x.bottom};};
  return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,inputs:[...document.querySelectorAll('.date-range input')].map(rect),card:rect(document.querySelector('.range-editor .card')),count:rect(document.querySelector('.range-count'))};
 });
 expect(r.overflow).toBe(false);expect(r.inputs.map(i=>i.height)).toEqual([44,44]);expect(r.inputs[0].width).toBe(r.inputs[1].width);
 expect(r.inputs[0].x+r.inputs[0].width<=r.inputs[1].x||r.inputs[0].bottom<=r.inputs[1].y).toBe(true);
 if(r.width<=1080){expect(r.count.y-r.card.bottom).toBe(24);expect(r.count.height).toBe(96);expect(r.count.width).toBe(r.card.width);}else{expect(r.count.width).toBe(320);expect(r.count.y).toBe(r.card.y);}
 return r;
}
function errors(p,meta){
 p.on('pageerror',e=>runtimeErrors.push({...meta,error:e.message}));
 p.on('console',m=>{if(/hydration.*mismatch/i.test(m.text()))runtimeErrors.push({...meta,error:m.text()});});
}
for(const [type,engine]of [[webkit,'webkit']]){
 const browser=await type.launch();
 try{
  for(const locale of ['en-US','zh-CN']){
   const c=await browser.newContext({locale,timezoneId:'Asia/Shanghai',viewport:{width:1081,height:1000}});
   const item={engine,locale,result:'PASS',checks:[],layouts:[]};let release;
   let p;
   try{
    await login(c,'dev071_old',locale);p=await c.newPage();errors(p,{engine,locale});
    await p.clock.setFixedTime(new Date('2026-09-06T04:00:00Z'));
    let previews=0,posts=0,hold=false,blocked=false,fail=false,gate;
    p.on('request',r=>{if(r.url().includes('/review-range/preview'))previews++;if(r.method()==='POST'&&r.url().endsWith('/me/review-sessions'))posts++;});
    await p.route('**/me/review-range/preview?*',async route=>{
     if(fail){await route.fulfill({status:500,contentType:'application/problem+json',body:JSON.stringify(problem)});return;}
     if(hold){blocked=true;await gate;}
     await route.continue().catch(()=>{});
    });
    await p.goto(origin+'/review');await status(p,'empty');
    await expect(p.locator('.range-resume button')).toBeVisible();
    const emptyLinks=p.locator('.range-feedback .inline-actions a');
    await emptyLinks.first().focus();await p.keyboard.press('Alt+Tab');await expect(emptyLinks.last()).toBeFocused();
    item.checks.push('Empty-state keyboard order: library then learning; independent resume visible');
    await p.locator('#review-start').fill('2026-08-10');await p.locator('#review-end').fill('2026-08-10');await status(p,'ready');
    await expect(p.locator('.range-count .count-number')).toHaveText('3');
    const node=await p.locator('#review-start').elementHandle(),endNode=await p.locator('#review-end').elementHandle();
    await p.locator('#review-start').fill('2026-08-01');await p.locator('#review-end').fill('2026-08-01');await status(p,'empty');
    await expect(p.locator('.range-count .count-number')).toHaveText('0');
    await p.locator('#review-start').fill('2026-08-10');await p.locator('#review-end').fill('2026-08-10');await status(p,'ready');
    await expect(p.locator('.range-count .count-number')).toHaveText('3');
    expect(await p.locator('#review-start').evaluate((n,old)=>n===old,node)).toBe(true);
    item.checks.push('Real old-record dates: empty→ready→empty→ready with exact 0/3 counts and stable input');
    await p.locator('#review-start').focus();const before=previews;
    for(const width of [1081,1080,901,900,1081]){
     await p.setViewportSize({width,height:1000});await status(p,'ready');
     expect(await p.locator('#review-start').evaluate((n,old)=>n===old,node)).toBe(true);
     expect(await p.locator('#review-end').evaluate((n,old)=>n===old,endNode)).toBe(true);
     await expect(p.locator('#review-start')).toHaveValue('2026-08-10');await expect(p.locator('#review-end')).toHaveValue('2026-08-10');await expect(p.locator('#review-start')).toBeFocused();
     item.layouts.push({state:'ready',...(await geometry(p))});
    }
    expect(previews).toBe(before);expect(posts).toBe(0);
    item.checks.push('1081→1080→901→900→1081 preserves both DOM nodes, dates, focused input, ready/resume; no preview or POST');
    const other=locale==='en-US'?'zh-CN':'en-US';
    await p.locator('.locale-switch select').selectOption(other);
    await expect(p.locator('.range-editor .card-title')).toHaveText(other==='zh-CN'?'选择日期范围':'Choose a date range');
    expect(await p.locator('#review-start').evaluate((n,old)=>n===old,node)).toBe(true);
    await expect(p.locator('#review-start')).toHaveValue('2026-08-10');await expect(p.locator('.range-count .count-number')).toHaveText('3');
    expect(previews).toBe(before);
    await p.locator('.locale-switch select').selectOption(locale);
    await expect(p.locator('.range-editor .card-title')).toHaveText(locale==='zh-CN'?'选择日期范围':'Choose a date range');
    item.checks.push('Locale round-trip retains draft, preview and DOM; no business preview request');
    hold=true;gate=new Promise(r=>release=r);
    await p.locator('#review-start').fill('2026-08-09');await expect.poll(()=>blocked).toBe(true);await status(p,'loading');
    for(const width of [901,1080,1081]){
     await p.setViewportSize({width,height:1000});await expect(p.locator('.range-count .count-number')).toHaveText('—');await expect(p.locator('.range-editor button[type=submit]')).toBeDisabled();await expect(p.locator('.range-resume button')).toBeEnabled();
     item.layouts.push({state:'loading-with-resume',...(await geometry(p))});
    }
    hold=false;release();release=undefined;await status(p,'ready');
    item.checks.push('Loading/resume at 901/1080/1081; unknown count and disabled start, form retained');
    fail=true;await p.locator('#review-start').fill('2026-08-08');await status(p,'failed');
    const retained=await p.locator('#review-start').inputValue();const retry=p.locator('.range-feedback button');
    await expect(retry).toHaveText(locale==='zh-CN'?'重试':'Try again');await retry.focus();fail=false;await p.keyboard.press('Enter');await status(p,'ready');
    await expect(p.locator('#review-start')).toBeFocused();await expect(p.locator('#review-start')).toHaveValue(retained);
    item.checks.push('Contract-shaped 500 retains dates; keyboard retry restores start-field focus');
    await p.locator('#review-start').fill('');await status(p,'invalid');await expect(p.locator('#review-start')).toHaveAttribute('aria-describedby','range-date-error');
    await expect(p.locator('.range-resume button')).toBeEnabled();
    const result=await new AxeBuilder({page:p}).include('main').analyze();
    expect(result.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);item.axeSeriousCritical=0;
    const invalidNode=await p.locator('#review-start').elementHandle();
    for(const width of [901,1080,1081]){
     await p.setViewportSize({width,height:1000});await status(p,'invalid');expect(await p.locator('#review-start').evaluate((n,old)=>n===old,invalidNode)).toBe(true);
    }
    const countBeforeResume=posts;await p.locator('.range-resume button').click();await expect(p).toHaveURL(/\/review\/[0-9a-f-]+$/);await expect(p.locator('.review-shell')).toBeVisible();expect(posts).toBe(countBeforeResume);expect(posts).toBe(0);
    item.checks.push('Invalid draft survives resizing; existing real session resumes without POST');
    item.previewRequests=previews;item.creationPosts=posts;
   }catch(error){item.result='FAIL';item.error=String(error.stack||error);if(p)await p.screenshot({path:join(dir,'failure-interaction-retest-'+engine+'-'+locale+'.png'),fullPage:true}).catch(()=>{});}
   finally{if(release)release();await c.close();}
   suites.push(item);console.log(JSON.stringify({interaction:engine,locale,result:item.result,checks:item.checks.length,error:item.error}));
   const guest=await browser.newContext({locale,viewport:{width:901,height:1000}});
   try{
    await guest.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);const page=await guest.newPage();const privateRequests=[];errors(page,{engine,locale,guest:true});
    page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/v1/me/'))privateRequests.push(new URL(r.url()).pathname);});
    for(const path of ['/review','/library']){
     const row={engine,locale,path,result:'PASS'};
     try{await page.goto(origin+path);await expect(page.locator('.auth-gate h1')).toBeVisible();expect(privateRequests).toEqual([]);await expect(page).toHaveURL(origin+path);row.privateRequests=[...privateRequests];}
     catch(error){row.result='FAIL';row.error=String(error.stack||error);}
     guests.push(row);
    }
   }finally{await guest.close();}
  }
 }finally{await browser.close();}
}
const output={at:new Date().toISOString(),scope:'Focused macOS WebKit retest using native Option-Tab clickable navigation; no source or OS setting changes. Initial failure and original Chromium/zoom results retained.',keyboardMethod:'Alt+Tab (macOS Option-Tab)',officialReference:'https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac',counts:{suites:suites.length,suiteFailed:suites.filter(x=>x.result==='FAIL').length,guests:guests.length,guestFailed:guests.filter(x=>x.result==='FAIL').length,zoom:zoom.length,zoomFailed:zoom.filter(x=>x.result==='FAIL').length},suites,guests,zoom,runtimeErrors};
writeFileSync(join(dir,'interaction-webkit-retest-results.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({counts:output.counts,runtimeErrors}));
if(output.counts.suiteFailed||output.counts.guestFailed||output.counts.zoomFailed||runtimeErrors.length)process.exitCode=1;
