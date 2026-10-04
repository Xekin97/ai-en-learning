import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
const root=process.cwd(), require=createRequire(root+'/frontend/package.json');
const {chromium,expect}=require('@playwright/test');
const out=new URL('./',import.meta.url), origin='http://127.0.0.1:3300';
const proto='http://127.0.0.1:4186/.planning/milestones/M002/design/prototype/';
const results=[],errors=[];
async function check(id,name,fn){try{await fn();results.push({id,name,result:'PASS'})}catch(e){results.push({id,name,result:'FAIL',error:String(e)})}console.log(id,results.at(-1).result)}
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',locale:'zh-CN'});
const page=await context.newPage(),design=await context.newPage();
const ready=async p=>{await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready)};
page.on('pageerror',e=>errors.push(e.message));
await check('U01','Approved home copy, two full story cards, order and static layout',async()=>{
  await page.goto(origin);await ready(page);await design.goto(proto+'?page=home&lang=zh');await design.locator('.home-card-stack').waitFor();await design.evaluate(()=>document.fonts.ready);
  for(const selector of ['.home-kicker','.home-intro h1','.home-description','.home-actions a','.home-paper-meta','.home-paper h2','.home-story','.home-word-meaning','.home-path h2','.home-path p'])expect(await page.locator(selector).allTextContents()).toEqual(await design.locator(selector).allTextContents());
  expect(await page.locator('.home-story').count()).toBe(2);
  const box=async(p,s)=>p.locator(s).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});
  const geometry=[];for(const selector of ['.home-intro','.home-card-stack','.home-path'])geometry.push({selector,actual:await box(page,selector),design:await box(design,selector)});
  writeFileSync(new URL('home-geometry.json',out),JSON.stringify(geometry,null,2));
  await page.screenshot({path:new URL('home-actual.png',out).pathname,fullPage:true});await design.screenshot({path:new URL('home-design.png',out).pathname,fullPage:true});
});
await check('U02','Home automatic change stops on reading; reduced motion applies dynamically',async()=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(origin);await ready(page);
  const stack=page.locator('.home-card-stack');await expect(stack).toHaveAttribute('data-motion','running');
  const first=await stack.getAttribute('data-top');await expect(stack).not.toHaveAttribute('data-top',first,{timeout:10000});
  await stack.locator('.home-paper').first().focus();await expect(stack).toHaveAttribute('data-motion','paused');
  const readTop=await stack.getAttribute('data-top');await page.waitForTimeout(8200);await expect(stack).toHaveAttribute('data-top',readTop);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(stack).toHaveAttribute('data-motion','reduced');
});
await check('U03','Authentication layout aligns fields and matches approved visible labels',async()=>{
  for(const [path,view] of [['/login','login'],['/register','register']]){
    await page.goto(origin+path);await ready(page);await design.goto(proto+'?page='+view+'&lang=zh');await design.locator('form').waitFor();
    const actual=await page.locator('.auth-form input').evaluateAll(es=>es.map(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
    expect(new Set(actual.map(x=>x.x)).size).toBe(1);expect(actual.every(x=>x.h>=44)).toBe(true);
    await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:new URL(view+'-320.png',out).pathname,fullPage:true});await page.setViewportSize({width:1440,height:1000});
  }
});
await browser.close();
const ext=new URL('zoom-extension/',out).pathname;mkdirSync(ext);
writeFileSync(ext+'manifest.json',JSON.stringify({manifest_version:3,name:'QA isolated 200 percent zoom',version:'1.0',permissions:['tabs'],host_permissions:[origin+'/*'],background:{service_worker:'background.js'}}));
writeFileSync(ext+'background.js','chrome.runtime.onInstalled.addListener(()=>{});');
await check('U04','Actual Chromium tab zoom 200% preserves key page reachability',async()=>{
  const ctx=await chromium.launchPersistentContext(mkdtempSync(tmpdir()+'/ww-qa2-zoom-'),{channel:'chromium',headless:false,viewport:null,locale:'en-US',reducedMotion:'reduce',args:['--window-size=1440,1000','--disable-extensions-except='+ext,'--load-extension='+ext]});
  try{
    const p=await ctx.newPage();await p.goto(origin+'/login');await ready(p);
    const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');
    const zoom=await worker.evaluate(async origin=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith(origin));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id)},origin);expect(zoom).toBe(2);
    await ctx.addCookies([{name:'wordweave_session',value:'learner',url:origin}]);
    const metrics=[];
    for(const route of ['/login','/review','/library','/account','/create']){
      await p.goto(origin+route);await ready(p);
      const m=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,dpr:devicePixelRatio}));metrics.push({route,...m});expect(m.scrollWidth).toBeLessThanOrEqual(m.width);
      await p.screenshot({path:new URL('zoom-'+route.slice(1)+'.png',out).pathname,fullPage:true});
    }
    writeFileSync(new URL('zoom-metrics.json',out),JSON.stringify({actualTabZoom:zoom,metrics},null,2));
  }finally{await ctx.close()}
});
writeFileSync(new URL('ui-audit.json',out),JSON.stringify({results,pageErrors:errors},null,2));
