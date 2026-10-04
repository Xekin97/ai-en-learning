import {readFileSync} from 'node:fs';
import {webkit,expect,start,stop,ok,call,sql,out,origin,dump,ready,env} from './harness.mjs';
const f=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const user=sql(`SELECT username FROM wordweave.accounts WHERE id='${f.owner}'`);
const results=[],samples=[],runtime=[];let browser,action;
const flush=()=>dump('results.json',{results,samples,runtime,localProviderCalls:0,realProviderCalls:0});
try {
  const before=JSON.parse(sql(`SELECT json_build_object('growthActivated',activated_at IS NOT NULL,'rules',(SELECT count(*) FROM wordweave.checkin_rules),'levels',(SELECT count(*) FROM wordweave.growth_levels)) FROM wordweave.growth_settings WHERE singleton`));
  // Same minimum configured baseline used by existing backend growth tests.
  sql(`BEGIN;
    UPDATE wordweave.growth_settings SET activated_at=clock_timestamp() WHERE activated_at IS NULL;
    INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience)
      SELECT '2020-01-01',0,0,0,0 WHERE NOT EXISTS(SELECT 1 FROM wordweave.checkin_rules);
    COMMIT;`);
  dump('fixture-control.json',{before,reason:'Title-only DB lacked growth activation/check-in configuration; /me/growth returned 503 while /me/items returned 200. Configured only this disposable test database.',applicationChanged:false});
  browser=await start(webkit);
  for(const [lang,width] of [['en-US',1440],['zh-CN',390]]) {
    action=lang+'-items';const context=await browser.newContext({locale:lang,timezoneId:'America/Los_Angeles',viewport:{width,height:900},reducedMotion:'reduce'});
    await ok(context,'/auth/login','POST',{username:user,password:env.ADMIN_PASSWORD,browser_ui_locale:lang});
    await ok(context,'/me/ui-locale','PUT',{ui_locale:lang});
    const growth=await call(context,'/me/growth');expect(growth.status).toBe(200);
    const inventory=await ok(context,'/me/items');expect(inventory.items.length).toBeGreaterThan(0);
    const page=await context.newPage();page.setDefaultTimeout(12000);
    page.on('console',m=>{if(['warning','error'].includes(m.type()))runtime.push({action,kind:m.type(),message:m.text()});});
    page.on('pageerror',e=>runtime.push({action,kind:'pageerror',message:e.message}));
    try {
      const response=await page.goto(origin+'/account/items');const html=await response.text();await ready(page);await page.waitForLoadState('networkidle');
      const selector='.item-dates dd';
      const server=await page.evaluate(({html,selector})=>Array.from(new DOMParser().parseFromString(html,'text/html').querySelectorAll(selector),x=>x.textContent.trim()),{html,selector});
      const client=await page.locator(selector).evaluateAll(nodes=>nodes.map(x=>x.textContent.trim()));
      expect(server.length).toBeGreaterThan(0);expect(client).toEqual(server);expect(server.every(x=>/\d{1,2}:\d{2}/.test(x))).toBe(true);
      expect(runtime.filter(x=>x.action===action)).toEqual([]);expect(await page.locator('html').getAttribute('lang')).toBe(lang);
      samples.push({id:action,width,browserTimeZone:'America/Los_Angeles',growthStatus:growth.status,server,client});
      await page.screenshot({path:new URL(action+'.png',out).pathname});results.push({id:action,result:'PASS'});
    }catch(error){results.push({id:action,result:'FAIL',error:String(error)});}
    flush();console.log(action,results.at(-1).result,results.at(-1).error??'');await context.close();
  }
}finally{
  await stop(browser);flush();
  // Remove first run's disposable visible fixtures; retain issued definition per DB guard.
  sql(`BEGIN;
    DELETE FROM wordweave.platform_notices WHERE id='c9e3ac60-b479-4f10-8271-57b158919962';
    DELETE FROM wordweave.user_items WHERE id='6a779695-0134-4c31-821b-c16ada2fa169';
    DELETE FROM wordweave.growth_settlements WHERE id='f0f50e70-1aa3-4214-8e0c-a64a1e7d46d6';
    COMMIT;`);
  dump('fixture-cleanup.json',{visibleFixturesRemoved:true,issuedDefinitionsRetainedUnlisted:true,disposableDBOnly:true});
  if(results.length!==2||results.some(x=>x.result!=='PASS'))process.exitCode=1;
}
