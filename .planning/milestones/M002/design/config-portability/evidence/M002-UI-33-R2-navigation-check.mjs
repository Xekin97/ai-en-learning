import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=playwright;
const base='http://127.0.0.1:4176';
const dir=path.dirname(new URL(import.meta.url).pathname);
const report={version:'M002-UI-33-R2',mode:'user-click navigation and dynamic growth category regression',provider_calls:0,configuration_writes:0,checks:[],screenshots:[],console_errors:[],page_errors:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const contexts=[];
async function open(url,viewport={width:1440,height:950}){
 const context=await browser.newContext({viewport,reducedMotion:'reduce'});contexts.push(context);
 const page=await context.newPage();
 page.on('pageerror',e=>report.page_errors.push(`${url}: ${e}`));
 page.on('console',m=>{if(m.type()==='error')report.console_errors.push(`${url}: ${m.text()}`)});
 await page.goto(url,{waitUntil:'networkidle'});
 await page.locator('#app[aria-busy="false"]').waitFor();
 return page;
}
const formalPath=p=>new URL(p.url()).pathname==='/formal/';
const overflow=p=>p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth));
async function shot(p,name){await p.screenshot({path:path.join(dir,name),fullPage:true});report.screenshots.push(name)}
async function navTo(page,target){
 const link=page.locator(`.admin-nav a[href*="page=${target}"]`).first();
 await link.click();
 await page.waitForLoadState('networkidle');
 await page.locator('#app[aria-busy="false"]').waitFor();
}
async function modalCategory(page){
 return page.locator('#portability-dialog').getAttribute('data-category');
}
try{
 const zh=await open(`${base}/formal/?page=models&category=models&portState=idle&lang=zh`);
 const start={url:zh.url(),formal:formalPath(zh),providers:await zh.locator('.generic-provider-card').count(),actions:await zh.locator('[data-cr313-action]').count()};
 await navTo(zh,'plans');
 const plan={url:zh.url(),formal:formalPath(zh),lang:new URL(zh.url()).searchParams.get('lang'),tabs:await zh.locator('.admin-main>.tabs [role=tab]').count(),repair:await zh.locator('#content-repair-limit').count(),actions:await zh.locator('[data-cr313-action]').count()};
 await zh.locator('[data-action="open-priority-editor"]').click();
 plan.priorityEditor=await zh.locator('#priority-editor').evaluate(e=>e.open);
 await zh.locator('#priority-form input').first().fill('5');
 await zh.locator('[data-action="preview-priorities"]').click();
 plan.priorityPreview=await zh.locator('#priority-editor .notice').count();
 plan.prioritySave=await zh.locator('#priority-editor [data-action="save-priorities"]').count();
 await zh.locator('#priority-editor [data-action="close-priority-editor"]').first().click();
 plan.priorityClosed=await zh.locator('#priority-editor').count()===0;
 record('default-sidebar-models-to-plans-stays-in-formal-host',start.formal&&start.providers===3&&start.actions===2&&plan.formal&&plan.lang==='zh'&&plan.tabs===4&&plan.repair===1&&plan.actions===2&&plan.priorityEditor&&plan.priorityPreview===1&&plan.prioritySave===1&&plan.priorityClosed, {start,plan});
 await zh.locator('.page-head h1').click();
 await shot(zh,'R2-01-sidebar-plan-desktop-zh.png');
 const historyPage=await open(`${base}/formal/?page=models&category=models&portState=idle&lang=zh`);
 await navTo(historyPage,'plans');
 await historyPage.goBack({waitUntil:'domcontentloaded'});await historyPage.locator('.generic-provider-list').waitFor();
 const back={url:historyPage.url(),formal:formalPath(historyPage),providers:await historyPage.locator('.generic-provider-card').count()};
 await historyPage.goForward({waitUntil:'domcontentloaded'});await historyPage.locator('#service-settings').waitFor();
 const forward={url:historyPage.url(),formal:formalPath(historyPage),tabs:await historyPage.locator('.admin-main>.tabs [role=tab]').count()};
 record('browser-back-forward-preserves-formal-host-and-inherited-pages',back.formal&&back.providers===3&&forward.formal&&forward.tabs===4,{back,forward});

 await navTo(zh,'operations');
 const growthEntry={url:zh.url(),formal:formalPath(zh),selected:await zh.locator('.admin-main>.tabs .selected').getAttribute('data-action'),rows:await zh.locator('[data-item-row]').count(),actions:await zh.locator('[data-cr313-action]').count()};
 await zh.locator('[data-cr313-action="import"]').click();
 const itemCategory=await modalCategory(zh);await zh.locator('#cr313-dialog [data-action="close"]').first().click();
 const categories={itemsettings:itemCategory};
 for(const tab of ['signsettings','levelsettings','achievementsettings']){
   await zh.locator(`[data-action="optab:${tab}"]`).click();
   await zh.locator('[data-cr313-action="import"]').click();
   categories[tab]=await modalCategory(zh);
   await zh.locator('#cr313-dialog [data-action="close"]').first().click();
 }
 await zh.locator('[data-action="optab:signsettings"]').click();
 await zh.locator('[data-cr313-action="import"]').click();
 record('growth-tabs-map-item-to-items-and-other-tabs-to-complete-growth',growthEntry.formal&&growthEntry.selected==='optab:itemsettings'&&growthEntry.rows===4&&growthEntry.actions===2&&categories.itemsettings==='items'&&['signsettings','levelsettings','achievementsettings'].every(k=>categories[k]==='growth'),{growthEntry,categories});
 await shot(zh,'R2-02-growth-tab-category-desktop-zh.png');
 await zh.locator('#cr313-dialog [data-action="close"]').first().click();

 await navTo(zh,'models');
 await zh.locator('[data-action="edit-provider"]').first().click();
 const modelReturn={url:zh.url(),formal:formalPath(zh),editorOpen:await zh.locator('#admin-model').evaluate(e=>e.open),protocol:await zh.locator('[data-connection-field="protocol"]').count()};
 record('operations-sidebar-models-returns-to-current-inherited-model-host',modelReturn.formal&&modelReturn.editorOpen&&modelReturn.protocol===1,modelReturn);

 const en=await open(`${base}/formal/?page=plans&category=plans&portState=idle&lang=zh`);
 await en.locator('#site-language').evaluate(el=>{el.value='en';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await en.waitForTimeout(250);
 const afterLanguage={url:en.url(),formal:formalPath(en),lang:new URL(en.url()).searchParams.get('lang'),title:await en.locator('h1').first().innerText(),action:await en.locator('[data-cr313-action="import"]').innerText()};
 await navTo(en,'operations');
 const enGrowth={url:en.url(),formal:formalPath(en),lang:new URL(en.url()).searchParams.get('lang'),title:await en.locator('h1').first().innerText(),action:await en.locator('[data-cr313-action="import"]').innerText()};
 record('language-switch-and-next-sidebar-route-preserve-formal-host-and-english',afterLanguage.formal&&afterLanguage.lang==='en'&&afterLanguage.title==='Plans'&&afterLanguage.action==='Import configuration'&&enGrowth.formal&&enGrowth.lang==='en'&&enGrowth.title==='Growth operations'&&enGrowth.action==='Import configuration',{afterLanguage,enGrowth});
 await shot(en,'R2-03-language-and-growth-desktop-en.png');

 const mobile=await open(`${base}/formal/?page=models&category=models&portState=idle&lang=en`,{width:390,height:844});
 await navTo(mobile,'plans');
 const mobilePlan={url:mobile.url(),formal:formalPath(mobile),actions:await mobile.locator('[data-cr313-action]').count(),tabs:await mobile.locator('.admin-main>.tabs [role=tab]').count(),overflow:await overflow(mobile)};
 await navTo(mobile,'operations');
 const mobileGrowth={url:mobile.url(),formal:formalPath(mobile),actions:await mobile.locator('[data-cr313-action]').count(),overflow:await overflow(mobile)};
 record('mobile-sidebar-navigation-keeps-formal-host-without-horizontal-overflow',mobilePlan.formal&&mobilePlan.actions===2&&mobilePlan.tabs===4&&mobilePlan.overflow===0&&mobileGrowth.formal&&mobileGrowth.actions===2&&mobileGrowth.overflow===0,{mobilePlan,mobileGrowth});
 await shot(mobile,'R2-04-sidebar-growth-mobile-en.png');
} finally {
 record('browser-console-and-page-errors',report.console_errors.length===0&&report.page_errors.length===0,{console_errors:report.console_errors,page_errors:report.page_errors});
 report.summary={total:report.checks.length,passed:report.checks.filter(x=>x.passed).length,failed:report.checks.filter(x=>!x.passed).length};
 await fs.writeFile(path.join(dir,'M002-UI-33-R2-navigation.json'),JSON.stringify(report,null,2)+'\n');
 await Promise.all(contexts.map(c=>c.close()));await browser.close();
}
if(report.summary.failed)process.exitCode=1;
