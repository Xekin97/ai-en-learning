import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';

const dir = new URL('./', import.meta.url);
const fixture = JSON.parse(await fs.readFile(new URL('../../../technical/fixtures/stream-v5/rewrite-once.json', dir), 'utf8'));
const browser = await playwright.chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>m.type()==='error' && errors.push(m.text()));
const report={checked_at:new Date().toISOString(),method:'Normal Generate click; real playback timings; DOM observation only; no forced events or timer acceleration',fixture:'rewrite-once',design_version:'M003-UI-09',simulation_only:true};
try {
  await page.goto('http://127.0.0.1:4174/M003/design/prototype/?view=formal&rev=ui09&page=create&scenario=rewrite-once&event=0&status=0&lang=zh',{waitUntil:'networkidle'});
  await page.evaluate(()=>{window.__settings=document.querySelector('.settings.creation-settings');window.__panel=document.querySelector('#generation-status');window.__history=history.length;});
  await page.locator('[data-action="generate"]').click();
  const started=Date.now(),trace=[];let last='',capturedPlan=false,capturedDraft=false;
  while(Date.now()-started<20000){
    const sample=await page.evaluate(()=>({state:document.querySelector('#generation-status')?.dataset.state,plan:document.querySelectorAll('#planning-preview').length,items:document.querySelectorAll('#planning-preview .plan-item').length,planText:document.querySelector('#planning-preview')?.textContent??'',draft:document.querySelector('.live-draft-text')?.textContent??'',save:!!document.querySelector('[data-action="save-story"]'),marks:document.querySelectorAll('#generation-status mark').length,demoOpen:!!document.querySelector('.scenario-bar')?.open}));
    const sig=JSON.stringify(sample);
    if(sig!==last){trace.push({ms:Date.now()-started,...sample,codepoints:Array.from(sample.draft).length});last=sig;}
    if(sample.items>=3&&!capturedPlan){await page.screenshot({path:new URL('planning-1440.png',dir).pathname,fullPage:true});capturedPlan=true;}
    if(sample.draft.length>150&&!capturedDraft){await page.screenshot({path:new URL('drafting-1440.png',dir).pathname,fullPage:true});capturedDraft=true;}
    if(sample.state==='valid')break;
    await page.waitForTimeout(30);
  }
  const finalText=await page.locator('#final-result .story-text').textContent();
  const finalWire=fixture.wire.findLast(x=>x.event==='generation.validated');
  const firstPlan=trace.find(x=>x.plan),firstDraft=trace.find(x=>x.draft);
  const draftSamples=trace.filter(x=>x.draft);
  const shrinks=draftSamples.filter((x,i)=>i>0&&x.codepoints<draftSamples[i-1].codepoints).map(({ms,codepoints})=>({ms,codepoints}));
  const checks={planning_before_draft:!!firstPlan&&!!firstDraft&&firstPlan.ms<firstDraft.ms,all_four_plan_items:trace.some(x=>x.items===4),plan_retained_until_final:!!firstDraft&&trace.filter(x=>x.ms>=firstDraft.ms&&x.state!=='valid').every(x=>x.plan===1&&x.items===4),plan_cleared_on_valid:trace.at(-1)?.state==='valid'&&trace.at(-1)?.plan===0,continuous_draft:new Set(draftSamples.map(x=>x.draft)).size>30,two_replacement_events:shrinks.length>=2,safe_before_final:trace.filter(x=>x.state!=='valid').every(x=>!x.save&&x.marks===0),final_matches_wire:finalText===finalWire.data.result.passage,save_only_final:trace.at(-1)?.state==='valid'&&trace.at(-1)?.save,demo_stays_closed:trace.every(x=>!x.demoOpen),settings_preserved:await page.evaluate(()=>window.__settings===document.querySelector('.settings.creation-settings')),result_panel_preserved:await page.evaluate(()=>window.__panel===document.querySelector('#generation-status')),history_unchanged:await page.evaluate(()=>window.__history===history.length),m002_workspace_structure:await page.evaluate(()=>!!document.querySelector('.workspace .settings.creation-settings')&&!!document.querySelector('.word-picker')&&!!document.querySelector('.brand svg')),no_browser_errors:errors.length===0};
  Object.assign(report,{pass:Object.values(checks).every(Boolean),checks,first_plan_ms:firstPlan?.ms,first_draft_ms:firstDraft?.ms,final_ms:trace.at(-1)?.ms,visible_text_changes:new Set(draftSamples.map(x=>x.draft)).size,shrink_events:shrinks,errors,trace});
  await page.screenshot({path:new URL('final-1440.png',dir).pathname,fullPage:true});
} catch(e) {Object.assign(report,{pass:false,error:e.stack,errors});}
finally {await browser.close();await fs.writeFile(new URL('actual-click.json',dir),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({...report,trace:undefined},null,2));
if(!report.pass)process.exitCode=1;
