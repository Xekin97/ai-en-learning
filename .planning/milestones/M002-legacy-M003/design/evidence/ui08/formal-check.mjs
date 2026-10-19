import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
const { chromium } = playwright;
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:4174/M003/design/prototype/';
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const report = {
  version: 'M003-UI-08',
  checked_at: new Date().toISOString(),
  scope: 'formal design delivery gaps only: copy source, 320 long content/touch/reduced motion, keyboard focus, 768 plan and preset layouts',
  reused_evidence: [
    'design/evidence/ui07-r1/M003-UI-07-R1-browser.json',
    'reviews/evidence/ui07-r1-root/actual-click.json'
  ],
  checks: [],
  console_errors: [],
};
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:320,height:844}, reducedMotion:'reduce'});
const page = await context.newPage();
page.on('pageerror', error => report.console_errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });

const record = (name, passed, details={}) => report.checks.push({name,passed,details});
try {
  await page.route('**/stream-v5/basic.json', async route => {
    const response = await route.fetch();
    const body = await response.json();
    for (const frame of body.wire) {
      const item = frame?.data?.item;
      if (item?.kind === 'scene') item.text = '清晨的社区花园里，学习者与邻居一起整理种子、分享工具，并在自然对话中练习今天选定的词汇；这个较长场景用于验证窄屏自然换行。';
      if (item?.kind === 'word_use') {
        item.sense = `${item.sense}；这是用于检查较长义项在窄屏卡片中自然换行且不遮挡正文的补充说明。`;
        item.phrase = `${item.phrase} / community-garden-collaboration-and-shared-learning-practice`;
      }
    }
    await route.fulfill({response, json:body});
  });
  await page.goto(`${base}?view=formal&rev=ui08&page=create&scenario=basic&event=0&status=0&lang=zh`, {waitUntil:'networkidle'});
  const demoHidden = await page.locator('.scenario-bar,.prototype-mark').count() === 0;
  await page.keyboard.press('Tab');
  const skipFocused = await page.evaluate(() => document.activeElement?.classList.contains('skip-link'));
  await page.keyboard.press('Enter');
  const mainFocused = await page.evaluate(() => document.activeElement?.id === 'main');
  record('formal-preview-and-skip-link', demoHidden && skipFocused && mainFocused, {demoHidden,skipFocused,mainFocused});

  const targetAudit = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select')]
    .filter(el => {
      const style=getComputedStyle(el); const r=el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width>0 && r.height>0 && !el.disabled;
    }).map(el => {
      const r=el.getBoundingClientRect();
      const label=el.matches('input[type=checkbox],input[type=radio]') ? el.closest('label') : null;
      const hit=label?.getBoundingClientRect() ?? r;
      return {tag:el.tagName.toLowerCase(),id:el.id||null,width:Math.round(hit.width),height:Math.round(hit.height),text:(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,40)};
    }).filter(x => x.width < 44 || x.height < 44));
  record('mobile-touch-targets', targetAudit.length === 0, {violations:targetAudit});

  await page.locator('[data-action="generate"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.plan-item').length >= 4 && (document.querySelector('.live-draft-text')?.textContent?.length ?? 0) > 20, null, {timeout:5000});
  const draft = await page.evaluate(() => ({
    planCount:document.querySelectorAll('.plan-item').length,
    draftLength:[...document.querySelector('.live-draft-text')?.textContent ?? ''].length,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    longItems:[...document.querySelectorAll('.plan-item')].map(el => ({scroll:el.scrollWidth,client:el.clientWidth})),
    planVisible:!!document.querySelector('#planning-preview'),
    draftVisible:!!document.querySelector('#live-draft'),
    animation:getComputedStyle(document.querySelector('.writing-indicator i')).animationDuration,
  }));
  await page.screenshot({path:path.join(evidenceDir,'01-create-plan-draft-long-320.png'),fullPage:true});
  const longWrapped = draft.longItems.every(x => x.scroll <= x.client + 1);
  record('320-long-plan-and-live-draft', draft.planCount===4 && draft.draftLength>20 && draft.overflow<=1 && longWrapped && draft.planVisible && draft.draftVisible, draft);
  record('reduced-motion', ['0s','0.00001s','0.01ms','1e-05s'].includes(draft.animation), {animationDuration:draft.animation});

  await page.waitForFunction(() => document.querySelector('#final-result') && !document.querySelector('#planning-preview') && !document.querySelector('[data-action="save-story"]')?.disabled, null, {timeout:6000});
  const finalState = await page.evaluate(() => ({
    final:!!document.querySelector('#final-result'),
    plan:!!document.querySelector('#planning-preview'),
    save:!!document.querySelector('[data-action="save-story"]'),
    bodyLength:[...document.querySelector('#final-result .story-text')?.textContent ?? ''].length,
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
  }));
  await page.screenshot({path:path.join(evidenceDir,'02-create-final-long-320.png'),fullPage:true});
  record('320-final-long-reading', finalState.final && !finalState.plan && finalState.save && finalState.bodyLength>100 && finalState.overflow<=1, finalState);

  await page.setViewportSize({width:768,height:1024});
  await page.goto(`${base}?view=formal&rev=ui08&page=plans&plan=pro&limit=99&adminState=preview&lang=en`, {waitUntil:'networkidle'});
  const planPage = await page.evaluate(() => ({
    regions:['plan-tabs','plan-existing-settings','service-settings','content-service','change-preview','plan-actions'].filter(id=>document.getElementById(id)),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    prototypeText:document.body.textContent.includes('Prototype scenarios'),
    artificialConflict:document.body.textContent.includes('Show remote conflict'),
  }));
  await page.screenshot({path:path.join(evidenceDir,'03-plans-preview-768-en.png'),fullPage:true});
  record('768-plan-regions', planPage.regions.length===6 && planPage.overflow<=1 && !planPage.prototypeText && !planPage.artificialConflict, planPage);

  await page.goto(`${base}?view=formal&rev=ui08&page=presets&mode=enhanced&event=0&status=0&lang=zh`, {waitUntil:'networkidle'});
  const presetPage = await page.evaluate(() => ({
    regions:['preset-list','preset-editor','preset-settings','preview-mode','preview-result','preset-actions'].filter(id=>document.getElementById(id)),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    prototypeMark:!!document.querySelector('.prototype-mark,.scenario-bar'),
  }));
  await page.screenshot({path:path.join(evidenceDir,'04-presets-768-zh.png'),fullPage:true});
  record('768-preset-regions', presetPage.regions.length===6 && presetPage.overflow<=1 && !presetPage.prototypeMark, presetPage);

  const source = await fs.readFile(path.resolve(evidenceDir,'../../prototype/app.js'),'utf8');
  const copy = JSON.parse(await fs.readFile(path.resolve(evidenceDir,'../../copy.json'),'utf8'));
  const missing=[];
  for (const [fn,table] of [['t','static'],['tt','templates']]) {
    const re=new RegExp(`(?<![A-Za-z])${fn}\\(\\"([^\\"]+)\\"`,'g');
    for (const match of source.matchAll(re)) for (const locale of ['zh','en']) if (!Object.hasOwn(copy[table],`${match[1]}.${locale}`)) missing.push(`${fn}:${match[1]}.${locale}`);
  }
  record('copy-literal-key-coverage', missing.length===0, {static:Object.keys(copy.static).length,templates:Object.keys(copy.templates).length,missing});
} catch (error) {
  record('runner', false, {error:String(error),stack:error?.stack});
} finally {
  await browser.close();
}
report.summary = {
  passed:report.checks.filter(x=>x.passed).length,
  failed:report.checks.filter(x=>!x.passed).length,
  pageErrors:report.console_errors.length,
};
await fs.writeFile(path.join(evidenceDir,'M003-UI-08-formal-browser.json'),JSON.stringify(report,null,2)+'\n');
if (report.summary.failed || report.summary.pageErrors) process.exitCode=1;
