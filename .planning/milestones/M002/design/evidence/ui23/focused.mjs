import {createRequire} from 'node:module';import fs from 'node:fs';
const root='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning';
const require=createRequire(root+'/frontend/package.json');const {chromium}=require('@playwright/test');
const dir=root+'/.planning/milestones/M002/design/evidence/ui23';const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
page.setDefaultTimeout(6000);const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
function record(name,pass,details){checks.push({name,pass,details});fs.writeFileSync(dir+'/focused.json',JSON.stringify({checks,errors},null,2));}
async function go(route,lang='zh',state='normal'){await page.goto(`http://127.0.0.1:4186/prototype/?page=${route}&lang=${lang}&state=${state}&v=M002-UI-23`);await page.waitForSelector('#main');}
function combo(id){return page.locator('#'+id).locator('..').locator('.ww-select-trigger');}
await go('create');await combo('site-language').click();await page.getByRole('option',{name:'EN',exact:true}).click();record('locale selection redraw (correct copy)',await page.locator('h1').innerText()==='Turn words into a story');
await go('presets');const old=await page.locator('.preset-meanings dd').allTextContents();await combo('preset-language').click();await page.getByRole('option',{name:'日语',exact:true}).click();
record('stale preview preserves Chinese meanings',JSON.stringify(old)===JSON.stringify(await page.locator('.preset-meanings dd').allTextContents())&&await page.locator('.preset-meanings-head > span').innerText()==='中文');
record('stale preview explicit and cannot publish',await page.locator('[data-preview-status]').innerText()!==''&&await page.locator('[data-action="preset-publish"]').isDisabled());
await page.locator('[data-action="preset-preview"]').click();await page.waitForTimeout(850);
record('fresh preview Japanese meanings',await page.locator('.preset-meanings-head > span').innerText()==='日本語'&&(await page.locator('.preset-meanings dd').allTextContents()).every(t=>/[\u3040-\u30ff]/.test(t)),await page.locator('.preset-meanings').innerText());
await page.screenshot({path:dir+'/05-admin-preset.png',fullPage:true});
await page.locator('[data-action="new-preset"]').click();record('new preset waiting for preview',await page.locator('.preset-meanings').innerText()==='词语释义\n\n生成预览后查看释义');
await go('explore');record('published meaning count',await page.locator('.gallery-card').first().locator('.preset-meanings dt').count()===3);await page.screenshot({path:dir+'/04-picks-desktop.png',fullPage:true});
await go('messages');const md='# 一起学习\n\n> 保持好奇，慢慢进步。\n\n- 第一项\n  - 第二层\n\n| 词语 | 释义 |\n|---|---|\n| resilient | 有韧性 |\n\n```text\n'+('word '.repeat(80))+'\n```\n\n[说明](https://example.com) [危险](javascript:alert(1))\n\n<img src=x onerror="window.ui23Attack=1">';
await page.locator('#body-zh').fill(md);await page.locator('[data-action="message-preview"]').click();
record('Markdown headings quote nested list table code',await page.locator('.markdown h1').count()===1&&await page.locator('.markdown ul ul').count()===1&&await page.locator('.markdown table').count()===1&&await page.locator('.markdown pre').count()===1);
record('Markdown unsafe HTML/protocol not active',await page.evaluate(()=>!window.ui23Attack&&document.querySelectorAll('.markdown img,.markdown [href^="javascript:"]').length===0));
record('Markdown overflow local and same reading shell',await page.locator('#dialog').getAttribute('class')==='notice-dialog'&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.markdown pre').scrollWidth>document.querySelector('.markdown pre').clientWidth));
await page.keyboard.press('Escape');
await page.setViewportSize({width:390,height:844});await go('notices','zh','long-title');await page.locator('[data-action="notice:0"]').click();await page.screenshot({path:dir+'/03-notice-mobile.png'});
await page.locator('.notice-reading').evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('#dialog [data-action="notice:1"]').click();record('next message resets body scroll',await page.locator('.notice-reading').evaluate(e=>e.scrollTop===0));
record('short message keeps stable reading height',await page.locator('#dialog').evaluate(e=>e.getBoundingClientRect().height>600));await page.keyboard.press('Escape');
await page.setViewportSize({width:320,height:568});await go('login');await page.locator('#auth-username').fill('learning_demo');await page.locator('#auth-password').fill('prototype123');await page.locator('[data-action="identity-submit"]').click();await page.waitForSelector('#dialog[open]');
const toast=await page.evaluate(()=>{const d=document.querySelector('#dialog').getBoundingClientRect(),t=document.querySelector('#toast').getBoundingClientRect();return {dialog:{top:d.top,bottom:d.bottom},toast:{top:t.top,bottom:t.bottom},bodyHeight:document.querySelector('.notice-reading').clientHeight,status:document.querySelector('#toast').matches(':popover-open')};});
record('welcome above modal without blocking actions',toast.status&&toast.dialog.bottom<=toast.toast.top-8&&toast.toast.bottom<=568&&toast.bodyHeight>=100,toast);
await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await go('create');await page.locator('.creation-settings').evaluate(e=>e.open=true);await combo('model').click();
await page.screenshot({path:dir+'/06-select-mobile.png'});
await page.keyboard.press('Escape');
// Synthetic component-boundary fixture only: many options, disabled/long labels and modal containment.
await page.locator('#model').evaluate(s=>{s.innerHTML='<option value="">请选择</option>'+Array.from({length:30},(_,i)=>`<option value="${i}" ${i===2?'disabled':''}>Model ${i} · A model name long enough to wrap on a small screen</option>`).join('');});await page.waitForTimeout(30);await combo('model').focus();await page.keyboard.press('Enter');await page.keyboard.press('End');
const popup=await page.locator('.ww-select-menu:popover-open').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,top:r.top,bottom:r.bottom,height:r.height,client:e.clientHeight,scroll:e.scrollHeight}});
record('synthetic long list contained and scrollable',popup.x>=11&&popup.right<=379&&popup.top>=0&&popup.bottom<=844&&popup.scroll>popup.client,popup);
await page.keyboard.press('Escape');await page.locator('#model').evaluate(s=>s.disabled=true);await page.waitForTimeout(30);record('disabled select trigger',await combo('model').isDisabled());
await go('notices');await page.locator('[data-action="notice:0"]').click();await page.locator('.notice-reading').evaluate(e=>e.insertAdjacentHTML('afterbegin','<label><span>Prototype test select</span><select id="synthetic-dialog"><option>First</option><option>Second</option></select></label>'));await page.waitForTimeout(30);await combo('synthetic-dialog').click();record('synthetic menu works in modal',await page.locator('.ww-select-menu:popover-open').count()===1);await page.keyboard.press('Escape');record('select Escape does not close modal',await page.locator('#dialog').isVisible()&&await page.locator('.ww-select-menu:popover-open').count()===0);
record('no browser errors',errors.length===0,errors);console.log(JSON.stringify({checks:checks.length,failures:checks.filter(c=>!c.pass),errors},null,2));await browser.close();
