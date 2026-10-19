import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');const {chromium}=require('@playwright/test');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});
const evidence=[];
for(const scenario of ['dictionary','unavailable','accent']) {
 await page.goto('http://127.0.0.1:4175/M002/design/pronunciation/formal/?page=library&lang=en&scenario='+scenario);await page.waitForSelector('#app:not([aria-busy])');
 const get=async()=>page.locator('[data-pron-item]').evaluateAll(es=>es.map(el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height,font:document.fonts.status}}));
 const before=await get();const b=page.locator(`[data-word="${scenario==='accent'?'gentle':'wander'}"] [data-pron-play]`);await b.click();await page.waitForTimeout(600);const after=await get();
 const label=await b.locator('.pron-button-copy').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,text:el.textContent,children:[...el.children].map(x=>({text:x.textContent,width:x.getBoundingClientRect().width,scroll:x.scrollWidth}))}));
 evidence.push({scenario,before,after,label});
}
await page.goto('http://127.0.0.1:4175/M002/design/pronunciation/formal/?page=plan&lang=en&longwords=1');await page.waitForSelector('#app:not([aria-busy])');const c=page.locator('[data-word="pronunciation"]');await c.locator('[data-pron-menu-trigger]').focus();await page.keyboard.press('Enter');
const m=c.locator('.pron-menu');const now={control:await c.boundingBox(),menu:await m.boundingBox()};await page.waitForTimeout(200);const settled={control:await c.boundingBox(),menu:await m.boundingBox(),css:await m.evaluate(el=>({position:getComputedStyle(el).position,top:getComputedStyle(el).top,transform:getComputedStyle(el).transform}))};
evidence.push({now,settled});console.log(JSON.stringify(evidence,null,2));await writeFile('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/design/pronunciation/evidence/browser-run-01-diagnosis.json',JSON.stringify(evidence,null,2));await browser.close();
