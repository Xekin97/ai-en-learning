import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const {chromium,expect}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const out=new URL('./',import.meta.url),results=[],errors=[];
let browser;
const server=spawn('python3',['-m','http.server','4186','--bind','127.0.0.1','--directory','.planning/milestones/M002/design'],{stdio:'ignore'});
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4186/prototype/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
 for(const [lang,width] of [['en',1440],['zh',390]]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4186/prototype/?page=batch&state=save-error&role=learner&lang='+lang);
  await page.locator('[data-action="learn-title-edit"]').click();await page.locator('#batch-title').fill('QA13 retained draft');
  await page.locator('[data-action="learn-title-save"]').click();const expected=copy.static[lang+'.l.title.failed'];
  await expect(page.locator('#batch-title-error')).toHaveText(expected);await expect(page.locator('#batch-title')).toBeFocused();
  results.push({lang,width,actual:await page.locator('#batch-title-error').innerText(),expected,focus:await page.locator('#batch-title').evaluate(el=>el===document.activeElement)});
  await page.screenshot({path:new URL('prototype-'+lang+'.png',out).pathname});await page.close();
 }
 expect(errors).toEqual([]);
}finally{writeFileSync(new URL('prototype-check.json',out),JSON.stringify({version:'UI22/H01',results,errors},null,2));await browser?.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}
