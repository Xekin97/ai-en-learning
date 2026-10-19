import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(resolve('frontend/package.json'));
const {chromium}=require('@playwright/test');
const dir=dirname(fileURLToPath(import.meta.url));
const design=resolve('.planning/milestones/M002/design/pronunciation');
const baseline=JSON.parse(await readFile(resolve(design,'copy.json'),'utf8'));
const patch=JSON.parse(await readFile(resolve(design,'technical-alignment/copy.json'),'utf8'));
const merged={...baseline.static,...baseline.templates,...patch.static,...patch.templates};
const browser=await chromium.launch();const page=await browser.newPage();page.setDefaultTimeout(5000);
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const assert=(value,message)=>{if(!value)throw new Error(message)};
for(const [view,lang,lost,next] of [['result','zh','en-US','en-GB'],['plan','en','en-GB','en-US']]){
 try{
  await page.goto(`http://127.0.0.1:4175/M002/design/pronunciation/technical-alignment/formal/?page=${view}&lang=${lang}&scenario=accent&lost=${lost}&alternatives=${next}`);
  await page.waitForSelector('#app:not([aria-busy])');
  const control=page.locator('[data-pron-control]').first(),button=control.locator('[data-pron-play]');
  const word=await control.getAttribute('data-word');await button.click();await control.locator('[data-play-state="accent"]').waitFor();
  const accent=merged[`${lang}.pron.${lost==='en-US'?'us':'uk'}`];
  const expected=merged[`${lang}.pron.accentUnavailable`].replaceAll('{word}',word).replaceAll('{accent}',accent)+' '+merged[`${lang}.pron.chooseAccent`].replaceAll('{word}',word);
  assert(await button.getAttribute('aria-label')===expected,'copy does not match approved templates');
  assert(await control.getAttribute('data-actual-source')==='','automatic playback before selection');
  await button.click();assert(await control.locator('[data-pron-accent]').count()===1,'single alternative missing');
  assert(await control.locator('[data-pron-accent]').getAttribute('data-pron-accent')===next,'wrong alternative');
  await page.keyboard.press('Escape');assert(await button.evaluate(el=>el===document.activeElement),'wrong focus return');
  checks.push({view,lang,lost,next,status:'PASS',expectedLabel:expected});
 }catch(error){checks.push({view,lang,lost,next,status:'FAIL',error:error.message})}
}
await browser.close();
const report={version:'M002-FE-PRON-01-TA1',designVersion:'M002-UI-32-R3-TA1',timestamp:new Date().toISOString(),scope:'Frontend intake of approved design; two targeted paths. Reuses unchanged 16-case design evidence. No product implementation or real audio.',checks,errors,screenshotsSaved:0,pass:checks.filter(c=>c.status==='PASS').length,total:checks.length};
await writeFile(resolve(dir,'intake.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=report.pass===report.total&&!errors.length?0:1;
