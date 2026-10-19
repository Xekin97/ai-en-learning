import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning/frontend/package.json');
const { chromium } = require('@playwright/test');
const root = '/private/tmp/wordweave-m002-pronunciation-review-132';
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
try {
  for (const kind of ['picker', 'plan', 'result', 'library']) {
    const url = `http://127.0.0.1:4175/M003/design/pronunciation/formal/?page=${kind}&lang=zh&scenario=dictionary`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#app:not([aria-busy])').waitFor();
    const panel = page.locator(kind === 'picker' ? '#pron-page-401-picker' : kind === 'library' ? '#pron-page-403-library' : `#pron-page-402-${kind}`);
    const controls = panel.locator('[data-pron-play]');
    const count = await controls.count();
    if (!count) throw new Error(`No controls in ${kind}`);
    const button = controls.first();
    const name = await button.getAttribute('aria-label');
    await button.click();
    await page.waitForFunction(() => !!document.querySelector('[data-play-state="playing"]'));
    results.push({ page: kind, url, controls: count, first_control: name, simulated_playback_state: 'playing', status: 'PASS' });
    if (kind === 'result') await page.screenshot({ path: `${root}/result-preview.png`, fullPage: true });
  }
  if (errors.length) throw new Error('Preview had load errors');
  const result = { status: 'PASS', scope: 'Existing formal design preview availability; not implementation or real audio acceptance', results, errors, real_audio_tested: false };
  fs.writeFileSync(`${root}/preview-readiness.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
