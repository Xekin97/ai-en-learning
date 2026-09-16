import { chromium } from '../../../../../frontend/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const shots = join(dir, 'cr031-cr032-screenshots');
mkdirSync(shots, { recursive: true });
const base = 'http://127.0.0.1:6010/prototype/';
const checks = [], metrics = [], errors = [];
const browser = await chromium.launch();
const check = (name, ok, actual) => checks.push({ name, pass: Boolean(ok), ...(ok ? {} : { actual }) });
const url = (id, locale, role = 'visitor', state = 'default') => `${base}?page=${id}&role=${role}&state=${state}&locale=${locale}`;
const gateTitle = (key, locale) => locale === 'en-US' ? `Sign in to open ${key === 'review' ? 'Review' : 'Library'}` : `登录后打开“${key === 'review' ? '复习' : '学习记录'}”`;
async function pageFor(width, locale) {
  const context = await browser.newContext({ locale, viewport: { width, height: width < 721 ? 844 : 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function gateCheck(page, id, locale, label) {
  const key = id === 'PAGE-007' ? 'review' : 'library';
  check(`${label} exact title`, await page.locator('main h1').innerText() === gateTitle(key, locale), await page.locator('main h1').innerText());
  check(`${label} target`, await page.locator('.auth-gate').getAttribute('data-auth-target') === key);
  check(`${label} stable page`, new URL(page.url()).searchParams.get('page') === id);
  check(`${label} no protected data`, await page.locator('main .date-range, main .batch-card, main input').count() === 0);
  check(`${label} no overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  return page.locator('main').innerText();
}
async function axe(page, scope, label) {
  const result = await new AxeBuilder({ page }).include(scope).analyze();
  const violations = result.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  check(`${label} axe serious/critical`, violations.length === 0, violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
}

try {
  for (const width of [320, 390, 720, 1280, 1440]) {
    for (const locale of ['zh-CN', 'en-US']) {
      const { context, page } = await pageFor(width, locale);
      const label = `${width}-${locale}`;
      for (const id of ['PAGE-007', 'PAGE-005']) {
        await page.goto(url(id, locale));
        const baseline = await gateCheck(page, id, locale, `${label} ${id} direct`);
        await page.goto(url('PAGE-001', locale));
        await page.locator(`.hero-actions [data-value="${id}"]`).click();
        check(`${label} ${id} hero matches direct`, await gateCheck(page, id, locale, `${label} ${id} hero`) === baseline);
        await page.goto(url('PAGE-001', locale));
        if (width <= 720) {
          await page.locator('[data-action="mobile-menu"]').click();
          await page.locator(`dialog [data-value="${id}"]`).click();
        } else await page.locator(`#app-header [data-value="${id}"]`).click();
        check(`${label} ${id} navigation matches direct`, await gateCheck(page, id, locale, `${label} ${id} navigation`) === baseline);
        await page.goto(url('PAGE-006', locale));
        await page.locator('.prototype-trigger').click();
        await page.locator('#prototype-page').selectOption(id);
        check(`${label} ${id} picker matches direct`, await gateCheck(page, id, locale, `${label} ${id} picker`) === baseline);
        const states = id === 'PAGE-007' ? ['resume', 'empty', 'date-error', 'default'] : ['empty', 'search-empty', 'default'];
        for (const state of states) {
          await page.locator('#prototype-state').selectOption(state);
          check(`${label} ${id} state ${state} same gate`, await page.locator('main').innerText() === baseline);
          check(`${label} ${id} state ${state} same target`, new URL(page.url()).searchParams.get('page') === id);
        }
        await page.locator('.prototype-trigger').click();
        if ([390, 1440].includes(width)) await page.screenshot({ path: join(shots, `gate-${id}-${label}.png`) });
        await page.locator('main [data-value="PAGE-003"]').click();
        check(`${label} ${id} login intent`, await page.locator('[data-auth-intent]').getAttribute('data-auth-intent') === (id === 'PAGE-007' ? 'review' : 'library'));
        await page.locator('.auth-alt [data-value="PAGE-002"]').click();
        check(`${label} ${id} register retains return`, new URL(page.url()).searchParams.get('returnPage') === id);
        await page.reload();
        check(`${label} ${id} refresh retains return`, await page.locator('[data-auth-intent]').count() === 1);
        await page.locator('.prototype-trigger').click();
        await page.locator('#prototype-state').selectOption('error');
        await page.locator('.prototype-trigger').click();
        check(`${label} ${id} error retains intent`, await page.locator('[data-auth-intent]').count() === 1);
        await page.locator('[data-action="auth-submit"]').click();
        check(`${label} ${id} auth returns`, new URL(page.url()).searchParams.get('page') === id);
        check(`${label} ${id} auth clears intent`, !new URL(page.url()).searchParams.has('returnPage'));
        check(`${label} ${id} auth no gate`, await page.locator('.auth-gate').count() === 0);
        check(`${label} ${id} auth no review auto-start`, await page.locator('[data-cloze-answer], #review-answer-1').count() === 0);
      }

      for (const mode of ['short', 'long', 'xlong', 'loading', 'error', 'unavailable']) {
        // Fresh locale state so account preferences from the previous auth flow do not mask the requested fixture.
        await page.evaluate(() => localStorage.clear());
        await page.goto(url('PAGE-103', locale, 'admin', `batch-${mode}`));
        const stateLabel = `${label} reader ${mode}`;
        const data = await page.evaluate(() => {
          const dialog = document.querySelector('dialog'), body = document.querySelector('.reader-body');
          const r = dialog.getBoundingClientRect(), br = body.getBoundingClientRect();
          const header = document.querySelector('.reader-header').getBoundingClientRect(), footer = document.querySelector('.dialog-footer').getBoundingClientRect();
          const passage = body.querySelector('.reading-passage'), paragraphs = [...body.querySelectorAll('.reading-passage p')];
          return { open: dialog.open, width: r.width, x: r.x, top: r.top, bottom: r.bottom, viewport: innerHeight,
            pageWidth: document.documentElement.scrollWidth, bodyWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth,
            bodyHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, headerBottom: header.bottom, bodyTop: br.top, bodyBottom: br.bottom, footerTop: footer.top,
            padding: getComputedStyle(body).paddingLeft, font: passage && getComputedStyle(passage).fontSize,
            lineHeight: passage && getComputedStyle(passage).lineHeight, paragraphs: paragraphs.length,
            words: passage ? passage.innerText.trim().split(/\s+/).length : 0,
            resources: body.querySelectorAll('.reader-word').length,
            paragraphGap: paragraphs.length > 1 ? paragraphs[1].getBoundingClientRect().top - paragraphs[0].getBoundingClientRect().bottom : null,
            tagGap: passage ? passage.getBoundingClientRect().top - body.querySelector('.passage-tags').getBoundingClientRect().bottom : null,
            mutationControls: dialog.querySelectorAll('input, textarea, select').length,
            titleFocused: document.activeElement.id === 'dialog-title',
            readonly: dialog.querySelector('.status-badge').textContent.trim(),
          };
        });
        metrics.push({ label: stateLabel, ...data });
        check(`${stateLabel} open`, data.open);
        check(`${stateLabel} inside viewport`, data.x >= 15 && data.top >= 15 && data.bottom <= data.viewport - 14);
        check(`${stateLabel} no horizontal overflow`, data.pageWidth <= width && data.bodyScrollWidth <= data.bodyWidth + 1, data);
        check(`${stateLabel} nonoverlap regions`, data.headerBottom <= data.bodyTop + 1 && data.bodyBottom <= data.footerTop + 1);
        check(`${stateLabel} padding`, data.padding === (width <= 720 ? '20px' : '32px'));
        check(`${stateLabel} readonly controls`, data.mutationControls === 0);
        check(`${stateLabel} readonly label`, data.readonly === (locale === 'en-US' ? 'Read only' : '只读'));
        check(`${stateLabel} title focus`, data.titleFocused);
        if (['short', 'long', 'xlong'].includes(mode)) {
          check(`${stateLabel} 18px / 1.9 reading`, data.font === '18px' && Number.parseFloat(data.lineHeight) >= 34.1, data);
          check(`${stateLabel} tags gap`, data.tagGap >= 23.9, data.tagGap);
          check(`${stateLabel} resources`, data.resources === (mode === 'xlong' ? 9 : 3));
          if (mode !== 'short') check(`${stateLabel} paragraph gap`, data.paragraphGap >= 23.9, data.paragraphGap);
          if (mode === 'xlong') check(`${stateLabel} extended stress content`, data.words >= 800 && data.bodyScrollHeight > data.bodyHeight);
        }
        const before = await page.locator('.reader-header').boundingBox();
        await page.locator('.reader-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
        check(`${stateLabel} header fixed while reading`, JSON.stringify(await page.locator('.reader-header').boundingBox()) === JSON.stringify(before));
        check(`${stateLabel} footer close reachable`, await page.locator('.dialog-footer button').isVisible());
        await page.locator('.reader-body').evaluate(el => { el.scrollTop = 0; });
        if ([390, 1440].includes(width) && ['short', 'xlong', 'error'].includes(mode)) await page.screenshot({ path: join(shots, `reader-${mode}-${label}.png`) });
        if ([390, 1440].includes(width) && ['short', 'error'].includes(mode)) await axe(page, 'dialog', stateLabel);
        if (mode === 'error') {
          await page.locator('[data-action="admin-batch-retry"]').click();
          check(`${stateLabel} retry success`, await page.locator('.reader-word').count() === 3);
        }
        await page.keyboard.press('Escape');
        check(`${stateLabel} Escape closes`, !await page.locator('dialog').evaluate(el => el.open));
        check(`${stateLabel} search retained`, await page.locator('#admin-user-search').inputValue() === 'lin');
        check(`${stateLabel} trigger focus restored`, await page.evaluate(() => document.activeElement.getAttribute('data-action') === 'admin-view-batch'));
        check(`${stateLabel} document unlocked`, !await page.locator('body').evaluate(el => el.classList.contains('has-reader-dialog')));
      }
      await page.goto(url('PAGE-009', locale, 'learner'));
      const colors = await page.locator('.danger-zone .card-subtitle').evaluate(el => ({ text: el.textContent, fg: getComputedStyle(el).color, bg: getComputedStyle(el.closest('.card-header')).backgroundColor }));
      check(`${label} danger neutral color`, colors.fg === 'rgb(64, 88, 90)' && colors.bg === 'rgb(250, 233, 231)', colors);
      if ([390, 1440].includes(width)) {
        await axe(page, '.danger-zone', `${label} account`);
        await page.screenshot({ path: join(shots, `account-${label}.png`) });
      }
      await context.close();
    }
  }

  const { context, page } = await pageFor(1440, 'en-US');
  await page.goto(url('PAGE-103', 'en-US', 'admin', 'results'));
  await page.locator('[data-action="admin-user-open"][data-index="1"]').click();
  const before = await page.locator('#admin-user-search').inputValue();
  await page.locator('[data-action="admin-view-batch"][data-index="1"]').click();
  check('selected learner retained', await page.locator('dialog').getAttribute('data-username') === 'lin_news');
  check('selected batch retained', await page.locator('dialog').getAttribute('data-batch-id') === 'batch-002');
  check('selected batch content not first fixture', (await page.locator('.reader-body .reading-passage').innerText()).startsWith('According to a local business report'));
  check('selected batch resources', await page.locator('.reader-word dt').allTextContents().then(xs => xs.join('|') === 'according to|business|news'));
  await page.locator('.reader-close').click();
  check('close retains search and second trigger', await page.locator('#admin-user-search').inputValue() === before && await page.evaluate(() => document.activeElement.dataset.index === '1'));
  await page.locator('[data-action="admin-view-batch"][data-index="1"]').click();
  for (let n = 0; n < 8; n++) {
    await page.keyboard.press('Tab');
    check(`modal Tab ${n} trapped`, await page.evaluate(() => Boolean(document.activeElement.closest('dialog'))));
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-action="admin-user-back"]').click();
  check('result query survives modal roundtrip', await page.locator('#admin-user-search').inputValue() === before);
  await page.goto(url('PAGE-007', 'en-US'));
  await page.locator('[data-locale-select]').selectOption('zh-CN');
  await gateCheck(page, 'PAGE-007', 'zh-CN', 'locale switch to Chinese');
  await page.locator('[data-locale-select]').selectOption('en-US');
  await gateCheck(page, 'PAGE-007', 'en-US', 'locale switch to English');
  await axe(page, 'main', 'Review gate');
  await page.locator('main [data-value="PAGE-003"]').click();
  await page.locator('#app-header [data-value="PAGE-004"]').click();
  await page.locator('#app-header [data-value="PAGE-003"]').click();
  check('leaving auth clears stale intent', await page.locator('[data-auth-intent]').count() === 0);
  await page.goto(url('PAGE-006', 'en-US') + '&batch=batch-002');
  check('story target distinct from Review', await page.locator('main h1').innerText() === 'Sign in to view this story');
  await page.locator('main [data-value="PAGE-003"]').click();
  await page.locator('[data-action="auth-submit"]').click();
  check('story deep intent preserves ID', new URL(page.url()).searchParams.get('batch') === 'batch-002');
  await context.close();
  check('no uncaught browser errors', errors.length === 0, errors);
} finally {
  await browser.close();
  const result = { date: new Date().toISOString(), scope: 'Design prototype only; not independent QA or production acceptance', passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).length, checks, metrics, errors };
  writeFileSync(join(dir, 'cr031-cr032-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, failed: result.failed, failures: checks.filter(c => !c.pass), errors }, null, 2));
  if (result.failed) process.exitCode = 1;
}
