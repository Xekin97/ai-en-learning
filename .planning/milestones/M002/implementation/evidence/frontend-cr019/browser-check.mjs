import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const { chromium, webkit, expect } = createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const out=new URL('./',import.meta.url), origin='http://127.0.0.1:3300';
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const text=(lang,key)=>copy.static[lang+'.'+key]??copy.templates[lang+'.'+key];
const results=[],runtime=[],samples=[];
const inspect=async button=>button.evaluate(el=>{
  const svg=el.querySelector('svg'), rect=el.getBoundingClientRect(), ir=svg.getBoundingClientRect();
  return {text:el.textContent.trim(),svgCount:el.querySelectorAll('svg').length,viewBox:svg.getAttribute('viewBox'),path:svg.querySelector('path').getAttribute('d'),hidden:svg.getAttribute('aria-hidden'),focusable:svg.getAttribute('focusable'),tabindex:svg.getAttribute('tabindex'),firstChild:el.firstElementChild.tagName,iconWidth:ir.width,iconHeight:ir.height,buttonWidth:rect.width,buttonHeight:rect.height,gap:getComputedStyle(el).gap,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
});
function flush(){writeFileSync(new URL('browser-results.json',out),JSON.stringify({results,samples,runtime,backend:'existing contract mock; no real Go/DB retest',localProviderCalls:0,realProviderCalls:0},null,2)+'\n');}
for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{
    for(const lang of ['zh','en'])for(const width of [390,1440]){
      const id=`R19-${engine.name()}-${lang}-${width}`, start=runtime.length;
      const options={locale:lang==='zh'?'zh-CN':'en-US',viewport:{width,height:900},deviceScaleFactor:1,reducedMotion:'reduce'};
      const context=await browser.newContext(options),pc=await browser.newContext(options);
      const page=await context.newPage(),proto=await pc.newPage();
      for(const [label,p] of [['production',page],['prototype',proto]]){
        p.setDefaultTimeout(10000);
        p.on('pageerror',e=>runtime.push({id,label,type:'pageerror',message:e.message}));
        p.on('console',msg=>{if(['error','warning'].includes(msg.type()))runtime.push({id,label,type:msg.type(),message:msg.text()});});
      }
      try{
        await context.addCookies([{name:'wordweave_session',value:'learner',url:origin},{name:'wordweave_ui_locale',value:options.locale,url:origin}]);
        await page.goto(origin+'/library/batch-e2e');
        await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
        await proto.goto(`http://127.0.0.1:3332/prototype/index.html?page=batch&batch=b1&lang=${lang}`);
        const sample={id,engineVersion:browser.version(),checks:[]};
        for(const [label,p] of [['production',page],['prototype',proto]]){
          await expect(p.locator('#saved-batch-title')).toBeVisible();
          const button=p.getByRole('button',{name:text(lang,'l.title.edit'),exact:true});
          await expect(button.locator('svg')).toHaveCount(1);
          // Click the SVG itself: the existing button remains the only action target.
          const original=await p.locator('#saved-batch-title').innerText();
          await button.locator('svg').click();
          await expect(p.locator('#batch-title')).toBeFocused();
          await p.locator('#batch-title').fill('Discarded change');
          await p.getByRole('button',{name:text(lang,'cancel'),exact:true}).click();
          await expect(p.locator('#saved-batch-title')).toHaveText(original);
          await button.focus();
          await p.keyboard.press(engine===webkit?'Alt+Tab':'Tab');
          expect(await p.evaluate(()=>document.activeElement?.tagName?.toLowerCase()==='svg')).toBe(false);
          await button.focus();await p.keyboard.press('Enter');
          await expect(p.locator('#batch-title')).toBeFocused();
          const value=lang==='zh'?'我的学习札记':'My learning notes';
          await p.locator('#batch-title').fill(value);
          if(label==='production'){
            const response=p.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/me/batches/batch-e2e'));
            await p.locator('#batch-title').press('Enter');expect((await response).status()).toBe(200);
          }else await p.getByRole('button',{name:text(lang,'l.title.save'),exact:true}).click();
          await expect(p.locator('#saved-batch-title')).toHaveText(value);
          await p.mouse.move(0,0);await p.evaluate(()=>document.fonts.ready);
          const actual=await inspect(button);
          expect(actual).toMatchObject({text:text(lang,'l.title.edit'),svgCount:1,viewBox:'0 0 24 24',hidden:'true',focusable:'false',tabindex:null,firstChild:'svg',iconWidth:18,iconHeight:18,gap:'8px'});
          expect(actual.scrollWidth).toBeLessThanOrEqual(width);
          sample.checks.push({target:label,...actual});
          await p.locator('.batch-title-header').screenshot({path:new URL(id+'-'+label+'.png',out).pathname});
        }
        const [actual,expected]=sample.checks;
        expect(actual.path).toBe(expected.path);
        expect(Math.abs(actual.buttonWidth-expected.buttonWidth)).toBeLessThanOrEqual(1);
        expect(actual.buttonHeight).toBe(expected.buttonHeight);
        expect(runtime.slice(start)).toEqual([]);
        samples.push(sample);results.push({id,result:'PASS',svgClick:true,cancel:true,keyboardEnterAndSave:true,svgNotTabStop:true,prototypeIconAndGeometryMatch:true});
      }catch(error){
        results.push({id,result:'FAIL',error:String(error.stack??error)});
        await page.screenshot({path:new URL(id+'-failed.png',out).pathname}).catch(()=>{});
      }finally{await context.close();await pc.close();flush();}
    }
  }finally{await browser.close();}
}
console.log(JSON.stringify({passed:results.filter(x=>x.result==='PASS').length,failed:results.filter(x=>x.result==='FAIL').length,runtimeEvents:runtime.length}));
if(results.some(x=>x.result==='FAIL'))process.exitCode=1;
