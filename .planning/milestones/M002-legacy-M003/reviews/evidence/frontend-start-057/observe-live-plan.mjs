import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../..');
const { chromium } = createRequire(path.join(root, 'frontend/package.json'))('@playwright/test');
const stack = JSON.parse(fs.readFileSync(path.join(here, 'local-stack-public.json'), 'utf8'));
const credentials = JSON.parse(fs.readFileSync(path.join(stack.work, 'env.json'), 'utf8'));
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000}, baseURL:stack.frontend_origin});
page.setDefaultTimeout(15000);
async function ready() { await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true'); }
async function select(label, value) {
 const control = page.getByRole('combobox', {name:label});
 const button = (await control.evaluate(node=>node.tagName==='SELECT')) ? control.locator('..').getByRole('combobox') : control;
 const native = button.locator('..').locator('select');
 const labelText = await native.locator(`option[value="${value}"]`).textContent();
 await button.click();
 await page.locator(`[id="${await button.getAttribute('aria-controls')}"]`).getByRole('option',{name:labelText.trim(),exact:true}).click();
}
try {
 await page.goto('/login'); await ready();
 await page.locator('input[name="username"]').fill(credentials.BASIC_USERNAME);
 await page.locator('input[name="password"]').fill(credentials.BASIC_PASSWORD);
 await page.locator('form button[type="submit"]').click();
 await page.waitForURL(url => !url.pathname.includes('/login'));
 await page.goto('/create'); await ready();
 const settings=page.locator('details.settings');
 if (!(await settings.evaluate(node=>node.open))) await settings.locator('summary').click();
 await select('Model',stack.models.pass); await select('Style','story'); await select('Length','short'); await select('Explanation language','en');
 await page.locator('#create-words-search').fill('grape');
 await page.getByRole('option',{name:'grape',exact:true}).click();
 await page.evaluate(() => {
  const start=performance.now(); const rows=[]; const ids=new WeakMap(); let nextId=1;
  const id=node=>node ? (ids.has(node)?ids.get(node):(ids.set(node,nextId),nextId++)) : null;
  const sample=()=>{
   const plan=document.querySelector('.m003-plan-preview');
   const draft=document.querySelector('.m003-live-draft');
   const final=document.querySelector('.m003-final-result');
   const text=draft?.querySelector('.live-draft-text')?.textContent?.trim() ?? '';
   const row={ms:Math.round(performance.now()-start),plan:!!plan,planNode:id(plan),draft:!!draft,draftNode:id(draft),draftLength:Array.from(text).length,final:!!final,phase:document.querySelector('.draft-status')?.textContent?.trim()??null};
   const prev=rows.at(-1);
   if (!prev || JSON.stringify({...prev,ms:0})!==JSON.stringify({...row,ms:0})) rows.push(row);
   if(plan&&text&&!window.__m003Coexist) window.__m003Coexist={...row,planText:plan.textContent.trim(),draftText:text};
   if(final) window.__m003Final={text:final.querySelector('.story-text')?.textContent?.trim(),planAbsent:!plan,draftAbsent:!draft};
  };
  window.__m003Rows=rows;
  window.__m003Observer=new MutationObserver(sample);
  window.__m003Observer.observe(document.body,{childList:true,subtree:true,characterData:true});sample();
 });
 let posts=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/generations/stream'))posts++;});
 await page.getByRole('button',{name:'Generate story',exact:true}).click();
 await page.waitForFunction(()=>!!window.__m003Coexist);
 await page.waitForFunction(()=>!!window.__m003Final);
 const observation=await page.evaluate(()=>{window.__m003Observer.disconnect();return {samples:window.__m003Rows,coexist:window.__m003Coexist,final:window.__m003Final};});
 const started=observation.samples.findIndex(row=>row.plan);
 const final=observation.samples.findIndex(row=>row.final);
 const drafts=observation.samples.filter(row=>row.draftLength>0&&!row.final);
 const checks={singlePost:posts===1,planBeforeDraft:observation.samples.findIndex(row=>row.plan)<observation.samples.findIndex(row=>row.draftLength>0),planRetainedUntilFinal:started>=0&&final>started&&observation.samples.slice(started,final).every(row=>row.plan),multipleDraftLengths:new Set(drafts.map(row=>row.draftLength)).size>1,stablePlanNode:new Set(observation.samples.filter(row=>row.plan).map(row=>row.planNode)).size===1,stableDraftNode:new Set(drafts.map(row=>row.draftNode)).size===1,finalReplacesPlanAndDraft:observation.final.planAbsent&&observation.final.draftAbsent};
 const result={recordedAt:new Date().toISOString(),scope:'Actual browser + Go + disposable PostgreSQL + synthetic local provider. DOM observations only; no linguistic quality or production SLO claim.',checks,...observation};
 fs.writeFileSync(path.join(here,'live-plan-observation.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({checks,samples:observation.samples.length,firstCoexistMs:observation.coexist.ms}));
 if(Object.values(checks).some(value=>!value))process.exitCode=1;
} catch(error) { const failure={recordedAt:new Date().toISOString(),error:error.message,selectors:await page.locator('select').evaluateAll(nodes=>nodes.map(node=>({name:node.getAttribute('name'),options:Array.from(node.options).map(o=>({value:o.value,text:o.textContent}))}))).catch(()=>[])}; fs.writeFileSync(path.join(here,'live-plan-observation-failure.json'),JSON.stringify(failure,null,2)+'\n'); console.error(JSON.stringify(failure)); process.exitCode=1; }
finally { await browser.close(); }
