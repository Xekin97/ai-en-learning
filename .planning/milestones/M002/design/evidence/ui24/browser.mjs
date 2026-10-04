import {createRequire} from 'node:module';import fs from 'node:fs';
const root='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning';
const require=createRequire(root+'/frontend/package.json'),{chromium}=require('@playwright/test');
const dir=root+'/.planning/milestones/M002/design/evidence/ui24';const browser=await chromium.launch({headless:true});
const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(6000);
const checks=[],errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
function check(name,pass,details){checks.push({name,pass,details});fs.writeFileSync(dir+'/browser.json',JSON.stringify({checks,errors,consoleErrors},null,2));if(!pass)console.log('FAIL',name,details);}
async function go(lang,state='normal'){await page.goto(`http://127.0.0.1:4186/prototype/?page=notices&lang=${lang}&state=${state}&v=M002-UI-24`);await page.waitForSelector('.notices-page');}
for(const width of [1440,1920,390,320]) for(const lang of ['zh','en']){
 await page.setViewportSize({width,height:width<=390?844:1000});await go(lang);
 let d=await page.locator('.notices-page').evaluate(e=>{const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,height:r.height};};return {page:rect(e),header:rect(e.querySelector('.page-head')),list:rect(e.querySelector('.notice-list')),rows:[...e.querySelectorAll('.notice-entry')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth,viewport:innerWidth,headings:e.querySelectorAll('h1').length,dates:[...e.querySelectorAll('time')].map(t=>[t.textContent,t.dateTime])};});
 check(`centered full rows ${width} ${lang}`,!d.overflow&&d.page.width<=880&&Math.abs(d.page.x+d.page.width/2-width/2)<1&&d.header.x===d.list.x&&d.rows.every(r=>Math.abs(r.width-(d.list.width-2))<1)&&d.headings===1&&d.dates.every(([a,b])=>a===b),d);
 await page.locator('.notice-entry').first().focus();await page.keyboard.press('Enter');await page.waitForSelector('#dialog[open]');
 check(`row opens matching notice ${width} ${lang}`,await page.locator('#dialog-title').innerText()===await page.locator('.notice-entry-title').first().innerText());
 await page.keyboard.press('Escape');check(`close returns row focus ${width} ${lang}`,await page.locator('.notice-entry').first().evaluate(e=>e===document.activeElement));
 if(width===1440&&lang==='zh') await page.screenshot({path:dir+'/01-desktop-1440.png',fullPage:true});
 const long=lang==='zh'?'从挑选词语到重新回顾：用完整的英文短文和熟悉的释义语言，慢慢建立属于自己的学习节奏，把每一次学习里的小小发现都记下来':'From choosing your words to revisiting a story: build your own English learning rhythm with complete passages, familiar explanations, and a little discovery worth remembering each day';
 await page.locator('.notice-entry-title').first().evaluate((e,t)=>e.textContent=t,long);
 d=await page.locator('.notice-entry').first().evaluate(e=>{const r=e.getBoundingClientRect(),title=e.querySelector('.notice-entry-title'),t=title.getBoundingClientRect(),date=e.querySelector('time').getBoundingClientRect(),arrow=e.querySelector('.notice-entry-arrow').getBoundingClientRect();return {row:{x:r.x,right:r.right,bottom:r.bottom},title:{x:t.x,right:t.right,y:t.y,bottom:t.bottom},date:{y:date.y,bottom:date.bottom},arrow:{x:arrow.x,right:arrow.right},overflow:document.documentElement.scrollWidth>innerWidth,clamped:getComputedStyle(title).webkitLineClamp};});
 check(`long title fits ${width} ${lang}`,!d.overflow&&d.title.right<d.arrow.x&&d.title.bottom<=d.row.bottom&&d.clamped==='none'&&(width>600||d.date.bottom<=d.title.y),d);
 if(width===320&&lang==='en')await page.screenshot({path:dir+'/02-mobile-long-title-320.png',fullPage:true});
 if(width===1920&&lang==='en')await page.screenshot({path:dir+'/03-wide-1920.png',fullPage:true});
 await go(lang,'empty');check(`empty state ${width} ${lang}`,await page.locator('.notice-empty').isVisible()&&await page.locator('.notice-entry').count()===0&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
check('No page errors or missing copy',errors.length===0&&consoleErrors.length===0,{errors,consoleErrors});
const report={version:'M002-UI-24',status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,errors,consoleErrors,screenshots:3,real_provider_calls:0};fs.writeFileSync(dir+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length,failed:checks.filter(c=>!c.pass)},null,2));await browser.close();
