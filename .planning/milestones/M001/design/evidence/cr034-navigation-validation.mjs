import { chromium } from '../../../../../frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)), output=join(dir,'cr034-final');
mkdirSync(output,{recursive:true});
const checks=[],errors=[],base='http://127.0.0.1:6010/prototype/';
const check=(name,pass,actual)=>checks.push({name,pass:Boolean(pass),...(pass?{}:{actual})});
const browser=await chromium.launch();
const url=(id,locale,state='default')=>base+'?'+new URLSearchParams({page:id,locale,state,role:'visitor'});
try {
  for(const width of [390,1440]) for(const locale of ['zh-CN','en-US']) {
    const ctx=await browser.newContext({locale,viewport:{width,height:1000}});
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    const label=width+' '+locale;
    for(const id of ['PAGE-005','PAGE-007']) {
      const expected=locale==='zh-CN' ? (id==='PAGE-007'?'登录后打开“复习”':'登录后打开“学习记录”') : 'Sign in to open '+(id==='PAGE-007'?'Review':'Library');
      await page.goto(url(id,locale));
      const gate=await page.locator('main').innerText();
      check(label+' direct '+id+' exact title',await page.locator('main h1').innerText()===expected);
      await page.goto(url('PAGE-001',locale));
      await page.locator('.hero-actions [data-value="'+id+'"]').click();
      check(label+' hero '+id+' matches',await page.locator('main').innerText()===gate);
      await page.goto(url('PAGE-001',locale));
      if(width<721){await page.locator('[data-action="mobile-menu"]').click();await page.locator('dialog [data-value="'+id+'"]').click();}
      else await page.locator('#app-header [data-value="'+id+'"]').click();
      check(label+' header/mobile '+id+' matches',await page.locator('main').innerText()===gate);
      await page.locator('main [data-value="PAGE-003"]').click();
      await page.locator('.auth-alt [data-value="PAGE-002"]').click();
      check(label+' register retains '+id,new URL(page.url()).searchParams.get('returnPage')===id);
      await page.locator('[data-action="auth-submit"]').click();
      check(label+' auth returns '+id+' without starting',new URL(page.url()).searchParams.get('page')===id && await page.locator('#review-answer-1').count()===0);
      await page.evaluate(()=>localStorage.clear());
    }
    await page.goto(url('PAGE-007',locale));
    const labels=await page.locator('#prototype-state option').allTextContents();
    check(label+' ten selectable states',labels.length===10);
    if(locale==='en-US')check(label+' state labels fully English',labels.every(t=>!/[\u3400-\u9fff]/.test(t)),labels);
    await ctx.close();
  }
  check('no browser exceptions',errors.length===0,errors);
} catch(error) {check('execution complete',false,String(error.stack));}
finally {
  await browser.close();
  const lum=hex=>{const c=hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const ratio=(fg,bg)=>{const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  const contrasts=['#fffdf8','#f4efe5','#eee8dc'].map(bg=>({foreground:'#596c6b',background:bg,ratio:ratio('#596c6b',bg)}));
  check('faint contrast on three documented surfaces',contrasts.every(c=>c.ratio>=4.5),contrasts);
  const files=['../theme.css','../prototype/index.html','../prototype/app.js','../prototype/i18n.js','../prototype/review-range.js'];
  const sources=Object.fromEntries(files.map(file=>[file,{sha256:createHash('sha256').update(readFileSync(join(dir,file))).digest('hex')}]));
  const result={at:new Date().toISOString(),scope:'Current design source navigation and localization supplement only',passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks,errors,contrasts,sources};
  writeFileSync(join(output,'navigation-final-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:checks.filter(c=>!c.pass)},null,2));if(result.failed)process.exitCode=1;
}
