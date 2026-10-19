import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=playwright;
const evidenceDir=path.dirname(new URL(import.meta.url).pathname);
const base='http://127.0.0.1:4174/M003/design/prototype/';
const report={version:'M003-UI-10-R1',checked_at:new Date().toISOString(),scope:'PAGE-208 modal correction only',baseline:'live-appdialog-observation.json',scenarios:[],console_errors:[],screenshots:[]};
let completed=false;
const record=(name,passed,details={})=>report.scenarios.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();
page.setDefaultTimeout(5000);
page.on('pageerror',e=>report.console_errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.console_errors.push(m.text())});
const url=(query)=>`${base}?${new URLSearchParams(query)}`;
const stable=()=>page.evaluate(async()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
try{
  await page.goto(url({page:'models',lang:'zh',view:'formal',state:'list',rev:'ui10-r1'}),{waitUntil:'networkidle'});
  const list=await page.evaluate(()=>({cards:document.querySelectorAll('.generic-provider-card').length,pageScroll:scrollY,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,modalOpen:document.querySelector('#admin-model')?.open}));
  record('complete model-management list is the background',list.cards===3&&list.pageScroll===0&&list.overflow<=1&&!list.modalOpen,list);
  await page.screenshot({path:path.join(evidenceDir,'10-r1-list-1440.png'),fullPage:false});report.screenshots.push('10-r1-list-1440.png');

  const exactOpener=page.locator('.generic-provider-card').nth(1).locator('[data-action="edit-provider"]');
  await exactOpener.click(); await stable();
  const topLayer=await page.evaluate(()=>{const d=document.querySelector('#admin-model'),body=d.querySelector('.dialog-body'),add=document.querySelector('[data-action="add-provider"]'),r=add.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {open:d.open,modal:d.matches(':modal'),title:d.querySelector('h2').textContent.trim(),provider:d.querySelector('[data-connection-field="name"]').value,models:d.querySelectorAll('.generic-model-item').length,pageScroll:scrollY,bodyOverflow:getComputedStyle(body).overflowY,backgroundHit:hit===d||d.contains(hit),activeInside:d.contains(document.activeElement)};});
  record('selected provider opens a real top-layer AppDialog shape',topLayer.open&&topLayer.modal&&topLayer.provider==='Responses example'&&topLayer.models===1&&topLayer.pageScroll===0&&topLayer.bodyOverflow==='auto'&&topLayer.backgroundHit&&topLayer.activeInside,topLayer);
  await page.screenshot({path:path.join(evidenceDir,'11-r1-modal-initial-1440.png'),fullPage:false});report.screenshots.push('11-r1-modal-initial-1440.png');
  const body=page.locator('#admin-model > .dialog-body');
  await page.evaluate(()=>{document.querySelector('#admin-model > .dialog-body').scrollTop=0;});
  const beforeRects=await page.evaluate(()=>{const d=document.querySelector('#admin-model'),h=d.querySelector(':scope > h2').getBoundingClientRect(),f=d.querySelector(':scope > .dialog-actions').getBoundingClientRect(),b=d.querySelector(':scope > .dialog-body');return {headerY:h.y,footerY:f.y,bodyScroll:b.scrollTop,pageScroll:scrollY};});
  await body.evaluate(el=>el.scrollTop+=220);
  const afterRects=await page.evaluate(()=>{const d=document.querySelector('#admin-model'),h=d.querySelector(':scope > h2').getBoundingClientRect(),f=d.querySelector(':scope > .dialog-actions').getBoundingClientRect(),b=d.querySelector(':scope > .dialog-body');return {headerY:h.y,footerY:f.y,bodyScroll:b.scrollTop,pageScroll:scrollY,jsonVisible:!!d.querySelector('.custom-parameters')};});
  record('body scrolls while modal header, footer, and page stay fixed',afterRects.bodyScroll>beforeRects.bodyScroll&&afterRects.headerY===beforeRects.headerY&&afterRects.footerY===beforeRects.footerY&&afterRects.pageScroll===0&&afterRects.jsonVisible,{before:beforeRects,after:afterRects});
  await page.evaluate(()=>{const body=document.querySelector('#admin-model > .dialog-body'),target=document.querySelector('#custom-parameters-0');body.scrollTop=Math.max(0,target.offsetTop-body.offsetTop-120);});
  await page.screenshot({path:path.join(evidenceDir,'12-r1-modal-json-1440.png'),fullPage:false});report.screenshots.push('12-r1-modal-json-1440.png');

  const tabResults=[];for(let i=0;i<18;i++){await page.keyboard.press('Tab');tabResults.push(await page.evaluate(()=>document.querySelector('#admin-model').contains(document.activeElement)));}for(let i=0;i<8;i++){await page.keyboard.press('Shift+Tab');tabResults.push(await page.evaluate(()=>document.querySelector('#admin-model').contains(document.activeElement)));}
  record('Tab and Shift+Tab remain in top modal',tabResults.every(Boolean),{steps:tabResults.length});
  await page.locator('#model-entry-1 [data-action="test-model"]').click();
  const probeOk=await page.locator('#model-entry-1 > .notice').textContent();
  const area=page.locator('#custom-parameters-0');await area.fill('{"model":"other-model"}');
  const probeStale=await page.locator('#model-entry-1 > .notice').textContent();
  record('explicit model test is scoped and becomes stale after configuration edit',probeOk.includes('短连接测试通过')&&probeStale.includes('测试结果已失效'),{probeOk:probeOk.trim(),probeStale:probeStale.trim()});
  await page.locator('#admin-model [data-action="save-provider"]').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  const saveError=await page.evaluate(()=>({raw:document.querySelector('#custom-parameters-0').value,error:document.querySelector('#custom-parameters-error-0')?.textContent.trim(),invalid:document.querySelector('#custom-parameters-0').getAttribute('aria-invalid'),focused:document.activeElement===document.querySelector('#custom-parameters-0')}));
  record('invalid save preserves raw input and focuses the associated field error',saveError.raw==='{\"model\":\"other-model\"}'&&saveError.invalid==='true'&&saveError.focused&&saveError.error?.length>0,saveError);
  await page.keyboard.press('Escape');
  const confirm=await page.evaluate(()=>({parentModal:document.querySelector('#admin-model').matches(':modal'),confirmModal:document.querySelector('#model-discard').matches(':modal'),activeInConfirm:document.querySelector('#model-discard').contains(document.activeElement)}));
  record('Escape routes dirty form to a stacked discard confirmation',confirm.parentModal&&confirm.confirmModal&&confirm.activeInConfirm,confirm);
  await page.locator('#model-discard [data-action="keep-editing"]').click();
  record('Keep editing retains raw JSON and parent modal',await area.inputValue()==='{"model":"other-model"}'&&await page.locator('#admin-model').evaluate(el=>el.matches(':modal')),{value:await area.inputValue()});
  await page.locator('#admin-model .dialog-close').click();await page.locator('#model-discard [data-action="discard-model"]').click();
  await page.waitForFunction(()=>!document.querySelector('#admin-model').open);
  const restored=await page.evaluate(()=>({exact:document.activeElement?.dataset.action==='edit-provider'&&document.activeElement?.dataset.provider==='10000000-0000-4000-8000-000000000002',pageScroll:scrollY}));
  record('discard closes and restores the exact provider trigger',restored.exact&&restored.pageScroll===0,restored);

  const addOpener=page.locator('[data-action="add-provider"]');await addOpener.click();
  const addInitial=await page.evaluate(()=>({title:document.querySelector('#model-dialog-title').textContent.trim(),models:document.querySelectorAll('#admin-model .generic-model-item').length,name:document.querySelector('[data-connection-field="name"]').value,protocol:document.querySelector('[data-connection-field="protocol"]').value}));
  await page.locator('#admin-model .ww-select-trigger').click();
  await page.getByRole('option',{name:'Anthropic Messages'}).click();
  await page.locator('#custom-parameters-0').fill('{"thinking":{"type":"disabled"}}');
  await page.locator('#admin-model [data-action="add-model"]').click();
  await page.locator('#model-entry-2 > .generic-model-advanced > summary').click();
  await page.locator('#custom-parameters-1').fill('{}');
  const addState=await page.evaluate(()=>({models:document.querySelectorAll('#admin-model .generic-model-item').length,protocol:document.querySelector('[data-connection-field="protocol"]').value,first:document.querySelector('#custom-parameters-0').value,second:document.querySelector('#custom-parameters-1').value}));
  record('add-provider mode, protocol choice, add-model, and per-model JSON are independent',addInitial.title==='添加服务商'&&addInitial.models===1&&addInitial.name===''&&addState.models===2&&addState.protocol==='anthropic_messages'&&addState.first!==addState.second,{addInitial,addState});
  await page.locator('#admin-model .dialog-close').click();await page.locator('#model-discard [data-action="discard-model"]').click();

  await page.goto(url({page:'models',lang:'zh',view:'formal',state:'conflict',provider:'10000000-0000-4000-8000-000000000001',rev:'ui10-r1'}),{waitUntil:'networkidle'});
  await page.locator('#custom-parameters-0').fill('{"reasoning":{"enabled":true}}');
  await page.locator('#admin-model [data-action="refresh-provider"]').click();
  const merged=await page.evaluate(()=>({raw:document.querySelector('#custom-parameters-0').value,conflict:!!document.querySelector('#admin-model .notice.warn')}));
  record('version refresh clears conflict while retaining the model JSON draft',merged.raw==='{\"reasoning\":{\"enabled\":true}}'&&!merged.conflict,merged);
  await page.locator('#admin-model .dialog-close').click();await page.locator('#model-discard [data-action="discard-model"]').click();

  await page.goto(url({page:'models',lang:'zh',view:'formal',state:'list',rev:'ui10-r1'}),{waitUntil:'networkidle'});
  await page.locator('.generic-provider-card').nth(2).locator('[data-action="edit-provider"]').click();
  await page.locator('#admin-model [data-action="save-provider"]').click();
  const saved=await page.evaluate(()=>({modalOpen:document.querySelector('#admin-model')?.open??false,status:document.querySelector('.notice.success')?.textContent.trim(),cards:document.querySelectorAll('.generic-provider-card').length}));
  record('valid save closes to the complete list and shows saved state',!saved.modalOpen&&saved.cards===3&&saved.status?.includes('服务商配置已保存'),saved);

  await page.setViewportSize({width:390,height:844});
  await page.goto(url({page:'models',lang:'zh',view:'formal',state:'edit',provider:'10000000-0000-4000-8000-000000000001',rev:'ui10-r1'}),{waitUntil:'networkidle'});await stable();
  const mobileInitial=await page.evaluate(()=>({modal:document.querySelector('#admin-model').matches(':modal'),bodyScroll:document.querySelector('#admin-model > .dialog-body').scrollTop,pageScroll:scrollY,provider:document.querySelector('[data-connection-field="name"]').value}));
  record('mobile normal edit opens at the provider section',mobileInitial.modal&&mobileInitial.bodyScroll===0&&mobileInitial.pageScroll===0&&mobileInitial.provider==='OpenRouter',mobileInitial);
  await page.screenshot({path:path.join(evidenceDir,'13-r1-modal-initial-390.png'),fullPage:false});report.screenshots.push('13-r1-modal-initial-390.png');
  await page.goto(url({page:'models',lang:'zh',view:'formal',state:'error',case:'protected_model',provider:'10000000-0000-4000-8000-000000000001',rev:'ui10-r1'}),{waitUntil:'networkidle'});await stable();
  await page.evaluate(()=>{const body=document.querySelector('#admin-model > .dialog-body'),target=document.querySelector('#custom-parameters-0');body.scrollTop=Math.max(0,target.offsetTop-body.offsetTop-72);});
  const mobile=await page.evaluate(()=>{const d=document.querySelector('#admin-model'),area=d.querySelector('#custom-parameters-0'),error=d.querySelector('#custom-parameters-error-0'),help=d.querySelector('#custom-parameters-help-0'),all=[...d.querySelectorAll('*')];return {modal:d.matches(':modal'),dialogWidth:Math.round(d.getBoundingClientRect().width),viewport:innerWidth,pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,pageScroll:scrollY,errorAfterTextarea:all.indexOf(error)>all.indexOf(area),errorBeforeHelp:all.indexOf(error)<all.indexOf(help),raw:area.value,errorText:error.textContent.trim()};});
  record('mobile error keeps specific reason directly after JSON without horizontal overflow',mobile.modal&&mobile.dialogWidth<=390&&mobile.pageOverflow<=1&&mobile.pageScroll===0&&mobile.errorAfterTextarea&&mobile.errorBeforeHelp&&mobile.raw==='{\"model\":\"other-model\"}',mobile);
  await page.screenshot({path:path.join(evidenceDir,'14-r1-modal-error-390.png'),fullPage:false});report.screenshots.push('14-r1-modal-error-390.png');
  await page.locator('#custom-parameters-0').click();
  const internalClick=await page.evaluate(()=>!document.querySelector('#model-discard').open&&document.querySelector('#admin-model').matches(':modal'));
  record('clicking inside the modal does not close it',internalClick,{parentModal:internalClick});
  await page.mouse.click(8,8);
  const backdrop=await page.evaluate(()=>({confirm:document.querySelector('#model-discard').matches(':modal'),parent:document.querySelector('#admin-model').matches(':modal')}));
  record('backdrop uses the same dirty-close confirmation',backdrop.confirm&&backdrop.parent,backdrop);
  await page.screenshot({path:path.join(evidenceDir,'15-r1-discard-confirm-390.png'),fullPage:false});report.screenshots.push('15-r1-discard-confirm-390.png');
  completed=true;
}catch(error){
  report.run_error={name:error?.name??'Error',message:error?.message??String(error)};
}finally{
  report.scenarios.push({name:'no browser console errors',passed:report.console_errors.length===0,details:{count:report.console_errors.length}});
  report.completed=completed;
  report.result=completed&&report.scenarios.every(x=>x.passed)?'PASS':'FAIL';
  await fs.writeFile(path.join(evidenceDir,'modal-rework-browser.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
if(report.result!=='PASS')process.exitCode=1;
