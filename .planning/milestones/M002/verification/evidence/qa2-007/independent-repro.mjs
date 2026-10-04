import {readFileSync} from 'node:fs';
import {expect,start,stop,ok,sql,origin,out,dump,ready,instrument,env} from './harness.mjs';
const fixture=JSON.parse(readFileSync(new URL('fixture.json',out))),copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const t=(lang,key)=>copy.static[lang+'.'+key]??copy.templates[lang+'.'+key], username=sql("SELECT username FROM wordweave.accounts WHERE id='"+fixture.userId+"'");
const browser=await start(),samples=[],runtime=[];let action='SETUP';
try{
 for(const [lang,width] of [['en',1440],['zh',320]]){
  const c=await browser.newContext({viewport:{width,height:900}}),p=await c.newPage();instrument(p,runtime,()=>action);
  await ok(c,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});await ok(c,'/me/ui-locale','PUT',{ui_locale:lang==='en'?'en-US':'zh-CN'});
  const focus=()=>p.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id,type:document.activeElement?.getAttribute('type'),text:document.activeElement?.tagName==='BODY'?'body':document.activeElement?.textContent?.slice(0,80)}));
  action='search-'+lang;await p.goto(origin+'/library');await ready(p);await p.getByRole('searchbox').fill('LEARN');
  const response=p.waitForResponse(r=>r.url().includes('/api/v1/me/batches?')&&new URL(r.url()).searchParams.get('entry')==='LEARN');await p.getByRole('button',{name:t(lang,'l.searchAction'),exact:true}).click();expect((await response).status()).toBe(200);await expect(p.locator('.library-row')).toHaveCount(20);await p.waitForTimeout(700);
  samples.push({action,lang,width,expectedFocus:'search input',actualFocus:await focus(),matches:await p.getByRole('searchbox').evaluate(el=>el===document.activeElement)});
  await p.screenshot({path:new URL(action+'.png',out).pathname});
  action='load-more-'+lang;await p.getByRole('button',{name:t(lang,'l.more'),exact:true}).click();await expect(p.locator('.library-row')).toHaveCount(21);await p.waitForTimeout(700);
  samples.push({action,lang,width,expectedFocus:'first new title',actualFocus:await focus(),matches:await p.locator('.library-row').last().locator('h2 a').evaluate(el=>el===document.activeElement)});await p.screenshot({path:new URL(action+'.png',out).pathname});
  action='participation-'+lang;const id=fixture.ids[0];await ok(c,'/me/batches/'+id,'PATCH',{participates_in_range_review:true});await p.goto(origin+'/library?entry=LEARN');await ready(p);const apiBefore=await ok(c,'/me/learning-summary'),uiBefore=(await p.locator('.library-stats dd').allTextContents()).map(Number),box=p.locator('[data-batch="'+id+'"]').getByRole('checkbox');
  await expect(box).toBeChecked();const changed=p.waitForResponse(r=>r.url().includes('/api/v1/me/batches/'+id)&&r.request().method()==='PATCH');await box.click();const res=await changed;expect(res.status()).toBe(200);await expect(box).not.toBeChecked();await expect(box).toBeEnabled();await p.waitForTimeout(700);const apiAfter=await ok(c,'/me/learning-summary'),uiAfter=(await p.locator('.library-stats dd').allTextContents()).map(Number),actualFocus=await focus(),focusMatches=await box.evaluate(el=>el===document.activeElement);
  const persisted=(await ok(c,'/me/batches/'+id)).batch.participates_in_range_review;await p.screenshot({path:new URL(action+'.png',out).pathname});
  await p.reload();await ready(p);const uiReloaded=(await p.locator('.library-stats dd').allTextContents()).map(Number);
  samples.push({action,lang,width,id,patchStatus:res.status(),patch:await res.json(),apiBefore,apiAfter,uiBefore,uiAfter,uiReloaded,persisted,expectedFocus:'same checkbox',actualFocus,focusMatches,statisticsMatch:uiAfter[2]===apiAfter.participating_batches&&uiAfter[3]===apiAfter.paused_batches});
  await c.close();
 }
 dump('independent-repro.json',{samples,runtime,separateBrowserContexts:2,realProviderCalls:0});
 console.log(JSON.stringify(samples,null,2));if(samples.some(x=>x.matches===false||x.statisticsMatch===false||x.focusMatches===false))process.exitCode=1;
}finally{await stop(browser);}

