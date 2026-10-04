const {chromium,expect}=require('../../../../../frontend/node_modules/@playwright/test');
const {default:AxeBuilder}=require('../../../../../frontend/node_modules/@axe-core/playwright');
const fs=require('node:fs'),path=require('node:path');
const report={version:'M002-UI-06',scope:'Local prototype only; synthetic content and sessionStorage, no real API or authorization verification.',checks:[],screens:[],axe:[],routes:[]};
const root=__dirname,base='http://127.0.0.1:4174/prototype/',key='ww-m002-learning-ui06';
const visit=(p,route,query='')=>p.goto(base+'?page='+route+'&lang=zh&v=M002-UI-06'+query,{waitUntil:'networkidle'});
const click=(p,a)=>p.locator('[data-action="'+a+'"]:visible').first().click();
const demo=async(p,id,value)=>{if(!await p.locator('#demo details').evaluate(e=>e.open))await p.click('#demo summary');await p.selectOption(id,value);};
const saved=p=>p.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),key);
async function shot(p,name){const file='UI06-'+name+'.png';await p.screenshot({path:path.join(root,file),fullPage:true});report.screens.push(file);}
(async()=>{
 const browser=await chromium.launch();report.browser=browser.version();
 async function test(name,fn){const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});try{await fn(p);expect(errors).toEqual([]);report.checks.push({name,status:'PASS'});}catch(e){report.checks.push({name,status:'FAIL',error:e.message});await shot(p,'failure-'+report.checks.length);}await ctx.close();}
 await test('UIA-PAGE-006-02: default, cancel, blank, save, focus, language, reload and data isolation',async p=>{
  await visit(p,'batch','&batch=b1&role=learner');await expect(p.locator('#saved-batch-title')).toHaveText('resilient · wander · weave');
  const story=await p.locator('.story-text').innerText(),resources=await p.locator('.resource-grid').innerText();
  await shot(p,'batch-1440');await click(p,'learn-title-edit');await expect(p.locator('#batch-title')).toBeFocused();
  await p.fill('#batch-title','临时标题');await click(p,'learn-title-cancel');await expect(p.locator('#saved-batch-title')).toHaveText('resilient · wander · weave');await expect(p.locator('[data-action="learn-title-edit"]')).toBeFocused();
  await click(p,'learn-title-edit');await p.fill('#batch-title','   ');await p.locator('#batch-title').press('Enter');await expect(p.locator('#batch-title-error')).toHaveText('请输入标题，不能只包含空格。');await expect(p.locator('#batch-title')).toHaveAttribute('aria-invalid','true');
  await shot(p,'title-error-1440');await p.fill('#batch-title','  小城里的新发现  ');await p.locator('#batch-title').press('Enter');await expect(p.locator('#batch-title-form')).toHaveAttribute('aria-busy','true');await expect(p.locator('[data-action="learn-title-save"]')).toBeDisabled();
  await expect(p.locator('#saved-batch-title')).toHaveText('小城里的新发现');await expect(p.locator('[data-action="learn-title-edit"]')).toBeFocused();
  expect(await p.locator('.story-text').innerText()).toBe(story);expect(await p.locator('.resource-grid').innerText()).toBe(resources);
  const data=await saved(p);expect(data.generated).toBe(12);expect(data.collected).toBe(12);expect(data.batches[1].title).toBe('gentle · bloom');expect(data.batches[0].savedAt).toBe('2026-09-12 09:30');
  await click(p,'language');await expect(p.locator('#saved-batch-title')).toHaveText('小城里的新发现');await p.reload();await expect(p.locator('#saved-batch-title')).toHaveText('小城里的新发现');
 });
 await test('UIA-PAGE-005-02: new title, original target-only search, order and six statistics',async p=>{
  await visit(p,'batch','&batch=b1&role=learner');await click(p,'learn-title-edit');await p.fill('#batch-title','My morning notes');await click(p,'learn-title-save');await expect(p.locator('#saved-batch-title')).toHaveText('My morning notes');
  await p.click('[data-go="library"]');await expect(p.locator('.library-row').first()).toHaveAttribute('data-batch','b1');await expect(p.locator('.library-row').first().locator('h2')).toHaveText('My morning notes');await expect(p.locator('.batch-targets').first()).toContainText('resilient · wander · weave');await expect(p.locator('.library-stats > div')).toHaveCount(6);
  await p.fill('#library-query','morning');await click(p,'learn-search');await expect(p.locator('.library-row')).toHaveCount(0);
  await p.fill('#library-query','wander');await click(p,'learn-search');await expect(p.locator('.library-row')).toHaveCount(1);await click(p,'learn-open:b1');await click(p,'learn-title-edit');await p.fill('#batch-title','Changed again');await click(p,'learn-title-save');await expect(p.locator('#saved-batch-title')).toHaveText('Changed again');await p.click('[data-go="library"]');await expect(p.locator('#library-query')).toHaveValue('wander');await expect(p.locator('.library-row h2')).toHaveText('Changed again');await shot(p,'library-1440');
 });
 await test('UIA-PAGE-006-03: failed save, retry, paused batch, plain text and denied save',async p=>{
  await visit(p,'batch','&batch=b3&state=save-error&role=learner');await expect(p.locator('[data-participation="b3"]')).not.toBeChecked();await click(p,'learn-title-edit');await p.fill('#batch-title','<img src=x onerror=alert(1)>');await click(p,'learn-title-save');await expect(p.locator('#batch-title-error')).toContainText('标题未保存');await expect(p.locator('#batch-title')).toHaveValue('<img src=x onerror=alert(1)>');
  await demo(p,'#demo-state','normal');await click(p,'learn-title-save');await expect(p.locator('#saved-batch-title')).toHaveText('<img src=x onerror=alert(1)>');await expect(p.locator('#saved-batch-title img')).toHaveCount(0);
  await demo(p,'#demo-state','title-denied');await click(p,'learn-title-edit');await p.fill('#batch-title','Not authorized');await click(p,'learn-title-save');await expect(p.locator('#batch-title-error')).toContainText('重新登录');expect((await saved(p)).batches.find(x=>x.id==='b3').title).toBe('<img src=x onerror=alert(1)>');
  await visit(p,'batch','&role=guest&batch=b1');await expect(p.locator('#batch-title')).toHaveCount(0);await expect(p.locator('#identity-form')).toBeVisible();
 });
 await test('UIA-PAGE-103-02: same learner title in admin list/reader; other user independent',async p=>{
  await visit(p,'batch','&batch=b1&role=learner');await click(p,'learn-title-edit');await p.fill('#batch-title','我保留的第一篇');await click(p,'learn-title-save');await expect(p.locator('#saved-batch-title')).toHaveText('我保留的第一篇');
  await demo(p,'#demo-page','userdetail');await click(p,'adm-user-tab:learning');await expect(p.locator('.admin-library-row h3').first()).toHaveText('我保留的第一篇');await expect(p.locator('[data-action="learn-title-edit"]')).toHaveCount(0);await click(p,'adm-reader:0');await expect(p.locator('#dialog h3').first()).toHaveText('我保留的第一篇');await expect(p.locator('#dialog input')).toHaveCount(0);await click(p,'close');await shot(p,'admin-reader-1440');await demo(p,'#demo-page','users');await p.fill('#admin-user-query','reader');await click(p,'adm-search');await click(p,'adm-user:u2');await click(p,'adm-user-tab:learning');await expect(p.locator('.admin-library-row h3').first()).toHaveText('resilient · wander · weave');
 });
 await test('UIA-PAGE-212-02 / PAGE-217-02 / PAGE-216-02: one title, no descriptions, draft vs published, no preview for title-only edit',async p=>{
  await visit(p,'presets');await expect(p.locator('#preset-title')).toHaveValue('在小城，遇见新的自己');await expect(p.locator('#preset-zh,#preset-en,#preset-desc-zh,#preset-desc-en')).toHaveCount(0);await expect(p.locator('.article .story-text')).toContainText('Mia');const preview=await p.locator('.article .story-text').innerText();
  await p.fill('#preset-title','一次散步，一个故事');await click(p,'preset-save');await expect(p.locator('.article h3')).toHaveText('一次散步，一个故事');
  await demo(p,'#demo-page','explore');await expect(p.locator('.preset-card h2').first()).toHaveText('在小城，遇见新的自己');await expect(p.locator('#presets')).not.toContainText('日常与成长');await expect(p.locator('#presets')).not.toContainText('城市日常');
  await demo(p,'#demo-page','presets');await click(p,'preset-publish');await expect(p.locator('.admin-record.selected')).toContainText('已发布');expect(await p.locator('.article .story-text').innerText()).toBe(preview);
  await shot(p,'presets-1440');await demo(p,'#demo-page','explore');await expect(p.locator('.preset-card h2').first()).toHaveText('一次散步，一个故事');await click(p,'language');await expect(p.locator('.preset-card h2').first()).toHaveText('一次散步，一个故事');await shot(p,'explore-1440');await click(p,'try:0');await expect(p.locator('.preset-context h2')).toHaveText('一次散步，一个故事');await expect(p.locator('#generate')).toBeEnabled();await expect(p.locator('[data-region="generation-result"]')).not.toContainText('Mia');await shot(p,'trial-1440');
 });
 await test('UIA-PAGE-212-03: blank title refused, new preset needs preview, parameter changes invalidate preview',async p=>{
  await visit(p,'presets');await p.fill('#preset-title','  ');await click(p,'preset-save');await expect(p.locator('#admin-error')).toContainText('请填写标题');await p.fill('#preset-title','只改标题');await click(p,'preset-save');await expect(p.locator('[data-action="preset-publish"]')).toBeEnabled();await p.selectOption('#preset-style','News');await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();await click(p,'new-preset');await expect(p.locator('#preset-title')).toHaveValue('');await expect(p.locator('[data-action="preset-publish"]')).toBeDisabled();
 });
 await test('UIA-PAGE-216-03: preset generation and collection retain word default; review does not expose edited title',async p=>{
  await visit(p,'trial','&role=learner');await click(p,'generate');await expect(p.locator('[data-action="collect"]')).toBeVisible({timeout:12000});await click(p,'collect');await expect(p.locator('#saved-batch-title')).toHaveText('resilient · wander · weave');await click(p,'learn-title-edit');await p.fill('#batch-title','答案 resilient wander weave');await click(p,'learn-title-save');await expect(p.locator('#saved-batch-title')).toHaveText('答案 resilient wander weave');await p.locator('[data-action^="learn-single:"]').first().click();await expect(p.locator('#main')).not.toContainText('答案 resilient wander weave');await expect(p.locator('.slot').first()).toBeVisible();
 });
 await test('UIA-PAGE-006-04: mobile/desktop long titles, keyboard editing, reduced motion and axe',async p=>{
  const sample='很长的标题A'.repeat(24);
  await visit(p,'batch','&batch=b1&role=learner');await click(p,'learn-title-edit');await p.fill('#batch-title',sample);await click(p,'learn-title-save');await expect(p.locator('#saved-batch-title')).toHaveText(sample);
  for(const width of [360,390,768,1440]){await p.setViewportSize({width,height:900});expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
  await p.setViewportSize({width:390,height:900});await shot(p,'long-title-390');await click(p,'learn-title-edit');await p.fill('#batch-title','沿着小路，重新出发');await shot(p,'title-edit-390');await click(p,'learn-title-cancel');
  for(const route of ['batch','presets','explore','trial']){await visit(p,route,'&role=learner');if(route==='batch')await click(p,'learn-title-edit');expect(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await shot(p,route+'-390');const a=await new AxeBuilder({page:p}).analyze();report.axe.push({route,width:390,violations:a.violations.map(x=>({id:x.id,impact:x.impact}))});expect(a.violations).toEqual([]);}
 });
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 for(const route of ['home','login','register','create','library','batch','range','review','overview','sessiondone','profile','notices','growth','bag','shop','adminhome','metrics','models','plans','users','userdetail','operations','credits','messages','presets','explore','trial']){await visit(p,route,'&role=learner');await expect(p.locator('#main h1,#main h2').first()).toBeVisible();report.routes.push({route,status:'PASS'});}
 expect(errs).toEqual([]);await ctx.close();await browser.close();
 report.status=report.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';fs.writeFileSync(path.join(root,'UI06-browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,routes:report.routes.length,axe:report.axe.length}));process.exitCode=report.status==='PASS'?0:1;
})().catch(e=>{report.status='FAIL';report.error=e.message;fs.writeFileSync(path.join(root,'UI06-browser-results.json'),JSON.stringify(report,null,2)+'\n');console.error(e);process.exit(1);});
