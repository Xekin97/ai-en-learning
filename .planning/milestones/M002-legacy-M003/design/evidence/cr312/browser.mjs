import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
const { chromium } = playwright;
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:4174/M003/design/prototype/';
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const report = {
  version: 'M003-UI-13',
  checked_at: new Date().toISOString(),
  scope: 'CR-311 candidate presentation and CR-312 published paragraph revision in PAGE-204/216/212 design prototype',
  fixtures: ['../../technical/fixtures/cr311-312/*.json'],
  provider_calls: 0,
  checks: [], screenshots: [], console_errors: [],
};
const record = (name, passed, details = {}) => report.checks.push({ name, passed, details });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
page.on('pageerror', error => report.console_errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });
const createUrl = (event, extra = '') => `${base}?page=create&lang=zh&scenario=cr312-shorter&event=${event}&demo=open${extra}`;
const goto = async url => { await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#generation-status'); };
const draftText = async () => (await page.locator('.live-draft-text').innerText()).replace(/\n+/g, '\n').trim();
const currentEvent = () => Number(new URL(page.url()).searchParams.get('event') ?? 0);
const waitEvent = event => page.waitForFunction(value => Number(new URL(location.href).searchParams.get('event')) >= value, event);
const snap = async name => {
  const cleanup = await page.addStyleTag({ content: '.skip-link:not(:focus){display:none!important}' });
  await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true, animations: 'disabled' });
  await cleanup.evaluate(node => node.remove());
  report.screenshots.push(name);
};

try {
  await goto(createUrl(0, '&words=the,art'));
  await page.locator('#create-words-search').fill('the');
  const searchOptions = await page.locator('#create-words [role=option] > span:first-child').allTextContents();
  const selectedBeforeRandom = await page.locator('#create-words .word-token > span').allTextContents();
  await page.locator('#create-words [data-picker-random]').click();
  const selectedAfterRandom = await page.locator('#create-words .word-token > span').allTextContents();
  record('UIA-M003-427-filtered-picker', searchOptions.join(',') === 'theater,another'
    && selectedBeforeRandom.join(',') === 'the,art' && selectedAfterRandom.includes('the')
    && selectedAfterRandom.some(word => ['go','theater','another'].includes(word)),
    { searchOptions, selectedBeforeRandom, selectedAfterRandom });

  await goto(createUrl(11));
  const replay = page.locator('[data-action=harness-replay]');
  await replay.click();
  await waitEvent(11);
  const initial = { text: await draftText(), plan: await page.locator('#planning-preview').isVisible(), save: await page.locator('[data-action=save-story]').count() };
  await waitEvent(12);
  const waiting = { activity: (await page.locator('[data-stream-status]').innerText()).trim(), title: (await page.locator('#live-draft-title').innerText()).trim(), detail: await page.locator('.draft-status').count(), text: await draftText() };
  await waitEvent(13);
  const halfBegin = await draftText();
  await waitEvent(14);
  const halfEdit = await draftText();
  await page.locator('[data-action=cancel-generation]').focus({ preventScroll: true });
  await page.evaluate(() => scrollTo(0, Math.min(520, document.documentElement.scrollHeight - innerHeight)));
  const beforeCommitPosition = await page.evaluate(() => ({ y: scrollY, active: document.activeElement?.getAttribute('data-action') || document.activeElement?.id }));
  await waitEvent(15);
  const committed = { text: await draftText(), changed: await page.locator('.m003-story-paragraph.is-changed').count() };
  const afterCommitPosition = await page.evaluate(() => ({ y: scrollY, active: document.activeElement?.getAttribute('data-action') || document.activeElement?.id }));
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await snap('01-paragraph-commit-desktop-zh.png');
  await waitEvent(17);
  const bodyComplete = { text: await draftText(), save: await page.locator('[data-action=save-story]').count(), plan: await page.locator('#planning-preview').count() };
  await waitEvent(19);
  const valid = { result: await page.locator('#final-result').count(), save: await page.locator('[data-action=save-story]').count(), meanings: await page.locator('#final-result .m003-vocabulary-list > div').count() };
  record('UIA-M003-428-430-live-sequence', initial.text === 'We see art.\nWe go home.\nThe art stays.' && initial.plan && initial.save === 0
    && waiting.activity === '正在完善内容' && waiting.title === '当前正文' && waiting.detail === 0 && waiting.text === initial.text
    && halfBegin === initial.text && halfEdit === initial.text
    && committed.text === 'We enjoy art.\nWe go home.\nThe art stays.' && committed.changed === 1
    && bodyComplete.text === 'We enjoy art.\nWe go together.' && bodyComplete.save === 0 && bodyComplete.plan === 1
    && valid.result === 1 && valid.save === 1 && valid.meanings === 2,
    { initial, waiting, halfBegin, halfEdit, committed, bodyComplete, valid, eventsReached: currentEvent() });
  record('UIA-M003-429-reader-position', beforeCommitPosition.active === afterCommitPosition.active
    && beforeCommitPosition.active !== '' && beforeCommitPosition.y > 0
    && Math.abs(afterCommitPosition.y - beforeCommitPosition.y) < 4,
    { beforeCommitPosition, afterCommitPosition });

  await goto(`${base}?page=create&lang=en&scenario=cr312-large-paragraph&event=24&demo=open`);
  const longBuffered = { text: await draftText(), changed: await page.locator('.is-changed').count() };
  await goto(`${base}?page=create&lang=en&scenario=cr312-large-paragraph&event=25&demo=open`);
  const longCommitted = { length: (await draftText()).length, changed: await page.locator('.is-changed').count() };
  record('UIA-M003-429-long-paragraph-buffer', longBuffered.text === 'We see art.\nWe go home.\nThe art stays.' && longBuffered.changed === 0 && longCommitted.length > 16000 && longCommitted.changed === 1, { longBuffered, longCommitted });

  await goto(`${base}?page=create&lang=zh&scenario=cr312-q02-mid-draft&event=19&demo=open`);
  const q02Staged = await draftText();
  await goto(`${base}?page=create&lang=zh&scenario=cr312-q02-mid-draft&event=20&demo=open`);
  const q02Restored = await draftText();
  await goto(`${base}?page=create&lang=zh&scenario=cr312-q02-mid-draft&event=22&demo=open`);
  const q02Valid = { result: await page.locator('#final-result').count(), notice: (await page.locator('#final-result .notice').innerText()).trim() };
  record('UIA-M003-431-q02-restore', q02Staged === 'We enjoy art.\nWe go home.\nThe art stays.' && q02Restored === 'We see art.\nWe go home.\nThe art stays.' && q02Valid.result === 1 && q02Valid.notice.length > 0, { q02Staged, q02Restored, q02Valid });

  const terminal = {};
  for (const scenario of ['pending','failed','cancelled']) {
    const fixture = JSON.parse(await fs.readFile(new URL(`../../../technical/fixtures/cr311-312/${scenario}.json`, import.meta.url), 'utf8'));
    await goto(`${base}?page=create&lang=zh&scenario=cr312-${scenario}&event=${fixture.wire.length}&demo=open`);
    terminal[scenario] = { state: await page.locator('#generation-status').getAttribute('data-state'), save: await page.locator('[data-action=save-story]').count(), result: await page.locator('#final-result').count() };
  }
  record('UIA-M003-431-terminal-states', terminal.pending.state === 'pending' && terminal.failed.state === 'failed' && terminal.cancelled.state === 'cancelled' && Object.values(terminal).every(value => value.save === 0 && value.result === 0), terminal);

  await page.setViewportSize({ width: 390, height: 844 });
  await goto(`${base}?page=create&lang=en&scenario=cr312-shorter&event=15&view=formal`);
  const narrow = {
    activity: (await page.locator('[data-stream-status]').innerText()).trim(),
    overflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
    columns: await page.locator('.m003-vocabulary-list').first().evaluate(node => getComputedStyle(node).gridTemplateColumns),
  };
  await snap('02-paragraph-commit-mobile-en.png');
  record('UIA-M003-433-narrow-en', narrow.activity === 'Refining the story' && narrow.overflow === 0 && !narrow.columns.includes(' '), narrow);

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await goto(createUrl(15));
  const reduced = {
    cueAnimation: await page.locator('.m003-story-paragraph.is-changed').evaluate(node => getComputedStyle(node).animationName),
    dotAnimation: await page.locator('.m003-writing i').first().evaluate(node => getComputedStyle(node).animationName),
    cueBackground: await page.locator('.m003-story-paragraph.is-changed').evaluate(node => getComputedStyle(node).backgroundColor),
  };
  record('UIA-M003-433-reduced-motion', reduced.cueAnimation === 'none' && reduced.dotAnimation === 'none' && reduced.cueBackground !== 'rgba(0, 0, 0, 0)', reduced);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.goto(`${base}?page=presets&lang=zh&mode=enhanced&event=15`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#preview-result');
  const preview = {
    resultRegion: await page.locator('#preview-result').count(),
    text: await page.locator('#preview-result .live-draft-text').innerText(),
    changed: await page.locator('#preview-result .is-changed').count(),
    activity: (await page.locator('#preview-result [data-stream-status]').innerText()).trim(),
    save: await page.locator('#preview-result [data-action=save-story]').count(),
  };
  await snap('03-admin-preview-paragraph-commit.png');
  record('UIA-M003-432-shared-preview', preview.resultRegion === 1 && preview.text.trim() === 'We enjoy art and go home.' && preview.changed === 0 && preview.activity === '正在完善内容' && preview.save === 0, preview);
} finally {
  record('browser-console', report.console_errors.length === 0, { errors: report.console_errors });
  report.summary = { total: report.checks.length, passed: report.checks.filter(item => item.passed).length, failed: report.checks.filter(item => !item.passed).length };
  await fs.writeFile(path.join(evidenceDir, 'M003-UI-13-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
if (report.summary.failed) process.exitCode = 1;
