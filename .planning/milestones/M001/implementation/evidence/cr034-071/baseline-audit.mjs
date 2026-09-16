import {chromium, expect} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {origin,dir,login} from './real-stack.mjs';
const browser=await chromium.launch(),checks=[];
try{
 for(const locale of ['zh-CN','en-US']){
  const c=await browser.newContext({viewport:{width:1080,height:1000}});
  await c.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);
  const a=await c.newPage(),d=await browser.newPage({viewport:{width:1080,height:1000}});
  await d.addInitScript(()=>localStorage.clear());
  for(const [path,page,state] of [['/review','PAGE-007','default'],['/review/absent','PAGE-008','default'],['/library','PAGE-005','default'],['/library/absent','PAGE-006','default'],['/account','PAGE-009','default']]){
   await a.goto(origin+path);await a.locator('.auth-gate h1').waitFor();
   await d.goto('http://127.0.0.1:6010/prototype/?page='+page+'&state='+state+'&role=visitor&locale='+locale);
   await d.locator('.auth-gate h1').waitFor();
   const actual=await a.locator('.auth-gate h1').evaluate(n=>getComputedStyle(n).color);
   const expected=await d.locator('.auth-gate h1').evaluate(n=>getComputedStyle(n).color);
   expect(actual).toBe('rgb(89, 108, 107)');expect(actual).toBe(expected);
   checks.push({locale,path,actual,expected,result:'PASS'});
  }
  await login(c,'dev071_empty',locale);
  await a.goto(origin+'/account');
  await expect(a.locator('.danger-zone .card-subtitle')).toHaveCSS('color','rgb(64, 88, 90)');
  await expect(a.locator('.danger-zone .card-header')).toHaveCSS('background-color','rgb(250, 233, 231)');
  checks.push({locale,path:'/account',subtitle:'#40585a',headerBackground:'#fae9e7',result:'PASS'});
  await a.goto(origin+'/review');await expect(a.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
  await d.goto('http://127.0.0.1:6010/prototype/?page=PAGE-007&state=empty-library&role=learner&locale='+locale);
  await d.locator('.range-editor').waitFor();
  await a.screenshot({path:join(dir,'boundary-app-'+locale+'-1080.png'),fullPage:true});
  await d.screenshot({path:join(dir,'boundary-design-'+locale+'-1080.png'),fullPage:true});
  for(const selector of ['.range-feedback h2','.page-description']){
   const actual=await a.locator(selector).evaluate(n=>getComputedStyle(n).color);
   const expected=await d.locator(selector).evaluate(n=>getComputedStyle(n).color);
   expect(actual).toBe(expected);checks.push({locale,selector,actual,expected,result:'PASS'});
  }
  await c.close();await d.close();
 }
 const theme=readFileSync(join(dir,'../../../../../../frontend/app/assets/css/theme.css'),'utf8');
 const selectors=[...theme.matchAll(/([^{}]+)\{[^{}]*color:\s*var\(--color-ink-faint\)[^{}]*\}/g)].map(m=>m[1].trim());
 expect(selectors.length).toBeGreaterThan(10);
 checks.push({kind:'static shared faint uses',selectors,token:'#596c6b',note:'Shared production theme unchanged by implementation; full original-file hash checked separately.'});
 writeFileSync(join(dir,'color-baseline-results.json'),JSON.stringify({at:new Date().toISOString(),checks},null,2),{flag:'wx'});
 console.log(JSON.stringify({colorChecks:checks.length-1,faintSelectorGroups:selectors.length,result:'PASS'}));
}finally{await browser.close();}
