import {createRequire} from 'node:module';import fs from 'node:fs';
const root='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning',dir=root+'/.planning/milestones/M002/design/evidence/ui23';
const require=createRequire(root+'/frontend/package.json'),{chromium}=require('@playwright/test');const browser=await chromium.launch({headless:true});const page=await browser.newPage({reducedMotion:'reduce'}),checks=[];
async function go(route,lang='zh',state='normal'){await page.goto(`http://127.0.0.1:4186/prototype/?page=${route}&lang=${lang}&state=${state}&v=M002-UI-23`);await page.waitForSelector('#main');}
for(const size of [[1440,1000],[390,844],[320,568]]) for(const lang of ['zh','en']){
 await page.setViewportSize({width:size[0],height:size[1]});await go('notices',lang,'long-title');await page.locator('[data-action="notice:0"]').click();
 let d=await page.evaluate(()=>({body:document.querySelector('.notice-reading').clientHeight,head:document.querySelector('.notice-heading').clientHeight,footBottom:document.querySelector('.dialog-actions').getBoundingClientRect().bottom}));
 checks.push({name:`long title body dominant ${size} ${lang}`,pass:d.body>d.head&&d.footBottom<=size[1],details:d});
 await go('login',lang);await page.locator('#auth-username').fill('learning_demo');await page.locator('#auth-password').fill('prototype123');await page.locator('[data-action="identity-submit"]').click();await page.waitForSelector('#dialog[open]');
 d=await page.evaluate(()=>({body:document.querySelector('.notice-reading').clientHeight,footBottom:document.querySelector('.dialog-actions').getBoundingClientRect().bottom,toastTop:document.querySelector('#toast').getBoundingClientRect().top,toastBottom:document.querySelector('#toast').getBoundingClientRect().bottom}));
 checks.push({name:`welcome clearance ${size} ${lang}`,pass:d.footBottom<=d.toastTop-11&&d.toastBottom<=size[1]&&d.body>=120,details:d});
 const closeClear=await page.evaluate(()=>document.querySelector('.dialog-close').getBoundingClientRect().bottom<=document.querySelector('#dialog-title').getBoundingClientRect().top);
 if(size[0]<=390) checks.push({name:`close does not overlap title ${size} ${lang}`,pass:closeClear});
 if(size[0]===320&&lang==='zh') await page.screenshot({path:dir+'/08-short-screen-final.png'});
 await page.keyboard.press('Escape');
}
fs.writeFileSync(dir+'/final-boundary-after-close.json',JSON.stringify({checks},null,2));console.log(JSON.stringify({checks:checks.length,failures:checks.filter(c=>!c.pass)},null,2));await browser.close();
