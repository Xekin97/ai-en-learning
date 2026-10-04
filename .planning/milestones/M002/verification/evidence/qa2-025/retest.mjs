import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const {chromium,webkit,expect}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const origin='http://127.0.0.1:3302',out=new URL('./',import.meta.url),results=[],errors=[];
for(const [engine,width,language,kind] of [[chromium,1440,'zh','ordinary'],[webkit,390,'en','preset']]){
  const b=await engine.launch();try{
    const locale=language==='zh'?'zh-CN':'en-US',t=k=>copy.static[language+'.'+k]??copy.templates[language+'.'+k];
    const context=await b.newContext({viewport:{width,height:900},locale});
    await context.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const preset=JSON.parse(readFileSync(new URL('../qa2-022/fixture.json',out))).presetId;
    await p.goto(origin+(kind==='ordinary'?'/create':'/trial/'+preset));
    await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    if(kind==='ordinary'){
      await p.locator('.creation-model select').selectOption({index:1});
      await p.locator('.creation-options select').nth(2).selectOption('zh');
      await p.getByRole('combobox',{name:t('wordsearch')}).fill('apple');
      await p.getByRole('option',{name:'apple',exact:true}).click();
    }
    await p.getByRole('button',{name:t('start'),exact:true}).click();
    const result=p.locator('[data-region="generation-result"]');
    await expect(result.locator('.study-resources h2')).toHaveText(t('l.resources'));
    await expect(result.locator('.study-resources .resource-grid article')).toHaveCount(kind==='ordinary'?1:3);
    const observations=await result.evaluate(el=>{
      const section=el.querySelector('.study-resources'),style=getComputedStyle(section),hint=section.querySelector('p.muted');
      return {border:style.borderTopWidth,padding:style.paddingTop,margin:style.margin,heading:section.querySelector('h2').textContent,
        hintsMuted:!!hint&&getComputedStyle(hint).color!==getComputedStyle(section.querySelector('p')).color,
        contentBeforeActions:!!section.nextElementSibling?.matches('.actions'),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(observations).toMatchObject({border:'1px',padding:'24px',margin:'30px 0px',hintsMuted:true,contentBeforeActions:true,overflow:false});
    await expect(p.locator('.app-error')).toHaveCount(0);
    await result.getByRole('button',{name:t('l.discard'),exact:true}).click();
    const dialog=p.locator('#generation-confirm');await expect(dialog).toBeVisible();
    const response=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/discard'));
    await dialog.getByRole('button',{name:t('confirm'),exact:true}).click();
    const discarded=await response;expect(discarded.ok()).toBeTruthy();
    await expect(result.locator('.empty')).toBeVisible();await expect(result.locator('.study-resources')).toHaveCount(0);
    await expect(p.getByRole('button',{name:t('start'),exact:true})).toBeEnabled();
    results.push({kind,width,locale,result:'PASS',observations,discardStatus:discarded.status(),idleAndReadyAgain:true});
  }catch(error){results.push({kind,width,result:'FAIL',error:error.message});process.exitCode=1;}
  finally{await b.close();}
}
writeFileSync(new URL('results.json',out),JSON.stringify({results,pageErrors:errors,realAI:0,screenshots:0,existingUserDataReset:false,finalUserUAT:'pending'},null,2)+'\n');
console.log(JSON.stringify(results.map(({kind,width,result,error})=>({kind,width,result,error}))));
