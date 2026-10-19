import playwright from "../../../../../../frontend/node_modules/@playwright/test/index.js";
import fs from "node:fs/promises";

const { chromium } = playwright;
const root = "http://127.0.0.1:4174/M003/design/prototype/";
const evidenceDir = new URL("./", import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const report = { version:"M003-UI-06", fixtureVersion:"M003-BE-04", contractVersion:"m003-stream-v4", browser:"Chromium", scenarios:[], summary:{} };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const cpLength = (value) => Array.from(value ?? "").length;

async function openPage(query, viewport={width:1440,height:1000}, setup=null) {
  const page = await browser.newPage({ viewport, reducedMotion:"reduce" });
  const errors=[];
  page.on("console", m => m.type()==="error" && errors.push(`console:${m.text()}`));
  page.on("pageerror", e => errors.push(`page:${e.message}`));
  if (setup) await setup(page);
  await page.goto(`${root}?rev=ui06&${query}`, {waitUntil:"networkidle"});
  return {page,errors};
}
async function waitEvent(page,n,timeout=12000){await page.waitForFunction(v=>Number(new URL(location.href).searchParams.get('event'))>=v,n,{timeout});}
async function observe(page, selector, terminal, timeout=12000) {
  const start=Date.now(), samples=[]; let sig="";
  while(Date.now()-start<timeout){
    const event=Number(new URL(page.url()).searchParams.get("event")||0);
    const state=await page.locator(selector).getAttribute("data-state");
    const text=await page.locator(".live-draft-text").evaluateAll(nodes=>nodes[0]?.textContent ?? "");
    const next=`${event}|${state}|${cpLength(text)}|${text.slice(-24)}`;
    if(next!==sig){samples.push({at_ms:Date.now()-start,event,state,codepoints:cpLength(text),tail:text.slice(-24)});sig=next;}
    if(state===terminal) break;
    await page.waitForTimeout(25);
  }
  return {elapsed_ms:Date.now()-start,samples};
}
async function record(name, fn){const item={name,pass:false,errors:[]};try{Object.assign(item,await fn());item.pass=true;}catch(e){item.errors.push(e.stack||e.message);}report.scenarios.push(item);}

await record("rewrite-once-real-click-live-splice", async()=>{
  const {page,errors}=await openPage("page=create&scenario=rewrite-once&event=0&status=0&lang=zh");
  const historyBefore=await page.evaluate(()=>history.length);
  await page.evaluate(()=>window.__ui06Panel=document.querySelector('#generation-status'));
  await page.locator('[data-action="generate"]').click();
  const observed=await observe(page,"#generation-status","valid",7500);
  const byEvent=new Map(observed.samples.map(x=>[x.event,x]));
  const lengths=[...new Set(observed.samples.filter(x=>x.codepoints>0).map(x=>x.codepoints))];
  assert(observed.samples.some(x=>x.codepoints===13),"first/pure-delete 13-codepoint fragment was not observed");
  assert(observed.samples.some(x=>x.codepoints===556),"V1 did not grow from edit frames");
  assert(observed.samples.filter(x=>x.codepoints===13).length>=2,"pure delete frame was not visibly applied after V1");
  assert(observed.samples.some(x=>x.codepoints===580),"V2 did not regrow from splice frames");
  assert(lengths.length>20,"draft did not expose enough distinct visible increments");
  assert(await page.locator('[data-action="save-story"]').count()===1,"save not enabled only at final");
  assert(await page.locator('mark').allTextContents().then(v=>v.join(','))==='garden,learn,share',"Unicode code-point highlighting is wrong");
  assert(await page.locator('.story-text').textContent().then(v=>v.includes('🌱 sign')),"emoji was lost");
  assert(await page.evaluate(()=>window.__ui06Panel===document.querySelector('#generation-status')),"whole result panel was rebuilt");
  assert(await page.evaluate(()=>history.length)===historyBefore,"autoplay grew browser history");
  assert(await page.locator('.scenario-bar').evaluate(el=>!el.open),"demo panel opened during normal generation");
  assert(errors.length===0,errors.join('; '));
  await page.screenshot({path:`${evidenceDir}/01-create-rewrite-final-1440.png`,fullPage:true});
  await page.close();
  return {historyBefore,historyAfter:historyBefore,distinctDraftLengths:lengths.length,checkpoints:[13,556,13,580].map((n,i)=>observed.samples.find((x,j)=>x.codepoints===n && (i!==2 || j>observed.samples.findIndex(y=>y.codepoints===556)))),elapsed_ms:observed.elapsed_ms,errors};
});

await record("rewrite-delete-static-visual-and-no-save", async()=>{
  const {page,errors}=await openPage("page=create&scenario=rewrite-once&event=23&status=0&lang=zh");
  const text=await page.locator('.live-draft-text').textContent();
  assert(cpLength(text)===13,"event 23 is not the pure-delete state");
  assert(await page.locator('[data-action="save-story"]').count()===0,"draft exposed save");
  await page.screenshot({path:`${evidenceDir}/02-create-pure-delete-1440.png`,fullPage:true});
  await page.close(); return {event:23,codepoints:cpLength(text),text,errors};
});

await record("rewrite-twice-retained-q02", async()=>{
  const {page,errors}=await openPage("page=create&scenario=rewrite-twice-recover&event=0&status=0&lang=zh",{width:390,height:844});
  await page.locator('[data-action="generate"]').click();
  const observed=await observe(page,"#generation-status","valid",10000);
  const byEvent=new Map(observed.samples.map(x=>[x.event,x]));
  assert(observed.samples.filter(x=>x.codepoints===13).length>=3,"V3 did not visibly replace the prior tail");
  assert(observed.samples.some(x=>x.codepoints===182),"V3 partial draft checkpoint missing");
  assert(observed.samples.some(x=>x.event>=51&&x.codepoints===580),"retained frame did not restore complete V2");
  assert(await page.locator('.incomplete-note').textContent().then(v=>v.includes('内容审校未完成')),"Q02 notice missing");
  assert(await page.locator('[data-action="save-story"]').count()===1,"Q02 valid result is not saveable");
  assert(await page.locator('body').textContent().then(v=>!v.includes('d-third')&&!v.includes('content_version')),"internal edit fields leaked");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),"mobile horizontal overflow");
  assert(errors.length===0,errors.join('; '));
  await page.screenshot({path:`${evidenceDir}/03-create-q02-mobile-390.png`,fullPage:true});
  await page.close(); return {checkpoints:[13,182,580].map(n=>observed.samples.find(x=>x.codepoints===n)),elapsed_ms:observed.elapsed_ms,errors};
});

await record("basic-paid-and-same-version-continuation", async()=>{
  const names=['basic','paid-no-rewrite','native-continuation'];
  const runs=await Promise.all(names.map(async name=>{const opened=await openPage(`page=create&scenario=${name}&event=0&status=0&lang=zh`,{width:900,height:760});await opened.page.locator('[data-action="generate"]').click();await opened.page.waitForSelector('[data-action="save-story"]',{timeout:7000});const out={name,passage:await opened.page.locator('.article-result .story-text').textContent(),errors:opened.errors};await opened.page.close();return out;}));
  for(const run of runs){assert(run.passage.includes('garden')&&run.passage.includes('learn')&&run.passage.includes('share'),`${run.name} final missing targets`);assert(run.errors.length===0,run.errors.join('; '));}
  return {runs:runs.map(x=>({name:x.name,codepoints:cpLength(x.passage),errors:x.errors}))};
});

await record("pending-eof-cancel-failure", async()=>{
  const configs=[['pending-status','valid'],['eof-unknown','pending'],['cancelled','cancelled'],['no-valid-failure','failed']];
  const runs=await Promise.all(configs.map(async([name,want])=>{const opened=await openPage(`page=create&scenario=${name}&event=0&status=0&lang=zh`,{width:900,height:760});await opened.page.locator('[data-action="generate"]').click();await opened.page.waitForFunction(([s,w])=>document.querySelector(s)?.dataset.state===w,['#generation-status',want],{timeout:7000});await opened.page.waitForTimeout(500);const out={name,state:await opened.page.locator('#generation-status').getAttribute('data-state'),draft:await opened.page.locator('.live-draft-text').count(),save:await opened.page.locator('[data-action="save-story"]').count(),recheck:await opened.page.locator('[data-action="recheck-generation"]').count(),errors:opened.errors};await opened.page.close();return out;}));
  const map=Object.fromEntries(runs.map(x=>[x.name,x]));
  assert(map['pending-status'].state==='valid'&&map['pending-status'].save===1,'pending finite status did not resolve valid');
  assert(map['eof-unknown'].state==='pending'&&map['eof-unknown'].draft===1&&map['eof-unknown'].save===0,'EOF did not retain read-only draft');
  assert(map.cancelled.draft===0&&map.cancelled.save===0,'cancelled retained draft/save');
  assert(map['no-valid-failure'].draft===0&&map['no-valid-failure'].save===0,'failed retained draft/save');
  return {runs};
});

await record("cancel-and-restart-isolate-old-epoch", async()=>{
  const {page,errors}=await openPage("page=create&scenario=rewrite-once&event=0&status=0&lang=zh",{width:1000,height:780});
  await page.locator('[data-action="generate"]').click();await waitEvent(page,8);await page.locator('[data-action="cancel-generation"]').click();const cancelEvent=Number(new URL(page.url()).searchParams.get('event'));await page.waitForTimeout(6500);
  assert(await page.locator('#generation-status').getAttribute('data-state')==='cancelled','old timer polluted cancelled state');
  assert(Number(new URL(page.url()).searchParams.get('event'))===cancelEvent,'old timer changed cancelled URL');
  await page.locator('[data-action="restart"]').click();await page.locator('[data-action="generate"]').click();await page.waitForSelector('[data-action="save-story"]',{timeout:7500});
  assert(errors.length===0,errors.join('; '));await page.close();return {cancelEvent,restarted:true,errors};
});

async function badFixture(mutator){return openPage("page=create&scenario=rewrite-once&event=0&status=0&lang=zh",{width:900,height:760},async page=>{await page.route('**/stream-v4/rewrite-once.json',async route=>{const response=await route.fetch();const body=await response.json();mutator(body);await route.fulfill({response,json:body});});});}
await record("protocol-duplicate-noop-and-invalid-revision-range", async()=>{
  const dup=await badFixture(body=>{body.wire.splice(4,0,structuredClone(body.wire[3]));body.playback.splice(4,0,{after_ms:20});});
  await dup.page.locator('[data-action="generate"]').click();await dup.page.waitForSelector('[data-action="save-story"]',{timeout:7500});assert(await dup.page.locator('.article-result').count()===1,'adjacent duplicate blocked valid flow');
  const wrong=await badFixture(body=>{body.wire[3].data.base_rev=99;body.wire[3].data.rev=100;});await wrong.page.locator('[data-action="generate"]').click();await waitEvent(wrong.page,4);await wrong.page.waitForTimeout(500);assert(await wrong.page.locator('#generation-status').getAttribute('data-state')==='pending','wrong revision was applied');assert(await wrong.page.locator('.live-draft-text').textContent().then(v=>cpLength(v))===13,'wrong revision changed text');
  const range=await badFixture(body=>{body.wire[2].data.at=1;});await range.page.locator('[data-action="generate"]').click();await waitEvent(range.page,3);await range.page.waitForTimeout(400);assert(await range.page.locator('#generation-status').getAttribute('data-state')==='pending','out-of-range splice was applied');assert(await range.page.locator('.live-draft-text').count()===0,'out-of-range splice produced text');
  const out={duplicateErrors:dup.errors,wrongErrors:wrong.errors,rangeErrors:range.errors};await Promise.all([dup.page.close(),wrong.page.close(),range.page.close()]);return out;
});

await record("preview-enhanced-auto-qualification-and-basic-boundary", async()=>{
  const enhanced=await openPage("page=presets&mode=enhanced&event=0&status=0&lang=zh");await enhanced.page.locator('[data-action="generate-preview"]').click();const observed=await observe(enhanced.page,"#preview-result","ready",8000);assert(observed.samples.some(x=>x.codepoints>0&&x.event<45),'preview did not stream draft edits');assert(new URL(enhanced.page.url()).searchParams.get('qualified')==='1','preview did not finish current-preset qualification');assert(await enhanced.page.locator('#preset-publish').isEnabled(),'qualified complete preview did not enable publish');assert(await enhanced.page.locator('.scenario-bar').evaluate(el=>!el.open),'normal preview opened demo');await enhanced.page.screenshot({path:`${evidenceDir}/04-preset-ready-1440.png`,fullPage:true});
  const base=await openPage("page=presets&mode=base&event=0&status=0&lang=zh",{width:1000,height:800});await base.page.locator('[data-action="generate-preview"]').click();assert(Number(new URL(base.page.url()).searchParams.get('event'))===0,'basic mode replayed enhanced fixture');assert(await base.page.locator('.scenario-bar').evaluate(el=>el.open),'basic boundary was not explained');
  const out={elapsed_ms:observed.elapsed_ms,distinctDraftLengths:new Set(observed.samples.map(x=>x.codepoints).filter(Boolean)).size,enhancedErrors:enhanced.errors,baseErrors:base.errors};await Promise.all([enhanced.page.close(),base.page.close()]);return out;
});

await record("plans-boundaries-and-complete-fields", async()=>{
  const checks=[['0','true'],['99','true'],['-1','false'],['100','false'],['1.5','false']];const results=[];
  for(const [limit,valid] of checks){const {page,errors}=await openPage(`page=plans&plan=pro&limit=${limit}&adminState=edit&lang=zh`,{width:1100,height:800});const form=await page.locator('.plan-form').getAttribute('data-limit-valid');results.push({limit,valid:form,errors});assert((form==='true')=== (valid==='true'),`limit ${limit} boundary wrong`);assert(await page.locator('#basic-correction-policy').textContent().then(v=>v.includes('2')),'read-only base budget missing');assert(await page.locator('.plan-existing-grid').count()===1,'existing plan fields missing');await page.close();}
  return {results};
});

await record("english-mobile-stable-region-and-overflow", async()=>{
  const {page,errors}=await openPage("page=create&scenario=rewrite-once&event=0&status=0&lang=en",{width:390,height:844});await page.locator('[data-action="generate"]').click();await waitEvent(page,10);await page.evaluate(()=>{window.__panel=document.querySelector('#generation-status');window.scrollTo(0,220)});const scrollBefore=await page.evaluate(()=>scrollY);await waitEvent(page,18);const scrollAfter=await page.evaluate(()=>scrollY);assert(await page.evaluate(()=>window.__panel===document.querySelector('#generation-status')),'mobile result panel rebuilt');assert(Math.abs(scrollAfter-scrollBefore)<3,'autoplay moved user scroll position');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'English mobile overflow');assert(await page.locator('body').textContent().then(v=>!v.includes('⟦')),'missing English copy');await page.screenshot({path:`${evidenceDir}/05-create-writing-en-390.png`,fullPage:true});await page.close();return {scrollBefore,scrollAfter,errors};
});

report.summary={passed:report.scenarios.filter(x=>x.pass).length,failed:report.scenarios.filter(x=>!x.pass).length,total:report.scenarios.length,screenshots:5,syntheticPlaybackTimingMeasured:true,productionLatencyMeasured:false,modelOrProviderCalled:false,apiFixtureCheckerRerun:false};
await fs.writeFile(`${evidenceDir}/M003-UI-06-browser.json`,JSON.stringify(report,null,2)+"\n");
await browser.close();
console.log(JSON.stringify(report.summary));
if(report.summary.failed) process.exitCode=1;
