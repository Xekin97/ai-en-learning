const {chromium,expect}=require('../../../../../frontend/node_modules/@playwright/test');
const {default:AxeBuilder}=require('../../../../../frontend/node_modules/@axe-core/playwright');
const fs=require('node:fs'),path=require('node:path');
const report={version:'M002-UI-05',checks:[],screens:[],axe:[],errors:[],scope:'Deterministic local design only; no backend transactions.'};
(async()=>{
const browser=await chromium.launch();report.browser=browser.version();
const visit=(p,route,extra='')=>p.goto('http://127.0.0.1:4174/prototype/?page='+route+'&lang=zh&role=learner'+extra,{waitUntil:'networkidle'});
const click=(p,a)=>p.locator('[data-action="'+a+'"]:visible').first().click();
const selectDemo=async(p,key,val)=>{if(!await p.locator('#demo-'+key).isVisible())await p.locator('#demo summary').click();await p.selectOption('#demo-'+key,val);};
const account=(p,route)=>p.locator('.account-nav [data-go="'+route+'"]').click();
const points=p=>p.locator('.growth-banner .stats strong').first();
async function test(name,fn){const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});try{await fn(p);expect(errors).toEqual([]);report.checks.push({name,status:'PASS'});}catch(e){report.checks.push({name,status:'FAIL',error:e.message});await p.screenshot({path:path.join(__dirname,'UI05-growth-fail-'+report.checks.length+'.png'),fullPage:true});}await ctx.close();}
await test('GROW-01 latest configured per-level manual rewards grant points and card together, once',async p=>{
 await visit(p,'growth');await expect(p.locator('.growth-banner')).toContainText('260 / 300');await expect(p.locator('.achievement-group')).toHaveCount(4);await click(p,'growth-level:2');await expect(points(p)).toHaveText('340');await expect(p.locator('[data-action="growth-level:2"]')).toBeDisabled();await account(p,'bag');await expect(p.locator('.item')).toHaveCount(5);
 await account(p,'growth');await click(p,'growth-claim:0');await expect(points(p)).toHaveText('355');await account(p,'bag');await expect(p.locator('.item')).toHaveCount(6);
});
await test('GROW-02 blocked, disabled and downgraded reward states preserve facts and cannot pay',async p=>{
 for(const state of ['blocked','disabled','demoted']){await visit(p,'growth','&state='+state);await expect(p.locator('[data-action="growth-level:2"]')).toBeDisabled();await expect(points(p)).toHaveText('320');}
 await visit(p,'growth','&state=claim-error');await click(p,'growth-level:2');await expect(points(p)).toHaveText('320');await expect(p.locator('[data-action="growth-level:2"]')).toBeEnabled();await expect(p.locator('#toast')).toContainText('领取失败');
});
await test('GROW-03 make-up updates calendar and card, adds points without XP and cannot repeat',async p=>{
 await visit(p,'growth');await click(p,'makeup');await click(p,'makeup-day:14');await click(p,'makeup-confirm');await expect(p.locator('[data-day="14"]')).toContainText('✓');await expect(points(p)).toHaveText('326');await expect(p.locator('.growth-banner')).toContainText('260 / 300');await account(p,'bag');await expect(p.locator('.item').first()).toContainText('已使用');await expect(p.locator('.item').first().locator('button')).toBeDisabled();
});
await test('CARD-01 per-model extension preserves overlap and repeated card adds its full duration',async p=>{
 await visit(p,'bag');await click(p,'use:2');await expect(p.locator('#dialog')).toContainText('2026-09-20 12:00');await expect(p.locator('#dialog')).toContainText('2026-09-23 12:00');await click(p,'benefit-confirm:2');await account(p,'shop');await click(p,'redeem:2');await click(p,'redeem-confirm:2');await account(p,'bag');await click(p,'use:4');await expect(p.locator('#dialog')).toContainText('2026-09-23 12:00');await expect(p.locator('#dialog')).toContainText('2026-09-26 12:00');await click(p,'benefit-confirm:4');await expect(p.locator('.item').last()).toContainText('2026-09-26');
});
await test('CARD-02 same-plan renewal, full plan coverage and separate quota visibility',async p=>{
 await visit(p,'bag');await click(p,'use:3');await expect(p.locator('#dialog')).not.toContainText('剩余时间作废');await click(p,'benefit-confirm:3');await expect(p.locator('.item').nth(2)).toContainText('当前计划已满足该模型卡提供的所有模型');await expect(p.locator('[data-action="use:2"]')).toBeDisabled();await account(p,'shop');await click(p,'redeem:3');await click(p,'redeem-confirm:3');await account(p,'bag');await click(p,'use:4');await expect(p.locator('#dialog')).toContainText('不重置');await expect(p.locator('#dialog')).toContainText('2026-10-01');await click(p,'benefit-confirm:4');await p.click('.nav [data-go="create"]');await expect(p.locator('.quota-detail')).toContainText('计划剩余 20 次 · 额外 0 次');await expect(p.locator('#length option')).toHaveCount(5);
});
await test('CARD-03 issued effects stay fixed, latest retirement points apply, refund is once-only',async p=>{
 await visit(p,'operations');await click(p,'item-edit:2');await p.fill('#item-duration','99');await p.fill('#item-refund','55');await click(p,'item-save');await selectDemo(p,'page','bag');await click(p,'use:2');await expect(p.locator('#dialog')).toContainText('增加 3 天');await click(p,'close');await selectDemo(p,'state','retired');await click(p,'refund:2');await expect(p.locator('#dialog')).toContainText('55 积分');await click(p,'refund-confirm:2');await expect(p.locator('[data-action="refund:2"]')).toHaveCount(0);await expect(p.locator('.page-head')).toContainText('375 积分');
});
await test('CARD-04 extra uses preserve plan allowance and cancellation is counted',async p=>{
 await visit(p,'bag');await click(p,'use:1');await click(p,'benefit-confirm:1');await p.click('.nav [data-go="create"]');await expect(p.locator('.quota-detail')).toContainText('计划剩余 5 次 · 额外 3 次');await p.selectOption('#model','Model A');await p.selectOption('#explain','chinese');await click(p,'generate');await click(p,'cancelgen');await expect(p.locator('.quota-detail')).toContainText('计划剩余 4 次 · 额外 3 次');await p.click('.nav [data-go="library"]');const data=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('ww-m002-learning-ui05')));expect(data.generated).toBe(13);
});
await test('FLOW-01 interrupted submission checks status without a second settlement',async p=>{
 await visit(p,'overview','&state=response-lost');await click(p,'learn-submit');await expect(p.locator('#submit')).toHaveText('确认提交状态');let d=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('ww-m002-learning-ui05')));expect(Object.values(d.sessions)[0].attempts).toHaveLength(1);await click(p,'learn-submit');await expect(p.locator('s.bad').first()).toBeVisible();d=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('ww-m002-learning-ui05')));expect(Object.values(d.sessions)[0].attempts).toHaveLength(1);
});
const ctx=await browser.newContext({reducedMotion:'reduce'}),p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
for(const width of [320,390,768,1440,1600])for(const lang of ['zh','en'])for(const route of ['home','explore','growth','bag','shop','notices','trial','profile']){
 await p.setViewportSize({width,height:1000});await p.goto('http://127.0.0.1:4174/prototype/?page='+route+'&lang='+lang+'&role=learner');await expect(p.locator('h1')).toBeVisible();const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);report.screens.push({route,width,lang,overflow});
 if(lang==='zh'&&[390,1440].includes(width))await p.screenshot({path:path.join(__dirname,`UI05-${route}-${width}.png`),fullPage:true,animations:'disabled'});
 if(width===1440&&lang==='zh'){const r=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa']).analyze();report.axe.push({route,violations:r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))});}
 if(width===1600){const w=await p.locator('main').evaluate(el=>el.getBoundingClientRect().width);if(w>1440)report.errors.push('Container exceeds1440 '+route);}
}
await ctx.close();await browser.close();report.status=report.checks.every(x=>x.status==='PASS')&&!report.errors.length&&report.screens.every(x=>!x.overflow)&&report.axe.every(x=>!x.violations.length)?'PASS':'FAIL';fs.writeFileSync(path.join(__dirname,'UI05-growth-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,screens:report.screens.length,overflow:report.screens.filter(x=>x.overflow),axe:report.axe,errors:report.errors}));if(report.status!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
