import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.cwd(), require=createRequire(root+'/frontend/package.json');
const {chromium,expect}=require('@playwright/test');
const out=new URL('./',import.meta.url), origin='http://127.0.0.1:3300';
const copy=JSON.parse(readFileSync(root+'/.planning/milestones/M002/design/copy.json'));
const t=k=>copy.static['en.'+k]??copy.templates['en.'+k];
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.addCookies([{name:'wordweave_session',value:'learner',url:origin}]);
await context.addInitScript(()=>{
  window.__qaDenyStorage=true;
  const original=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(...args){
    if(window.__qaDenyStorage)throw new DOMException('QA injected storage denial','SecurityError');
    return original.apply(this,args);
  };
});
const page=await context.newPage();page.setDefaultTimeout(5000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
const observations=[];
try{
  await context.request.post('http://127.0.0.1:38080/api/v1/__test/review-reset');
  await page.goto(origin+'/library/batch-e2e');await ready();
  await page.getByRole('button',{name:t('l.single'),exact:true}).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  observations.push({point:'storage denied before first attempt',slots:await page.locator('.slot').count(),text:await page.locator('main').innerText()});
  await page.locator('main [role=alert]').getByRole('button',{name:t('retry'),exact:true}).click();
  observations.push({point:'retry while denied',slots:await page.locator('.slot').count()});
  await page.getByRole('button',{name:t('restart'),exact:true}).click();
  await expect(page.locator('main [role=alert]')).toBeVisible();
  observations.push({point:'explicit restart while denied',slots:await page.locator('.slot').count()});
  await page.screenshot({path:new URL('storage-denied.png',out).pathname,fullPage:true});
  await page.evaluate(()=>{window.__qaDenyStorage=false});
  await page.getByRole('button',{name:t('resume'),exact:true}).click();
  await expect(page.locator('.slot')).toHaveCount(5);
  observations.push({point:'storage restored; resume',slots:await page.locator('.slot').count()});
  writeFileSync(new URL('storage-fault.json',out),JSON.stringify({method:'real browser, production frontend, contract API mock, injected IDBFactory.open SecurityError; no app modifications',observations,pageErrors:errors,expected:'Storage failure is visible; current answers remain editable and submittable (FE-02 §6.2).',result:observations[0].slots===0?'FAIL':'PASS'},null,2));
  console.log(JSON.stringify({result:observations[0].slots===0?'FAIL':'PASS',observations:observations.map(({point,slots})=>({point,slots})),pageErrors:errors}));
}finally{await browser.close()}
