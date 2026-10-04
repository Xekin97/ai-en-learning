import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect, ok, raw, ready, origin, t } from '../qa2-022/harness.mjs';
import { candidate as probeCandidate } from '../qa2-009/provider-fixed.mjs';
const out = new URL('./', import.meta.url), results = JSON.parse(readFileSync(new URL('first-results.json', out))).results.filter(r => r.result === 'PASS'), errors = [];
const parse = text => text.split('\n\n').filter(Boolean).map(block => ({
  event: block.match(/^event: (.*)$/m)?.[1], data: JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? '{}'),
}));
const browser = await chromium.launch();
const beforeStats = await fetch('http://127.0.0.1:38084/stats').then(r => r.json());
function verify(events, entries, language) {
  expect(events.filter(e => e.event === 'generation.failed')).toHaveLength(0);
  const final = events.find(e => e.event === 'generation.validated');
  expect(final).toBeTruthy();
  const value = final.data.result;
  expect(value.targets.map(x => x.entry)).toEqual(entries);
  expect(events.filter(e => e.event === 'passage.delta').map(e => e.data.text).join('')).toBe(value.passage);
  const languagePattern = {zh: /[\u4e00-\u9fff]/, en: /Placeholder definition/, ja: /[\u3040-\u30ff]/}[language];
  for (const target of value.targets) {
    expect(target.entry_meaning).toMatch(languagePattern);
    expect(target.hint_blanks.length).toBeGreaterThan(0);
    expect(target.occurrences.length).toBeGreaterThan(0);
    for (const span of target.occurrences)
      expect([...value.passage].slice(span.start, span.end).join('')).toBe(span.surface);
  }
  return { run_id: final.data.run_id, entries, language, characters: value.passage.length,
    words: value.passage.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g).length, valid: true, streamMatchesResult: true };
}
try {
  for (const spec of (process.env.RETEST_API === '1' ? [
    { entries: ['apple', 'rain', 'music'], meaning_language: 'zh', scenario: 'story', length: 'short' },
    { entries: ['learn', 'book'], meaning_language: 'en', scenario: 'business', length: 'medium' },
    { entries: ["coup d'etat", 'grape'], meaning_language: 'ja', scenario: 'news', length: 'medium' },
  ] : [])) {
    const context = await browser.newContext();
    const options = await ok(context, '/generation-options');
    const response = await raw(context, '/generations/stream', 'POST', { ...spec, model_id: options.models[0].id });
    expect(response.status()).toBe(200);
    const events = parse(await response.text());
    const result = verify(events, spec.entries, spec.meaning_language);
    const start = events.find(e => e.event === 'generation.started').data;
    const bootstrap = await ok(context, '/bootstrap');
    const discard = await context.request.post(origin + '/api/v1/generations/' + start.run_id + '/discard', {
      data: {}, headers: { origin, 'sec-fetch-site': 'same-origin', 'x-csrf-token': bootstrap.csrf_token, 'x-generation-token': start.generation_token },
    });
    expect(discard.ok()).toBeTruthy();
    results.push({ case: 'API-' + spec.meaning_language, ...result, length: spec.length, result: 'PASS' });
    await context.close();
  }
  for (const kind of ['ordinary', 'preset']) {
    const context = await browser.newContext({locale: 'en-US', viewport: {width: 1440, height: 900}});
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    let entries, language;
    if (kind === 'ordinary') {
      await page.goto(origin + '/create'); await ready(page);
      const options = await ok(context, '/generation-options');
      await page.locator('.creation-model select').selectOption(options.models[0].id);
      await page.locator('.creation-options select').nth(0).selectOption('discussion');
      await page.locator('.creation-options select').nth(1).selectOption('medium');
      await page.locator('.creation-options select').nth(2).selectOption('zh');
      for (const entry of ['apple', 'rain']) {
        await page.getByRole('combobox', {name: t('wordsearch')}).fill(entry);
        await page.getByRole('option', {name: entry, exact: true}).click();
      }
      await page.getByRole('button', {name: t('random'), exact: true}).click();
      await expect(page.locator('.panel > .chips > .chip')).toHaveCount(3);
      entries = (await page.locator('.panel > .chips > .chip').allTextContents()).map(x => x.trim()); language = 'zh';
    } else {
      const id = JSON.parse(readFileSync(new URL('../qa2-022/fixture.json', out))).presetId;
      const detail = await ok(context, '/presets/' + id);
      entries = detail.preset.configuration.entries; language = detail.preset.configuration.meaning_language;
      await page.goto(origin + '/trial/' + id); await ready(page);
      await expect(page.locator('.trial-settings')).toBeVisible();
    }
    const completed = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/generations/stream'));
    await page.getByRole('button', {name: t('start'), exact: true}).click();
    const response = await completed;
    expect(response.status()).toBe(200);
    await expect(page.locator('.generation-result .resource-card')).toHaveCount(entries.length);
    expect(await page.locator('.generation-result .resource-card h3').allTextContents()).toEqual(entries);
    const result = {entries, language, valid: true, assertion: 'Real completed UI cards, marked passage and collect action; SSE stream identity checked in API cases'};
    await expect(page.locator('.app-error')).toHaveCount(0);
    await expect(page.locator('.generation-result .story-text')).toContainText(entries[0]);
    await page.getByRole('button', {name: t('guestcollect'), exact: true}).click();
    await expect(page).toHaveURL(/\/login\?.*claim=1/);
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
    results.push({case: 'UI-' + kind, ...result, collectReachesLogin: true, result: 'PASS'});
    await context.close();
  }
  const response = await fetch('http://127.0.0.1:38084/chat/completions', { method: 'POST', body: JSON.stringify({messages: [
    {role:'system',content:'fixed compatibility probe'}, {role:'user',content:'{}'},
  ]}) });
  const chunks = (await response.text()).split('\n\n').filter(block => block.startsWith('data: {')).map(block => JSON.parse(block.slice(6)));
  const probe = JSON.parse(chunks.map(x => x.choices[0].delta.content).join(''));
  expect(probe).toEqual(probeCandidate(['learn'], 'en', true));
  results.push({case:'compatibility-fixture', result:'PASS', previousProbePreserved: true});
  expect(errors).toEqual([]);
} catch (error) {
  results.push({result:'FAIL', error: error.message}); process.exitCode = 1;
} finally {
  const afterStats = await fetch('http://127.0.0.1:38084/stats').then(r => r.json());
  writeFileSync(new URL('results.json', out), JSON.stringify({results, pageErrors: errors, beforeStats, afterStats,
    realProviderCalls: 0, screenshots: 0, existingUserDataModified: false, finalUserUAT: 'pending'}, null, 2) + '\n');
  console.log(JSON.stringify(results.map(({case:name,result,error}) => ({case:name,result,error}))));
  await browser.close();
}
