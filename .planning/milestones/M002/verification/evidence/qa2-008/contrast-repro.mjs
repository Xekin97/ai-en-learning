import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {start,stop,ok,sql,origin,out,dump,ready,env,expect} from './harness.mjs';
const fixture=JSON.parse(readFileSync(new URL('fixture.json',out))),username=sql("SELECT username FROM wordweave.accounts WHERE id='"+fixture.userId+"'"),browser=await start(),samples=[];
const Axe=createRequire(process.cwd()+'/frontend/package.json')('@axe-core/playwright').default;
try{
 for(const [lang,width] of [['zh',1440],['en',1440],['zh',320]]) {
  const c=await browser.newContext({viewport:{width,height:900}});await ok(c,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});await ok(c,'/me/ui-locale','PUT',{ui_locale:lang==='zh'?'zh-CN':'en-US'});
  const p=await c.newPage();await p.goto(origin+'/library');await ready(p);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1200);
  for(const which of ['production','prototype']) {
   if(which==='prototype'){await p.goto('http://127.0.0.1:4186/prototype/?page=library&lang='+lang);await p.waitForTimeout(1200);}
   const geometry=await p.locator('[data-stat="generated"] dt span').evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,font:s.font,fontSize:s.fontSize,parents:[el,el.parentElement,el.parentElement.parentElement,el.closest('.library-page'),el.closest('main')].map(x=>({tag:x.tagName,classes:x.className,opacity:getComputedStyle(x).opacity,background:getComputedStyle(x).backgroundColor,animation:getComputedStyle(x).animationName})),animations:document.getAnimations().map(a=>({playState:a.playState,time:a.currentTime}))}});
   const axe=await new Axe({page:p}).include('.library-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();samples.push({lang,width,which,geometry,violations:axe.violations});await p.screenshot({path:new URL('contrast-'+which+'-'+lang+'-'+width+'.png',out).pathname});
  }
  await c.close();
 }
 dump('contrast-repro.json',{samples});console.log(JSON.stringify(samples.map(x=>({lang:x.lang,width:x.width,which:x.which,geometry:x.geometry,violations:x.violations.map(v=>v.id)})),null,2));
}finally{await stop(browser);}
