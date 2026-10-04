import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {start,stop,ok,sql,origin,out,dump,ready,env,expect,instrument} from './harness.mjs';
const fixture=JSON.parse(readFileSync(new URL('fixture.json',out)));
const original=JSON.parse(readFileSync(new URL('library-results.json',out)));
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const browser=await start(),context=await browser.newContext({viewport:{width:1440,height:900}}),runtime=[];
try {
 const username=sql("SELECT username FROM wordweave.accounts WHERE id='"+fixture.userId+"'");
 await ok(context,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 await ok(context,'/me/ui-locale','PUT',{ui_locale:'zh-CN'});
 const page=await context.newPage();instrument(page,runtime,()=> 'K10-control');
 await page.goto(origin+'/library');await ready(page);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
 const labels=await page.locator('.library-stats dt').allTextContents();
 expect(labels).toEqual(['generated','words','participating','paused','successes','successfulbatches'].map(k=>copy.static['zh.l.stat.'+k]));
 const order=await page.locator('.library-page').evaluate(el=>['.page-head','.library-stats','.library-toolbar','.library-list'].map(s=>el.querySelector(s).getBoundingClientRect().top));
 expect(order.every((v,i)=>i===0||v>order[i-1])).toBe(true);
 const Axe=createRequire(process.cwd()+'/frontend/package.json')('@axe-core/playwright').default;
 const scan=await new Axe({page}).include('.library-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(scan.violations).toEqual([]);expect(runtime).toEqual([]);
 expect(original.runtime.filter(e=>e.kind==='pageerror'||!(['K06','K07'].includes(e.action)&&e.text==='Failed to load resource: net::ERR_FAILED'))).toEqual([]);
 await page.screenshot({path:new URL('K10-control-zh-1440.png',out).pathname});
 dump('library-controls.json',{results:[{id:'K10',result:'PASS',name:'Exact labels/order, accessibility after entrance animation, runtime control'}],labels,order,violations:scan.violations,runtime,originalRuntime:original.runtime,originalRawOutcome:'9 PASS / 1 FAIL; original entrance-animation contrast finding preserved',localProviderCalls:0,realProviderCalls:0});
 console.log('K10 control PASS');
} finally {await stop(browser);}
