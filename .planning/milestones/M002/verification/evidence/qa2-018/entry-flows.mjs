import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(process.cwd()+'/frontend/package.json');
const {chromium,webkit,expect}=require('@playwright/test');
const out=path.dirname(new URL(import.meta.url).pathname),root=process.cwd();
const design=root+'/.planning/milestones/M002/design';
const copy=JSON.parse(fs.readFileSync(design+'/copy.json'));
const fixtures=JSON.parse(fs.readFileSync(design+'/prototype/fixtures.json'));
const t=(l,k)=>copy.static[l+'.'+k]??copy.templates[l+'.'+k];
const results=[];const browsers={chromium:await chromium.launch(),webkit:await webkit.launch()};
async function run(id,engine,lang,width,fn){
 const c=await browsers[engine].newContext({viewport:{width,height:width===320?568:width===390?844:900},deviceScaleFactor:1});
 await c.addCookies([{name:'wordweave_ui_locale',value:lang==='zh'?'zh-CN':'en-US',url:'http://127.0.0.1:3300'}]);
 const p=await c.newPage(),r={id,engine,lang,width,checks:[],observations:{},runtime:[],requests:[]};
 p.on('pageerror',e=>r.runtime.push({type:'pageerror',text:e.message}));
 p.on('console',m=>{if(['warning','error'].includes(m.type()))r.runtime.push({type:m.type(),text:m.text()})});
 p.on('request',q=>{if(new URL(q.url()).pathname.startsWith('/api/'))r.requests.push({method:q.method(),url:q.url()})});
 const check=(name,ok,actual)=>r.checks.push({name,pass:!!ok,...(actual===undefined?{}:{actual})});
 try{await fn(p,c,r,check);check('no runtime warning/error',r.runtime.length===0,r.runtime);}
 catch(e){r.error=e.stack;check('test completed',false,e.message);await p.screenshot({path:out+'/'+id+'-failure.png',fullPage:true}).catch(()=>{});}
 r.status=r.checks.every(x=>x.pass)?'PASS':'FAIL';results.push(r);fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');
 console.log(id,r.status,r.checks.filter(x=>!x.pass).map(x=>x.name).join('; '));await c.close();
}
async function ready(p,url='/'){await p.goto('http://127.0.0.1:3300'+url);await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');}
async function shot(p,id,suffix){await p.screenshot({path:out+'/'+id+'-'+suffix+'.png',fullPage:true});}
async function menuObservations(p,tab){
 const d=p.locator('.account-dropdown'),s=d.locator('summary'),links=d.locator('nav a');
 const opened=()=>d.evaluate(e=>e.open),focus=()=>p.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.trim().slice(0,120),isSummary:document.activeElement?.matches('.account-dropdown summary'),isHeading:document.activeElement?.matches('h1,h2')}));
 async function ensureOpen(){if(!await opened())await s.click();}
 const o={};await s.focus();await p.keyboard.press('Enter');o.enterOpens=await opened();
 if(await opened())await p.keyboard.press('Space');o.spaceCloses=!await opened();await p.keyboard.press('Space');o.spaceOpens=await opened();
 o.labels=await links.allTextContents();await p.keyboard.press(tab);o.firstLinkFocused=await links.first().evaluate(e=>e===document.activeElement);
 await p.keyboard.press('Escape');o.escapeCloses=!await opened();o.escapeFocus=await focus();
 await ensureOpen();const outside={x:4,y:p.viewportSize().height-4};o.outsideTarget=await p.evaluate(pt=>{const e=document.elementFromPoint(pt.x,pt.y);return{tag:e?.tagName,inDropdown:!!e?.closest('.account-dropdown')}},outside);if(o.outsideTarget.inDropdown)throw new Error('Outside target overlaps dropdown');await p.mouse.click(outside.x,outside.y);o.outsideCloses=!await opened();await p.screenshot({path:out+'/outside-'+new URL(p.url()).port+'-'+p.viewportSize().width+'-'+(await p.locator('.home-intro h1').innerText()).slice(0,2)+'.png',fullPage:true});
 await ensureOpen();await links.last().focus();await p.keyboard.press(tab);o.tabExitCloses=!await opened();o.tabExitFocus=await focus();
 await ensureOpen();await links.first().click();await p.waitForTimeout(250);o.selectionCloses=!await opened();await p.waitForFunction(()=>document.activeElement?.matches('h1,h2'));o.selectionFocus=await focus();o.current=await links.first().getAttribute('aria-current');return o;
}
async function header(p,c,r,check){
 const tab=r.engine==='webkit'?'Alt+Tab':'Tab';
 await c.addCookies([{name:'wordweave_session',value:'learner',url:'http://127.0.0.1:3300'}]);await p.emulateMedia({reducedMotion:'reduce'});await ready(p);
 const a=await menuObservations(p,tab);r.observations.production=a;await shot(p,r.id,'production-after-selection');
 const q=await c.newPage();await q.emulateMedia({reducedMotion:'reduce'});await q.goto('http://127.0.0.1:3332/prototype/index.html?page=home&lang='+r.lang);await q.locator('.account-dropdown').waitFor();
 const b=await menuObservations(q,tab);r.observations.prototype=b;await shot(q,r.id,'prototype-after-selection');
 check('approved four account labels',JSON.stringify(a.labels.map(x=>x.trim()))===JSON.stringify(['profile','growth','bag','shop'].map(k=>t(r.lang,k))));
 for(const [name,value]of Object.entries(a))if(['enterOpens','spaceCloses','spaceOpens','firstLinkFocused','escapeCloses','outsideCloses','tabExitCloses','selectionCloses'].includes(name))check(name,value,{production:value,prototype:b[name]});
 check('Escape returns focus to avatar',a.escapeFocus.isSummary,{production:a.escapeFocus,prototype:b.escapeFocus});
 check('selecting section focuses page heading',a.selectionFocus.isHeading,{production:a.selectionFocus,prototype:b.selectionFocus});
 check('selected section has aria-current',a.current==='page',a.current);
 check('header no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(const [label,page] of [['production',p],['prototype',q]]){
  const visits=[];
  for(let i=0;i<4;i++){
   await page.locator('.account-dropdown summary').click();
   await page.locator('.account-dropdown nav a').nth(i).click();
   await page.waitForFunction(()=>document.activeElement?.matches('h1,h2'));
   const obs=await page.evaluate(()=>({path:location.pathname,view:new URL(location.href).searchParams.get('page'),focused:document.activeElement.textContent,tag:document.activeElement.tagName,opened:document.querySelector('.account-dropdown').open,current:[...document.querySelectorAll('.account-dropdown nav a')].map(x=>x.getAttribute('aria-current')),overflow:document.documentElement.scrollWidth>innerWidth}));
   visits.push(obs);
   check(label+' section '+i+' closes, focuses approved title, marks current only and fits', !obs.opened&&obs.focused===t(r.lang,['profile.title','growth.title','bag.title','shop.title'][i])&&obs.current[i]==='page'&&obs.current.filter(x=>x==='page').length===1&&!obs.overflow,obs);
  }
  r.observations[label+'Sections']=visits;
 }
 await q.close();
}
try{
 for(const lang of ['zh','en'])for(const [engine,width] of [['webkit',320],['chromium',1440]])await run(`N18-${lang}-${width}`,engine,lang,width,header);
}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
const summary={cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,findings:results.flatMap(r=>r.checks.filter(x=>!x.pass).map(x=>({id:r.id,...x})))};
fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');
if(summary.failed)process.exitCode=1;
