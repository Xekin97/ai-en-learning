import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const {chromium}=playwright;
const base='http://127.0.0.1:4176';
const dir=path.dirname(new URL(import.meta.url).pathname);
const report={
  version:'M003-UI-15',
  scope:'targeted CAP-502/CAP-503 and AC504/AC514 design recheck after item-level preview detail correction',
  design_simulation:true,
  provider_calls:0,
  configuration_writes:0,
  checks:[],screenshots:[],console_errors:[],page_errors:[]
};
const record=(name,passed,details)=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const contexts=[];
async function open(url,viewport={width:1440,height:1050}){
  const context=await browser.newContext({viewport});contexts.push(context);
  const page=await context.newPage();
  page.on('pageerror',error=>report.page_errors.push(`${url}: ${error}`));
  page.on('console',message=>{if(message.type()==='error')report.console_errors.push(`${url}: ${message.text()}`)});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#app[aria-busy="false"]').waitFor();
  return page;
}
async function shot(page,name){await page.screenshot({path:path.join(dir,name),fullPage:true});report.screenshots.push(name)}

const cases=[
  {category:'models',page:'models',lang:'zh',counts:[1,2,1],applied:'hostname',appliedBoundary:'本产品未设置',removed:'Model B',previewShot:'02-formal-models-preview-desktop-zh.png'},
  {category:'plans',page:'plans',lang:'en',counts:[0,3,0],applied:'explicitly provides null',appliedBoundary:'not an omitted default',removed:'None',previewShot:'04-formal-plans-preview-desktop-en.png'},
  {category:'items',page:'growth',lang:'zh',counts:[0,2,1],applied:'英文说明显式为空',appliedBoundary:'回退显示中文说明',removed:'模型体验卡',previewShot:'09-formal-items-preview-desktop-zh.png'},
  {category:'growth',page:'growth',lang:'en',counts:[2,8,1],applied:'No reward item',appliedBoundary:'No item',removed:'Save 5 passages',previewShot:'06-formal-growth-preview-desktop-en.png'}
];

try{
  for(const item of cases){
    const preview=await open(`${base}/formal/?page=${item.page}&category=${item.category}&state=preview&lang=${item.lang}`);
    const groups=preview.locator('.change-details .change-group');
    const details={
      groups:await groups.count(),
      open:await groups.evaluateAll(nodes=>nodes.map(node=>node.open)),
      rowCounts:await groups.evaluateAll(nodes=>nodes.map(node=>node.querySelectorAll('.change-list li').length)),
      identities:await preview.locator('.change-list code').allTextContents(),
      applied:await preview.locator('.applied-result').allTextContents(),
      removed:await preview.locator('.change-remove').innerText(),
      overflow:await preview.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth))
    };
    const identitiesUnique=new Set(details.identities).size===details.identities.length;
    if(item.category==='models'){
      details.currentBaseline={names:await preview.locator('.generic-model-title h3').allTextContents(),modes:await preview.locator('.generic-model-row .generic-model-meta').allTextContents()};
      details.baselineAligned=details.currentBaseline.names.join('|')==='Model A|Model B|Model C'&&details.currentBaseline.modes[0].includes('json_schema')&&details.currentBaseline.modes[1].includes('json_schema')&&details.currentBaseline.modes[2].includes('prompt')&&details.removed.includes('Model B');
    }else if(item.category==='plans'){
      details.currentBaseline={proInputs:await preview.locator('#page-502-plans .form-grid input').evaluateAll(nodes=>nodes.map(node=>node.value))};
      details.baselineAligned=details.currentBaseline.proInputs.join(',')==='2,16,10,2'&&details.applied.some(text=>text.includes('explicitly provides null'));
    }else if(item.category==='items'){
      details.currentBaseline={rows:await preview.locator('#page-503-items .data-table tbody tr').allTextContents()};
      details.baselineAligned=details.currentBaseline.rows.length===4&&details.currentBaseline.rows.some(text=>text.includes('额外次数卡')&&text.includes('30'))&&details.currentBaseline.rows.some(text=>text.includes('模型体验卡'))&&details.removed.includes('模型体验卡');
    }else{
      details.currentBaseline={inputs:await preview.locator('#page-504-growth input').evaluateAll(nodes=>nodes.map(node=>node.value))};
      details.baselineAligned=details.currentBaseline.inputs.join(',')==='4,2,10,10,5';
    }
    record(`${item.category}-preview-locates-every-change-and-aligns-current-baseline`,details.groups===3&&details.open.every(Boolean)&&details.rowCounts.join(',')===item.counts.join(',')&&details.identities.length===item.counts.reduce((a,b)=>a+b,0)&&identitiesUnique&&details.applied.some(text=>text.includes(item.applied)&&text.includes(item.appliedBoundary))&&details.removed.includes(item.removed)&&details.overflow===0&&details.baselineAligned,details);
    await shot(preview,item.previewShot);

    const confirm=await open(`${base}/formal/?page=${item.page}&category=${item.category}&state=confirm&lang=${item.lang}`);
    const removal=confirm.locator('.confirmation-changes .change-remove');
    const confirmation={
      removalOpen:await removal.getAttribute('open'),
      removalCount:await removal.locator('.change-list li').count(),
      removalText:await removal.innerText(),
      acknowledge:await confirm.locator('[data-ack]').count(),
      submitDisabled:await confirm.locator('[data-action="submit"]').isDisabled()
    };
    record(`${item.category}-confirmation-explicitly-lists-removals`,confirmation.removalOpen!==null&&confirmation.removalCount===item.counts[2]&&confirmation.removalText.includes(item.removed)&&confirmation.acknowledge===1&&confirmation.submitDisabled,confirmation);
  }

  const labeling=await open(`${base}/formal/?page=models&category=models&state=preview&lang=en`);
  const labelDetails={
    businessDialogVersionLabels:await labeling.locator('#portability-dialog').getByText('M003-UI-15',{exact:true}).count(),
    demoRegionVersionLabels:await labeling.locator('.formal-demo').getByText('M003-UI-15',{exact:true}).count(),
    dialogTitle:await labeling.locator('#portability-dialog-title').innerText()
  };
  record('internal-design-version-stays-outside-business-dialog',labelDetails.businessDialogVersionLabels===0&&labelDetails.demoRegionVersionLabels===1&&labelDetails.dialogTitle.includes('Import and replace'),labelDetails);

  const modelBlocked=await open(`${base}/formal/?page=models&category=models&state=blocked&lang=zh`);
  const modelBlockedDetails={currentModels:await modelBlocked.locator('.generic-model-title h3').allTextContents(),references:await modelBlocked.locator('.dependency-list li').allTextContents()};
  record('model-dependency-block-references-current-removal',modelBlockedDetails.currentModels.includes('Model B')&&modelBlockedDetails.references.length===3&&modelBlockedDetails.references.every(text=>text.includes('Model B')),modelBlockedDetails);
  await shot(modelBlocked,'03-formal-models-dependency-blocked-desktop-zh.png');

  const itemBlocked=await open(`${base}/formal/?page=growth&category=items&state=blocked&lang=zh`);
  const itemBlockedDetails={currentRows:await itemBlocked.locator('.data-table tbody tr').allTextContents(),references:await itemBlocked.locator('.dependency-list li').allTextContents()};
  record('item-dependency-block-references-current-removal',itemBlockedDetails.currentRows.some(text=>text.includes('模型体验卡'))&&itemBlockedDetails.references.length===2&&itemBlockedDetails.references.every(text=>text.includes('模型体验卡')),itemBlockedDetails);
  await shot(itemBlocked,'05-formal-items-blocked-desktop-zh.png');

  const mobile=await open(`${base}/formal/?page=models&category=models&state=confirm&lang=en`,{width:390,height:844});
  const body=mobile.locator('#portability-dialog .dialog-body');
  await body.evaluate(node=>node.scrollTop=node.scrollHeight);
  const footer=mobile.locator('#portability-dialog .dialog-actions');
  const box=await footer.boundingBox();
  const mobileDetails={
    overflow:await mobile.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)),
    removalVisible:await mobile.locator('.change-remove[open]').count(),
    footerBottom:box.y+box.height,
    viewportHeight:844,
    targetHeights:await footer.locator('button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height))
  };
  record('mobile-item-detail-scroll-keeps-confirmation-actions-reachable',mobileDetails.overflow===0&&mobileDetails.removalVisible===1&&mobileDetails.footerBottom<=844&&mobileDetails.targetHeights.every(height=>height>=44),mobileDetails);
  await shot(mobile,'07-formal-model-confirm-mobile-en.png');
}finally{
  record('browser-console',report.console_errors.length===0&&report.page_errors.length===0,{console_errors:report.console_errors,page_errors:report.page_errors});
  report.summary={total:report.checks.length,passed:report.checks.filter(check=>check.passed).length,failed:report.checks.filter(check=>!check.passed).length};
  await fs.writeFile(path.join(dir,'M003-UI-15-change-detail.json'),JSON.stringify(report,null,2)+'\n');
  await Promise.all(contexts.map(context=>context.close()));
  await browser.close();
}
if(report.summary.failed)process.exitCode=1;
