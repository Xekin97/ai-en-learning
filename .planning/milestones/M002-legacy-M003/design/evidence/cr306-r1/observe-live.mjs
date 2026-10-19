import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
const { chromium } = playwright;
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../../../../..');
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const accessPath = path.join(root,'.planning/milestones/M003/verification/evidence/uat-local-001/access.json');
const access = JSON.parse(await fs.readFile(accessPath,'utf8'));
const env = JSON.parse(await fs.readFile(path.join(access.runtime_location,'env.json'),'utf8'));
const report = {version:'M003-UI-10-R1',checked_at:new Date().toISOString(),scope:'Read-only observation of running UAT model list and AppDialog; no save, test, delete, or provider call',checks:[],console_errors:[],screenshots:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
page.on('pageerror',error=>report.console_errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')report.console_errors.push(message.text());});
try{
  await page.goto(`${access.origin}/login?redirect=/admin/models`,{waitUntil:'networkidle'});
  await page.locator('input[name="username"]').fill(env.ADMIN_USERNAME);
  await page.locator('input[name="password"]').fill(env.ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>location.pathname.startsWith('/admin'),{timeout:15000});
  if(new URL(page.url()).pathname!=='/admin/models') await page.goto(`${access.origin}/admin/models`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>location.pathname==='/admin/models',{timeout:15000});
  await page.waitForLoadState('networkidle');
  const list=await page.evaluate(()=>({
    url:location.pathname,
    providers:document.querySelectorAll('.generic-provider-card').length,
    modelRows:document.querySelectorAll('.generic-provider-models .generic-model-row').length,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    scrollY,
  }));
  record('live-list-layout',list.url==='/admin/models'&&list.providers>0&&list.overflow<=1,list);
  await page.screenshot({path:path.join(evidenceDir,'00-live-model-list-1440.png'),fullPage:true}); report.screenshots.push('00-live-model-list-1440.png');

  const trigger=page.locator('.generic-provider-card:has(.generic-model-row) .generic-provider-heading > button').last();
  const triggerText=(await trigger.textContent())?.trim();
  await trigger.scrollIntoViewIfNeeded();
  const openerScroll=await page.evaluate(()=>scrollY);
  await trigger.click();
  const dialog=page.locator('#admin-model');
  await dialog.waitFor({state:'visible'});
  await page.evaluate(async()=>await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const advanced=dialog.locator('.generic-model-advanced').first();
  if(!(await advanced.getAttribute('open'))) await advanced.locator('summary').click();
  await page.evaluate(async()=>await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const modal=await page.evaluate(()=>{
    const d=document.querySelector('#admin-model'); const body=d?.querySelector('.dialog-body'); const footer=d?.querySelector('.dialog-actions');
    const r=d?.getBoundingClientRect(), br=body?.getBoundingClientRect(), fr=footer?.getBoundingClientRect();
    return {open:d?.open??false,modal:d?.matches(':modal')??false,activeTag:document.activeElement?.tagName,activeClass:document.activeElement?.className,dialogRect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,bodyRect:br?{y:br.y,height:br.height,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,overflowY:getComputedStyle(body).overflowY}:null,footerRect:fr?{y:fr.y,height:fr.height}:null,bodyScroll:body?.scrollTop??null,pageScroll:scrollY,footerButtons:footer?.querySelectorAll('button').length??0,protocolSelect:!!d?.querySelector('[role="combobox"],select')};
  });
  record('live-appdialog-top-layer',modal.open&&modal.modal&&modal.footerButtons===2&&modal.bodyRect?.overflowY==='auto'&&modal.protocolSelect,modal);
  await page.screenshot({path:path.join(evidenceDir,'01-live-editor-modal-1440.png'),fullPage:false}); report.screenshots.push('01-live-editor-modal-1440.png');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#admin-model')?.open);
  const restored=await page.evaluate(triggerText=>({activeText:document.activeElement?.textContent?.trim(),pageScroll:scrollY}),triggerText);
  record('live-escape-focus-restore',restored.activeText===triggerText&&restored.pageScroll===openerScroll,{triggerText,openerScroll,...restored});

  await page.setViewportSize({width:390,height:844});
  await trigger.scrollIntoViewIfNeeded();
  const mobileOpenerScroll=await page.evaluate(()=>scrollY);
  await trigger.click();
  await dialog.waitFor({state:'visible'});
  await page.evaluate(async()=>await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const mobileAdvanced=dialog.locator('.generic-model-advanced').first();
  if(!(await mobileAdvanced.getAttribute('open'))) await mobileAdvanced.locator('summary').click();
  const mobile=await page.evaluate(()=>({modal:document.querySelector('#admin-model')?.matches(':modal'),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,dialogWidth:Math.round(document.querySelector('#admin-model')?.getBoundingClientRect().width??0),viewport:innerWidth,pageScroll:scrollY}));
  record('live-mobile-modal',mobile.modal&&mobile.overflow<=1&&mobile.dialogWidth<=390&&mobile.pageScroll===mobileOpenerScroll,{mobileOpenerScroll,...mobile});
  await page.screenshot({path:path.join(evidenceDir,'02-live-editor-modal-390.png'),fullPage:false}); report.screenshots.push('02-live-editor-modal-390.png');
  await page.keyboard.press('Escape');
}finally{
  report.checks.push({name:'console-errors',passed:report.console_errors.length===0,details:{count:report.console_errors.length}});
  report.summary={total:report.checks.length,passed:report.checks.filter(x=>x.passed).length,failed:report.checks.filter(x=>!x.passed).length};
  await fs.writeFile(path.join(evidenceDir,'live-appdialog-observation.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
if(report.summary.failed)process.exitCode=1;
