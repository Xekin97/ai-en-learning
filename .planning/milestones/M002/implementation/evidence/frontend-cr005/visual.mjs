import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');
const source = JSON.parse(readFileSync('../.planning/milestones/M002/design/copy.json','utf8'));
const t = (key) => source.static['en.'+key] ?? source.templates['en.'+key];
const out = (name) => new URL(name, import.meta.url).pathname;
const browser = await chromium.launch();
const results=[];
try {
 const proto = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await proto.goto('http://127.0.0.1:4186/prototype/?page=review&lang=en');
 await proto.waitForTimeout(600);
 await proto.screenshot({path:out('prototype-review-stable.png'),fullPage:true});
 await proto.close();
 for (const width of [1440,320]) {
  const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.request.post('http://127.0.0.1:38080/api/v1/__test/review-reset');
  await context.addCookies([{name:'wordweave_session',value:'learner',url:'http://127.0.0.1:3334'}]);
  await context.addInitScript(() => { const open=IDBFactory.prototype.open; IDBFactory.prototype.open=function(...args){if(args[0]==='wordweave-review-drafts')throw new DOMException('Denied','SecurityError');return open.apply(this,args);}; });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3334/library/batch-e2e');
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await page.getByRole('button',{name:t('l.single'),exact:true}).click();
  await page.locator('.slot').first().waitFor();
  await page.locator('.slot').first().fill('x');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.slot').count(),5);
  const warning=await page.getByRole('alert').filter({hasText:t('failed')}).innerText();
  const regions=await page.locator('.review-paper h2,.review-paper .slot,.review-paper .hint').evaluateAll(els=>els.map(el=>({text:el.textContent.trim(),top:el.getBoundingClientRect().top,kind:el.className||el.tagName})));
  assert.ok(regions[0].top<regions[1].top);
  assert.ok(regions[1].top<regions[6].top && regions[6].top<regions[7].top);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false);assert.deepEqual(errors,[]);
  await page.screenshot({path:out('memory-editing-'+width+'.png'),fullPage:true});
  results.push({width,slots:5,warning,input:await page.locator('.slot').first().inputValue(),regions,overflow,pageerrors:errors});
  await context.close();
 }
 writeFileSync(out('visual.json'),JSON.stringify({design:'UI22/H01',productionOrigin:'http://127.0.0.1:3334',results},null,2));
}finally{await browser.close();}
