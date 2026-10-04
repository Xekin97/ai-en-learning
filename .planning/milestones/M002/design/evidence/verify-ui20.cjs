const {chromium,expect}=require('../../../../../frontend/node_modules/@playwright/test');
const {default:AxeBuilder}=require('../../../../../frontend/node_modules/@axe-core/playwright');
const fs=require('node:fs'),path=require('node:path');
const out={version:'M002-UI-20',scope:'Welcome: ten-second lifetime and larger elapsed days, bilingual short/mobile and desktop layout; ordinary feedback remains five seconds.',checks:[],layouts:[]};
const base='http://127.0.0.1:4174/prototype/';
const visit=async(p,q={})=>{await p.goto(base+'?'+new URLSearchParams({page:'login',role:'guest',lang:'zh',v:out.version,...q}));await p.locator('#main').waitFor()};
const login=async(p,lang='zh')=>{await visit(p,{lang});await p.fill('#auth-username','learner');await p.fill('#auth-password','prototype-example');await p.locator('[data-action="identity-submit"]').click();await p.locator('#toast.visible').waitFor();const start=Date.now();await p.locator('#dialog[open]').waitFor();return start};
(async()=>{const b=await chromium.launch();out.browser=b.version();
async function check(name,fn){const c=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});try{await fn(p);expect(errors).toEqual([]);out.checks.push({name,status:'PASS'})}catch(e){out.checks.push({name,status:'FAIL',error:e.message,errors});await p.screenshot({path:path.join(__dirname,'UI20-failure-'+out.checks.length+'.png')})}await c.close();console.log(name,out.checks.at(-1).status)}
await check('Five-day example has larger complete day label; ten seconds survive notice pagination and closure',async p=>{
 // Test-only fixture variation; production prototype data stays unchanged.
 await p.route('**/fixtures.json?*',async route=>{const response=await route.fetch(),f=await response.json();f.user.lastLearn='2026-09-12 16:24';await route.fulfill({response,json:f})});
 for(const [width,height] of [[320,568],[1440,900]])for(const lang of ['zh','en']){
  await p.setViewportSize({width,height});await login(p,lang);
  await expect(p.locator('#toast')).toHaveText(lang==='zh'?'欢迎回来，小涟，距离上一次学习已经过去了 5 天':'Welcome back, 小涟. It has been 5 learning days since your last session.');
  await expect(p.locator('#toast strong')).toHaveText(lang==='zh'?'5 天':'5 learning days');
  const typography=await p.locator('#toast strong').evaluate(e=>({days:parseFloat(getComputedStyle(e).fontSize),body:parseFloat(getComputedStyle(e.parentElement).fontSize),weight:getComputedStyle(e).fontWeight}));expect(typography.days).toBeGreaterThan(typography.body);expect(Number(typography.weight)).toBeGreaterThanOrEqual(700);
  const a=await p.locator('#toast').boundingBox(),d=await p.locator('#dialog').boundingBox();expect(a.x).toBeGreaterThanOrEqual(0);expect(a.x+a.width).toBeLessThanOrEqual(width);expect(a.y+a.height).toBeLessThanOrEqual(height);expect(a.y).toBeGreaterThanOrEqual(d.y+d.height+8);
  expect(await p.locator('#toast').evaluate(e=>e.matches(':popover-open')&&e.parentElement.id==='dialog')).toBe(true);await expect(p.locator('.dialog-close')).toBeFocused();out.layouts.push({width,height,lang,typography,toast:a,dialog:d});
  await p.screenshot({path:path.join(__dirname,`UI20-welcome-${width}-${lang}.png`)});
 }
 const axe=await new AxeBuilder({page:p}).analyze();out.axeViolations=axe.violations;expect(axe.violations).toEqual([]);
 const start=await login(p);await p.locator('#dialog').getByRole('button',{name:'下一步',exact:true}).click();await p.waitForTimeout(Math.max(0,6000-(Date.now()-start)));await expect(p.locator('#toast')).toBeVisible();await p.keyboard.press('Escape');await expect(p.locator('#dialog')).not.toBeVisible();await expect(p.locator('#toast')).toBeVisible();await expect(p.locator('#toast strong')).toHaveText('5 天');await expect(p.locator('#toast')).toBeHidden({timeout:5000});out.lifetime_ms=Date.now()-start;expect(out.lifetime_ms).toBeGreaterThanOrEqual(9700);expect(out.lifetime_ms).toBeLessThan(11000);
});
await check('Ordinary save feedback stays plain and expires after five seconds',async p=>{
 await visit(p,{page:'profile',role:'learner'});await p.fill('#nickname','小树');await p.locator('[data-action="profile-save"]').click();await p.locator('#toast.visible').waitFor();const start=Date.now();await expect(p.locator('#toast')).toContainText('保存');await expect(p.locator('#toast strong')).toHaveCount(0);await expect(p.locator('#toast')).toBeHidden({timeout:6000});out.save_lifetime_ms=Date.now()-start;expect(out.save_lifetime_ms).toBeGreaterThan(4700);expect(out.save_lifetime_ms).toBeLessThan(6000);
});
await b.close();out.status=out.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';fs.writeFileSync(path.join(__dirname,'UI20-browser-results.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));process.exitCode=out.status==='PASS'?0:1})().catch(e=>{console.error(e);process.exit(1)});
