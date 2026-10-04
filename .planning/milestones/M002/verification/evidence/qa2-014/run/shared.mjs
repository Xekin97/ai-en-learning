import {readFileSync} from 'node:fs';
import {webkit,expect,start,stop,ok,sql,origin,out,dump,ready,env,randomUUID} from './harness.mjs';

const fixture=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const username=sql(`SELECT username FROM wordweave.accounts WHERE id='${fixture.owner}'`);
const ids={notice:randomUUID(),definition:randomUUID(),settlement:randomUUID(),item:randomUUID()};
const results=[],samples=[],runtime=[];let browser,page,action;
const flush=()=>dump('shared-results.json',{results,samples,runtime,localProviderCalls:0,realProviderCalls:0});
try {
  const baseline=JSON.parse(sql(`SELECT json_build_object('activated',activated_at IS NOT NULL,'firstLevel',(SELECT count(*) FROM wordweave.growth_levels WHERE level_no=1),'rules',(SELECT count(*) FROM wordweave.checkin_rules)) FROM wordweave.growth_settings WHERE singleton`));
  expect(baseline.activated).toBe(true);expect(baseline.firstLevel).toBe(1);expect(baseline.rules).toBeGreaterThan(0);
  dump('fixture.json',{database:'wordweave_qa14_date_copy',baseline,fixtures:ids,cleanup:'drop this QA-only cloned database after stopping services'});
  sql(`BEGIN;
    INSERT INTO wordweave.platform_notices(id,title_zh,title_en,body_zh,body_en,visible,remind,published_at)
      VALUES('${ids.notice}','QA14日期通知','QA14 date notice','本地测试','Local test',true,false,'2026-09-28T06:46:00Z');
    INSERT INTO wordweave.item_definitions(id,kind,name_zh,name_en,description_zh,description_en,exchange_price,activation_ttl_seconds,ever_issued)
      VALUES('${ids.definition}','makeup','QA14补签卡','QA14 makeup card','本地测试','Local test',0,86400,true);
    INSERT INTO wordweave.growth_settlements(id,owner_id,kind,source_key,config_snapshot)
      VALUES('${ids.settlement}','${fixture.owner}','admin_grant','${ids.item}','{}');
    INSERT INTO wordweave.user_items(id,owner_id,definition_id,issuance_settlement_id,issuance_component,issued_at,activation_deadline,kind_snapshot,parameters_snapshot)
      VALUES('${ids.item}','${fixture.owner}','${ids.definition}','${ids.settlement}','item:1',clock_timestamp(),'2027-01-01T00:00:00+08:00','makeup','{"kind":"makeup"}');
    COMMIT;`);
  browser=await start(webkit);
  for(const [lang,width] of [['en-US',1440],['zh-CN',390]]) {
    const contexts={};
    for(const [role,user] of [['learner',username],['admin',env.ADMIN_USERNAME]]) {
      const context=await browser.newContext({locale:lang,timezoneId:'America/Los_Angeles',viewport:{width,height:900},reducedMotion:'reduce'});
      await ok(context,'/auth/login','POST',{username:user,password:env.ADMIN_PASSWORD,browser_ui_locale:lang});
      await ok(context,'/me/ui-locale','PUT',{ui_locale:lang});contexts[role]=context;
    }
    for(const [id,role,path,selector] of [
      ['account','learner','/account','.account-facts > div:nth-child(3) dd, .account-facts > div:nth-child(4) dd'],
      ['items','learner','/account/items','.item-dates dd'],
      ['notice','learner','/notices','.notice-entry small'],
      ['admin-user','admin','/admin/users/'+fixture.owner,'.admin-facts > div:nth-child(4) dd, .admin-facts > div:nth-child(5) dd, .admin-facts > div:nth-child(6) dd'],
    ]) {
      action=lang+'-'+id;page=await contexts[role].newPage();page.setDefaultTimeout(12000);
      page.on('console',m=>{if(['warning','error'].includes(m.type()))runtime.push({action,kind:m.type(),message:m.text()});});
      page.on('pageerror',e=>runtime.push({action,kind:'pageerror',message:e.message}));
      try {
        const response=await page.goto(origin+path);expect(response.status()).toBe(200);const html=await response.text();await ready(page);await page.waitForLoadState('networkidle');
        const server=await page.evaluate(({html,selector})=>Array.from(new DOMParser().parseFromString(html,'text/html').querySelectorAll(selector),el=>el.textContent.trim()),{html,selector});
        const client=await page.locator(selector).evaluateAll(nodes=>nodes.map(el=>el.textContent.trim()));
        expect(server.length).toBeGreaterThan(0);expect(server.some(x=>/\d{1,2}:\d{2}/.test(x))).toBe(true);expect(client).toEqual(server);
        if(id==='items')expect(client).toContain(lang==='en-US'?'Jan 1, 2027, 12:00 AM':'2027年1月1日 00:00');
        if(id==='notice')expect(client).toContain(lang==='en-US'?'Sep 28, 2026, 2:46 PM':'2026年9月28日 14:46');
        expect(await page.locator('html').getAttribute('lang')).toBe(lang);expect(runtime.filter(x=>x.action===action)).toEqual([]);
        samples.push({id:action,path,width,server,client,browserTimeZone:'America/Los_Angeles'});
        if(id==='items')await page.screenshot({path:new URL(action+'.png',out).pathname});
        results.push({id:action,result:'PASS'});
      }catch(error){results.push({id:action,result:'FAIL',error:String(error)});await page.screenshot({path:new URL(action+'-failed.png',out).pathname}).catch(()=>{});}
      flush();console.log(action,results.at(-1).result,results.at(-1).error??'');await page.close();
    }
    for(const context of Object.values(contexts))await context.close();
  }
}finally{flush();await stop(browser);if(results.length!==8||results.some(x=>x.result!=='PASS'))process.exitCode=1;}
