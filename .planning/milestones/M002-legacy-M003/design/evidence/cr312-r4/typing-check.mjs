import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=playwright;
const base='http://127.0.0.1:4174/M003/design/prototype/';
const dir=path.dirname(new URL(import.meta.url).pathname);
const fixture=JSON.parse(await fs.readFile(new URL('../../fixtures/ui13-r3-bookshop.json',import.meta.url),'utf8'));
const firstTarget=fixture.wire[12].data.insert;
const initial=fixture.checkpoints.initial_body_complete;
const final=fixture.checkpoints.final_passage;
const count=value=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].length;
const report={version:'M003-UI-13-R4',scope:'Initial append typing presenter only: real-time growth, 650ms catch-up, immediate terminal flush/cancel, replay isolation, reduced motion, and shared 390px PAGE-212 observation. R3 content and R2 revision motion are reused.',timing_contract:{base_graphemes_per_second:36,max_visual_lag_ms:650,scheduler:'one requestAnimationFrame loop; one DOM patch per frame at most'},provider_calls:0,checks:[],screenshots:[],console_errors:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050}});const page=await context.newPage();
page.on('pageerror',e=>report.console_errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.console_errors.push(m.text())});
const eventNo=page=>page.evaluate(()=>Number(new URL(location.href).searchParams.get('event')??0));
const waitEvent=(page,n)=>page.waitForFunction(n=>Number(new URL(location.href).searchParams.get('event')??0)>=n,n,{timeout:25000,polling:8});
const text=page=>page.locator('.live-draft-text').innerText();
const snap=async(page,name)=>{const style=await page.addStyleTag({content:'.skip-link:not(:focus){display:none!important}'});await page.screenshot({path:path.join(dir,name),fullPage:true});await style.evaluate(n=>n.remove());report.screenshots.push(name)};
try {
  await page.goto(`${base}?page=create&lang=zh&scenario=ui13-r3-bookshop&event=11&demo=open&rev=ui13-r4`,{waitUntil:'domcontentloaded'});
  await page.locator('[data-action=harness-replay]').click();await waitEvent(page,13);
  const receivedAt=Date.now();await page.waitForTimeout(35);const first=await text(page);const firstMeta=await page.locator('.live-draft-text').evaluate(n=>({state:n.dataset.typingState,shown:Number(n.dataset.typingShown),received:Number(n.dataset.typingReceived),cursor:n.classList.contains('is-typing'),busy:n.getAttribute('aria-busy')}));
  await page.waitForTimeout(145);const second=await text(page);const secondMeta=await page.locator('.live-draft-text').evaluate(n=>({state:n.dataset.typingState,shown:Number(n.dataset.typingShown),received:Number(n.dataset.typingReceived),cursor:n.classList.contains('is-typing')}));
  await snap(page,'01-initial-typing-desktop-zh.png');
  await page.waitForFunction(()=>document.querySelector('.live-draft-text')?.dataset.typingState==='caught-up',null,{timeout:1200,polling:8});
  const caughtAt=Date.now();const caught={elapsed_ms:caughtAt-receivedAt,event:await eventNo(page),text:await text(page),meta:await page.locator('.live-draft-text').evaluate(n=>({shown:Number(n.dataset.typingShown),received:Number(n.dataset.typingReceived),cursor:n.classList.contains('is-typing'),busy:n.hasAttribute('aria-busy')}))};
  record('R4-01-two-time-growth-and-catchup',count(first)>0&&count(first)<count(second)&&count(second)<count(firstTarget)&&caught.elapsed_ms<=850&&caught.meta.shown===caught.meta.received&&!caught.meta.cursor&&!caught.meta.busy,{first_count:count(first),second_count:count(second),first_target_count:count(firstTarget),firstMeta,secondMeta,caught:{...caught,text_count:count(caught.text)}});
  await waitEvent(page,17);const body={text:(await page.locator('#live-draft [data-paragraph-index]').allTextContents()).join('\n\n'),cursor:await page.locator('.live-draft-text.is-typing').count(),state:await page.locator('.live-draft-text').getAttribute('data-typing-state')};
  await waitEvent(page,29);const valid={text:await page.locator('#final-result .story-text').innerText(),cursor:await page.locator('.live-draft-text.is-typing').count(),settingsDisabled:await page.locator('#create-settings fieldset').isDisabled(),action:await page.locator('#generation-actions button').getAttribute('data-action')};
  record('R4-02-body-and-valid-flush-immediately',body.text===initial&&body.cursor===0&&valid.text===final&&valid.cursor===0&&!valid.settingsDisabled&&valid.action==='generate',{body:{...body,text_matches:body.text===initial},valid:{...valid,text_matches:valid.text===final}});

  await page.locator('[data-action=harness-replay]').click();await waitEvent(page,13);await page.waitForTimeout(90);const beforeCancel=await text(page);await page.locator('[data-action=cancel-generation]').click();const cancelledImmediate={state:await page.locator('#generation-status').getAttribute('data-state'),typing:await page.locator('.is-typing').count(),draft:await page.locator('#live-draft').count(),event:await eventNo(page)};await page.waitForTimeout(760);const cancelledLater={state:await page.locator('#generation-status').getAttribute('data-state'),typing:await page.locator('.is-typing').count(),draft:await page.locator('#live-draft').count(),event:await eventNo(page)};
  await page.locator('[data-action=restart]').click();await page.locator('[data-action=harness-replay]').click();await waitEvent(page,13);await page.waitForTimeout(90);const replay={text:await text(page),state:await page.locator('.live-draft-text').getAttribute('data-typing-state'),typing:await page.locator('.live-draft-text.is-typing').count()};
  record('R4-03-cancel-and-replay-isolation',count(beforeCancel)>0&&cancelledImmediate.state==='cancelled'&&cancelledImmediate.typing===0&&cancelledImmediate.draft===0&&cancelledLater.state==='cancelled'&&cancelledLater.typing===0&&cancelledLater.draft===0&&cancelledLater.event===cancelledImmediate.event&&count(replay.text)>0&&count(replay.text)<count(firstTarget)&&replay.state==='running'&&replay.typing===1,{before_cancel_count:count(beforeCancel),cancelledImmediate,cancelledLater,replay:{...replay,text_count:count(replay.text)}});

  const reducedContext=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});const reduced=await reducedContext.newPage();
  reduced.on('pageerror',e=>report.console_errors.push(String(e)));await reduced.goto(`${base}?page=create&lang=zh&scenario=ui13-r3-bookshop&event=11&demo=open&rev=ui13-r4`,{waitUntil:'domcontentloaded'});await reduced.locator('[data-action=harness-replay]').click();await waitEvent(reduced,13);const reducedState={text:await text(reduced),typing:await reduced.locator('.live-draft-text.is-typing').count(),state:await reduced.locator('.live-draft-text').getAttribute('data-typing-state')};record('R4-04-reduced-motion-direct',reducedState.text===firstTarget&&reducedState.typing===0&&reducedState.state==='reduced',{...reducedState,text_matches:reducedState.text===firstTarget});await reducedContext.close();

  const mobileContext=await browser.newContext({viewport:{width:390,height:844}});const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>report.console_errors.push(String(e)));await mobile.goto(`${base}?page=presets&lang=en&mode=enhanced&event=11&rev=ui13-r4`,{waitUntil:'domcontentloaded'});await mobile.locator('[data-action=generate-preview]').click();await waitEvent(mobile,13);await mobile.waitForTimeout(180);const mobileState={event:await eventNo(mobile),count:count(await text(mobile)),target:count(firstTarget),typing:await mobile.locator('#preview-result .live-draft-text.is-typing').count(),overflow:await mobile.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)),planUses:await mobile.locator('#preview-result .m003-plan-use').count()};await snap(mobile,'02-initial-typing-mobile-en-page212.png');record('R4-05-page212-mobile-shared',mobileState.count>0&&mobileState.count<mobileState.target&&mobileState.typing===1&&mobileState.overflow===0&&mobileState.planUses===6,{mobileState});await mobileContext.close();
} finally {
  record('browser-console',report.console_errors.length===0,{errors:report.console_errors});report.summary={total:report.checks.length,passed:report.checks.filter(x=>x.passed).length,failed:report.checks.filter(x=>!x.passed).length};await fs.writeFile(path.join(dir,'M003-UI-13-R4-typing.json'),JSON.stringify(report,null,2)+'\n');await context.close();await browser.close();
}
if(report.summary.failed)process.exitCode=1;
