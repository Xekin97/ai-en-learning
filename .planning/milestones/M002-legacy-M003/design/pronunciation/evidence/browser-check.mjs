import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const {chromium}=playwright;
const base='http://127.0.0.1:4175/M003/design/pronunciation';
const dir=path.dirname(new URL(import.meta.url).pathname);
const report={version:'M003-UI-14',mode:'requirements acceptance for design prototype/formal design',provider_calls:0,checks:[],screenshots:[],console_errors:[],page_errors:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const contexts=[];
async function open(url,viewport={width:1440,height:1050},options={}) {
  const context=await browser.newContext({viewport,reducedMotion:options.reducedMotion});contexts.push(context);
  const page=await context.newPage();
  page.on('pageerror',error=>report.page_errors.push(`${url}: ${String(error)}`));
  page.on('console',message=>{if(message.type()==='error')report.console_errors.push(`${url}: ${message.text()}`)});
  await page.goto(url,{waitUntil:'networkidle'});
  return page;
}
async function shot(page,name) { await page.screenshot({path:path.join(dir,name),fullPage:true});report.screenshots.push(name); }
const overflow=page=>page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth));

try {
  const prototype=await open(`${base}/prototype/?lang=zh&scenario=dictionary`);
  const purpose={title:await prototype.locator('h1').innerText(),rows:await prototype.locator('[data-pron-item]').count(),formalLink:await prototype.locator('a[href*="formal"]').count(),fullProductNav:await prototype.locator('.topbar').count()};
  record('prototype-is-independent-interaction-lab',purpose.rows===3&&purpose.formalLink===1&&purpose.fullProductNav===0,purpose);
  const first=prototype.locator('[data-pron-item]').nth(0).locator('[data-pron-play]');
  const second=prototype.locator('[data-pron-item]').nth(1).locator('[data-pron-play]');
  await first.click();await prototype.waitForTimeout(120);await second.click();
  const switched={firstState:await first.getAttribute('data-play-state'),firstStatus:await prototype.locator('[data-pron-item]').nth(0).locator('.pron-status-slot').innerText(),secondState:await second.getAttribute('data-play-state')};
  await prototype.waitForTimeout(500);
  switched.secondAfter=await second.getAttribute('data-play-state');
  switched.secondStatus=await prototype.locator('[data-pron-item]').nth(1).locator('.pron-status-slot').innerText();
  record('single-playback-and-late-result-cancel',switched.firstState==='idle'&&switched.firstStatus.includes('已停止')&&switched.secondAfter==='playing'&&switched.secondStatus.includes('浏览器'),switched);
  await shot(prototype,'01-prototype-switch-fallback-desktop-zh.png');

  const accent=await open(`${base}/prototype/?lang=en&scenario=accent&menu=1`);
  const trigger=accent.locator('[data-pron-item]').nth(1).locator('[data-pron-menu-trigger]');
  await trigger.focus();await accent.keyboard.press('Escape');
  const keyboard={expanded:await trigger.getAttribute('aria-expanded'),focused:await trigger.evaluate(node=>node===document.activeElement)};
  await accent.locator('[data-pron-item]').nth(0).locator('[data-pron-play]').focus();await accent.keyboard.press('Enter');await accent.waitForTimeout(500);
  const accentAction=accent.locator('[data-pron-item]').nth(0).locator('[data-pron-available]');
  keyboard.explicitAlternative=await accentAction.count();
  record('keyboard-and-no-silent-accent-substitution',keyboard.expanded==='false'&&keyboard.focused&&keyboard.explicitAlternative===1,keyboard);

  const gesture=await open(`${base}/prototype/?lang=zh&scenario=gesture`);
  const gestureButton=gesture.locator('[data-pron-item]').first().locator('[data-pron-play]');
  await gestureButton.click();await gesture.waitForTimeout(500);
  const again=gesture.locator('[data-pron-item]').first().locator('[data-pron-gesture]');
  const gestureState={explicitAgain:await again.count(),state:await gestureButton.getAttribute('data-play-state')};
  await again.click();await gesture.waitForTimeout(500);gestureState.after=await gestureButton.getAttribute('data-play-state');
  record('gesture-failure-has-explicit-second-click',gestureState.explicitAgain===1&&gestureState.state==='idle'&&gestureState.after==='playing',gestureState);

  const unavailable=await open(`${base}/prototype/?lang=en&scenario=unavailable`);
  await unavailable.locator('[data-pron-item]').first().locator('[data-pron-play]').click();await unavailable.waitForTimeout(500);
  const unavailableState={error:await unavailable.locator('[data-pron-item]').first().locator('[data-pron-play]').getAttribute('data-play-state'),retry:await unavailable.locator('[data-pron-item]').first().locator('[data-pron-retry]').count(),text:await unavailable.locator('[data-pron-item]').first().locator('.pron-status-slot').innerText()};
  record('unavailable-reaches-clear-retryable-terminal-state',unavailableState.error==='error'&&unavailableState.retry===1&&unavailableState.text.includes('temporarily unavailable'),unavailableState);

  const picker=await open(`${base}/formal/?page=picker&lang=zh&scenario=dictionary`);
  const pickerState={region:await picker.locator('#pron-page-401-picker').count(),selectedControls:await picker.locator('.pron-selected-list [data-pron-play]').count(),candidates:await picker.locator('.pron-search-row').count(),candidatePlay:await picker.locator('.pron-search-row [data-pron-play]').count(),candidateAdd:await picker.locator('.pron-search-row .btn').count(),settingsSelects:await picker.locator('.pron-settings select').count(),languageSelect:await picker.locator('.pron-language-switch').count(),idleWorkspace:await picker.locator('.pron-empty').count(),overflow:await overflow(picker),demoOpen:await picker.locator('.pron-demo[open]').count()};
  record('PAGE401-separate-play-add-and-collapsed-demo',pickerState.region===1&&pickerState.selectedControls===6&&pickerState.candidates===4&&pickerState.candidatePlay===4&&pickerState.candidateAdd===4&&pickerState.settingsSelects===4&&pickerState.languageSelect===1&&pickerState.idleWorkspace===1&&pickerState.overflow===0&&pickerState.demoOpen===0,pickerState);
  await shot(picker,'02-formal-picker-desktop-zh.png');

  const plan=await open(`${base}/formal/?page=plan&lang=zh&scenario=dictionary`);
  await plan.locator('#pron-page-402-plan [data-entry="gentle"] [data-pron-play]').click();await plan.waitForTimeout(500);
  const planState={region:await plan.locator('#pron-page-402-plan').count(),entries:await plan.locator('#pron-page-402-plan [data-entry]').count(),playing:await plan.locator('#pron-page-402-plan [data-entry="gentle"] [data-pron-play]').getAttribute('data-play-state'),pickerVisible:await plan.locator('#pron-page-401-picker:visible').count(),overflow:await overflow(plan)};
  record('PAGE402-plan-full-page-and-current-word-play',planState.region===1&&planState.entries===6&&planState.playing==='playing'&&planState.pickerVisible===1&&planState.overflow===0,planState);
  await plan.evaluate(()=>scrollTo(0,0));await shot(plan,'03-formal-plan-playing-desktop-zh.png');

  const mobile=await open(`${base}/formal/?page=result&lang=en&scenario=fallback`,{width:390,height:844});
  await mobile.locator('#pron-page-402-result [data-entry="wander"] [data-pron-play]').click();await mobile.waitForTimeout(500);
  const mobileState={region:await mobile.locator('#pron-page-402-result').count(),entries:await mobile.locator('#pron-page-402-result [data-entry]').count(),source:await mobile.locator('#pron-page-402-result [data-entry="wander"] .pron-status-slot').innerText(),minTarget:await mobile.locator('#pron-page-402-result [data-entry="wander"] [data-pron-play]').evaluate(node=>Math.min(node.getBoundingClientRect().width,node.getBoundingClientRect().height)),menuWordClipped:await mobile.locator('.pron-word-token').filter({hasText:'gentle'}).locator(':scope > span[lang="en"]').evaluate(node=>node.scrollWidth>node.clientWidth),plainWordClipped:await mobile.locator('.pron-word-token').filter({hasText:'curious'}).locator(':scope > span[lang="en"]').evaluate(node=>node.scrollWidth>node.clientWidth),overflow:await overflow(mobile)};
  record('PAGE402-result-mobile-fallback-and-touch',mobileState.region===1&&mobileState.entries===6&&mobileState.source.toLowerCase().includes('browser')&&mobileState.minTarget>=44&&!mobileState.menuWordClipped&&!mobileState.plainWordClipped&&mobileState.overflow===0,mobileState);
  await shot(mobile,'04-formal-result-fallback-mobile-en.png');

  const library=await open(`${base}/formal/?page=library&lang=zh&scenario=accent&menu=1`);
  const libraryState={region:await library.locator('#pron-page-403-library').count(),cards:await library.locator('#pron-page-403-library .resource-grid article').count(),controls:await library.locator('#pron-page-403-library .resource-grid [data-pron-play]').count(),bodyMarks:await library.locator('#pron-page-403-library .story-text mark').count(),menu:await library.locator('#pron-page-403-library [data-entry="gentle"] .pron-menu:not([hidden])').count(),overflow:await overflow(library)};
  record('PAGE403-card-title-controls-without-body-popup',libraryState.region===1&&libraryState.cards===6&&libraryState.controls===6&&libraryState.bodyMarks===6&&libraryState.menu===1&&libraryState.overflow===0,libraryState);
  await shot(library,'05-formal-library-accent-menu-desktop-zh.png');

  const reduced=await open(`${base}/formal/?page=library&lang=en&scenario=dictionary`,{width:390,height:844},{reducedMotion:'reduce'});
  await reduced.locator('#pron-page-403-library [data-entry="wander"] [data-pron-play]').click();await reduced.waitForTimeout(500);
  const reducedState=await reduced.locator('#pron-page-403-library [data-entry="wander"] [data-pron-play]').evaluate(node=>({state:node.dataset.playState,animation:getComputedStyle(node.querySelector('svg')).animationName,overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)}));
  record('reduced-motion-preserves-state-without-pulse',reducedState.state==='playing'&&reducedState.animation==='none'&&reducedState.overflow===0,reducedState);

  const uniqueIds=await picker.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return {total:ids.length,unique:new Set(ids).size,duplicates:ids.filter((id,index)=>ids.indexOf(id)!==index)}});
  record('stable-locators-have-unique-ids',uniqueIds.total===uniqueIds.unique,uniqueIds);
} finally {
  record('browser-console',report.console_errors.length===0&&report.page_errors.length===0,{console_errors:report.console_errors,page_errors:report.page_errors});
  report.summary={total:report.checks.length,passed:report.checks.filter(item=>item.passed).length,failed:report.checks.filter(item=>!item.passed).length};
  await fs.writeFile(path.join(dir,'M003-UI-14-browser.json'),JSON.stringify(report,null,2)+'\n');
  await Promise.all(contexts.map(context=>context.close()));
  await browser.close();
}
if(report.summary.failed) process.exitCode=1;
