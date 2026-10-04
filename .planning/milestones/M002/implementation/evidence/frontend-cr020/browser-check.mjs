import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
const require=createRequire(process.cwd()+'/frontend/package.json');
const {chromium,webkit,expect}=require('@playwright/test');
const e=dirname(new URL(import.meta.url).pathname);
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const t=(lang,key)=>copy.static[lang+'.'+key]??copy.templates[lang+'.'+key];
const sections=[['/account','profile','profile','profile.title'],['/account/growth','growth','growth','growth.title'],['/account/items','bag','bag','bag.title'],['/account/exchange','shop','shop','shop.title']];
const results=[],runtime=[];
const browsers={chromium:await chromium.launch(),webkit:await webkit.launch()};
async function scenario(engine,lang,width){
 const id=`R20-${engine}-${lang}-${width}`,c=await browsers[engine].newContext({viewport:{width,height:width===320?568:900},deviceScaleFactor:1});
 await c.addCookies([{name:'wordweave_session',value:'learner',url:'http://127.0.0.1:3300'},{name:'wordweave_ui_locale',value:lang==='zh'?'zh-CN':'en-US',url:'http://127.0.0.1:3300'}]);
 const result={id,engine,lang,width,result:'FAIL',versions:{},runtime:[],delayedGrowthRequests:0};
 try{
 for(const version of ['production','prototype']){
  const p=await c.newPage();p.setDefaultTimeout(8000);await p.emulateMedia({reducedMotion:'reduce'});
  p.on('console',m=>{if(['warning','error'].includes(m.type()))result.runtime.push({version,type:m.type(),text:m.text()})});p.on('pageerror',x=>result.runtime.push({version,type:'pageerror',text:x.message}));
  if(version==='production')await p.route('**/api/v1/me/growth',async r=>{result.delayedGrowthRequests++;await new Promise(resolve=>setTimeout(resolve,300));await r.continue()});
  await p.goto(version==='production'?'http://127.0.0.1:3300/':`http://127.0.0.1:3332/prototype/index.html?page=home&lang=${lang}`);
  if(version==='production')await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
  const dropdown=p.locator('.account-dropdown'),summary=dropdown.locator('summary'),links=dropdown.locator('nav a');
  const open=()=>dropdown.evaluate(x=>x.open);const tab=engine==='webkit'?'Alt+Tab':'Tab';
  await summary.focus();await p.keyboard.press('Enter');await expect(dropdown).toHaveJSProperty('open',true);
  await expect(links).toHaveText(sections.map(x=>t(lang,x[2])));
  const style=await dropdown.locator('.account-popover').evaluate(x=>{const s=getComputedStyle(x);return{width:s.width,padding:s.padding,gap:s.gap,borderRadius:s.borderRadius,background:s.backgroundColor}});
  const iconCount=await links.locator('svg').count();expect(iconCount).toBe(4);
  await p.screenshot({path:`${e}/${id}-${version}-open.png`,fullPage:true});
  for(let i=0;i<4;i++){await p.keyboard.press(tab);await expect(links.nth(i)).toBeFocused();}
  await p.keyboard.press('Escape');await expect(dropdown).toHaveJSProperty('open',false);await expect(summary).toBeFocused();
  await p.keyboard.press('Space');await expect(dropdown).toHaveJSProperty('open',true);await p.keyboard.press('Space');await expect(dropdown).toHaveJSProperty('open',false);
  await summary.click();const point={x:4,y:p.viewportSize().height-4};expect(await p.evaluate(pt=>!!document.elementFromPoint(pt.x,pt.y)?.closest('.account-dropdown'),point)).toBe(false);await p.mouse.click(point.x,point.y);await expect(dropdown).toHaveJSProperty('open',false);
  await summary.click();await links.last().focus();await p.keyboard.press(tab);await expect(dropdown).toHaveJSProperty('open',false);expect(await p.evaluate(()=>!!document.activeElement?.closest('.account-dropdown'))).toBe(false);
  const destinations=[];
  for(const [route,view,,titleKey] of sections){
   await summary.click();const item=links.filter({hasText:t(lang,sections.find(x=>x[0]===route)[2])});
   await item.focus();await p.keyboard.press('Enter');
   await expect(p.locator('.account-content h1')).toHaveText(t(lang,titleKey));await expect(p.locator('.account-content h1')).toBeFocused();await expect(dropdown).toHaveJSProperty('open',false);
   const active=version==='production'?dropdown.locator(`a[href="${route}"]`):dropdown.locator(`a[data-go="${view}"]`);await expect(active).toHaveAttribute('aria-current','page');
   expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   // Re-selecting the current section must not leave focus on a hidden link.
   await summary.click();await active.click();await expect(p.locator('.account-content h1')).toBeFocused();await expect(dropdown).toHaveJSProperty('open',false);
   destinations.push({route,title:await p.locator('.account-content h1').innerText(),focus:true,current:true,samePageFocus:true});
  }
  result.versions[version]={style,iconCount,destinations,tabKey:tab,escapeFocus:true,outsideDismiss:true,focusExitDismiss:true,orderedLinkTraversal:true};
  await p.screenshot({path:`${e}/${id}-${version}-section.png`,fullPage:true});await p.close();
 }
 expect(result.versions.production.style).toEqual(result.versions.prototype.style);expect(result.runtime).toEqual([]);expect(result.delayedGrowthRequests).toBeGreaterThan(0);result.result='PASS';
 }catch(error){result.error=error.stack;for(const p of c.pages())await p.screenshot({path:`${e}/${id}-failure-${c.pages().indexOf(p)}.png`,fullPage:true}).catch(()=>{});}
 finally{runtime.push(...result.runtime.map(x=>({id,...x})));results.push(result);await c.close();writeFileSync(e+'/browser-results.json',JSON.stringify({results,runtime},null,2)+'\n');console.log(id,result.result,result.error?.split('\n')[0]??'');}
}
try{for(const engine of ['chromium','webkit'])await Promise.all(['zh','en'].flatMap(lang=>[320,1440].map(width=>scenario(engine,lang,width))))}
finally{await Promise.all(Object.values(browsers).map(x=>x.close()))}
if(results.some(x=>x.result!=='PASS'))process.exitCode=1;
