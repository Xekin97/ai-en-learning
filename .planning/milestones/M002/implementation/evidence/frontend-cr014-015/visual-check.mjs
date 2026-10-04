import { readFileSync,writeFileSync } from 'node:fs';
import { start,stop,ok,ready,env,origin } from '../../../verification/evidence/qa2-007/harness.mjs';
const out=new URL('./',import.meta.url),fixture=JSON.parse(readFileSync(new URL('browser/fixture.json',out))), browser=await start();
const checks=[];
try {
 const context=await browser.newContext();
 await ok(context,'/auth/login','POST',{username:fixture.username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 for(const [lang,width] of [['en',320],['zh',1440]]) {
  await ok(context,'/me/ui-locale','PUT',{ui_locale:lang==='en'?'en-US':'zh-CN'});
  const page=await context.newPage();await page.setViewportSize({width,height:900});
  await page.goto(origin+'/library');await ready(page);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);
  await page.screenshot({path:new URL('visual-production-'+lang+'-'+width+'.png',out).pathname});
  checks.push({lang,width,production:await page.locator('.library-page').evaluate(el=>({title:el.querySelector('h1').textContent,statCount:el.querySelectorAll('.library-stats dd').length,order:[...el.children].map(x=>x.className),scrollWidth:document.documentElement.scrollWidth}))});
  await page.goto('http://127.0.0.1:4186/prototype/?page=library&lang='+lang);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(650);
  await page.screenshot({path:new URL('visual-prototype-'+lang+'-'+width+'.png',out).pathname});await page.close();
 }
} finally {await stop(browser);writeFileSync(new URL('visual-check.json',out),JSON.stringify(checks,null,2));}
