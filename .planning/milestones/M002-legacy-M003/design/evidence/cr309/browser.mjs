import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
const { chromium } = playwright;
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:4176/M003/design/prototype/';
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const report = {
  version: 'M003-UI-11',
  checked_at: new Date().toISOString(),
  scope: 'CR-309 PAGE-204/216/212 before, provisional and authoritative-result visual continuity',
  source_fixture: '../../technical/fixtures/stream-v5/rewrite-once.json',
  checks: [],
  screenshots: [],
  console_errors: [],
};
const record = (name, passed, details = {}) => report.checks.push({ name, passed, details });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.on('pageerror', error => report.console_errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });
const goto = query => page.goto(`${base}?view=formal&rev=ui11&${query}`, { waitUntil: 'networkidle' });
const snap = async (name, selector) => {
  await page.locator(selector).screenshot({ path: path.join(evidenceDir, name), animations: 'disabled' });
  report.screenshots.push(name);
};
const metrics = selector => page.locator(selector).first().evaluate(element => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width * 100) / 100,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    color: style.color,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    borderTopWidth: style.borderTopWidth,
    whiteSpace: style.whiteSpace,
    overflowWrap: style.overflowWrap,
  };
});
const stateMetrics = async () => ({
  overflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
  bodyWidth: await page.locator('.m003-result-body').evaluate(element => Math.round(element.getBoundingClientRect().width * 100) / 100),
  columns: await page.locator('.m003-vocabulary-list').evaluate(element => getComputedStyle(element).gridTemplateColumns),
  itemCount: await page.locator('.m003-vocabulary-list > div').count(),
  dt: await metrics('.m003-vocabulary-list dt'),
  dd: await metrics('.m003-vocabulary-list dd'),
  item: await metrics('.m003-vocabulary-list > div'),
  story: await metrics('.story-text'),
});
const same = (a, b, fields) => fields.every(field => a[field] === b[field]);

try {
  for (const viewport of [
    { key: 'desktop', width: 1440, height: 1050 },
    { key: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await goto('page=create&lang=zh&scenario=rewrite-once&event=0&status=0');
    const before = {
      overflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
      bodyWidth: await page.locator('.m003-result-body').evaluate(element => Math.round(element.getBoundingClientRect().width * 100) / 100),
      vocabularyCount: await page.locator('.m003-vocabulary-list').count(),
    };
    await snap(`01-before-${viewport.key}.png`, '#generation-status');

    await goto('page=create&lang=zh&scenario=rewrite-once&event=8&status=0');
    const during = await stateMetrics();
    const provisionalFields = await page.locator('.m003-plan-use').first().evaluate(element => ({
      tag: element.tagName,
      entry: element.querySelector('dt')?.textContent?.trim(),
      meanings: [...element.querySelectorAll('dd')].map(node => node.textContent?.trim()),
    }));
    await snap(`02-during-${viewport.key}.png`, '#generation-status');

    await goto('page=create&lang=zh&scenario=rewrite-once&event=74&status=0');
    const after = await stateMetrics();
    const afterLanguage = await page.locator('.m003-result-meanings .section-head > span').textContent();
    const finalFields = await page.locator('.m003-result-meanings .m003-vocabulary-list > div').first().evaluate(element => ({
      tag: element.tagName,
      entry: element.querySelector('dt')?.textContent?.trim(),
      meanings: [...element.querySelectorAll('dd')].map(node => node.textContent?.trim()),
    }));
    await snap(`03-after-${viewport.key}.png`, '#generation-status');

    const sharedTypography = same(during.dt, after.dt, ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'])
      && same(during.dd, after.dd, ['fontSize', 'lineHeight', 'color', 'marginTop'])
      && same(during.item, after.item, ['paddingTop', 'paddingBottom', 'borderTopWidth']);
    const sharedStory = same(during.story, after.story, ['lineHeight', 'marginTop', 'marginBottom', 'whiteSpace', 'overflowWrap']);
    const expectedColumns = viewport.key === 'desktop' ? 2 : 1;
    record(`create-${viewport.key}-continuity`,
      before.overflow === 0 && during.overflow === 0 && after.overflow === 0
      && before.bodyWidth === during.bodyWidth && during.bodyWidth === after.bodyWidth
      && during.itemCount === 3 && after.itemCount === 3
      && during.columns.split(' ').length === expectedColumns && after.columns.split(' ').length === expectedColumns
      && sharedTypography && sharedStory
      && afterLanguage?.trim() === '中文'
      && provisionalFields.tag === 'DIV' && finalFields.tag === 'DIV'
      && provisionalFields.meanings.length === 2 && finalFields.meanings.length === 2,
      { before, during, after, afterLanguage: afterLanguage?.trim(), provisionalFields, finalFields, sharedTypography, sharedStory });
  }

  await page.setViewportSize({ width: 1440, height: 1050 });
  await goto('page=presets&lang=zh&mode=basic&event=7&status=0');
  const previewDuring = await stateMetrics();
  await snap('04-page212-during-desktop.png', '#preview-result');
  await goto('page=presets&lang=zh&mode=basic&event=29&status=0&qualified=1');
  const previewAfter = await stateMetrics();
  const previewAfterLanguage = await page.locator('.m003-result-meanings .section-head > span').textContent();
  await snap('05-page212-after-desktop.png', '#preview-result');
  record('page212-shared-preview-continuity',
    previewDuring.itemCount === 2 && previewAfter.itemCount === 2
    && previewDuring.bodyWidth === previewAfter.bodyWidth
    && same(previewDuring.dt, previewAfter.dt, ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'])
    && same(previewDuring.dd, previewAfter.dd, ['fontSize', 'lineHeight', 'color', 'marginTop'])
    && same(previewDuring.story, previewAfter.story, ['lineHeight', 'marginTop', 'marginBottom', 'whiteSpace', 'overflowWrap'])
    && previewAfterLanguage?.trim() === '日本語',
    { previewDuring, previewAfter, previewAfterLanguage: previewAfterLanguage?.trim() });
} finally {
  record('browser-console', report.console_errors.length === 0, { errors: report.console_errors });
  report.summary = {
    total: report.checks.length,
    passed: report.checks.filter(item => item.passed).length,
    failed: report.checks.filter(item => !item.passed).length,
  };
  await fs.writeFile(path.join(evidenceDir, 'M003-UI-11-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
if (report.summary.failed) process.exitCode = 1;
