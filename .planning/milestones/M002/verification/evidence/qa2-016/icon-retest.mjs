import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(process.cwd()+'/frontend/package.json');
const {chromium,webkit,expect}=require('@playwright/test');
const {default:AxeBuilder}=require('@axe-core/playwright');
const out=new URL('./',import.meta.url),origin='http://127.0.0.1:3300';
const source=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const asset=JSON.parse(readFileSync('.planning/milestones/M002/design/prototype/assets/lucide.json'));
const t=(lang,key)=>source.static[lang+'.'+key]??source.templates[lang+'.'+key];
const results=[],samples=[],runtime=[],requests=[];
let current='setup';
const record=()=>writeFileSync(new URL('results.json',out),JSON.stringify({version:'M002-QA-16',results,samples,runtime,requests,localProviderCalls:0,realProviderCalls:0},null,2)+'\n');
const inspect=async button=>button.evaluate(el=>{
 const svg=el.querySelector('svg'),s=getComputedStyle(svg),b=getComputedStyle(el),sr=svg.getBoundingClientRect(),br=el.getBoundingClientRect();
 const header=el.closest('.batch-title-header'),title=header.querySelector('h2').getBoundingClientRect();
 return {text:el.textContent.trim(),childTags:[...el.children].map(x=>x.tagName.toLowerCase()),svgCount:el.querySelectorAll('svg').length,paths:[...svg.querySelectorAll('path')].map(x=>x.getAttribute('d')),viewBox:svg.getAttribute('viewBox'),hidden:svg.getAttribute('aria-hidden'),focusable:svg.getAttribute('focusable'),tabindex:svg.getAttribute('tabindex'),nestedFocusTargets:el.querySelectorAll('a,button,input,select,textarea,[tabindex="0"]').length,icon:{width:sr.width,height:sr.height},button:{width:br.width,height:br.height,left:br.left,right:br.right,top:br.top},titleBottom:title.bottom,gap:b.gap,color:s.color,headerDirection:getComputedStyle(header).flexDirection,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};
});
for(const lang of ['zh','en'])for(const width of [360,1440]){
 const engine=width===360?webkit:chromium;current=`I16-${lang}-${width}`;
 const browser=await engine.launch(),options={viewport:{width,height:900},deviceScaleFactor:1,locale:lang==='zh'?'zh-CN':'en-US',reducedMotion:'reduce'};
 const ctx=await browser.newContext(options),protoCtx=await browser.newContext(options);
 const page=await ctx.newPage(),proto=await protoCtx.newPage(),sample={id:current,engine:engine.name(),version:browser.version(),targets:[]},startRuntime=runtime.length;
 for(const [label,p] of [['production',page],['prototype',proto]]){
  p.setDefaultTimeout(10000);
  p.on('pageerror',e=>runtime.push({id:current,target:label,type:'pageerror',message:e.message}));
  p.on('console',m=>{if(['warning','error'].includes(m.type()))runtime.push({id:current,target:label,type:m.type(),message:m.text()});});
 }
 page.on('request',request=>{if(request.method()==='PATCH'&&request.url().endsWith('/me/batches/batch-e2e'))requests.push({id:current,body:request.postDataJSON()});});
 try{
  await ctx.addCookies([{name:'wordweave_session',value:'learner',url:origin},{name:'wordweave_ui_locale',value:options.locale,url:origin}]);
  await page.goto(origin+'/library/batch-e2e');await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  await proto.goto(`http://127.0.0.1:3332/prototype/index.html?page=batch&batch=b1&lang=${lang}`);
  for(const [target,p] of [['production',page],['prototype',proto]]){
   const button=p.getByRole('button',{name:t(lang,'l.title.edit'),exact:true});await expect(button).toBeVisible();
   const title=await p.locator('#saved-batch-title').innerText(),svg=button.locator('svg');
   await expect(svg).toHaveCount(1);await expect(svg).toBeVisible();
   await svg.click();await expect(p.getByLabel(t(lang,'l.title.label'),{exact:true})).toBeFocused();
   await p.locator('#batch-title').fill('未保存的输入 / not saved');
   await p.getByRole('button',{name:t(lang,'cancel'),exact:true}).click();await expect(p.locator('#saved-batch-title')).toHaveText(title);
   // Traverse out of the existing button: no additional SVG tab stop.
   await button.focus();await p.keyboard.press(engine===webkit?'Alt+Tab':'Tab');
   expect(await p.evaluate(()=>document.activeElement?.tagName.toLowerCase())).not.toBe('svg');
   // Button background and the SVG must reach the same editor.
   await button.click({position:{x:4,y:4}});await expect(p.locator('#batch-title')).toBeFocused();
   await p.getByRole('button',{name:t(lang,'cancel'),exact:true}).click();
   await button.focus();await p.keyboard.press('Space');await expect(p.locator('#batch-title')).toBeFocused();
   const common=lang==='zh'?'我的学习札记':'My learning notes';await p.locator('#batch-title').fill(common);
   if(target==='production'){
    const response=p.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/me/batches/batch-e2e'));
    await p.locator('#batch-title').press('Enter');expect((await response).status()).toBe(200);
   }else await p.getByRole('button',{name:t(lang,'l.title.save'),exact:true}).click();
   await expect(p.locator('#saved-batch-title')).toHaveText(common);await p.mouse.move(0,0);await p.evaluate(()=>document.fonts.ready);
   const actual=await inspect(button);
   expect(actual).toMatchObject({text:t(lang,'l.title.edit'),childTags:['svg'],svgCount:1,viewBox:'0 0 24 24',hidden:'true',focusable:'false',tabindex:null,nestedFocusTargets:0,icon:{width:18,height:18},gap:'8px',headerDirection:width===360?'column':'row'});
   expect(actual.scrollWidth).toBeLessThanOrEqual(width);expect(actual.button.right).toBeLessThanOrEqual(width);expect(actual.button.left).toBeGreaterThanOrEqual(0);
   if(width===360)expect(actual.button.top).toBeGreaterThanOrEqual(actual.titleBottom);
   const approvedPaths=[...asset.icons.pencil.body.matchAll(/\sd="([^"]+)"/g)].map(x=>x[1]);expect(actual.paths).toEqual(approvedPaths);
   const aria=await button.ariaSnapshot();expect(aria).toBe(`- button "${t(lang,'l.title.edit')}":`+'\n'+`  - text: ${t(lang,'l.title.edit')}`);
   const axe=await new AxeBuilder({page:p}).include('.batch-title-header').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   expect(axe.violations).toEqual([]);
   sample.targets.push({target,actual,aria,axe:{violations:axe.violations,incomplete:axe.incomplete.map(x=>x.id),passes:axe.passes.length}});
   await p.locator('.batch-title-header').screenshot({path:new URL(current+'-'+target+'.png',out).pathname});
  }
  const [actual,expected]=sample.targets.map(x=>x.actual);
  for(const key of ['paths','color','icon','gap','headerDirection'])expect(actual[key]).toEqual(expected[key]);
  expect(Math.abs(actual.button.width-expected.button.width)).toBeLessThanOrEqual(1);expect(actual.button.height).toBe(expected.button.height);
  expect(requests.filter(x=>x.id===current)).toHaveLength(1);expect(Object.keys(requests.find(x=>x.id===current).body).sort()).toEqual(['expected_title_revision','title']);
  expect(runtime.slice(startRuntime)).toEqual([]);samples.push(sample);results.push({id:current,result:'PASS',finding:'QA2-F16',scope:'title-edit ICON10; SVG/background/keyboard; cancel/save; layout/accessibility'});
 }catch(error){results.push({id:current,result:'FAIL',error:String(error.stack??error)});samples.push(sample);await page.screenshot({path:new URL(current+'-failed.png',out).pathname}).catch(()=>{});}
 finally{await browser.close();record();}
}
console.log(JSON.stringify({passed:results.filter(x=>x.result==='PASS').length,failed:results.filter(x=>x.result==='FAIL').length,runtimeEvents:runtime.length}));
if(results.some(x=>x.result==='FAIL'))process.exitCode=1;
