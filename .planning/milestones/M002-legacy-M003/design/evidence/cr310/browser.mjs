import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
const { chromium } = playwright;
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:4176/M003/design/prototype/';
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const report = {
  version: 'M003-UI-12',
  checked_at: new Date().toISOString(),
  scope: 'CR-310 completed-result editing and next-generation confirmation',
  fixtures: ['../../technical/fixtures/stream-v5/rewrite-once.json', 'prototype discard failure adapter'],
  provider_calls: 0,
  checks: [],
  screenshots: [],
  console_errors: [],
};
const record = (name, passed, details = {}) => report.checks.push({ name, passed, details });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.on('pageerror', error => report.console_errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });
const query = (lang = 'zh', extra = '') => `?page=create&lang=${lang}&view=formal&scenario=rewrite-once&event=74&status=0&style=discussion&words=harbor,quiet&rev=ui12${extra}`;
const goto = (lang = 'zh', extra = '') => page.goto(base + query(lang, extra), { waitUntil: 'networkidle' });
const snap = async name => {
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true, animations: 'disabled' });
  report.screenshots.push(name);
};
const state = async () => ({
  lifecycle: await page.locator('#generation-status').getAttribute('data-state'),
  resultTitle: (await page.locator('#final-result h2').textContent())?.trim(),
  resultBody: (await page.locator('#final-result .story-text').textContent())?.trim(),
  resultMeanings: await page.locator('#final-result .m003-vocabulary-list > div').count(),
  selectedWords: await page.locator('#create-words .word-token > span').allTextContents(),
  style: await page.locator('#create-style').inputValue(),
  disabledControls: await page.locator('#create-settings :is(select,input,button):disabled').count(),
  generateDisabled: await page.locator('#generate').isDisabled(),
  standaloneDiscard: await page.getByRole('button', { name: /放弃本次结果|Discard result/ }).count(),
  overflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
});

try {
  await goto();
  const before = await state();
  await snap('01-editable-result-desktop.png');
  record('UIA-M003-423-editable-result',
    before.lifecycle === 'valid' && before.style === 'discussion'
    && before.selectedWords.join(',') === 'harbor,quiet'
    && !before.resultTitle.includes('quiet')
    && before.resultBody.length > 0 && before.resultMeanings > 0
    && before.disabledControls === 0 && !before.generateDisabled
    && before.standaloneDiscard === 0 && before.overflow === 0,
    before);

  await page.locator('#generate').click();
  const dialog = page.locator('#regenerate-confirm');
  const modal = await dialog.evaluate(element => element.matches(':modal'));
  const zhCopy = {
    title: (await dialog.locator('h2').textContent())?.trim(),
    body: (await dialog.locator('.dialog-body').textContent())?.trim(),
    cancel: (await dialog.locator('.dialog-actions button').first().textContent())?.trim(),
    confirm: (await dialog.locator('.dialog-actions button').last().textContent())?.trim(),
    active: await page.evaluate(() => document.activeElement?.textContent?.trim()),
  };
  await snap('02-confirm-desktop-zh.png');
  await page.keyboard.press('Shift+Tab');
  const trappedBackward = await page.evaluate(() => document.activeElement?.closest('#regenerate-confirm')?.id === 'regenerate-confirm');
  await page.keyboard.press('Escape');
  const afterEscape = await state();
  const escapeFocus = await page.evaluate(() => document.activeElement?.id);
  record('UIA-M003-424-dialog-cancel-keyboard',
    modal && zhCopy.title === '生成新的短文？'
    && zhCopy.body === '继续生成会永久放弃当前未收录的短文和学习信息。'
    && zhCopy.cancel === '取消' && zhCopy.confirm === '放弃并生成'
    && zhCopy.active === '取消' && trappedBackward
    && escapeFocus === 'generate'
    && afterEscape.resultTitle === before.resultTitle
    && afterEscape.resultBody === before.resultBody
    && afterEscape.selectedWords.join(',') === before.selectedWords.join(',')
    && afterEscape.style === before.style,
    { zhCopy, trappedBackward, escapeFocus, afterEscape });

  await goto('zh', '&discardFailure=1');
  const failureBefore = await state();
  await page.locator('#generate').click();
  await dialog.locator('[data-action="confirm-regenerate"]').click();
  const failureAfter = await state();
  const failureAlert = (await page.locator('.m003-regenerate-error').textContent())?.trim();
  record('UIA-M003-425-discard-failure-stops-generation',
    failureAfter.lifecycle === 'valid'
    && failureAfter.resultTitle === failureBefore.resultTitle
    && failureAfter.resultBody === failureBefore.resultBody
    && failureAfter.selectedWords.join(',') === failureBefore.selectedWords.join(',')
    && failureAfter.style === failureBefore.style
    && failureAlert === '暂时无法放弃当前结果。当前短文和新配置均已保留，请重试。'
    && new URL(page.url()).searchParams.get('event') === '74',
    { failureBefore, failureAfter, failureAlert, url: page.url(), simulated_new_generation_calls: 0 });

  await page.setViewportSize({ width: 390, height: 844 });
  await goto('en');
  const mobileBefore = await state();
  await page.locator('#generate').click();
  const enCopy = {
    title: (await dialog.locator('h2').textContent())?.trim(),
    body: (await dialog.locator('.dialog-body').textContent())?.trim(),
    cancel: (await dialog.locator('.dialog-actions button').first().textContent())?.trim(),
    confirm: (await dialog.locator('.dialog-actions button').last().textContent())?.trim(),
    active: await page.evaluate(() => document.activeElement?.textContent?.trim()),
    modal: await dialog.evaluate(element => element.matches(':modal')),
    width: await dialog.evaluate(element => Math.round(element.getBoundingClientRect().width)),
  };
  await snap('03-confirm-mobile-en.png');
  await dialog.locator('.dialog-actions button').first().click();
  const mobileAfter = await state();
  record('UIA-M003-424-mobile-en-cancel',
    enCopy.modal && enCopy.title === 'Generate a new story?'
    && enCopy.body === 'Continuing will permanently discard the current unsaved story and its learning information.'
    && enCopy.cancel === 'Cancel' && enCopy.confirm === 'Discard and generate'
    && enCopy.active === 'Cancel' && enCopy.width <= 366
    && mobileBefore.overflow === 0 && mobileAfter.overflow === 0
    && mobileAfter.resultTitle === mobileBefore.resultTitle
    && mobileAfter.selectedWords.join(',') === mobileBefore.selectedWords.join(','),
    { enCopy, mobileBefore, mobileAfter });

  await page.setViewportSize({ width: 1440, height: 1050 });
  await goto();
  await page.locator('#generate').click();
  await dialog.locator('[data-action="confirm-regenerate"]').click();
  await page.waitForFunction(() => document.querySelector('#generation-status')?.getAttribute('data-state') !== 'valid');
  const confirmed = {
    lifecycle: await page.locator('#generation-status').getAttribute('data-state'),
    resultCount: await page.locator('#final-result').count(),
    selectedWords: await page.locator('#create-words .word-token > span').allTextContents(),
    style: await page.locator('#create-style').inputValue(),
  };
  record('UIA-M003-425-confirm-proceeds',
    confirmed.lifecycle !== 'valid' && confirmed.resultCount === 0
    && confirmed.selectedWords.join(',') === 'harbor,quiet' && confirmed.style === 'discussion',
    { ...confirmed, simulated_discard_calls: 1, simulated_new_generation_calls: 1 });
} finally {
  record('browser-console', report.console_errors.length === 0, { errors: report.console_errors });
  report.summary = {
    total: report.checks.length,
    passed: report.checks.filter(item => item.passed).length,
    failed: report.checks.filter(item => !item.passed).length,
  };
  await fs.writeFile(path.join(evidenceDir, 'M003-UI-12-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
if (report.summary.failed) process.exitCode = 1;
