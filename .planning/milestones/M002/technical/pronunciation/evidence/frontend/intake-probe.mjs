// Read-only intake: unchanged approved design plus final UAT HTML headers. No live audio/model calls.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const require=createRequire(resolve('frontend/package.json'));
const {chromium}=require('@playwright/test');
const report={at:new Date().toISOString(),scope:'Design intake DOM and current UAT document headers only',designVersion:'M002-UI-32-R3',actualAudioVerified:false,implementationTested:false,screenshotsSaved:0,cases:[]};
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 for(const name of ['picker','plan','result','library']) {
  try {
   const response=await page.goto(`http://127.0.0.1:4175/M002/design/pronunciation/formal/?page=${name}&lang=zh`,{timeout:10000});
   await page.locator('#app:not([aria-busy])').waitFor({timeout:5000});
   const value=await page.evaluate(()=>({controls:document.querySelectorAll('[data-pron-control]').length,pickerControls:document.querySelectorAll('#pron-page-401-picker [data-pron-control]').length,entries:[...document.querySelectorAll('[data-pron-control]')].map(c=>({entry:c.dataset.word,label:c.querySelector('[data-pron-play]').getAttribute('aria-label'),text:c.querySelector('[data-pron-play]').textContent.trim(),visibleWidth:c.querySelector('[data-pron-play]').getBoundingClientRect().width})),overflow:document.documentElement.scrollWidth-innerWidth}));
   report.cases.push({name,http:response.status(),result:response.status()===200&&value.pickerControls===0&&value.controls===(name==='picker'?0:6)&&value.entries.every(e=>e.text===''&&e.visibleWidth===18)?'PASS':'FAIL',...value});
  } catch(e){report.cases.push({name,result:'UNVERIFIED',error:e.message});break;}
 }
 try {
  const response=await fetch('http://localhost:3016/create',{signal:AbortSignal.timeout(10000),redirect:'error'});
  report.currentUatHtml={url:'http://localhost:3016/create',status:response.status,contentType:response.headers.get('content-type'),csp:response.headers.get('content-security-policy'),referrerPolicy:response.headers.get('referrer-policy'),note:'Current build predates pronunciation; no CSP header here does not prove future deployment policy.'};
  await response.body?.cancel();
 }catch(e){report.currentUatHtml={result:'UNVERIFIED',error:e.message};}
}finally{
 await browser.close();
 await writeFile('.planning/milestones/M002/technical/pronunciation/evidence/frontend/intake-probe.json',JSON.stringify(report,null,2)+'\n');
}
process.stdout.write(JSON.stringify({cases:report.cases.map(({name,result,controls})=>({name,result,controls})),currentUatHtml:report.currentUatHtml,actualAudioVerified:report.actualAudioVerified})+'\n');
