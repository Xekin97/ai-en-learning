import{createRequire}from'node:module';import fs from'node:fs';import{createHash}from'node:crypto';
const R='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning',D=R+'/.planning/milestones/M002/design',require=createRequire(R+'/frontend/package.json'),{chromium}=require('@playwright/test'),browser=await chromium.launch({headless:true});const checks=[],errors=[];
const check=(name,pass,details)=>checks.push({name,pass,details});
for(const route of ['create','presets']){
 const p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:4186/prototype/?page=${route}&lang=zh&v=M002-UI-26`);const id=route==='create'?'create-words':'preset-words',r=p.locator('#'+id),input=r.locator('[data-word-query]');await input.waitFor();
 while(await r.locator('[data-picker-remove]').count())await r.locator('[data-picker-remove]').first().click();
 check(route+' empty state and input focus',await r.locator('.word-picker-empty').isVisible()&&await input.evaluate(el=>el===document.activeElement));
 await input.fill('bloom');await r.locator('[role=option]').click();
 check(route+' click adds and keeps focus',await r.locator('.word-token > span').innerText()==='bloom'&&await input.inputValue()===''&&await input.evaluate(el=>el===document.activeElement));
 await input.fill('bloom');await r.locator('[role=option]').click();check(route+' duplicate click blocked',await r.locator('.word-token').count()===1);
 await r.locator('[data-picker-clear]').click();check(route+' clear affects only search',await input.inputValue()===''&&await r.locator('.word-token').count()===1&&await input.getAttribute('aria-expanded')==='false'&&await input.evaluate(el=>el===document.activeElement));
 await input.fill('o');await input.press('Tab');check(route+' Tab closes without adding',await input.getAttribute('aria-expanded')==='false'&&await r.locator('.word-token').count()===1);
 await input.fill('o');await p.locator('h1').click();check(route+' outside click closes without adding',await input.getAttribute('aria-expanded')==='false'&&await input.inputValue()==='o'&&await r.locator('.word-token').count()===1);
 await input.focus();await input.press('ArrowUp');const active=await input.getAttribute('aria-activedescendant');check(route+' ArrowUp activates available option',!!active&&await p.locator('#'+active).getAttribute('aria-disabled')==='false');
 const box=await input.boundingBox();check(route+' search stays visible when popup opens',box.y>=0&&box.y+box.height<=844,{box});
 await p.close();
}
const p=await browser.newPage();await p.goto('http://127.0.0.1:4186/prototype/?page=create&lang=zh&role=guest&v=M002-UI-26');await p.waitForSelector('#create-words');check('Guest applies existing three word cap',await p.locator('#create-words .word-picker-count').innerText()==='已选 3 / 3 个词'&&await p.locator('[data-picker-random]').isDisabled());await p.close();
check('No browser errors',errors.length===0,errors);await browser.close();
const source_sha256=Object.fromEntries(['prototype/word-picker.js','prototype/app.js','prototype/presets.js','theme.css','copy.json'].map(n=>[n,createHash('sha256').update(fs.readFileSync(D+'/'+n)).digest('hex')]));
const result={version:'M002-UI-26',status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,errors,source_sha256,screenshots:0};fs.writeFileSync(D+'/evidence/ui26/interaction-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,failures:checks.filter(c=>!c.pass)},null,2));
