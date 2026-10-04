// Read-only reception of the approved prototype, not application verification.
const { chromium } = require('../../../../../frontend/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const outDir = __dirname;
const reportPath = path.join(outDir, 'M002-FE-01-prototype.json');
if (fs.existsSync(reportPath)) throw new Error('Reception evidence already exists');
const trace = JSON.parse(fs.readFileSync(path.join(outDir, '../../design/traceability.json')));
const admin = new Set(['users','userdetail','models','plans','messages','operations','credits','presets','metrics','adminhome']);
(async () => {
  const browser = await chromium.launch();
  const report = { kind: 'prototype_reception_only', browser: browser.version(), base: 'http://127.0.0.1:4186', checks: [], screenshots: [], production_verified: false, real_ai_calls: 0 };
  try {
    for (const [lang, width, height] of [['zh',1440,900],['en',390,844]]) {
      const context = await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
      const page = await context.newPage();
      for (const row of trace) for (const view of row.views) {
        const errors = [];
        const onError = e => errors.push(e.message);
        page.on('pageerror', onError);
        const role = admin.has(view) ? 'admin' : ['home','explore','trial','login','register'].includes(view) ? 'guest' : 'learner';
        await page.goto(`${report.base}/prototype/?page=${view}&role=${role}&lang=${lang}&batch=b1&v=M002-UI-22`, {waitUntil:'networkidle'});
        await page.locator('main').waitFor();
        const facts = await page.evaluate(() => ({ title:document.querySelector('main h1')?.textContent || null, mainTextLength:document.querySelector('main').textContent.length, overflow:document.documentElement.scrollWidth > innerWidth + 1, descriptions:document.querySelectorAll('.achievement-description').length }));
        report.checks.push({page:row.page,view,lang,width,height,...facts,errors,status:errors.length || !facts.mainTextLength || facts.overflow ? 'FAIL':'PASS'});
        if ((view === 'home' && lang === 'zh') || (view === 'growth' && lang === 'en')) {
          const filename = `M002-FE-01-${view}-${lang}.png`;
          await page.screenshot({path:path.join(outDir,filename),fullPage:true});
          report.screenshots.push(filename);
        }
        page.off('pageerror', onError);
      }
      await context.close();
    }
    report.status = report.checks.every(x => x.status === 'PASS') ? 'PASS' : 'FAIL';
  } finally {
    fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n');
    await browser.close();
  }
  console.log(JSON.stringify({status:report.status, checks:report.checks.length, failed:report.checks.filter(x=>x.status!=='PASS'),screenshots:report.screenshots}));
})().catch(e => { console.error(e); process.exitCode=1; });
