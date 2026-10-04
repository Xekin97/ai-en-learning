import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(process.cwd()+'/frontend/package.json'),{chromium,expect}=require('@playwright/test');
const browser=await chromium.launch(),results=[];
try{
 for(const [name,username,path] of [['guest',null,'/explore'],['learner','learner_e2e','/account/growth'],['admin','admin_e2e','/admin/models']]){
  const c=await browser.newContext();await c.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:'http://127.0.0.1:3300'}]);const p=await c.newPage(),events=[];p.on('pageerror',e=>events.push(e.message));
  if(username){await p.goto('http://127.0.0.1:3300/login');await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.getByLabel('Username',{exact:true}).fill(username);await p.getByLabel('Password',{exact:true}).fill('CorrectPass123!');await p.locator('.auth-form button[type=submit]').click();await p.waitForURL(u=>u.pathname!='/login');}
  await p.goto('http://127.0.0.1:3300'+path);await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.waitForLoadState('networkidle');await expect(p.locator('main h1')).toBeVisible();results.push({name,path,actual:new URL(p.url()).pathname,heading:await p.locator('main h1').innerText(),page_errors:events});await c.close();
 }
}finally{await browser.close();}
fs.writeFileSync(new URL('./preview-smoke.json',import.meta.url),JSON.stringify(results,null,2)+'\n');if(results.some(x=>x.actual!==x.path||x.page_errors.length))process.exitCode=1;
console.log(JSON.stringify(results));
