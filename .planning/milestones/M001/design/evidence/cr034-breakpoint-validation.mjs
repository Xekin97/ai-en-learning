import { chromium, webkit, expect } from '../../../../../frontend/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url));
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw Error('Use before or after; historical evidence is never overwritten.');
const output=join(dir,'cr034-breakpoint-069',phase);
if(existsSync(join(output,'results.json')))throw Error('This run already exists. Keep historical evidence.');
mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:6010/prototype/';
const widths=phase==='before'?[1080]:[320,390,560,561,720,900,901,960,1024,1079,1080,1081,1280,1440];
const states=phase==='before'?['empty-library','date-missing','preview-error']:['default','empty','empty-library','paused-only','resume','resume-empty','date-error','date-missing','loading','preview-error'];
const cases=[],comparisons=[],interactions=[],axeChecks=[],errors=[],privateCalls=[];
const recordedPath=join(dir,'../../implementation/evidence/cr034/comparison-results.json');
const recordedBytes=readFileSync(recordedPath);
const recorded=JSON.parse(recordedBytes).results;
const readMetrics=(page,rules)=>page.evaluate(rules=>Object.fromEntries(Object.entries(rules).map(([selector,properties])=>{
 const element=document.querySelector(selector);if(!element)throw Error('Missing '+selector);
 const css=getComputedStyle(element);return[selector,Object.fromEntries(properties.map(key=>[key,css[key]]))];
})),rules);
const url=(state,locale,role='learner')=>base+'?'+new URLSearchParams({page:'PAGE-007',state,locale,role});
let browser;
try {
 for(const [name,engine] of phase==='before'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]]){
  browser=await engine.launch();
  for(const locale of ['en-US','zh-CN']){
   const context=await browser.newContext({locale,timezoneId:'Asia/Shanghai'});
   const page=await context.newPage();
   await page.clock.setFixedTime(new Date('2026-09-06T04:00:00Z'));
   await page.addInitScript(()=>localStorage.clear());
   page.on('pageerror',e=>errors.push({name,locale,message:e.message}));
   page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))privateCalls.push(r.url());});
   for(const width of widths){
    await page.setViewportSize({width,height:1000});
    for(const state of states){
     await page.goto(url(state,locale));
     await page.locator('.range-editor').waitFor();
     await page.evaluate(()=>document.fonts.ready);
     const actual=await page.evaluate(()=>{
      const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      const grid=document.querySelector('.range-editor'),card=grid.querySelector('.card'),count=grid.querySelector('.range-count');
      return{viewport:innerWidth,grid:rect(grid),card:rect(card),count:rect(count),
       columns:getComputedStyle(grid).gridTemplateColumns,gap:getComputedStyle(grid).gap,
       countDirection:getComputedStyle(count).flexDirection,countMinimum:getComputedStyle(count).minHeight,
       numberSize:getComputedStyle(count.querySelector('.count-number')).fontSize,
       inputs:[...grid.querySelectorAll('input[type=date]')].map(rect),
       fields:[...grid.querySelectorAll('.field')].map(n=>({...rect(n),margin:getComputedStyle(n).marginTop})),
       startDisabled:grid.querySelector('[data-action="start-review"]').disabled,
       status:grid.dataset.rangePreview,overflow:document.documentElement.scrollWidth>innerWidth,
       toolsPosition:getComputedStyle(document.querySelector('.prototype-tools')).position,
       feedback:document.querySelector('.range-feedback').innerText.trim(),
       actions:[...document.querySelectorAll('.range-feedback .inline-actions .button')].map(n=>({width:rect(n).width,parentWidth:rect(n.parentElement).width})),
       resumeVisible:Boolean(document.querySelector('.range-resume')),
       dateErrorHidden:document.getElementById('range-date-error').hidden};
     });
     const failures=[];
     const assert=(id,ok)=>{if(!ok)failures.push(id);};
     const close=(a,b)=>Math.abs(a-b)<1;
     assert('input44Equal',actual.inputs.length===2&&actual.inputs.every(n=>n.height===44)&&close(actual.inputs[0].width,actual.inputs[1].width));
     assert('noOverflow',!actual.overflow);
     assert('fieldMargin0',actual.fields.every(f=>f.margin==='0px'));
     assert('gridGap24',actual.gap==='24px');
     assert('controllerOutsideFlow',actual.toolsPosition==='fixed');
     if(width<=1080){
      assert('stackedGrid',close(actual.card.x,actual.count.x)&&close(actual.count.y-actual.card.bottom,24)&&close(actual.card.width,actual.count.width));
      assert('compactCount96',close(actual.count.height,96)&&actual.countMinimum==='96px'&&actual.countDirection==='row'&&actual.numberSize==='40px');
     }else{
      assert('desktopGrid',close(actual.count.width,320)&&close(actual.count.x-actual.card.x-actual.card.width,24)&&close(actual.card.y,actual.count.y));
     }
     if(width<=560){
      assert('datesStackedGap16',close(actual.fields[1].y-actual.fields[0].bottom,16));
      assert('fullWidthEmptyActions',actual.actions.every(a=>close(a.width,a.parentWidth)));
     }else assert('datesSideBySide',close(actual.inputs[0].y,actual.inputs[1].y));
     const expected=['default','resume'].includes(state)?'ready':['date-error','date-missing'].includes(state)?'invalid':state==='preview-error'?'error':state==='loading'?'loading':'empty';
     assert('stateRetained',actual.status===expected&&actual.startDisabled===(expected!=='ready'));
     assert('resumeUnchanged',actual.resumeVisible===['resume','resume-empty'].includes(state));
     cases.push({engine:name,locale,width,state,pass:failures.length===0,failures,actual});
     if(name==='chromium'&&(phase==='before'||[901,1080,1081].includes(width))&&['empty-library','date-missing','preview-error'].includes(state))
      await page.screenshot({path:join(output,name+'-'+locale+'-'+width+'-'+state+'.png'),fullPage:true});
     const priorState={'empty-library':'empty','date-missing':'invalid','preview-error':'error'}[state];
     const prior=name==='chromium'&&recorded.find(r=>r.locale===locale&&r.width===width&&r.state===priorState);
     if(prior){
      const actualStyles=await readMetrics(page,Object.fromEntries(Object.entries(prior.actual).map(([s,v])=>[s,Object.keys(v)])));
      const diffs=[];
      for(const[s,props]of Object.entries(prior.actual))for(const[k,v]of Object.entries(props))if(actualStyles[s][k]!==v)diffs.push({selector:s,property:k,design:actualStyles[s][k],recordedProduction:v});
      comparisons.push({locale,width,state:priorState,pass:diffs.length===0,diffs});
     }
     if(phase==='after'&&[901,1080,1081].includes(width)&&['empty-library','date-missing','preview-error'].includes(state)){
      const result=await new AxeBuilder({page}).include('main').analyze();
      const violations=result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
      axeChecks.push({engine:name,locale,width,state,pass:violations.length===0,violations});
     }
    }
   }
   if(phase==='after'){
    // Resize a live edited form through both breakpoints; it must keep its inputs and draft.
    await page.setViewportSize({width:1081,height:1000});await page.goto(url('empty',locale));
    await page.locator('#review-start').fill('2026-08-01');
    await expect(page.locator('.range-editor')).toHaveAttribute('data-range-preview','ready');
    const node=await page.locator('#review-start').elementHandle();await page.locator('#review-start').focus();
    for(const width of [1080,901,900,1081]){
     await page.setViewportSize({width,height:1000});
     await expect(page.locator('#review-start')).toHaveValue('2026-08-01');
     await expect(page.locator('#review-start')).toBeFocused();
     expect(await page.locator('#review-start').evaluate((n,old)=>n===old,node)).toBe(true);
    }
    await page.locator('#review-end').fill('2026-08-02');await expect(page.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
    await page.locator('#review-end').fill('2026-09-06');await expect(page.locator('.range-editor')).toHaveAttribute('data-range-preview','ready');
    await page.locator('[data-locale-select]').first().selectOption(locale==='en-US'?'zh-CN':'en-US');
    await expect(page.locator('#review-start')).toHaveValue('2026-08-01');await expect(page.locator('.count-number')).toHaveText('2');
    await page.goto(url('preview-error',locale));await page.locator('[data-action="retry-range-preview"]').focus();await page.keyboard.press('Enter');
    await expect(page.locator('.range-editor')).toHaveAttribute('data-range-preview','ready');await expect(page.locator('#review-start')).toBeFocused();
    await page.goto(url('resume-empty',locale));await page.locator('#review-start').fill('');await expect(page.locator('[data-action="resume-range-review"]')).toBeEnabled();
    await page.goto(url('empty-library',locale,'visitor'));await expect(page.locator('.auth-gate')).toBeVisible();await expect(page.locator('.range-editor')).toHaveCount(0);
    interactions.push({engine:name,locale,pass:true,checks:['resize draft/node/focus','empty→ready','language retains draft/count','keyboard retry focus','invalid draft independent resume','visitor gate']});
   }
   await context.close();
   console.log('completed '+phase+' '+name+' '+locale);
  }
  await browser.close();browser=null;
 }
}catch(error){errors.push({execution:String(error.stack)});}
finally{
 if(browser)await browser.close();
 const failed=cases.filter(c=>!c.pass).length,comparisonFailed=comparisons.filter(c=>!c.pass).length;
 const result={at:new Date().toISOString(),phase,scope:'Design prototype self-check only; comparison uses frozen production metrics, not a fresh production run.',
  themeSha256:createHash('sha256').update(readFileSync(join(dir,'../theme.css'))).digest('hex'),
  productionSnapshotSha256:createHash('sha256').update(recordedBytes).digest('hex'),
  counts:{cases:cases.length,passed:cases.length-failed,failed,comparisons:comparisons.length,comparisonFailed,axe:axeChecks.length,axeFailed:axeChecks.filter(c=>!c.pass).length,interactionSuites:interactions.length},
  cases,comparisons,axeChecks,interactions,errors,privateCalls};
 writeFileSync(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({counts:result.counts,errors,privateCalls}));
 if(failed||comparisonFailed||axeChecks.some(c=>!c.pass)||errors.length||privateCalls.length)process.exitCode=1;
}
