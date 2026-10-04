import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');
const { chromium } = require('@playwright/test');
const dir = '/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/design/evidence/ui23';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const output=[];
for(const route of ['home','notices','explore','create','messages','presets','plans','profile']){
  await page.goto('http://127.0.0.1:4186/prototype/?page='+route+'&lang=zh&role=learner&v=M002-UI-23');
  await page.waitForSelector('#main',{timeout:10000});
  output.push({route,errors:[...errors],h1:await page.locator('h1').allTextContents(),selects:await page.locator('select:not(#demo select)').count(),triggers:await page.locator('.ww-select-trigger').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
}
await page.goto('http://127.0.0.1:4186/prototype/?page=home&lang=zh&v=M002-UI-23');
await page.waitForSelector('.home-why');
await page.screenshot({path:dir+'/01-home-desktop.png',fullPage:true});
await page.goto('http://127.0.0.1:4186/prototype/?page=notices&lang=zh&v=M002-UI-23');
await page.locator('[data-action="notice:0"]').click();
await page.screenshot({path:dir+'/02-notice-desktop.png'});
output.push({notice:await page.locator('#dialog').innerText(),body:await page.locator('.notice-reading').evaluate(e=>({client:e.clientHeight,scroll:e.scrollHeight}))});
fs.writeFileSync(dir+'/smoke.json',JSON.stringify({output,errors},null,2));
console.log(JSON.stringify({output,errors},null,2));
await browser.close();
