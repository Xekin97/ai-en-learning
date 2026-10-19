import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=playwright;
const base='http://127.0.0.1:4174/M003/design/prototype/';
const dir=path.dirname(new URL(import.meta.url).pathname);
const fixture=JSON.parse(await fs.readFile(new URL('../../fixtures/ui13-r3-bookshop.json',import.meta.url),'utf8'));
const initial=fixture.checkpoints.initial_body_complete.split('\n\n');
const final=fixture.checkpoints.final_passage.split('\n\n');
const report={version:'M003-UI-13-R3',scope:'New rich bookshop sample only: desktop full replay, PAGE-212 reuse, and 390px zh/en readability. R2 motion and prior protocol matrices are reused.',source:fixture.sample_source,provider_calls:0,checks:[],screenshots:[],console_errors:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.on('pageerror',e=>report.console_errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.console_errors.push(m.text())});
const waitEvent=n=>page.waitForFunction(n=>Number(new URL(location.href).searchParams.get('event')??0)>=n,n,{timeout:25000,polling:10});
const goto=async url=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForSelector('.m003-result-body')};
const paras=selector=>page.locator(`${selector} [data-paragraph-index]`).allTextContents();
const snap=async name=>{const style=await page.addStyleTag({content:'.skip-link:not(:focus){display:none!important}'});await page.screenshot({path:path.join(dir,name),fullPage:true});await style.evaluate(n=>n.remove());report.screenshots.push(name)};
try{
  await goto(`${base}?page=create&lang=zh&scenario=ui13-r3-bookshop&event=17&demo=open&rev=ui13-r3`);
  await page.locator('[data-action=harness-replay]').click();await waitEvent(17);
  await page.evaluate(()=>{document.querySelector('.live-draft-text').__r3Story='retained';document.querySelector('[data-paragraph-index="1"]').__r3Unchanged='retained'});
  const initialState={selected:await page.locator('#create-words .word-token>span').allTextContents(),planUses:await page.locator('.m003-plan-use').count(),paragraphs:await paras('#live-draft')};
  await waitEvent(18);const waiting=(await page.locator('[data-stream-status]').innerText()).trim();
  await waitEvent(20);const stagedP0=(await paras('#live-draft'))[0];
  await waitEvent(21);const commit0={paragraphs:await paras('#live-draft'),replacing:await page.locator('[data-paragraph-index="0"].is-replacing').count()};
  await waitEvent(22);const half2=(await paras('#live-draft'))[2];
  await waitEvent(23);const fullButUncommitted2=(await paras('#live-draft'))[2];
  await page.locator('[data-action=cancel-generation]').focus({preventScroll:true});await page.evaluate(()=>scrollTo(0,Math.min(760,document.documentElement.scrollHeight-innerHeight)));
  const beforePosition=await page.evaluate(()=>({y:scrollY,active:document.activeElement?.dataset.action}));
  await waitEvent(24);
  const unchangedSame=await page.evaluate(()=>{
    const node=document.querySelector('[data-paragraph-index="1"]');
    return node?.__r3Unchanged==='retained';
  });
  const commit2={paragraphs:await paras('#live-draft'),replacing:await page.locator('[data-paragraph-index="2"].is-replacing').count(),unchangedSame};
  const afterPosition=await page.evaluate(()=>({y:scrollY,active:document.activeElement?.dataset.action}));
  await page.waitForTimeout(105);await page.evaluate(()=>scrollTo(0,0));await snap('01-rich-revision-desktop-zh.png');
  await waitEvent(26);const commit3=(await paras('#live-draft'))[3];
  await waitEvent(27);const bodyComplete=await paras('#live-draft');
  await waitEvent(28);await page.locator('[data-action=cancel-generation]').focus({preventScroll:true});await page.evaluate(()=>document.activeElement.__r3Action='retained');
  await waitEvent(29);const validImmediate={storySame:await page.evaluate(()=>document.querySelector('.m003-retained-passage').__r3Story==='retained'),targets:await page.locator('#final-result .m003-vocabulary-list dt').allTextContents(),paragraphs:(await page.locator('#final-result .story-text').innerText()).split(/\n\n/),marks:await page.locator('#final-result mark').count(),settingsDisabled:await page.locator('#create-settings fieldset').isDisabled(),searchDisabled:await page.locator('#create-words-search').isDisabled(),active:await page.evaluate(()=>document.activeElement?.dataset.action),sameAction:await page.evaluate(()=>document.activeElement?.__r3Action==='retained'),slot:await page.locator('.m003-final-exit-slot').count()};
  await page.waitForTimeout(90);await page.evaluate(()=>scrollTo(0,0));await snap('02-rich-final-desktop-zh.png');
  await page.waitForTimeout(190);const finalSettled={slot:await page.locator('.m003-final-exit-slot').count(),paragraphs:(await page.locator('#final-result .story-text').innerText()).split(/\n\n/)};
  record('R3-01-desktop-full-replay',initialState.selected.join('|')===fixture.request.entries.join('|')&&initialState.planUses===6&&JSON.stringify(initialState.paragraphs)===JSON.stringify(initial)&&waiting==='让表达更自然'&&stagedP0===initial[0]&&commit0.paragraphs[0]===final[0]&&commit0.replacing===1&&half2===initial[2]&&fullButUncommitted2===initial[2]&&commit2.paragraphs[2]===final[2]&&commit2.replacing===1&&commit2.unchangedSame&&commit3===final[3]&&JSON.stringify(bodyComplete)===JSON.stringify(final),{initialState,waiting,stagedP0,commit0,half2,fullButUncommitted2,commit2,commit3,bodyComplete});
  record('R3-02-scroll-focus-and-valid',Math.abs(afterPosition.y-beforePosition.y)<4&&afterPosition.active===beforePosition.active&&validImmediate.storySame&&validImmediate.targets.join('|')===fixture.request.entries.join('|')&&validImmediate.paragraphs.join('|')===final.join('|')&&validImmediate.marks===6&&!validImmediate.settingsDisabled&&!validImmediate.searchDisabled&&validImmediate.active==='generate'&&validImmediate.sameAction&&validImmediate.slot===1&&finalSettled.slot===0&&finalSettled.paragraphs.join('|')===final.join('|'),{beforePosition,afterPosition,validImmediate,finalSettled});

  await goto(`${base}?page=presets&lang=zh&mode=enhanced&event=17&rev=ui13-r3`);await page.locator('[data-action=generate-preview]').click();await waitEvent(17);await page.evaluate(()=>document.querySelector('#preview-result .live-draft-text').__r3Preview='retained');const previewInitial={planUses:await page.locator('#preview-result .m003-plan-use').count(),paragraphs:await paras('#preview-result #live-draft')};await waitEvent(29);const previewFinal={same:await page.evaluate(()=>document.querySelector('#preview-result .m003-retained-passage').__r3Preview==='retained'),targets:await page.locator('#preview-result #final-result .m003-vocabulary-list dt').allTextContents(),paragraphs:(await page.locator('#preview-result #final-result .story-text').innerText()).split(/\n\n/),userSave:await page.locator('#preview-result [data-action=save-story]').count()};record('R3-03-page212-shared-sample',previewInitial.planUses===6&&previewInitial.paragraphs.join('|')===initial.join('|')&&previewFinal.same&&previewFinal.targets.join('|')===fixture.request.entries.join('|')&&previewFinal.paragraphs.join('|')===final.join('|')&&previewFinal.userSave===0,{previewInitial,previewFinal});

  await page.setViewportSize({width:390,height:844});
  await goto(`${base}?page=create&lang=zh&scenario=ui13-r3-bookshop&event=29&view=formal&rev=ui13-r3`);const narrowZh={overflow:await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)),targets:await page.locator('#final-result .m003-vocabulary-list dt').count(),paragraphs:(await page.locator('#final-result .story-text').innerText()).split(/\n\n/).length,columns:await page.locator('#final-result .m003-vocabulary-list').evaluate(n=>getComputedStyle(n).gridTemplateColumns)};await snap('03-rich-final-mobile-zh.png');record('R3-04-mobile-zh',narrowZh.overflow===0&&narrowZh.targets===6&&narrowZh.paragraphs===4&&!narrowZh.columns.includes(' '),{narrowZh});
  await goto(`${base}?page=create&lang=en&scenario=ui13-r3-bookshop&event=24&view=formal&rev=ui13-r3`);const narrowEn={overflow:await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)),label:(await page.locator('[data-stream-status]').innerText()).trim(),planUses:await page.locator('.m003-plan-use').count(),paragraphs:await paras('#live-draft')};await snap('04-rich-revision-mobile-en.png');record('R3-05-mobile-en',narrowEn.overflow===0&&narrowEn.label==='Making the wording more natural'&&narrowEn.planUses===6&&narrowEn.paragraphs.length===4,{narrowEn:{...narrowEn,paragraphs:narrowEn.paragraphs.length}});
}finally{
 record('browser-console',report.console_errors.length===0,{errors:report.console_errors});report.summary={total:report.checks.length,passed:report.checks.filter(x=>x.passed).length,failed:report.checks.filter(x=>!x.passed).length};await fs.writeFile(path.join(dir,'M003-UI-13-R3-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
}
if(report.summary.failed)process.exitCode=1;
