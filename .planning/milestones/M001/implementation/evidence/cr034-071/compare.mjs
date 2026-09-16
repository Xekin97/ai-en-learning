import { chromium, webkit, expect } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { origin, dir, login } from './real-stack.mjs';
const design='http://127.0.0.1:6010/prototype/';
const widths=[320,390,560,561,720,900,901,960,1024,1079,1080,1081,1280,1440];
const boundary=[901,1080,1081],results=[],axe=[],runtimeErrors=[];
const rules={
 '.range-editor':['gridTemplateColumns','gap'],
 '.range-editor .card-header':['padding'],
 '.range-editor .card-body':['padding'],
 '.range-editor .card-footer':['padding'],
 '.date-range':['gap','gridTemplateColumns'],
 '#review-start':['height','width','padding','fontFamily','fontSize','backgroundColor','borderRadius'],
 '#review-end':['height','width','padding','fontFamily','fontSize','backgroundColor','borderRadius'],
 '.range-count':['height','width','minHeight','flexDirection','gap','backgroundColor'],
 '.range-count .count-number':['fontSize','fontFamily','color'],
 '.range-count .helper':['fontSize','lineHeight','color','margin'],
 '.range-feedback':['marginTop'],
};
const problem={type:'about:blank',title:'Internal server error',status:500,code:'internal_error',detail:'Synthetic preview failure.',request_id:'dev071-preview-failure'};
async function metrics(page,extra){
 return page.evaluate(rules=>Object.fromEntries(Object.entries(rules).map(([selector,keys])=>{
  const n=document.querySelector(selector);if(!n)throw Error('Missing '+selector);
  const style=getComputedStyle(n);return [selector,Object.fromEntries(keys.map(key=>[key,style[key]]))];
 })),{...rules,...extra});
}
async function geometry(page){
 return page.evaluate(()=>{
  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,inputs:[...document.querySelectorAll('.date-range input')].map(rect),fields:[...document.querySelectorAll('.date-range .field')].map(n=>({rect:rect(n),margin:getComputedStyle(n).marginTop})),card:rect(document.querySelector('.range-editor .card')),count:rect(document.querySelector('.range-count'))};
 });
}
let fatal=null;
try{
 for(const [type,engine]of [[chromium,'chromium'],[webkit,'webkit']]){
  const browser=await type.launch();
  try{
   for(const locale of ['en-US','zh-CN']){
    const context=await browser.newContext({locale,timezoneId:'Asia/Shanghai'});await login(context,'dev071_empty',locale);
    const designContext=await browser.newContext({locale,timezoneId:'Asia/Shanghai'});
    await designContext.addInitScript(()=>localStorage.clear());
    const app=await context.newPage(),prototype=await designContext.newPage();
    await app.clock.setFixedTime(new Date('2026-09-06T04:00:00Z'));
    await prototype.clock.setFixedTime(new Date('2026-09-06T04:00:00Z'));
    for(const [p,side]of [[app,'app'],[prototype,'prototype']]){
     p.on('pageerror',e=>runtimeErrors.push({engine,locale,side,error:e.message}));
     p.on('console',m=>{if(/hydration.*mismatch/i.test(m.text()))runtimeErrors.push({engine,locale,side,error:m.text()});});
    }
    let mode='empty';
    await app.route('**/me/review-range/preview?*',async route=>{
     if(mode==='error')await route.fulfill({status:500,contentType:'application/problem+json',body:JSON.stringify(problem)});
     else await route.continue();
    });
    for(const width of engine==='chromium'?widths:boundary){
     await app.setViewportSize({width,height:1000});await prototype.setViewportSize({width,height:1000});
     for(const state of ['empty','invalid','error']){
      const item={engine,locale,width,state,result:'PASS',diff:[]};
      try{
       mode=state;await app.goto(origin+'/review');
       if(state==='invalid'){await expect(app.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');await app.locator('#review-start').fill('');}
       await expect(app.locator('.range-editor')).toHaveAttribute('data-range-preview',state==='error'?'failed':state);
       await prototype.goto(design+'?page=PAGE-007&role=learner&locale='+locale+'&state='+({empty:'empty-library',invalid:'date-missing',error:'preview-error'}[state]));
       await prototype.locator('.range-editor').waitFor();
       const extra=state==='empty'?{'.range-feedback .empty-state':['padding','minHeight','backgroundColor'],'.range-feedback h2':['fontSize','color'],'.range-feedback .inline-actions':['gap','marginTop','flexDirection']}
         :state==='error'?{'.range-feedback .notice':['padding','gap','color','backgroundColor'],'.range-feedback .notice-title':['fontSize','fontWeight','color']}:{};
       item.actual=await metrics(app,extra);item.expected=await metrics(prototype,extra);
       for(const [selector,props]of Object.entries(item.expected))for(const [key,value]of Object.entries(props))if(item.actual[selector][key]!==value)item.diff.push({selector,key,actual:item.actual[selector][key],expected:value});
       item.copy={};
       for(const selector of ['.range-editor .card-header','.range-editor .card-footer','.range-count','.range-feedback','#range-date-error']){
        const text=async p=>(await p.locator(selector).innerText()).replace(/\s+/g,' ').trim();
        const actual=await text(app),expected=await text(prototype);item.copy[selector]={actual,expected};if(actual!==expected)item.diff.push({selector,key:'copy',actual,expected});
       }
       const g=await geometry(app);item.geometry=g;
       expect(g.overflow).toBe(false);expect(g.inputs.map(x=>x.height)).toEqual([44,44]);expect(g.inputs[0].width).toBe(g.inputs[1].width);
       expect(g.fields.map(x=>x.margin)).toEqual(['0px','0px']);
       if(width>560)expect(g.inputs[0].y).toBe(g.inputs[1].y);else expect(g.inputs[1].y).toBeGreaterThan(g.inputs[0].bottom);
       if(width<=1080){expect(g.count.y-g.card.bottom).toBe(24);expect(g.count.height).toBe(96);expect(g.count.width).toBe(g.card.width);}
       else{expect(g.count.width).toBe(320);expect(g.count.y).toBe(g.card.y);}
       await expect(app.locator('.range-editor button[type=submit]')).toBeDisabled();
       if(width<=560){const row=app.locator('.range-feedback .inline-actions');if(await row.count())expect((await row.locator('a').first().boundingBox()).width).toBe((await row.boundingBox()).width);}
       if(boundary.includes(width)){
        const result=await new AxeBuilder({page:app}).include('main').analyze();const violations=result.violations.filter(v=>['serious','critical'].includes(v.impact));
        axe.push({engine,locale,width,state,result:violations.length?'FAIL':'PASS',violations});if(violations.length)item.diff.push({kind:'axe',violations});
       }
      }catch(error){item.diff.push({kind:'assertion-or-runtime',message:String(error.stack||error)});}
      if(item.diff.length)item.result='FAIL';
      const capture=item.diff.length||width===1080||(state==='empty'&&[390,901,1081,1440].includes(width));
      if(capture){
       item.screenshots={};for(const [p,side]of [[app,'app'],[prototype,'design']]){
        const file=side+'-'+engine+'-'+locale+'-'+width+'-'+state+'.png';
        try{await p.screenshot({path:join(dir,file),fullPage:true});item.screenshots[side]=file;}catch(error){item.screenshots[side+'Error']=String(error);}
       }
      }
      results.push(item);
     }
     console.log(JSON.stringify({progress:engine,locale,width,cases:results.length,failed:results.filter(x=>x.result==='FAIL').length}));
    }
    await context.close();await designContext.close();
   }
  }finally{await browser.close();}
 }
}catch(error){fatal=String(error.stack||error);}
const output={at:new Date().toISOString(),scope:'Fresh production frontend + real API on isolated 6101 compared with approved live prototype 6010. No frozen production metrics used.',engines:['chromium','webkit'],widths,counts:{cases:results.length,passed:results.filter(x=>x.result==='PASS').length,failed:results.filter(x=>x.result==='FAIL').length,axe:axe.length,axeFailed:axe.filter(x=>x.result==='FAIL').length},fatal,runtimeErrors,results,axe};
writeFileSync(join(dir,'comparison-results.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({counts:output.counts,fatal,runtimeErrors}));
if(fatal||runtimeErrors.length||output.counts.failed||output.counts.axeFailed)process.exitCode=1;
