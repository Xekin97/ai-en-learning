import{readFileSync,mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,sql,quote,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('browser-extra');
let b=await chromium.launch();
try{
 const c=await b.newContext();const token=await login(c,'qa065_learner');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage();await p.goto(origin+'/review');await ready(p);
 out.record('old-only library still permits choosing date',await p.locator('input[type=date]').count(),2);
 out.record('library has old saved data',sql('SELECT count(*) FROM wordweave.learning_batches WHERE owner_id='+quote(f.users.qa065_learner)),'2');
 await p.screenshot({path:join(dir,'screenshots','review-old-only-en.png')});await c.close();
 // Stage B adds a current saved date in synthetic QA data solely for date-size verification.
 sql('UPDATE wordweave.learning_batches SET saved_at=now() WHERE id='+quote(f.batches[1].id));
 for(const locale of['en-US','zh-CN']){
 const c=await b.newContext();const token=await login(c,'qa065_learner',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();c.setDefaultTimeout(7000);
 for(const width of[320,390,720,1280,1440]){
 await p.setViewportSize({width,height:1000});await p.goto(origin+'/review');await ready(p);await p.locator('.date-range').waitFor();
 const m=await p.locator('.date-range input').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{w:r.width,h:r.height,top:r.top,margin:getComputedStyle(n.closest('.field')).marginTop};}));
 out.record('From/To 44px '+locale+' '+width,m.map(n=>n.h),[44,44]);out.record('From/To equal width '+locale+' '+width,m[0].w,m[1].w);out.record('no second margin '+locale+' '+width,m[1].margin,'0px');
 if(width>720)out.record('From/To row alignment '+locale+' '+width,m[0].top,m[1].top);
 if(width===390||width===1440)await p.screenshot({path:join(dir,'screenshots','dates-'+locale+'-'+width+'.png')});
 }
 await p.locator('input[type=date]').nth(0).fill('2026-08-01');await p.locator('input[type=date]').nth(1).fill('2026-08-02');await p.locator('input[type=date]').nth(1).blur();await p.waitForTimeout(700);
 out.record('changing to empty retains editable dates '+locale,await p.locator('input[type=date]').count(),2);await c.close();
 }
} catch(e){out.error('dates execution',e);}finally{await b.close();}
for(const[type,name]of[[chromium,'chromium'],[webkit,'webkit']]){
 let browser;try{browser=await type.launch();
 for(const locale of['en-US','zh-CN'])for(const width of[390,1440]){
 const c=await browser.newContext({viewport:{width,height:844},locale});c.setDefaultTimeout(7000);const token=await login(c,'qa065_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/admin/users/'+f.users.qa065_learner+'?batch='+f.batches[1].id);await ready(p);await p.locator('.reader-passage').waitFor();
 out.record(name+' long complete '+locale+' '+width,(await p.locator('.reader-passage').textContent())===f.batches[1].passage,true);
 out.record(name+' modal bounds '+locale+' '+width,await p.locator('dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),true);
 await p.locator('.reader-body').focus();await p.keyboard.press('End');await p.keyboard.press('Escape');await expect(p.locator('dialog')).toHaveCount(0);
 await p.locator('.model-row button').nth(1).click();await p.locator('.reader-passage').waitFor();
 const axe=await new AxeBuilder({page:p}).analyze();out.record(name+' reader axe '+locale+' '+width,axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
 out.record(name+' runtime errors '+locale+' '+width,errors,[]);await c.close();
 }
 }catch(e){out.error(name+' execution',e);}finally{if(browser)await browser.close();}
}
try{
 const ext=join(dir,'zoom-extension'),profile=mkdtempSync(join(tmpdir(),'wordweave-qa065-zoom-'));
 const c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,args:['--window-size=1440,1000','--disable-extensions-except='+ext,'--load-extension='+ext]});
 try{
 const token=await login(c,'qa065_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});
 const p=await c.newPage();await p.goto(origin+'/admin/users/'+f.users.qa065_learner+'?batch='+f.batches[1].id);await ready(p);await p.locator('.reader-passage').waitFor();
 const worker=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker',{timeout:5000});
 const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.includes('/admin/users/'));return new Promise(resolve=>chrome.tabs.getZoom(tab.id,resolve));});
 out.record('actual browser tab zoom',zoom,2);
 out.record('zoom 200 bounds',await p.locator('dialog').evaluate(n=>{const r=n.getBoundingClientRect();return{inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,rootOverflow:document.documentElement.scrollWidth>innerWidth};}),{inside:true,rootOverflow:false});
 await p.screenshot({path:join(dir,'screenshots','browser-real-zoom-200.png')});await p.locator('.dialog-footer button').click();await expect(p.locator('dialog')).toHaveCount(0);
 out.record('zoom usable close',true,true);console.log('Temporary Chromium profile retained: '+profile);
 }finally{await c.close();}
}catch(e){out.error('real browser zoom',e);}
out.save();

