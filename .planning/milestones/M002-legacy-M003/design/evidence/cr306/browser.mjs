import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
const { chromium } = playwright;
import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:4174/M003/design/prototype/';
const evidenceDir = path.dirname(new URL(import.meta.url).pathname);
const report = {
  version: 'M003-UI-10',
  checked_at: new Date().toISOString(),
  scope: 'CR-306 complete PAGE-208 model editor plus bounded PAGE-204/216/212 waiting and failure states',
  source_fixtures: '../../technical/fixtures/cr306/index.json',
  checks: [],
  console_errors: [],
  screenshots: [],
};
const record = (name, passed, details={}) => report.checks.push({name, passed, details});
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1050}});
const page = await context.newPage();
page.on('pageerror', error => report.console_errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.console_errors.push(message.text()); });
const goto = async query => page.goto(`${base}?view=formal&rev=ui10&${query}`, {waitUntil:'networkidle'});
const snap = async (name,fullPage=true) => { await page.screenshot({path:path.join(evidenceDir,name),fullPage}); report.screenshots.push(name); };
const layout = () => page.evaluate(() => ({
  overflow: Math.max(0, document.documentElement.scrollWidth-document.documentElement.clientWidth),
  viewport: [innerWidth,innerHeight],
}));

try {
  await goto('page=models&lang=zh&state=edit');
  const desktop = await page.evaluate(() => ({
    providers:document.querySelectorAll('.generic-provider-card').length,
    models:document.querySelectorAll('.generic-provider-models .generic-model-row').length,
    dialog:!!document.querySelector('.m003-model-dialog[open]'),
    customLabel:document.querySelector('label[for="custom-parameters"]')?.textContent?.trim(),
    customValue:document.querySelector('#custom-parameters')?.value,
    maxTokens:!!document.querySelector('input[type="number"][max="1048576"]'),
    structured:!!document.querySelector('.model-option input[type="checkbox"]'),
    noCall:document.body.textContent.includes('保存只更新配置，不会调用模型'),
  }));
  const desktopLayout = await layout();
  record('page208-complete-desktop', desktop.providers===3 && desktop.models===4 && desktop.dialog && desktop.customValue.includes('reasoning') && desktop.maxTokens && desktop.structured && desktop.noCall && desktopLayout.overflow===0, {...desktop,...desktopLayout});
  await page.locator('#custom-parameters').scrollIntoViewIfNeeded();
  await snap('01-model-editor-1440-zh.png',false);

  await page.locator('#custom-parameters').focus();
  await page.keyboard.press('Tab');
  const keyboard = await page.evaluate(() => ({
    activeTag:document.activeElement?.tagName,
    activeValue:document.activeElement?.value,
    describedBy:document.querySelector('#custom-parameters')?.getAttribute('aria-describedby'),
    hasHelp:!!document.getElementById('custom-parameters-help'),
  }));
  record('json-label-keyboard-help', keyboard.activeTag==='SUMMARY' && keyboard.describedBy?.includes('custom-parameters-help') && keyboard.hasHelp, keyboard);

  await page.locator('#custom-parameters').fill('{"temperature":0.2}');
  await page.locator('[data-action="close-model"]').first().click();
  const confirmVisible = await page.locator('.m003-confirm-dialog[open]').isVisible();
  await page.locator('[data-action="keep-editing"]').click();
  const retained = await page.locator('#custom-parameters').inputValue();
  record('cancel-keep-preserves-json', confirmVisible && retained==='{\"temperature\":0.2}', {confirmVisible,retained});

  await goto('page=models&lang=en&state=error&case=protected_model');
  await page.setViewportSize({width:390,height:844});
  await page.reload({waitUntil:'networkidle'});
  const mobileError = await page.evaluate(() => ({
    value:document.querySelector('#custom-parameters')?.value,
    invalid:document.querySelector('#custom-parameters')?.getAttribute('aria-invalid'),
    alert:document.querySelector('[role="alert"]')?.textContent?.trim(),
    label:document.querySelector('label[for="custom-parameters"]')?.textContent?.trim(),
  }));
  const mobileLayout = await layout();
  record('protected-field-mobile', mobileError.value==='{"model":"other-model"}' && mobileError.invalid==='true' && mobileError.alert?.includes('protected') && mobileError.label==='Custom request parameters (JSON)' && mobileLayout.overflow===0, {...mobileError,...mobileLayout});
  await page.locator('[role="alert"]').scrollIntoViewIfNeeded();
  await snap('02-model-protected-error-390-en.png',false);

  await page.setViewportSize({width:1440,height:1050});
  await goto('page=models&lang=zh&state=probe-ok&tested=1');
  await page.locator('#custom-parameters').fill('{"temperature":0.3}');
  const stale = await page.locator('#model-entry-1 > .notice').textContent();
  record('configuration-change-invalidates-test', stale.includes('已失效'), {stale:stale.trim()});

  await goto('page=models&lang=zh&state=edit');
  await page.locator('#custom-parameters').fill('{"reasoning":{"enabled":false}}');
  await page.locator('[data-action="save-provider"]').click();
  const saved = await page.evaluate(() => ({
    url:location.search,
    status:document.querySelector('[role="status"]')?.textContent?.trim(),
    dialog:!!document.querySelector('.m003-model-dialog[open]'),
  }));
  record('save-success-zero-call-copy', saved.url.includes('state=saved') && saved.status?.includes('此前的连接测试结果已失效') && !saved.dialog, saved);
  await snap('03-model-saved-1440-zh.png');

  await goto('page=models&lang=zh&state=conflict');
  const conflict = await page.locator('[role="alert"]').textContent();
  record('revision-conflict', conflict.includes('保留你正在编辑的参数'), {conflict:conflict.trim()});
  await goto('page=models&lang=zh&state=probe-error');
  const rejected = await page.locator('[role="alert"]').textContent();
  record('explicit-probe-rejected', rejected.includes('配置未保存'), {rejected:rejected.trim()});

  for (const [name,query,expected] of [
    ['generation-timeout','page=create&lang=zh&scenario=cr306-timeout&event=3&status=0','failed'],
    ['generation-cancelled','page=create&lang=en&scenario=cr306-cancelled&event=3&status=0','cancelled'],
    ['generation-pending','page=create&lang=zh&scenario=cr306-settlement_pending&event=3&status=1','pending'],
    ['preview-timeout','page=presets&lang=zh&mode=basic&previewFailure=timeout&event=3&status=0','failed'],
  ]) {
    await goto(query);
    const target = name==='preview-timeout' ? '#preview-result' : '#generation-status';
    const state = await page.locator(target).getAttribute('data-state');
    const body = await page.locator(target).textContent();
    const noReasoning = !body.includes('reasoning') && !body.includes('推理');
    const pageLayout = await layout();
    record(name, state===expected && noReasoning && pageLayout.overflow===0, {state,expected,noReasoning,...pageLayout});
  }
  await goto('page=create&lang=zh&scenario=cr306-timeout&event=3&status=0');
  await snap('04-create-timeout-1440-zh.png');
} finally {
  record('browser-console', report.console_errors.length===0, {errors:report.console_errors});
  report.summary = {
    total:report.checks.length,
    passed:report.checks.filter(item=>item.passed).length,
    failed:report.checks.filter(item=>!item.passed).length,
  };
  await fs.writeFile(path.join(evidenceDir,'M003-UI-10-browser.json'), JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
if (report.summary.failed) process.exitCode=1;
