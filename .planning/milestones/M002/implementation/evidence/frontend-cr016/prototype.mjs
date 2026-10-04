import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
const {chromium,expect}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const out=new URL('./',import.meta.url), errors=[];
const server=spawn('python3',['-m','http.server','4186','--bind','127.0.0.1','--directory','.planning/milestones/M002/design'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4186/prototype/')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4186/prototype/?page=batch&state=save-error&lang=en&role=learner');
 await page.locator('[data-action="learn-title-edit"]').click();
 await page.locator('#batch-title').fill('Retain this title');
 await page.locator('[data-action="learn-title-save"]').click();
 await expect(page.locator('#batch-title-error')).toBeVisible();
 await expect(page.locator('#batch-title')).toBeFocused();
 await expect(page.locator('#batch-title')).toHaveValue('Retain this title');
 await page.screenshot({path:new URL('prototype-title-failure.png',out).pathname});
 writeFileSync(new URL('prototype-check.json',out),JSON.stringify({version:'UI22/H01',url:page.url(),focus:await page.locator('#batch-title').evaluate(e=>e===document.activeElement),errorText:await page.locator('#batch-title-error').innerText(),errors},null,2));
 expect(errors).toEqual([]);
}finally{await browser?.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}
