import {readFileSync} from 'node:fs';
import {expect,start,stop,ok,call,sql,origin,out,dump,ready,instrument,env,t} from './harness.mjs';
const f=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const runtime=[],results=[],samples=[];let action='setup',browser,page;
const hash=id=>sql(`SELECT md5(to_jsonb(b)::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const username=sql(`SELECT username FROM wordweave.accounts WHERE id='${f.owner}'`);
async function test(id,fn){action=id;try{await fn();results.push({id,result:'PASS'});}catch(e){results.push({id,result:'FAIL',error:String(e)});}dump('results.json',{results,samples,runtime,localProviderCalls:0,realProviderCalls:0});console.log(id,results.at(-1).result,results.at(-1).error??'');}
try{
  browser=await start();const c=await browser.newContext({locale:'en-US',reducedMotion:'reduce'});
  await ok(c,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
  page=await c.newPage();instrument(page,runtime,()=>action);
  await test('T1-focus',async()=>{
    await page.goto(origin+'/library/'+f.siblingB);await ready(page);
    const before=hash(f.siblingB);
    await page.getByRole('button',{name:t('l.title.edit'),exact:true}).click();
    await page.locator('#batch-title').fill('Keep input after ordinary failure');
    const pattern='**/api/v1/me/batches/'+f.siblingB;
    await page.route(pattern,async route=>route.request().method()==='PATCH'
      ?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({type:'https://wordweave.example/problems/temporarily-unavailable',title:'Temporarily unavailable',status:503,code:'temporarily_unavailable',detail:'Local QA server failure',request_id:'qa12-valid-problem'})})
      :route.continue());
    try{
      await page.locator('.batch-title-editor button[type="submit"]').click();
      await expect(page.locator('.batch-title-editor [role="alert"]')).toBeVisible();
      await expect(page.locator('#batch-title')).toBeEnabled();
      await expect(page.locator('#batch-title')).toHaveValue('Keep input after ordinary failure');
      expect(hash(f.siblingB)).toBe(before);
      const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id}));
      samples.push({action,focus,inputRetained:true,storedUnchanged:true});
      await page.screenshot({path:new URL('T1-focus.png',out).pathname});
      await expect(page.locator('#batch-title')).toBeFocused();
    }finally{await page.unroute(pattern);}
  });
  await test('T4-console',async()=>{
    await page.goto(origin+'/library/'+f.normalId);await ready(page);
    const before=hash(f.normalId);
    await page.getByRole('button',{name:t('l.title.edit'),exact:true}).click();
    await page.locator('#batch-title').fill('Denied after session expires');
    sql(`DELETE FROM wordweave.account_sessions WHERE account_id='${f.owner}'`);
    await page.locator('.batch-title-editor button[type="submit"]').click();
    await expect(page.locator('.auth-gate')).toBeVisible();
    await expect(page.locator('#toast')).not.toHaveText(t('l.title.saved'));
    expect(hash(f.normalId)).toBe(before);
    expect((await call(c,'/me/batches/'+f.normalId,'PATCH',{title:'Denied',expected_title_revision:'1'})).status).toBe(401);
    const errors=runtime.filter(x=>x.action===action);
    samples.push({action,storedUnchanged:true,writeStatus:401,loginGateVisible:true,runtime:errors});
    await page.screenshot({path:new URL('T4-console.png',out).pathname});
    expect(errors).toEqual([]);
  });
}catch(e){results.push({id:'SETUP',result:'FAIL',error:String(e)});}
finally{dump('results.json',{results,samples,runtime,localProviderCalls:0,realProviderCalls:0});await stop(browser);if(results.some(x=>x.result==='FAIL'))process.exitCode=1;}
