import {readFileSync} from 'node:fs';
import {chromium,firefox,webkit,expect,start,stop,ok,sql,origin,out,dump,ready,env} from './harness.mjs';
const f=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const user=sql(`SELECT username FROM wordweave.accounts WHERE id='${f.owner}'`);
const results=[],samples=[],runtime=[];let browser,page,action;
const flush=()=>dump('results.json',{results,samples,runtime,localProviderCalls:0,realProviderCalls:0});
try{
 for(const [id,engine,locale] of [['H01-webkit-en',webkit,'en-US'],['H02-chromium-en',chromium,'en-US'],['H03-webkit-zh',webkit,'zh-CN'],['H04-firefox-en',firefox,'en-US']]){
  action=id;browser=await start(engine);const c=await browser.newContext({locale,viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await ok(c,'/auth/login','POST',{username:user,password:env.ADMIN_PASSWORD,browser_ui_locale:locale});await ok(c,'/me/ui-locale','PUT',{ui_locale:locale});
  page=await c.newPage();page.setDefaultTimeout(12000);
  page.on('console',m=>{if(['warning','error'].includes(m.type()))runtime.push({action,kind:m.type(),message:m.text()});});page.on('pageerror',e=>runtime.push({action,kind:'pageerror',message:e.message}));
  const dates=[];
  try{
   for(const mode of ['direct','reload']){
    const r=mode==='direct'?await page.goto(origin+'/library/'+f.normalId):await page.reload();
    const server=(await r.text()).match(/<p[^>]*class="eyebrow"[^>]*>([^<]*)<\/p>/)?.[1];expect(server).toBeDefined();await ready(page);
    // Hydration compares DOM text nodes, not CSS text-transform's rendered innerText.
    const node=page.locator('.batch-detail > article > .eyebrow');const client=await node.textContent();
    const presentation=await node.innerText();const htmlLang=await page.locator('html').getAttribute('lang');expect(htmlLang).toBe(locale);
    dates.push({mode,server,client,presentation,locale:htmlLang,equal:server===client});
   }
   samples.push({id,dates,runtime:runtime.filter(x=>x.action===id),browserVersion:browser.version()});
   await page.screenshot({path:new URL(id+'.png',out).pathname});expect(dates.every(d=>d.equal)).toBe(true);expect(runtime.filter(x=>x.action===id)).toEqual([]);
   results.push({id,result:'PASS'});
  }catch(e){results.push({id,result:'FAIL',error:String(e)});}
  flush();console.log(id,results.at(-1).result);await stop(browser);browser=undefined;
 }
}finally{flush();await stop(browser);if(results.length!==4||results.some(x=>x.result==='FAIL'))process.exitCode=1;}
