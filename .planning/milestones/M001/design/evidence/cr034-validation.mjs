import { chromium, webkit, expect } from '../../../../../frontend/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const output = join(dir, 'cr034-final');
mkdirSync(output, { recursive: true });
const base = process.env.DESIGN_BASE || 'http://127.0.0.1:6010/prototype/';
if (new URL(base).hostname !== '127.0.0.1') throw Error('Only a local design preview is allowed');
const checks = [], errors = [], metrics = [];
const check = (name, pass, actual) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { actual }) });
const states = ['default', 'empty', 'empty-library', 'paused-only', 'resume-empty', 'resume', 'date-error', 'date-missing', 'loading', 'preview-error'];
const toUrl = (state, locale, role = 'learner', page = 'PAGE-007') => base + '?' + new URLSearchParams({ page, state, locale, role });
const browser = await chromium.launch();
async function contextFor(engine, width, locale) {
  const context = await engine.newContext({ locale, timezoneId: 'Asia/Shanghai', viewport: { width, height: width < 721 ? 844 : 1000 } });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-05T04:00:00Z'));
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function status(page, value) { await expect(page.locator('.range-editor')).toHaveAttribute('data-range-preview', value); }
async function fill(page, from, to) {
  await page.locator('#review-start').fill(from);
  await page.locator('#review-end').fill(to);
}
async function geometry(page, name) {
  const data = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.date-range input')];
    const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
    return { inputs: inputs.map(rect), overflow:document.documentElement.scrollWidth > innerWidth,
      margin: inputs.map(i => getComputedStyle(i.closest('.field')).marginTop),
      values:inputs.map(i=>i.value), brand:document.querySelector('.brand-name')?.textContent,
      countHeight:document.querySelector('.range-count').getBoundingClientRect().height,
      countDirection:getComputedStyle(document.querySelector('.range-count')).flexDirection,
      viewport:innerWidth,
      actions:[...document.querySelectorAll('.range-feedback .inline-actions .button')].map(button=>({
        width:button.getBoundingClientRect().width,container:button.parentElement.getBoundingClientRect().width
      })) };
  });
  metrics.push({name, ...data});
  check(name + ' two editable controls', data.inputs.length === 2);
  check(name + ' equal dimensions, 44px', data.inputs.length === 2 && data.inputs.every(i=>i.height === 44) && Math.abs(data.inputs[0].width-data.inputs[1].width)<1, data);
  check(name + ' no overflow / extra margin', !data.overflow && data.margin.every(v=>v === '0px'), data);
  if(data.viewport<=1080) check(name+' compact result strip',data.countHeight<=144 && data.countDirection==='row',data);
  if(data.viewport<=560 && data.actions.length) check(name+' full-width mobile actions',data.actions.every(a=>Math.abs(a.width-a.container)<1),data.actions);
}
async function axe(page, name, scope = 'main') {
  const result = await new AxeBuilder({ page }).include(scope).analyze();
  const violations = result.violations.filter(v => ['serious','critical'].includes(v.impact));
  check(name + ' axe serious/critical', violations.length === 0, violations.map(v => ({ id:v.id, nodes:v.nodes.map(n=>n.target) })));
}
async function recovery(page, label, locale) {
  await page.goto(toUrl('empty',locale)); await status(page,'empty');
  const start = page.locator('#review-start'), end = page.locator('#review-end');
  await page.evaluate(()=>{window.originalDateNodes=[document.getElementById('review-start'),document.getElementById('review-end')];});
  check(label+' initial dates recent seven', await start.inputValue()==='2026-08-30' && await end.inputValue()==='2026-09-05');
  await start.focus(); await start.fill('2026-08-01');
  await status(page,'loading');
  check(label+' loading invalidates start', await page.locator('[data-action="start-review"]').isDisabled());
  check(label+' loading not zero', await page.locator('.count-number').innerText()==='—');
  await status(page,'ready');
  check(label+' older records found', await page.locator('.count-number').innerText()==='2');
  check(label+' focus kept through result', await start.evaluate(el=>el===document.activeElement));
  await fill(page,'2026-08-01','2026-08-02'); await status(page,'empty');
  check(label+' zero disables start', await page.locator('[data-action="start-review"]').isDisabled());
  await page.evaluate(()=>document.querySelector('[data-action="start-review"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  check(label+' programmatic empty action still guarded', new URL(page.url()).searchParams.get('page')==='PAGE-007');
  await fill(page,'2026-08-12','2026-08-16'); await status(page,'ready');
  check(label+' range includes both boundaries', await page.locator('.count-number').innerText()==='2');
  check(label+' inputs never replaced', await page.evaluate(()=>window.originalDateNodes.every(el=>el.isConnected)));
  await fill(page,'2026-08-12','2026-08-12'); await status(page,'ready');
  check(label+' same day valid', await page.locator('.count-number').innerText()==='1');
  await end.fill('2026-08-11'); await status(page,'invalid');
  check(label+' invalid order linked to end', await end.getAttribute('aria-invalid')==='true' && await end.getAttribute('aria-describedby')==='range-date-error');
  await start.fill(''); await status(page,'invalid');
  check(label+' missing date not empty', await page.locator('.count-number').innerText()==='—' && await start.getAttribute('aria-invalid')==='true');
  await fill(page,'2026-08-12','2026-08-16'); await status(page,'ready');
  const next = locale==='zh-CN'?'en-US':'zh-CN';
  await page.locator('[data-locale-select]').first().selectOption(next);
  check(label+' language retains dates and result', await start.inputValue()==='2026-08-12' && await end.inputValue()==='2026-08-16' && await page.locator('.count-number').innerText()==='2');
  check(label+' current brand only', await page.locator('.brand-name').innerText()===(next==='zh-CN'?'词涟':'WordWeave'));
  await page.locator('[data-action="start-review"]').click();
  check(label+' explicit start enters sample only', new URL(page.url()).searchParams.get('page')==='PAGE-008');

  await page.evaluate(()=>localStorage.clear());
  for(const state of ['empty-library','paused-only']) {
    await page.goto(toUrl(state,locale));
    await fill(page,'2026-01-01','2026-12-31'); await status(page,'empty');
    check(label+' '+state+' broad range stays zero',await page.locator('.count-number').innerText()==='0');
  }
  await page.goto(toUrl('preview-error',locale)); await status(page,'error');
  check(label+' failure not empty or zero', await page.locator('.count-number').innerText()==='—' && await page.locator('.range-feedback .empty-state').count()===0);
  const retry=page.locator('[data-action="retry-range-preview"]');
  check(label+' exact retry copy', await retry.innerText()===(locale==='zh-CN'?'重试':'Try again'));
  await retry.focus(); await page.keyboard.press('Enter'); await status(page,'ready');
  check(label+' retry preserves dates and sensible focus', await start.inputValue()==='2026-08-30' && await start.evaluate(el=>el===document.activeElement));
  await page.goto(toUrl('resume-empty',locale));
  const resumeBefore=await page.locator('.range-resume').innerText();
  await fill(page,'2026-08-01','2026-08-02'); await status(page,'empty');
  check(label+' existing progress unaffected by zero', await page.locator('.range-resume').innerText()===resumeBefore);
  await start.fill(''); await status(page,'invalid');
  check(label+' resume remains independently enabled', await page.locator('[data-action="resume-range-review"]').isEnabled());
  await page.locator('[data-action="resume-range-review"]').click();
  check(label+' resume enters existing sample', new URL(page.url()).searchParams.get('page')==='PAGE-008');

  await page.goto(toUrl('default',locale));
  await start.fill('2026-08-01');
  await end.fill('2026-08-02');
  await end.fill('2026-09-05'); await status(page,'ready');
  check(label+' latest range wins', await page.locator('.count-number').innerText()==='5');
  check(label+' feedback has live status', await page.locator('#range-announcement').getAttribute('role')==='status');
  await start.focus(); await page.keyboard.press('Tab');
  check(label+' keyboard stays in date editor', await page.evaluate(()=>Boolean(document.activeElement.closest('.date-range'))));
  await start.fill('2026-08-02');
  await page.locator('.prototype-trigger').click();
  await page.locator('[data-prototype-role="visitor"]').click();
  await page.waitForTimeout(450);
  check(label+' late preview cannot replace visitor gate', await page.locator('.auth-gate').count()===1 && await page.locator('.date-range').count()===0);
}
try {
  for (const width of [320,390,720,1280,1440]) {
    for (const locale of ['zh-CN','en-US']) {
      const {context,page}=await contextFor(browser,width,locale);
      const label=width+'-'+locale;
      for (const state of states) {
        await page.goto(toUrl(state,locale));
        await geometry(page,label+' '+state);
        const expected = ['default','resume'].includes(state)?'ready':['date-error','date-missing'].includes(state)?'invalid':state==='preview-error'?'error':state==='loading'?'loading':'empty';
        await status(page,expected);
        check(label+' '+state+' start state', await page.locator('[data-action="start-review"]').isDisabled() === (expected!=='ready'));
        if (['empty','empty-library','paused-only','resume-empty'].includes(state)) {
          check(label+' '+state+' empty below persistent form', await page.locator('#range-feedback').evaluate(el=>el.getBoundingClientRect().top > document.querySelector('.range-editor').getBoundingClientRect().bottom));
          check(label+' '+state+' no false whole-library claim', await page.locator('#range-feedback h2').innerText()===(locale==='zh-CN'?'这段时间没有可复习的短文':'No stories to review in this range'));
        }
        if ([320,1440].includes(width) && ['empty','date-error','preview-error','resume-empty'].includes(state)) await page.screenshot({path:join(output,state+'-'+label+'.png'),fullPage:true});
        if ([390,1440].includes(width) && ['empty','date-error','preview-error'].includes(state)) await axe(page,label+' '+state);
      }
      for (const id of ['PAGE-005','PAGE-006','PAGE-007','PAGE-008','PAGE-009']) {
        await page.goto(toUrl('default',locale,'visitor',id));
        const title=page.locator('main h1');
        check(label+' '+id+' gate color', await title.evaluate(el=>getComputedStyle(el).color)==='rgb(89, 108, 107)');
        check(label+' '+id+' no private controls', await page.locator('main input,main .date-range,main .batch-row').count()===0);
        check(label+' '+id+' gate no overflow', await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if (id==='PAGE-007') {
          const original=await page.locator('main').innerText();
          await page.locator('.prototype-trigger').click();
          for (const state of states) {
            await page.locator('#prototype-state').selectOption(state);
            check(label+' visitor control '+state+' same gate', await page.locator('main').innerText()===original);
          }
          await page.locator('.prototype-trigger').click();
          if ([390,1440].includes(width)) {await axe(page,label+' guest');await page.screenshot({path:join(output,'guest-'+label+'.png')});}
        }
      }
      await recovery(page,label,locale);
      await context.close();
      console.log('completed '+label);
    }
  }
  // Actual rendering-engine coverage; not a substitute for physical iOS keyboard/AT.
  const safari=await webkit.launch();
  try {
    for (const locale of ['zh-CN','en-US']) {
      const {context,page}=await contextFor(safari,390,locale);
      await recovery(page,'WebKit-390-'+locale,locale);
      await page.goto(toUrl('empty',locale)); await geometry(page,'WebKit-390-'+locale);
      await page.screenshot({path:join(output,'webkit-empty-'+locale+'.png'),fullPage:true});
      await context.close();
    }
  } finally {await safari.close();}
  // Representative consumers of the global token; only inspect affected color properties.
  const {context,page}=await contextFor(browser,1440,'en-US');
  for (const [id,state,role,selector] of [
    ['PAGE-004','ready','learner','.choice-description'],['PAGE-005','default','learner','.stat-label'],
    ['PAGE-008','stage-1','learner','.progress-labels'],['PAGE-101','default','admin','.model-description']
  ]) {
    await page.goto(toUrl(state,'en-US',role,id));
    check(id+' faint consumer synchronized', await page.locator(selector).first().evaluate(el=>getComputedStyle(el).color)==='rgb(89, 108, 107)');
  }
  await page.goto(toUrl('default','en-US','learner','PAGE-009'));
  check('account ink-soft exception kept', await page.locator('.danger-zone .card-subtitle').evaluate(el=>getComputedStyle(el).color)==='rgb(64, 88, 90)');
  await context.close();
  const css=readFileSync(join(dir,'../theme.css'),'utf8');
  check('theme token exact', css.includes('--color-ink-faint: #596c6b;'));
  check('no browser exceptions', errors.length===0,errors);
} catch (error) {
  check('test execution completed',false,String(error.stack));
} finally {
  await browser.close();
  const result={at:new Date().toISOString(),scope:'UI/UX prototype self-check only; no API/UAT/production validation',fixedBrowserTime:'2026-09-05T04:00:00Z',base,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks,metrics,errors};
  writeFileSync(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:checks.filter(c=>!c.pass),errors},null,2));
  if(result.failed)process.exitCode=1;
}
