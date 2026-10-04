import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium, webkit, expect } = createRequire(process.cwd() + '/frontend/package.json')('@playwright/test');
const out = new URL('./', import.meta.url), origin = 'http://127.0.0.1:3302';
const copy = JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const before = process.env.CAPTURE_BEFORE === '1', results = [], errors = [];
const ready = p => p.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
async function inspect(page) {
  return page.locator('[data-region="generation-result"]').evaluate(root => {
    const region = root.querySelector('.study-resources'), hint = root.querySelector('.resource-grid p:last-child');
    return {
      heading: region?.querySelector('h2')?.textContent ?? null,
      sectionMargin: region ? getComputedStyle(region).margin : null,
      paddingTop: region ? getComputedStyle(region).paddingTop : null,
      borderTop: region ? getComputedStyle(region).borderTop : null,
      hintColor: getComputedStyle(hint).color,
      mutedColor: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
      gridColumns: getComputedStyle(root.querySelector('.resource-grid')).gridTemplateColumns,
      order: [...root.querySelector('.article').children].map(e => e.className || e.tagName),
      scrollOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
for (const width of (before ? [1440] : [1440, 390])) {
  const browser = await (width === 390 ? webkit : chromium).launch();
  const lang = width === 390 ? 'en' : 'zh', locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const t = key => copy.static[lang + '.' + key] ?? copy.templates[lang + '.' + key];
  try {
    for (const kind of (before ? ['ordinary'] : ['ordinary', 'preset'])) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, locale, reducedMotion: 'reduce' });
      await context.addCookies([{ name: 'wordweave_ui_locale', value: locale, url: origin }]);
      const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
      const preset = JSON.parse(readFileSync('.planning/milestones/M002/verification/evidence/qa2-022/fixture.json')).presetId;
      await p.goto(origin + (kind === 'ordinary' ? '/create' : '/trial/' + preset)); await ready(p);
      if (kind === 'ordinary') {
        if (width === 390) await p.locator('.settings > summary').click();
        await p.locator('.creation-model select').selectOption({ index: 1 });
        await p.locator('.creation-options select').nth(2).selectOption('zh');
        for (const entry of ['resilient', 'wander', 'weave']) {
          await p.getByRole('combobox', { name: t('wordsearch') }).fill(entry);
          await p.getByRole('option', { name: entry, exact: true }).click();
        }
      }
      await p.getByRole('button', { name: t('start'), exact: true }).click();
      const region = p.locator('[data-region="generation-result"]');
      await expect(region.locator('.resource-grid article')).toHaveCount(3);
      await expect(p.locator('.app-error')).toHaveCount(0);
      const actual = await inspect(p);
      if (before) expect(actual.heading).toBeNull();
      else {
        await expect(region.locator('.study-resources h2')).toHaveText(t('l.resources'));
        expect(actual.paddingTop).toBe('24px'); expect(actual.sectionMargin).toBe('30px 0px');
        expect(actual.borderTop).toMatch(/^1px solid/); expect(actual.scrollOverflow).toBe(false);
        await expect(region.locator('.resource-grid p.muted')).toHaveCount(3);
        expect(actual.order).toEqual(['eyebrow', 'H2', 'story-text', 'chips', 'study-resources', 'actions']);
      }
      if (kind === 'ordinary') {
        await p.evaluate(() => document.fonts.ready);
        await region.screenshot({ path: new URL(`${before ? 'before' : 'after'}-${width}.png`, out).pathname });
        const data = await region.evaluate(root => ({
          title: root.querySelector('.article > h2').textContent,
          passageHTML: root.querySelector('.story-text').innerHTML,
          tags: [...root.querySelectorAll('.article > .chips > .chip')].map(e => e.textContent),
          targets: [...root.querySelectorAll('.resource-grid article')].map(el => ({word:el.querySelector('h3').textContent,meaning:el.querySelector('p').textContent,hint:el.querySelector('p:last-child').textContent})),
        }));
        const proto = await context.newPage();
        // Static completion comparison; no motion claim. Speed up only prototype's 65ms generation timer.
        await proto.addInitScript(() => { const original = window.setInterval; window.setInterval = (fn, ms, ...args) => original(fn, ms === 65 ? 1 : ms, ...args); });
        await proto.goto(`http://127.0.0.1:4184/prototype/?page=create&role=guest&lang=${lang}`);
        await expect(proto.locator('#model')).toBeVisible();
        if (width === 390) await proto.locator('.settings > summary').click();
        await proto.locator('#model').selectOption({ index: 1 });
        await proto.locator('#explain').selectOption('chinese');
        await proto.locator('#generate').click();
        await expect(proto.locator('.study-resources')).toBeVisible();
        // Normalize only dynamic data, preserving all approved prototype structure and CSS.
        await proto.locator('[data-region="generation-result"]').evaluate((root, d) => {
          root.querySelector('.article > h2').textContent = d.title;
          root.querySelector('.story-text').innerHTML = d.passageHTML;
          root.querySelectorAll('.article > .chips > .chip').forEach((el, i) => i < d.tags.length ? el.textContent = d.tags[i] : el.remove());
          root.querySelectorAll('.resource-grid article').forEach((el, i) => {
            el.querySelector('h3').textContent=d.targets[i].word; el.querySelector('p').textContent=d.targets[i].meaning; el.querySelector('p:last-child').textContent=d.targets[i].hint;
          });
        }, data);
        const expected = await inspect(proto);
        if (!before) {
          for (const key of ['heading','sectionMargin','paddingTop','borderTop','hintColor','gridColumns','order']) expect(actual[key], key).toEqual(expected[key]);
        }
        if (before || width === 390) {
          await proto.evaluate(() => document.fonts.ready);
          await proto.locator('[data-region="generation-result"]').screenshot({ path:new URL(`prototype-${width}.png`,out).pathname });
        }
        results.push({kind,width,locale,result:before?'REPRODUCED':'PASS',actual,prototype:expected});
        await proto.close();
      } else results.push({kind,width,locale,result:'PASS',actual});
      if (!before) {
        await expect(region.getByRole('button',{name:t('l.discard'),exact:true})).toBeEnabled();
        await region.getByRole('button',{name:t('guestcollect'),exact:true}).click();
        await expect(p).toHaveURL(/\/login\?.*claim=1/);
      }
      await context.close();
    }
  } catch (error) { results.push({width,result:'FAIL',error:error.message}); process.exitCode=1; }
  finally { await browser.close(); }
}
writeFileSync(new URL(before?'before-results.json':'browser-results.json',out),JSON.stringify({results,pageErrors:errors,realAI:0,screenshotScope:'result region; static, matched data and font readiness'},null,2));
console.log(JSON.stringify(results.map(({kind,width,result,error})=>({kind,width,result,error}))));
