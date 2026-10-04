import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, webkit, expect, start, stop, ok, sql, origin, out, dump, ready, env, instrument } from './harness.mjs';
const {default:AxeBuilder}=createRequire(process.cwd()+'/frontend/package.json')('@axe-core/playwright');
const fixture=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const tr=(lang,key)=>copy.static[lang+'.'+key]??copy.templates[lang+'.'+key];
const results=[],samples=[],runtime=[],browserVersions=[],requests=[];
let action='SETUP',browser,page,proto;
const nonTitle=id=>sql(`SELECT md5((to_jsonb(b)-'title'-'title_revision')::text) FROM wordweave.learning_batches b WHERE id='${id}'`);
const originalTitle=id=>sql(`SELECT title FROM wordweave.learning_batches WHERE id='${id}'`);
const inspect=async p=>p.locator('.batch-title-header').evaluate(el=>{
 const h=el.querySelector('h2'),b=el.querySelector('button'),s=getComputedStyle(h),a=h.getBoundingClientRect(),r=b.getBoundingClientRect();
 return {direction:getComputedStyle(el).flexDirection,fontSize:s.fontSize,lineHeight:s.lineHeight,wrap:s.overflowWrap,title:{x:a.x,y:a.y,width:a.width,height:a.height,bottom:a.bottom},button:{x:r.x,y:r.y,width:r.width,height:r.height},scrollWidth:document.documentElement.scrollWidth,width:innerWidth,titleText:h.textContent,markupNodes:h.children.length};
});
const formInspect=async p=>p.locator('.batch-title-editor').evaluate(el=>{
 const nodes=[el.querySelector('label'),el.querySelector('input'),el.querySelector('.field-help'),...el.querySelectorAll('.actions button')];
 return {fields:nodes.map(n=>({text:n.tagName==='INPUT'?n.value:n.textContent.trim(),tag:n.tagName,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),maxLength:el.querySelector('input').getAttribute('maxlength'),description:el.querySelector('input').getAttribute('aria-describedby'),scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
});
const scan=async (p,selector)=>{
 const r=await new AxeBuilder({page:p}).include(selector).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 return {scope:selector,violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:r.passes.length};
};
async function edit(p,lang){const b=p.getByRole('button',{name:tr(lang,'l.title.edit'),exact:true});await b.focus();await p.keyboard.press('Enter');await expect(p.locator('#batch-title')).toBeFocused();}
async function saved(p,value){await expect(p.locator('#saved-batch-title')).toHaveText(value);}
function flush(){dump('results.json',{results,samples,runtime,requests,browserVersions,localProviderCalls:0,realProviderCalls:0});}
try{
 for(const lang of ['zh','en'])for(const width of [390,1440]){
  action=`UI15-${lang}-${width}`;
  const engine=[390,1440].includes(width)?webkit:chromium;
  browser=await start(engine);browserVersions.push({id:action,engine:engine.name(),version:browser.version()});
  const context=await browser.newContext({locale:lang==='zh'?'zh-CN':'en-US',viewport:{width,height:900},reducedMotion:'reduce'});
  const pc=await browser.newContext({locale:lang==='zh'?'zh-CN':'en-US',viewport:{width,height:900},reducedMotion:'reduce'});
  const batchId=width===360?fixture.legacy.batch:width===390?fixture.siblingA:fixture.normalId;
  const owner=width===360?fixture.legacy.owner:fixture.owner;
  const username=sql(`SELECT username FROM wordweave.accounts WHERE id='${owner}'`);
  const sample={id:action,batchId,kind:width===360?'M001 migrated':width===390?'paused preset-derived':'normal',checks:[],axe:[]};samples.push(sample);
  try{
   await ok(context,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:lang==='zh'?'zh-CN':'en-US'});
   await ok(context,'/me/ui-locale','PUT',{ui_locale:lang==='zh'?'zh-CN':'en-US'});
   const detail=(await ok(context,'/me/batches/'+batchId)).batch;const maxLength=detail.title_max_length;expect(Number.isInteger(maxLength)&&maxLength>=200).toBe(true);sample.titleMaxLength=maxLength;
   const before=nonTitle(batchId);const sharedBefore=originalTitle(fixture.siblingB);
   page=await context.newPage();instrument(page,runtime,()=>action);
   page.on('request',r=>{if(r.method()==='PATCH'&&new URL(r.url()).pathname===`/api/v1/me/batches/${batchId}`)requests.push({id:action,path:new URL(r.url()).pathname,title:r.postDataJSON()?.title});});
   await page.goto(origin+'/library/'+batchId);await ready(page);await expect(page.locator('#saved-batch-title')).toBeVisible();
   proto=await pc.newPage();instrument(proto,runtime,()=>action);
   await proto.goto(`http://127.0.0.1:3391/prototype/index.html?page=batch&batch=b1&lang=${lang}`);await expect(proto.locator('#saved-batch-title')).toBeVisible();
   const short=lang==='zh'?'我的学习札记':'My learning notes';
   const long=Array.from('QA15 <b>literal title</b> '+(lang==='zh'?'把新的单词放进自己的故事里，慢慢建立可以回顾的学习记忆。':'Remembering new words through stories. ')+'WordWithoutSpaces'.repeat(20)).slice(0,maxLength).join('');
   expect(Array.from(long)).toHaveLength(maxLength);
   for(const [titleKind,value] of [['short',short],['long',long]]){
    for(const [label,p] of [['production',page],['prototype',proto]]){
     await edit(p,lang);await p.locator('#batch-title').fill(value);
     if(label==='production'){
      const resp=p.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname===`/api/v1/me/batches/${batchId}`);
      await p.locator('#batch-title').press('Enter');expect((await resp).status()).toBe(200);
     }else await p.getByRole('button',{name:tr(lang,'l.title.save'),exact:true}).click();
     await saved(p,value);
    }
    const actual=await inspect(page),expected=await inspect(proto);
    sample.checks.push({titleKind,actual,prototype:expected});
    for(const m of [actual,expected]){
     expect(m.scrollWidth).toBeLessThanOrEqual(width);expect(m.markupNodes).toBe(0);expect(m.titleText).toBe(value);
     expect(m.title.x).toBeGreaterThanOrEqual(0);expect(m.title.x+m.title.width).toBeLessThanOrEqual(width);
     expect(m.button.width).toBeGreaterThan(0);expect(m.button.x+m.button.width).toBeLessThanOrEqual(width);
     if(width<=560)expect(m.button.y).toBeGreaterThanOrEqual(m.title.bottom);
    }
    for(const key of ['fontSize','lineHeight','wrap','direction'])expect(actual[key]).toBe(expected[key]);
   }
   for(const [label,p] of [['production',page],['prototype',proto]]){
    await p.locator('.batch-title-header').scrollIntoViewIfNeeded();
    sample.axe.push({target:label,state:'long-title',...await scan(p,'.batch-title-header')});
    await p.locator('.batch-title-header').screenshot({path:new URL(action+'-'+label+'-title.png',out).pathname});
    await edit(p,lang);await p.locator('#batch-title').fill('Cancel this edit');
    const form=await formInspect(p);sample[label+'Form']=form;
    expect(form.fields[0].text).toBe(tr(lang,'l.title.label'));expect(form.fields[2].text).toBe(tr(lang,'l.title.hint'));
    expect(form.fields[3].text).toBe(tr(lang,'l.title.save'));expect(form.fields[4].text).toBe(tr(lang,'cancel'));
    expect(form.fields[1].y).toBeLessThan(form.fields[2].y);expect(form.fields[2].y).toBeLessThan(form.fields[3].y);
    expect(form.maxLength).toBeNull();expect(form.description).toContain('batch-title-hint');expect(form.scrollWidth).toBeLessThanOrEqual(width);
    if(width<=560)expect(Math.abs(form.fields[3].y-form.fields[4].y)).toBeLessThanOrEqual(1);
    sample.axe.push({target:label,state:'editing',...await scan(p,'.batch-title-editor')});
    await p.locator('.batch-title-editor').screenshot({path:new URL(action+'-'+label+'-editor.png',out).pathname});
    await p.locator('#batch-title').focus();await p.keyboard.press('Tab');
    sample.keyboardProbe??=[];sample.keyboardProbe.push({target:label,plainTab:await p.evaluate(()=>({tag:document.activeElement.tagName,type:document.activeElement.getAttribute('type'),text:document.activeElement.textContent.trim().slice(0,80)}))});
    await p.locator('#batch-title').focus();await p.keyboard.press('Alt+Tab');await expect(p.getByRole('button',{name:tr(lang,'l.title.save'),exact:true})).toBeFocused();
    await p.keyboard.press('Alt+Tab');await expect(p.locator('.batch-title-editor').getByRole('button',{name:tr(lang,'cancel'),exact:true})).toBeFocused();await p.keyboard.press('Enter');await saved(p,long);
   }
   expect(originalTitle(batchId)).toBe(long);expect(nonTitle(batchId)).toBe(before);expect(originalTitle(fixture.siblingB)).toBe(sharedBefore);
   await page.reload();await ready(page);await saved(page,long);expect(requests.filter(r=>r.id===action)).toHaveLength(2);
   expect(sample.keyboardProbe[0].plainTab.tag).toBe(sample.keyboardProbe[1].plainTab.tag);
   expect(sample.keyboardProbe[0].plainTab.type).toBe(sample.keyboardProbe[1].plainTab.type);
   sample.keyboardCombination='Alt+Tab on macOS WebKit; plain Tab comparison preserved for both prototype and production';
   await page.getByRole('button',{name:tr(lang,'l.single'),exact:true}).click();
   await expect(page.locator('.slot')).toHaveCount(5);const sessionId=new URL(page.url()).pathname.split('/').at(-1);
   const envelope=await ok(context,'/me/review-sessions/'+sessionId);
   expect(JSON.stringify(envelope)).not.toContain('title');
   for(const mode of ['word','overview']){
    if(mode==='overview')await page.getByRole('button',{name:tr(lang,'overview'),exact:true}).click();
    expect(await page.locator('main').innerText()).not.toContain('QA15');
    const names=await page.locator('main [aria-label], main [title]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')+' '+e.getAttribute('title')));
    expect(names.join(' ')).not.toContain('QA15');
   }
   sample.reviewTitleHidden={word:true,overview:true,aria:true,api:true};
   expect(sample.axe.flatMap(s=>s.violations)).toEqual([]);
   expect(runtime.filter(x=>x.action===action)).toEqual([]);
   sample.nonTitleUnchanged=true;sample.siblingUnchanged=true;sample.keyboardSaveAndCancel=true;sample.reloadRetainsTitle=true;
   results.push({id:action,result:'PASS'});
  }catch(error){results.push({id:action,result:'FAIL',error:String(error)});await page?.screenshot({path:new URL(action+'-failed.png',out).pathname}).catch(()=>{});}
  finally{flush();console.log(action,results.at(-1).result,results.at(-1).error??'');await stop(browser);browser=undefined;page=undefined;proto=undefined;}
 }
}finally{await stop(browser);flush();}
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
