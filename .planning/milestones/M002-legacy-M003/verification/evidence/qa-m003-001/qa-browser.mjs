import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../..');
const { chromium } = createRequire(path.join(root, 'frontend/package.json'))('@playwright/test');
const stack = JSON.parse(fs.readFileSync(path.join(here, 'local-stack-public.json'), 'utf8'));
const credentials = JSON.parse(fs.readFileSync(path.join(stack.work, 'env.json'), 'utf8'));
const result = { scope: 'Real Chromium/Nuxt/Go/disposable PostgreSQL with synthetic provider. Automated keyboard/focus, responsive, 200% browser emulation, reduced-motion and publish behavior; no human screen reader or physical device claim.', checks: {}, measurements: {}, pageErrors: [], screenshots: [], failures: [] };
function check(name, pass, detail = null) { result.checks[name] = { pass: !!pass, detail }; if (!pass) result.failures.push(name); }
async function ready(page) { await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true'); }
async function login(page, username, password) {
  await page.goto('/login'); await ready(page);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes('/login'));
}
async function select(page, label, value) {
  const control = page.getByRole('combobox', { name: label });
  const native = control.locator('..').locator('select');
  const option = native.locator(`option[value="${value}"]`);
  const text = (await option.textContent()).trim();
  await control.click();
  await page.locator(`[id="${await control.getAttribute('aria-controls')}"]`).getByRole('option', { name: text, exact: true }).click();
}
async function overflow(page) { return page.evaluate(() => ({ innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth })); }
async function loginCreate(page, username, password, model) {
  await login(page, username, password); await page.goto('/create'); await ready(page);
  const settings = page.locator('details.settings'); if (!(await settings.evaluate(node => node.open))) await settings.locator('summary').click();
  await select(page, 'Model', model); await select(page, 'Style', 'story'); await select(page, 'Length', 'short'); await select(page, 'Explanation language', 'en');
  const search = page.locator('#create-words-search');
  await search.fill('grape'); await page.getByRole('option', { name: 'grape', exact: true }).click();
  await search.fill('young'); await page.getByRole('option', { name: 'young', exact: true }).click();
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: stack.frontend_origin, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => result.pageErrors.push(error.message));

  await loginCreate(page, credentials.BASIC_USERNAME, credentials.BASIC_PASSWORD, stack.models.pass);
  const generate = page.getByRole('button', { name: 'Generate story', exact: true });
  await generate.focus(); await generate.press('Enter');
  await page.waitForSelector('.m003-plan-preview');
  const home = page.getByRole('link', { name: 'Home', exact: true }); await home.focus();
  await page.waitForSelector('.m003-live-draft');
  const homeKeptFocus = await home.evaluate(node => document.activeElement === node);
  const live = await page.evaluate(() => {
    const plan = document.querySelector('.m003-plan-preview'), draft = document.querySelector('.m003-live-draft'), body = document.querySelector('.m003-result-body');
    const pb = plan.getBoundingClientRect(), db = draft.getBoundingClientRect(), bb = body.getBoundingClientRect();
    const animations = [...document.querySelectorAll('.m003-generation-paper *')].map(node => ({ node: node.className, name: getComputedStyle(node).animationName, duration: getComputedStyle(node).animationDuration })).filter(value => value.name !== 'none' && value.duration !== '0s');
    return { activeTag: document.activeElement?.tagName, activeHref: document.activeElement?.getAttribute('href'), planWidth: pb.width, draftWidth: db.width, planLeftGap: pb.left - bb.left, planRightGap: bb.right - pb.right, draftLeftGap: db.left - bb.left, draftRightGap: bb.right - db.right, animations, writingDots: document.querySelectorAll('.m003-writing i').length, scenePresent: !!document.querySelector('.m003-plan-scene'), wordUseCount: document.querySelectorAll('.m003-plan-use').length, planAndDraft: !!plan && !!draft };
  });
  result.measurements.createLive = live;
  check('create_plan_and_draft_coexist', live.planAndDraft);
  check('create_focus_not_stolen_during_stream', homeKeptFocus, { expected: 'Home link retains focus after Plan-to-draft mutation', actual: { tag: live.activeTag, href: live.activeHref } });
  check('create_centered_760_reading_column', live.planWidth <= 760.5 && live.draftWidth <= 760.5 && Math.abs(live.planLeftGap - live.planRightGap) <= 2 && Math.abs(live.draftLeftGap - live.draftRightGap) <= 2, live);
  check('reduced_motion_stops_affected_animations', live.animations.length === 0, live.animations);
  check('approved_writing_indicator_present', live.writingDots === 6, { expected: 'three dots in Plan and three in live draft', actual: live.writingDots });
  check('plan_scene_and_word_uses_visible', live.scenePresent && live.wordUseCount >= 2, { scenePresent: live.scenePresent, wordUseCount: live.wordUseCount });
  result.screenshots.push('09-create-plan-draft-final.png');
  await page.waitForSelector('.m003-final-result');
  check('valid_clears_temporary_plan_and_draft', await page.locator('.m003-plan-preview,.m003-live-draft').count() === 0);
  for (const width of [390, 320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); result.measurements['createOverflow' + width] = await overflow(page); check('create_no_horizontal_overflow_' + width, !result.measurements['createOverflow' + width].overflow, result.measurements['createOverflow' + width]); }

  await context.clearCookies(); await login(page, credentials.ADMIN_USERNAME, credentials.ADMIN_PASSWORD); await page.goto('/admin/plans'); await ready(page);
  await page.getByRole('button', { name: 'Pro', exact: true }).click();
  const native = await page.locator('#service-settings input[readonly]').inputValue();
  check('plans_native_policy_readonly_2', native === '2' && await page.locator('#service-settings input[readonly]').isDisabled(), native);
  const limit = page.locator('#content-repair-limit'); await limit.focus(); await limit.fill('1');
  await page.locator('form.panel').getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.locator('#plan-impact[open]'); await dialog.waitFor();
  const impactText = await dialog.textContent();
  check('plans_impact_separates_base_and_trial', /base|basic/i.test(impactText) && /trial/i.test(impactText) && !/total|in all/i.test(impactText), impactText.replace(/\s+/g, ' ').trim());
  await limit.evaluate(node => { node.value = '0'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => !document.querySelector('#plan-impact')?.open);
  const impactInvalidation = { dialogCount: await dialog.count(), visible: await dialog.isVisible(), value: await limit.inputValue() };
  check('plans_edit_invalidates_open_impact', !impactInvalidation.visible && impactInvalidation.value === '0', impactInvalidation);
  for (const width of [390, 320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); result.measurements['plansOverflow' + width] = await overflow(page); check('plans_no_horizontal_overflow_' + width, !result.measurements['plansOverflow' + width].overflow, result.measurements['plansOverflow' + width]); }
  await page.setViewportSize({ width: 390, height: 900 }); result.screenshots.push('10-plans-390.png');

  await page.goto('/admin/presets'); await ready(page); await page.getByRole('button', { name: 'New preset', exact: true }).click();
  await page.getByLabel('Preset title', { exact: true }).fill('M003 independent QA Q02');
  const presetSearch = page.locator('#preset-words-search'); await presetSearch.fill('grape'); await page.getByRole('option', { name: 'grape', exact: true }).click();
  await select(page, 'Model', stack.models.q02); await select(page, 'Style', 'story'); await select(page, 'Length', 'short'); await select(page, 'Explanation language', 'en');
  const basicRadio = page.getByRole('radio', { name: /Essential generation/i }); await basicRadio.focus(); await basicRadio.press('ArrowDown');
  const enhancedRadio = page.getByRole('radio', { name: /Enhanced generation/i });
  check('preset_keyboard_selects_enhanced_mode', await enhancedRadio.isChecked());
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await page.waitForSelector('#planning-preview'); await page.waitForSelector('#preview-result .story-text');
  check('preset_plan_and_draft_coexist', await page.locator('#planning-preview').isVisible() && await page.locator('#preview-result .story-text').isVisible());
  await page.waitForSelector('[data-testid="preset-q02-notice"]');
  check('preset_q02_usage_unknown_distinct_from_zero', /Unknown/.test(await page.locator('.usage-note').textContent()) && !/0\s*(?:credits|calls)/i.test(await page.locator('.usage-note').textContent()), await page.locator('.usage-note').textContent());
  const presetShot = path.join(here, '11-preset-q02-390.png'); await page.screenshot({ path: presetShot, fullPage: true }); result.screenshots.push(path.basename(presetShot));
  await page.getByRole('button', { name: 'Publish preset', exact: true }).click();
  const confirm = page.locator('#preset-confirm[open]'); await confirm.waitFor();
  const confirmButton = confirm.getByRole('button', { name: 'Confirm', exact: true });
  check('preset_q02_publish_requires_confirmation', await confirmButton.isDisabled());
  await confirm.getByRole('checkbox').check(); check('preset_q02_confirm_enables_publish', !(await confirmButton.isDisabled())); await confirmButton.click();
  await page.waitForTimeout(400);
  check('preset_q02_notice_persists_after_publish', await page.locator('[data-testid="preset-q02-notice"]').isVisible());
  check('preset_publish_outcome_visible', await page.getByRole('button', { name: 'Unlist', exact: true }).isVisible());
  for (const width of [320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); result.measurements['presetsOverflow' + width] = await overflow(page); check('presets_no_horizontal_overflow_' + width, !result.measurements['presetsOverflow' + width].overflow, result.measurements['presetsOverflow' + width]); }

  await context.close();
  const zoomContext = await browser.newContext({ viewport: { width: 720, height: 900 }, screen: { width: 1440, height: 1800 }, deviceScaleFactor: 2, baseURL: stack.frontend_origin, reducedMotion: 'reduce' });
  const zoom = await zoomContext.newPage(); zoom.on('pageerror', error => result.pageErrors.push(error.message)); await login(zoom, credentials.ADMIN_USERNAME, credentials.ADMIN_PASSWORD); await zoom.goto('/admin/plans'); await ready(zoom); await zoom.getByRole('button', { name: 'Pro', exact: true }).click();
  result.measurements.zoom200 = await overflow(zoom); check('plans_200_percent_no_horizontal_overflow', !result.measurements.zoom200.overflow, result.measurements.zoom200);
  const zoomTargets = await zoom.locator('#service-settings input:not([type="checkbox"]), form.panel button').evaluateAll(nodes => nodes.filter(node => { const s = getComputedStyle(node); return s.display !== 'none' && s.visibility !== 'hidden'; }).map(node => { const box = node.getBoundingClientRect(); return { id: node.id || node.textContent.trim(), width: box.width, height: box.height }; }));
  result.measurements.zoomTargets = zoomTargets; check('affected_action_targets_at_least_44px', zoomTargets.every(value => value.height >= 43.5), zoomTargets);
  const zoomShot = path.join(here, '12-plans-200pct.png'); await zoom.screenshot({ path: zoomShot, fullPage: true }); result.screenshots.push(path.basename(zoomShot)); await zoomContext.close();

  check('no_page_errors', result.pageErrors.length === 0, result.pageErrors);
  result.result = result.failures.length ? 'FAIL' : 'PASS';
} catch (error) {
  result.error = error.stack; result.result = 'ERROR'; result.failures.push('browser_script_completed');
} finally {
  await browser.close(); fs.writeFileSync(path.join(here, 'browser-results-final.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ result: result.result, failures: result.failures, screenshots: result.screenshots })); if (result.result !== 'PASS') process.exitCode = 1;
}
