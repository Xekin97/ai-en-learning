import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const { chromium } = playwright;
const base = 'http://127.0.0.1:4176';
const dir = path.dirname(new URL(import.meta.url).pathname);
const report = {
  version: 'M002-UI-33-R3',
  mode: 'priority editor modal defect regression',
  before: {
    modal: false,
    position: 'absolute',
    top: 1471.256103515625,
    bottom: 2009.381103515625,
    viewport: 950,
    source: 'R2 browser reproduction before the R3 adapter change',
  },
  provider_calls: 0,
  configuration_writes: 0,
  checks: [],
  screenshots: [],
  console_errors: [],
  page_errors: [],
};
const record = (name, passed, details = {}) => report.checks.push({ name, passed, details });
const browser = await chromium.launch({ headless: true });
const contexts = [];

async function open(url, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => report.page_errors.push(`${url}: ${error}`));
  page.on('console', message => {
    if (message.type() === 'error') report.console_errors.push(`${url}: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#app[aria-busy="false"]').waitFor();
  return page;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(dir, name) });
  report.screenshots.push(name);
}

async function openPriority(page) {
  await page.locator('[data-action="open-priority-editor"]').click();
  const dialog = page.locator('#priority-editor');
  await dialog.waitFor();
  await page.waitForTimeout(60);
  return dialog;
}

async function focusReturned(page) {
  await page.waitForTimeout(60);
  return page.locator('[data-action="open-priority-editor"]').evaluate(element => document.activeElement === element);
}

try {
  const desktop = await open(`${base}/formal/?page=plans&category=plans&portState=idle&lang=zh`, { width: 1440, height: 950 });
  let dialog = await openPriority(desktop);
  const initial = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      modal: element.matches(':modal'),
      position: getComputedStyle(element).position,
      rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
      activeInside: element.contains(document.activeElement),
    };
  });
  record(
    'desktop-opens-in-top-layer-centered-with-backdrop',
    initial.modal && initial.position === 'fixed' && initial.rect.top >= 0 && initial.rect.bottom <= initial.viewport.height && initial.activeInside,
    initial,
  );
  await screenshot(desktop, 'R3-01-priority-modal-desktop-zh.png');

  await dialog.locator('#priority-form input').first().fill('37');
  const urlBeforeBackdrop = desktop.url();
  const navBox = await desktop.locator('.admin-nav a[href*="page=models"]').first().boundingBox();
  await desktop.mouse.click(navBox.x + navBox.width / 2, navBox.y + navBox.height / 2);
  const backdrop = {
    modalStillOpen: await dialog.evaluate(element => element.matches(':modal')),
    value: await dialog.locator('#priority-form input').first().inputValue(),
    urlUnchanged: desktop.url() === urlBeforeBackdrop,
  };
  record('backdrop-blocks-background-and-keeps-draft', backdrop.modalStillOpen && backdrop.value === '37' && backdrop.urlUnchanged, backdrop);

  const tabContainment = [];
  for (let index = 0; index < 12; index += 1) {
    await desktop.keyboard.press('Tab');
    tabContainment.push(await dialog.evaluate(element => element.contains(document.activeElement)));
  }
  record('tab-focus-remains-in-modal', tabContainment.every(Boolean), { samples: tabContainment.length, all_inside: tabContainment.every(Boolean) });

  await dialog.locator('[data-action="preview-priorities"]').click();
  dialog = desktop.locator('#priority-editor');
  await pageWait(desktop);
  const preview = {
    modal: await dialog.evaluate(element => element.matches(':modal')),
    value: await dialog.locator('#priority-form input').first().inputValue(),
    notice: await dialog.locator('.notice').count(),
    focusOnNotice: await dialog.locator('.notice').evaluate(element => document.activeElement === element),
  };
  record('preview-redraw-preserves-draft-and-restores-modal', preview.modal && preview.value === '37' && preview.notice === 1 && preview.focusOnNotice, preview);
  await screenshot(desktop, 'R3-02-priority-preview-desktop-zh.png');

  await dialog.locator('[data-action="save-priorities"]').click();
  const saved = { closed: await desktop.locator('#priority-editor').count() === 0, focusReturned: await focusReturned(desktop) };
  record('save-closes-and-returns-focus-to-opener', saved.closed && saved.focusReturned, saved);

  dialog = await openPriority(desktop);
  await dialog.locator('#priority-form input').first().fill('29');
  await dialog.locator('.dialog-actions [data-action="close-priority-editor"]').click();
  const cancelled = { closed: await desktop.locator('#priority-editor').count() === 0, focusReturned: await focusReturned(desktop) };
  record('cancel-closes-and-returns-focus-to-opener', cancelled.closed && cancelled.focusReturned, cancelled);

  dialog = await openPriority(desktop);
  await desktop.keyboard.press('Escape');
  const escaped = { closed: await desktop.locator('#priority-editor').count() === 0, focusReturned: await focusReturned(desktop) };
  record('escape-closes-and-returns-focus-to-opener', escaped.closed && escaped.focusReturned, escaped);

  dialog = await openPriority(desktop);
  await dialog.locator('.dialog-close').click();
  const closeButton = { closed: await desktop.locator('#priority-editor').count() === 0, focusReturned: await focusReturned(desktop) };
  record('close-button-closes-and-returns-focus-to-opener', closeButton.closed && closeButton.focusReturned, closeButton);

  await desktop.locator('[data-cr313-action="import"]').click();
  const portabilityModal = await desktop.locator('#cr313-dialog').evaluate(element => element.matches(':modal'));
  await desktop.locator('#cr313-dialog [data-action="close"]').first().click();
  record('portability-modal-still-opens-after-priority-close', portabilityModal, { modal: portabilityModal });

  await desktop.locator('.admin-nav a[href*="page=operations"]').first().click();
  await desktop.waitForLoadState('networkidle');
  await desktop.locator('#app[aria-busy="false"]').waitFor();
  const growth = { path: new URL(desktop.url()).pathname, page: new URL(desktop.url()).searchParams.get('page'), overflow: await desktop.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)) };
  record('r2-plan-to-growth-navigation-remains-intact', growth.path === '/formal/' && growth.page === 'operations' && growth.overflow === 0, growth);

  const mobile = await open(`${base}/formal/?page=plans&category=plans&portState=idle&lang=en`, { width: 390, height: 844 });
  let mobileDialog = await openPriority(mobile);
  await mobileDialog.locator('#priority-form input').first().fill('41');
  await mobileDialog.locator('[data-action="preview-priorities"]').click();
  mobileDialog = mobile.locator('#priority-editor');
  await pageWait(mobile);
  await mobileDialog.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const mobileResult = await mobileDialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const action = element.querySelector('.dialog-actions');
    const actionRect = action.getBoundingClientRect();
    return {
      modal: element.matches(':modal'),
      rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      viewport: { width: innerWidth, height: innerHeight },
      actionBottom: actionRect.bottom,
      value: element.querySelector('#priority-form input').value,
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      dialogOverflow: Math.max(0, element.scrollWidth - element.clientWidth),
    };
  });
  record(
    'mobile-english-modal-fits-scrolls-and-keeps-actions-reachable',
    mobileResult.modal && mobileResult.rect.top >= 0 && mobileResult.rect.bottom <= mobileResult.viewport.height && mobileResult.actionBottom <= mobileResult.viewport.height && mobileResult.value === '41' && mobileResult.documentOverflow === 0 && mobileResult.dialogOverflow === 0,
    mobileResult,
  );
  await screenshot(mobile, 'R3-03-priority-preview-mobile-en.png');
} finally {
  record('browser-console-and-page-errors', report.console_errors.length === 0 && report.page_errors.length === 0, { console_errors: report.console_errors, page_errors: report.page_errors });
  report.summary = { total: report.checks.length, passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length };
  await fs.writeFile(path.join(dir, 'M002-UI-33-R3-priority-modal.json'), `${JSON.stringify(report, null, 2)}\n`);
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}

async function pageWait(page) {
  await page.locator('#priority-editor').waitFor();
  await page.waitForTimeout(80);
}

if (report.summary.failed) process.exitCode = 1;
