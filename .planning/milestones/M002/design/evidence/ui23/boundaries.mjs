import { createRequire } from 'node:module';
import fs from 'node:fs';
const require=createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');
const {chromium}=require('@playwright/test');
const dir='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/.planning/milestones/M002/design/evidence/ui23';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({reducedMotion:'reduce'});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
function record(name,pass,details){ checks.push({name,pass,details}); fs.writeFileSync(dir+'/boundaries-attempt2.json',JSON.stringify({checks,errors},null,2)); }
async function go(route,lang='zh',state='normal'){await page.goto(`http://127.0.0.1:4186/prototype/?page=${route}&lang=${lang}&state=${state}&v=M002-UI-23`);await page.waitForSelector('#main');}
const rect = e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
for(const size of [[1440,1000],[390,844],[320,568]]) for(const lang of ['zh','en']) for(const state of ['normal','long-title']){
 await page.setViewportSize({width:size[0],height:size[1]});await go('notices',lang,state);await page.locator('[data-action="notice:0"]').click();
 const before=await page.evaluate(()=>{const r=e=>{let q=e.getBoundingClientRect();return {x:q.x,y:q.y,w:q.width,h:q.height,b:q.bottom}};return {dialog:r(document.querySelector('#dialog')),head:r(document.querySelector('.notice-heading')),body:r(document.querySelector('.notice-reading')),foot:r(document.querySelector('#dialog .dialog-actions'))};});
 await page.locator('.notice-reading').evaluate(e=>e.scrollTop=e.scrollHeight);
 const after=await page.locator('#dialog .dialog-actions').evaluate(rect);
 record(`notice ${size} ${lang} ${state}`,before.foot.b<=size[1]&&before.head.y>=0&&before.body.h>=120&&Math.abs(before.foot.y-after.y)<1,before);
 await page.keyboard.press('Escape');record('notice Escape closes',!await page.locator('#dialog').isVisible());
}
const routes=['home','explore','create','library','batch','range','sessiondone','login','register','review','overview','summary','profile','notices','adminhome','models','plans','users','userdetail','messages','operations','credits','presets','metrics','growth','bag','shop','trial'];
for(const size of [[1440,1000],[390,844],[320,568]]) for(const lang of ['zh','en']) for(const route of routes){
 await page.setViewportSize({width:size[0],height:size[1]});await go(route,lang);
 const d=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,selects:document.querySelectorAll('select:not(#demo select)').length,combos:document.querySelectorAll('.ww-select-trigger').length,visibleNative:[...document.querySelectorAll('select:not(#demo select)')].some(e=>e.getBoundingClientRect().width>0)}));
 record(`route ${route} ${lang} ${size}`,!d.overflow&&!d.visibleNative&&d.selects===d.combos,d);
}
await page.setViewportSize({width:390,height:844});await go('create');
await page.locator('.creation-settings').evaluate(e=>e.open=true);
const combo=()=>page.locator('#model').locator('..').locator('.ww-select-trigger');
await combo().focus();await page.keyboard.press('Enter');
record('keyboard opens',await combo().getAttribute('aria-expanded')==='true');
await page.keyboard.press('End');await page.keyboard.press('Enter');
record('keyboard selects and restores focus',await page.locator('#model').inputValue()!==''&&await combo().evaluate(e=>e===document.activeElement));
await combo().click();await page.keyboard.press('Escape');record('Escape closes select',await combo().getAttribute('aria-expanded')==='false');
await combo().click();await page.keyboard.press('Tab');record('Tab closes select',await combo().getAttribute('aria-expanded')==='false');
await page.locator('#site-language').locator('..').locator('button').click();console.log('locale choices',await page.locator('.ww-select-menu:popover-open').innerText());await page.locator('.ww-select-menu:popover-open [role=option]').last().click();
record('locale selection redraw',await page.locator('h1').innerText()==='Write a story with your words',await page.locator('h1').innerText());
await go('explore','zh');
const meaning=await page.locator('.gallery-card').first().locator('.preset-meanings').innerText();
record('published meanings complete',await page.locator('.gallery-card').first().locator('.preset-meanings dt').count()===3,meaning);
await go('explore','en');record('meaning language independent of UI', (await page.locator('.gallery-card').first().locator('.preset-meanings dd').allTextContents()).some(t=>/[\u4e00-\u9fff]/.test(t)));
await go('presets');
await page.locator('#preset-language').locator('..').locator('button').click();await page.getByRole('option',{name:'日文',exact:true}).click();
record('old preview retains meaning language',await page.locator('.preset-meanings-head > span').innerText()==='中文');
record('changed preview not publishable',await page.locator('[data-action="preset-publish"]').isDisabled());
await page.locator('[data-action="preset-preview"]').click();await page.waitForTimeout(850);
record('new preview Japanese meanings',await page.locator('.preset-meanings-head > span').innerText()==='日本語'&&(await page.locator('.preset-meanings dd').allTextContents()).every(t=>/[\u3040-\u30ff]/.test(t)),await page.locator('.preset-meanings').innerText());
fs.writeFileSync(dir+'/boundaries-attempt1.json',JSON.stringify({checks,errors},null,2));
console.log(JSON.stringify({checks:checks.length,failures:checks.filter(x=>!x.pass),errors},null,2));await browser.close();
