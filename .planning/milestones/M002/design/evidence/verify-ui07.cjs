const {chromium,expect}=require('../../../../../frontend/node_modules/@playwright/test');
const {default:AxeBuilder}=require('../../../../../frontend/node_modules/@axe-core/playwright');
const fs=require('node:fs'),path=require('node:path');
const F=JSON.parse(fs.readFileSync(path.join(__dirname,'../prototype/fixtures.json')));
const out={version:'M002-UI-07',scope:'Local design prototype only; no real AI, APIs or authorization',checks:[],responsive:[],axe:[],errors:[]};
const url=(query)=>'http://127.0.0.1:4174/prototype/?'+query+'&v=M002-UI-07';
(async()=>{const b=await chromium.launch();out.browser=b.version();let p;
async function check(name,fn){try{await fn();out.checks.push({name,status:'PASS'});}catch(e){out.checks.push({name,status:'FAIL',error:e.message});if(p)await p.screenshot({path:path.join(__dirname,'UI07-failure-'+out.checks.length+'.png'),fullPage:true});}}
const c=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});p=await c.newPage();p.on('pageerror',e=>out.errors.push(e.message));
const go=async(query)=>{await p.goto(url(query));await p.locator('main h1,main h2').first().waitFor();};
const demo=async(value)=>{if(!await p.locator('#demo details').evaluate(e=>e.open))await p.locator('#demo summary').click();await p.selectOption('#demo-page',value);};
await check('UIA-PAGE-217-03 / 05: full published stories and all settings; correct selected locked workspace; no generation on entry',async()=>{
 await go('page=create&role=guest&lang=zh');const originalQuota=await p.locator('.quota-detail').textContent();await p.locator('[data-go="explore"]').first().click();await expect(p.locator('.gallery-card')).toHaveCount(2);
 for(let i=0;i<2;i++){
 const card=p.locator('.gallery-card').nth(i);await expect(card.locator('h2')).toHaveText(F.presets[i].title);
 expect(await card.locator('.gallery-passage p').allTextContents()).toEqual(F.presets[i].sampleText.split('\n\n'));
 expect(await card.locator('.chip').allTextContents()).toEqual(F.presets[i].words);
 await expect(card.locator('dd')).toHaveText([F.presets[i].model,'故事','简短','中文']);
 }
 await p.locator('[data-gallery="next"]').click();await expect(p.locator('.gallery-position')).toHaveText('2 / 2');
 await p.locator('[data-action="try:1"]').click();await expect(p.locator('.preset-context h2')).toHaveText(F.presets[1].title);
 await expect(p.locator('.settings dd')).toHaveText(['Model B','Story','Brief','中文']);await expect(p.locator('#generate')).toBeEnabled();
 await expect(p.locator('[data-region="generation-result"] .article')).toHaveCount(0);await expect(p.locator('.quota-detail')).toHaveText(originalQuota);await expect(p.locator('#model')).toHaveCount(0);
 await p.locator('[data-go="explore"]').first().click();await p.locator('[data-action="language"]').click();await expect(p.locator('.gallery-card h2').first()).toHaveText(F.presets[0].title);
 await expect(p.locator('.gallery-card').first().locator('dd')).toHaveText(['Model A','Story','Brief','Chinese']);
});
await check('UIA-PAGE-217-04: keyboard, reduced motion, empty and single preset',async()=>{
 await go('page=explore&role=guest&lang=zh');await expect(p.locator('[data-gallery="play"]')).toBeDisabled();
 await p.locator('.gallery-track').focus();await p.keyboard.press('End');await expect(p.locator('.gallery-position')).toHaveText('2 / 2');await p.keyboard.press('Home');await expect(p.locator('.gallery-position')).toHaveText('1 / 2');
 await go('page=explore&lang=zh&state=empty');await expect(p.locator('.gallery-track')).toHaveCount(0);await expect(p.locator('main [data-go="create"]')).toBeVisible();
 await go('page=explore&lang=zh&state=single');await expect(p.locator('.gallery-card')).toHaveCount(1);await expect(p.locator('[data-gallery="next"]')).toBeDisabled();
});
await check('UIA-PAGE-217-03 / 04: responsive complete content and axe',async()=>{
 for(const width of [320,390,768,1440])for(const lang of ['zh','en']){
 await p.setViewportSize({width,height:1000});await go('page=explore&role=guest&lang='+lang);
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const card=p.locator('.gallery-card').first();expect(await card.locator('.gallery-passage p').count()).toBe(3);
 expect(await card.locator('.gallery-passage').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
 if(lang==='zh'&&[390,1440].includes(width))await p.screenshot({path:path.join(__dirname,`UI07-explore-${width}.png`),fullPage:true});
 if(lang==='en'&&width===390)await p.screenshot({path:path.join(__dirname,'UI07-explore-390-en.png'),fullPage:true});
 out.responsive.push({width,lang,status:'PASS'});
 }
 for(const width of [390,1440]){await p.setViewportSize({width,height:1000});await go('page=explore&role=guest&lang=zh');const axe=await new AxeBuilder({page:p}).analyze();out.axe.push({width,violations:axe.violations});expect(axe.violations).toEqual([]);}
});
await check('UIA-PAGE-217-05: administrator draft/preview isolated; publish switches full sample and configuration together',async()=>{
 await go('page=presets&lang=zh');await p.fill('#preset-title','新的完整预设');await p.selectOption('#preset-model','Model B');await p.selectOption('#preset-style','News');await p.selectOption('#preset-length','Standard');await p.selectOption('#preset-language','English');await p.locator('[data-action="preset-save"]').click();
 await demo('explore');await expect(p.locator('.gallery-card h2').first()).toHaveText(F.presets[0].title);await expect(p.locator('.gallery-card').first().locator('dd')).toHaveText(['Model A','故事','简短','中文']);
 await demo('presets');await p.locator('[data-action="preset-preview"]').click();await expect(p.locator('[data-action="preset-publish"]')).toBeEnabled();
 await p.locator('[data-action="preset-publish"]').click();await demo('explore');await expect(p.locator('.gallery-card h2').first()).toHaveText('新的完整预设');await expect(p.locator('.gallery-card').first().locator('dd')).toHaveText(['Model B','新闻','标准','英语']);
 expect(await p.locator('.gallery-passage').first().locator('p').allTextContents()).toEqual(F.presets[0].sampleText.split('\n\n'));
 await p.locator('[data-action="try:0"]').click();await expect(p.locator('.settings dd')).toHaveText(['Model B','News','Standard','English']);
});
await check('UIA-PAGE-006-02 retained: private title save remains functional',async()=>{
 await go('page=batch&batch=b1&role=learner&lang=zh');await p.locator('[data-action="learn-title-edit"]').click();await p.fill('#batch-title','试用目录修改后的回归');await p.locator('[data-action="learn-title-save"]').click();await expect(p.locator('#saved-batch-title')).toHaveText('试用目录修改后的回归');
});
await c.close();
const auto=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});p=await auto.newPage();p.on('pageerror',e=>out.errors.push(e.message));
await check('UIA-PAGE-217-04: actual timed automatic movement, wrap, hover and focus pause, explicit resume and leave cleanup',async()=>{
 await go('page=explore&role=guest&lang=zh');await p.mouse.move(2,2);await expect(p.locator('.gallery-position')).toHaveText('1 / 2');
 await expect(p.locator('.gallery-position')).toHaveText('2 / 2',{timeout:11000});expect(await p.locator('.gallery-track').evaluate(e=>e.scrollLeft)).toBeGreaterThan(500);
 await expect(p.locator('.gallery-position')).toHaveText('1 / 2',{timeout:11000});
 await p.locator('.gallery-card').first().hover();await p.waitForTimeout(8300);await expect(p.locator('.gallery-position')).toHaveText('1 / 2');
 await p.mouse.move(2,2);await p.locator('.gallery-track').focus();await expect(p.locator('[data-gallery="play"]')).toHaveText('继续轮播');await p.waitForTimeout(8300);await expect(p.locator('.gallery-position')).toHaveText('1 / 2');
 await p.locator('[data-gallery="play"]').click();await p.mouse.move(2,2);await expect(p.locator('.gallery-position')).toHaveText('2 / 2',{timeout:11000});
 await p.locator('[data-go="home"]').first().click();await p.waitForTimeout(8300);await expect(p.locator('.gallery-track')).toHaveCount(0);expect(out.errors).toEqual([]);
});
await auto.close();await b.close();out.status=out.checks.every(x=>x.status==='PASS')&&out.errors.length===0?'PASS':'FAIL';fs.writeFileSync(path.join(__dirname,'UI07-browser-results.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));process.exitCode=out.status==='PASS'?0:1;
})().catch(e=>{console.error(e);process.exit(1)});
