import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const {chromium}=playwright;
const base='http://127.0.0.1:4176';
const dir=path.dirname(new URL(import.meta.url).pathname);
const report={version:'M002-UI-33-R1',mode:'inherited admin source plus local CR-313 adapter',provider_calls:0,configuration_writes:0,checks:[],screenshots:[],console_errors:[],page_errors:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const browser=await chromium.launch({headless:true});
const contexts=[];
async function open(url,viewport={width:1440,height:1050}){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  contexts.push(context);
  const page=await context.newPage();
  page.on('pageerror',e=>report.page_errors.push(`${url}: ${e}`));
  page.on('console',m=>{if(m.type()==='error')report.console_errors.push(`${url}: ${m.text()}`)});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#app[aria-busy="false"]').waitFor({timeout:10000});
  return page;
}
const overflow=p=>p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth));
async function shot(page,name){await page.screenshot({path:path.join(dir,name),fullPage:true});report.screenshots.push(name)}
async function block(page,selector){const el=page.locator(selector).first();return {html:await el.evaluate(e=>e.outerHTML),rect:await el.boundingBox(),text:await el.innerText()}}
try{
  const baseModels=await open(`${base}/formal/?page=models&category=models&lang=zh&inheritance=baseline`);
  const beforeModelList=await block(baseModels,'.generic-provider-list');
  const beforeModelNav=await block(baseModels,'.admin-nav');
  const beforeModelTitle=await block(baseModels,'.page-head h1');
  await shot(baseModels,'R1-01-baseline-models-desktop-zh.png');

  const models=await open(`${base}/formal/?page=models&category=models&portState=idle&lang=zh`);
  const afterModelList=await block(models,'.generic-provider-list');
  const afterModelNav=await block(models,'.admin-nav');
  const afterModelTitle=await block(models,'.page-head h1');
  const modelInheritance={
    listHashBefore:hash(beforeModelList.html),listHashAfter:hash(afterModelList.html),
    navHashBefore:hash(beforeModelNav.html),navHashAfter:hash(afterModelNav.html),
    titleBefore:beforeModelTitle.text,titleAfter:afterModelTitle.text,
    titleRectBefore:beforeModelTitle.rect,titleRectAfter:afterModelTitle.rect,
    providers:await models.locator('.generic-provider-card').count(),
    rows:await models.locator('.generic-model-row').count(),
    addedActions:await models.locator('[data-cr313-action]').count()
  };
  record('models-inherit-exact-provider-content-and-page-geometry',modelInheritance.listHashBefore===modelInheritance.listHashAfter&&modelInheritance.navHashBefore!==modelInheritance.navHashAfter&&modelInheritance.titleBefore===modelInheritance.titleAfter&&Math.abs(modelInheritance.titleRectBefore.x-modelInheritance.titleRectAfter.x)<1&&modelInheritance.providers===3&&modelInheritance.rows===4&&modelInheritance.addedActions===2,modelInheritance);
  await shot(models,'R1-02-models-with-local-actions-desktop-zh.png');
  await models.locator('[data-action="edit-provider"]').first().click();
  const modelEditor={open:await models.locator('#admin-model').evaluate(e=>e.open),protocol:await models.locator('[data-connection-field="protocol"]').count(),jsonParams:await models.locator('.custom-parameters').count(),modelRows:await models.locator('#admin-model [id^="model-entry-"]').count()};
  record('inherited-model-editor-remains-operable',modelEditor.open&&modelEditor.protocol===1&&modelEditor.jsonParams>=1&&modelEditor.modelRows>=1,modelEditor);
  await shot(models,'R1-03-inherited-model-editor-desktop-zh.png');
  await models.locator('#admin-model .dialog-close').click();

  const basePlans=await open(`${base}/formal/?page=plans&category=plans&lang=en&inheritance=baseline`);
  const beforePlanPanel=await block(basePlans,'.admin-main > .panel');
  const beforePlanTabs=await block(basePlans,'.admin-main > .tabs');
  const plans=await open(`${base}/formal/?page=plans&category=plans&portState=preview&lang=en`);
  const afterPlanPanel=await block(plans,'.admin-main > .panel');
  const afterPlanTabs=await block(plans,'.admin-main > .tabs');
  const planInheritance={
    panelHashBefore:hash(beforePlanPanel.html),panelHashAfter:hash(afterPlanPanel.html),
    tabsHashBefore:hash(beforePlanTabs.html),tabsHashAfter:hash(afterPlanTabs.html),
    tabCount:await plans.locator('.admin-main > .tabs [role="tab"]').count(),
    serviceSettings:await plans.locator('#service-settings').count(),
    repairInput:await plans.locator('#content-repair-limit').count(),
    dialogState:await plans.locator('#portability-dialog').getAttribute('data-portability-state')
  };
  record('plans-inherit-horizontal-tabs-full-form-and-repair-controls',planInheritance.panelHashBefore===planInheritance.panelHashAfter&&planInheritance.tabsHashBefore===planInheritance.tabsHashAfter&&planInheritance.tabCount===4&&planInheritance.serviceSettings===1&&planInheritance.repairInput===1&&planInheritance.dialogState==='preview',planInheritance);
  await shot(plans,'R1-04-plans-preview-over-inherited-page-desktop-en.png');
  await plans.locator('#cr313-dialog [data-action="close"]').first().click();
  await plans.locator('[data-plan="visitor"]').click();
  await plans.locator('[data-action="open-priority-editor"]').click();
  const planActions={visitorSelected:await plans.locator('[data-plan="visitor"]').getAttribute('aria-selected'),priorityOpen:await plans.locator('#priority-editor').evaluate(e=>e.open),importActionsAfterRerender:await plans.locator('[data-cr313-action]').count()};
  record('inherited-plan-tab-and-priority-editor-remain-operable',planActions.visitorSelected==='true'&&planActions.priorityOpen&&planActions.importActionsAfterRerender===2,planActions);

  const baseItems=await open(`${base}/formal/?page=operations&category=items&lang=zh&inheritance=baseline`);
  const beforeItemsPanel=await block(baseItems,'.admin-main > .panel');
  const items=await open(`${base}/formal/?page=operations&category=items&portState=blocked&lang=zh`);
  const afterItemsPanel=await block(items,'.admin-main > .panel');
  const itemInheritance={
    panelHashBefore:hash(beforeItemsPanel.html),panelHashAfter:hash(afterItemsPanel.html),
    tabs:await items.locator('.admin-main > .tabs .btn').count(),
    rows:await items.locator('[data-item-row]').count(),
    dialogState:await items.locator('#portability-dialog').getAttribute('data-portability-state'),
    refs:await items.locator('.dependency-list li').count()
  };
  record('items-inherit-existing-table-and-actions',itemInheritance.panelHashBefore===itemInheritance.panelHashAfter&&itemInheritance.tabs===4&&itemInheritance.rows===4&&itemInheritance.dialogState==='blocked'&&itemInheritance.refs===1,itemInheritance);
  await items.locator('#cr313-dialog [data-action="close"]').first().click();
  await items.locator('[data-action^="item-edit:"]').first().click();
  const itemEditor={open:await items.locator('#dialog').evaluate(e=>e.open),nameField:await items.locator('#item-zh').inputValue(),typeField:await items.locator('#item-type').count()};
  record('inherited-item-editor-remains-operable',itemEditor.open&&itemEditor.nameField==='补签卡'&&itemEditor.typeField===1,itemEditor);
  await shot(items,'R1-05-inherited-item-editor-desktop-zh.png');

  const growth=await open(`${base}/formal/?page=operations&category=growth&portState=preview&lang=en`);
  const growthState={
    activeTab:await growth.locator('.admin-main > .tabs .selected').getAttribute('data-action'),
    signInputs:await growth.locator('[id^="sign-"]').count(),
    dialogState:await growth.locator('#portability-dialog').getAttribute('data-portability-state'),
    addCount:await growth.locator('.preview-counts > div').first().locator('strong').innerText(),
    overflow:await overflow(growth)
  };
  record('growth-inherits-tabs-and-sign-rule-form',growthState.activeTab==='optab:signsettings'&&growthState.signInputs===5&&growthState.dialogState==='preview'&&growthState.addCount==='2'&&growthState.overflow===0,growthState);
  await shot(growth,'R1-06-growth-preview-over-inherited-page-desktop-en.png');
  await growth.locator('#cr313-dialog [data-action="close"]').first().click();
  await growth.locator('[data-action="optab:levelsettings"]').click();
  const growthTab={selected:await growth.locator('.admin-main > .tabs .selected').getAttribute('data-action'),tierRows:await growth.locator('[data-tier-row]').count(),importActionsAfterRerender:await growth.locator('[data-cr313-action]').count()};
  record('inherited-growth-tabs-remain-operable',growthTab.selected==='optab:levelsettings'&&growthTab.tierRows===4&&growthTab.importActionsAfterRerender===2,growthTab);

  const modelPreview=await open(`${base}/formal/?page=models&category=models&portState=preview&lang=zh`);
  const details={
    add:await modelPreview.locator('.change-add .change-list li').count(),
    update:await modelPreview.locator('.change-update .change-list li').count(),
    remove:await modelPreview.locator('.change-remove .change-list li').count(),
    removed:await modelPreview.locator('.change-remove').innerText(),
    backdropOverflow:await overflow(modelPreview)
  };
  record('new-model-preview-is-item-level-and-baseline-consistent',details.add===1&&details.update===2&&details.remove===1&&details.removed.includes('Unmodified model')&&details.backdropOverflow===0,details);
  await shot(modelPreview,'R1-07-model-item-level-preview-desktop-zh.png');

  const mobile=await open(`${base}/formal/?page=models&category=models&portState=confirm&lang=en`,{width:390,height:844});
  const footer=mobile.locator('#cr313-dialog .dialog-actions');
  const footerBox=await footer.boundingBox();
  const mobileState={
    overflow:await overflow(mobile),
    dialog:await mobile.locator('#cr313-dialog').boundingBox(),
    footer:footerBox,
    targets:await footer.locator('button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))),
    title:await mobile.locator('#portability-dialog-title').innerText()
  };
  mobileState.footerReachable=footerBox.y+footerBox.height<=844;
  record('mobile-native-dialog-has-no-horizontal-overflow-and-keeps-44px-targets',mobileState.overflow===0&&mobileState.footerReachable&&mobileState.targets.every(x=>x.h>=44)&&mobileState.title.includes('complete configuration'),mobileState);
  await shot(mobile,'R1-08-model-confirm-mobile-en.png');

  const prototype=await open(`${base}/prototype/?category=models&state=export&lang=zh`);
  const prototypeState={adminNav:await prototype.locator('.admin-nav').count(),lab:await prototype.locator('.cr313-prototype').count(),dialog:await prototype.locator('#portability-dialog').count(),version:await prototype.locator('.eyebrow').first().innerText(),overflow:await overflow(prototype)};
  record('prototype-remains-a-distinct-interaction-lab',prototypeState.adminNav===0&&prototypeState.lab===1&&prototypeState.dialog===1&&prototypeState.version.includes('M002-UI-33-R1')&&prototypeState.overflow===0,prototypeState);
  await shot(prototype,'R1-09-prototype-encrypted-export-desktop-zh.png');
} finally {
  record('browser-console',report.console_errors.length===0&&report.page_errors.length===0,{console_errors:report.console_errors,page_errors:report.page_errors});
  report.summary={total:report.checks.length,passed:report.checks.filter(x=>x.passed).length,failed:report.checks.filter(x=>!x.passed).length};
  await fs.writeFile(path.join(dir,'M002-UI-33-R1-browser.json'),JSON.stringify(report,null,2)+'\n');
  await Promise.all(contexts.map(c=>c.close()));
  await browser.close();
}
if(report.summary.failed) process.exitCode=1;
