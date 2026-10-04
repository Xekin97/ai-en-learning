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
 p.setDefaultTimeout(8000);p.on('request',q=>{if(new URL(q.url()).pathname.startsWith('/api/'))r.requests.push({method:q.method(),url:q.url()})});
 const check=(name,ok,actual)=>r.checks.push({name,pass:!!ok,...(actual===undefined?{}:{actual})});
 try{await fn(p,c,r,check);check('no runtime warning/error',r.runtime.length===0,r.runtime);}
 catch(e){r.error=e.stack;check('test completed',false,e.message);await p.screenshot({path:out+'/'+id+'-failure.png',fullPage:true}).catch(()=>{});}
 r.status=r.checks.every(x=>x.pass)?'PASS':'FAIL';results.push(r);fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');
 console.log(id,r.status,r.checks.filter(x=>!x.pass).map(x=>x.name).join('; '));await c.close();
}
async function ready(p,url='/'){await p.goto('http://127.0.0.1:3300'+url);await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');}
async function shot(p,id,suffix){await p.screenshot({path:out+'/'+id+'-'+suffix+'.png',fullPage:true});}
const origin='http://127.0.0.1:3300';
async function actor(c,value){await c.addCookies([{name:'wordweave_session',value,url:origin}]);}
async function settle(p){await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);}
async function reset(p,area){await p.request.post('http://127.0.0.1:38080/api/v1/__test/'+area+'-reset');}
const routes=[['/login','login','login','guest'],['/register','register','register','guest'],['/create','create','create.title','learner'],['/library','library','l.library','learner'],['/library/batch-e2e','batch',null,'learner'],['/review','range','l.range','learner'],['/account','profile','profile.title','learner'],['/account/growth','growth','growth.title','learner'],['/account/items','bag','bag.title','learner'],['/account/exchange','shop','shop.title','learner'],['/notices','notices','notices.title','learner'],['/admin','adminhome','a.adminhome','admin'],['/admin/models','models','a.models','admin'],['/admin/plans','plans','a.plans','admin'],['/admin/users?all=1','users','a.users','admin'],['/admin/growth','operations','operations','admin'],['/admin/notices','messages','a.messages','admin'],['/admin/presets','presets','presets','admin'],['/admin/analytics','metrics','metrics.title','admin']];
function layoutSnapshot(){
 const visible=e=>e.checkVisibility({checkVisibilityCSS:true});const box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,right:b.right}};
 const all=s=>[...document.querySelectorAll(s)].filter(visible);
 return {headings:all('main h1').map(e=>e.textContent.trim()),overflow:document.documentElement.scrollWidth>innerWidth,nav:all('header .nav a').map(e=>({text:e.textContent.trim(),current:e.getAttribute('aria-current')})),icons:all('main svg.ui-icon').map(e=>({decorative:e.getAttribute('aria-hidden'),focus:e.getAttribute('focusable'),hasShape:!!e.querySelector('path,circle,rect,polygon,line,polyline,ellipse,use')})),fields:all('main input,main select,main textarea').filter(e=>!['hidden','checkbox','radio'].includes(e.type)).map(e=>({tag:e.tagName,type:e.type,label:[...e.labels??[]].map(x=>x.textContent.trim()).join(' '),aria:e.getAttribute('aria-label'),box:box(e),value:e.value})),panels:all('.auth-layout,.auth-form,.auth-story,.account-sidebar,.account-content').map(e=>({cls:e.className,box:box(e)}))};
}
async function layouts(p,c,r,check){
 await p.emulateMedia({reducedMotion:'reduce'});const observations=[];
 for(const [url,view,key,who]of routes.filter(x=>['create','profile','operations','presets','metrics','shop'].includes(x[1]))){
  if(who==='guest')await c.clearCookies({name:'wordweave_session'});else await actor(c,who);
  await p.goto(origin+url);await settle(p);const o=await p.evaluate(layoutSnapshot);observations.push({url,view,...o});
  if(o.overflow){r.observations[view+'Overflow']=await p.evaluate(()=>[...document.querySelectorAll('main *')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(x=>x.right>innerWidth+1||x.x<0).slice(-20));}
  check(view+' one primary heading and no page overflow',o.headings.length===1&&!o.overflow,{headings:o.headings,overflow:o.overflow});
  if(key&&t(r.lang,key)!==undefined)check(view+' approved primary copy',o.headings[0]===t(r.lang,key),{actual:o.headings[0],expected:t(r.lang,key)});
  check(view+' named form controls and decorative SVG shapes',o.fields.every(x=>x.label||x.aria)&&o.icons.every(x=>x.decorative==='true'&&x.focus==='false'&&x.hasShape),{unnamed:o.fields.filter(x=>!x.label&&!x.aria),badIcons:o.icons.filter(x=>x.decorative!=='true'||x.focus!=='false'||!x.hasShape)});
  check(view+' fields at least 46px per UI09',o.fields.every(x=>x.box.height>=45.5),o.fields.filter(x=>x.box.height<45.5));
  if(who!=='admin')check(view+' five learner navigation labels',JSON.stringify(o.nav.map(x=>x.text))===JSON.stringify(['home','explore','create','range','library'].map(k=>t(r.lang,'nav.'+k))),o.nav);
  if(['login','register'].includes(view)){
   const geometry=await p.locator('.auth-form').evaluate(e=>{const fields=[...e.querySelectorAll('input')].map(x=>x.getBoundingClientRect()),b=e.querySelector('button[type=submit]').getBoundingClientRect(),surface=e.closest('.auth-layout')?.getBoundingClientRect();return {aligned:fields.every(x=>Math.abs(x.x-b.x)<1&&Math.abs(x.width-b.width)<1),surfaceWidth:surface?.width}});
   check(view+' form fields and submit align',geometry.aligned,geometry);
  }
  if(['login','profile','models','plans','messages','presets','shop'].includes(view))await shot(p,r.id,view);
 }
 r.observations.pages=observations;
}
async function growthFocus(p,c,r,check){
 await actor(c,'learner');await reset(p,'growth');await ready(p,'/account/growth');await settle(p);
 const group=p.locator('.achievement-group').first(),disclosure=group.locator('details');await disclosure.locator('summary').click();
 check('current tier and expanded remaining tiers visible',await disclosure.evaluate(e=>e.open));
 await group.getByRole('button',{name:t(r.lang,'claim'),exact:true}).click();await expect(group.locator('.achievement button').first()).toHaveText(t(r.lang,'claimed'));
 const a=await p.evaluate(()=>({focus:{tag:document.activeElement?.tagName,cls:document.activeElement?.className},summaryFocused:document.activeElement?.matches('.tier-disclosure summary'),open:document.querySelector('.tier-disclosure')?.open}));r.observations.claim=a;
 check('claim preserves expanded group',a.open,a);check('claim returns focus to group summary per ACCOUNT17',a.summaryFocused,a);await shot(p,r.id,'claim');
}
async function configuration(p,c,r,check){
 await actor(c,'learner');await ready(p,'/create');await settle(p);const settings=p.locator('details.settings');check('ordinary default disclosure by breakpoint',await settings.evaluate(e=>e.open)===(r.width>1100));
 if(!await settings.evaluate(e=>e.open))await settings.locator('summary').click();
 const boxes=k=>p.getByRole('combobox',{name:t(r.lang,k),exact:true});
 check('four native selects, empty model/language and Story/Brief defaults',await settings.locator('select').count()===4&&await boxes('model').inputValue()===''&&await boxes('explain').inputValue()===''&&await boxes('style').inputValue()==='story'&&await boxes('length').inputValue()==='short');
 await boxes('model').focus();await boxes('model').selectOption('model-fast');check('four expanded native controls at least46px',await settings.locator('select').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=45.5)));check('model selection keeps focus',await boxes('model').evaluate(e=>e===document.activeElement));
 await boxes('explain').selectOption('en');await boxes('style').selectOption('business');await boxes('length').selectOption('medium');
 await p.getByRole('button',{name:t(r.lang,'random'),exact:true}).click();await expect(p.locator('.workspace .chips')).toContainText('adapt');
 await p.getByRole('button',{name:t(r.lang,'language'),exact:true}).click();await settle(p);
 const actual=await settings.locator('select').evaluateAll(es=>es.map(e=>e.value));check('language redraw and random keep selected values and disclosure',JSON.stringify(actual)===JSON.stringify(['model-fast','business','medium','en'])&&await settings.evaluate(e=>e.open),actual);
 await shot(p,r.id,'ordinary');await p.goto(origin+'/library/batch-e2e');await settle(p);
 const snap=p.locator('.batch-settings'),data=await snap.evaluate(e=>({labels:[...e.querySelectorAll('dt')].map(x=>x.textContent.trim()),values:[...e.querySelectorAll('dd')].map(x=>x.textContent.trim()),controls:e.querySelectorAll('input,select,textarea,summary').length,order:[...e.querySelectorAll('h2,.trial-model,.trial-config-facts,.batch-review-count')].map(x=>x.tagName+':'+x.className)}));r.observations.snapshot=data;
 check('snapshot retains long saved model and four fields plus count',data.values.length===5&&data.values[0].includes('deliberately long name')&&data.values.at(-1)==='1',data);
 check('snapshot readonly and approved region order',data.controls===0&&data.order.length===4&&data.order[1].includes('trial-model')&&data.order[2].includes('trial-config-facts')&&data.order[3].includes('batch-review-count'),data);
 check('configuration pages fit viewport',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(p,r.id,'snapshot');
}
async function levelFocus(p,c,r,check){
 await actor(c,'learner');await reset(p,'growth');let claimed=false;
 await p.route('**/api/v1/me/growth/level-rewards?*',async route=>{const response=await route.fetch();const json=await response.json();const item=json.data.items[0];item.state=claimed?'claimed':'claimable';item.block_reason=null;item.claimed_at=claimed?'2026-09-20T05:00:00Z':null;item.settlement_id=claimed?'receipt-level':null;await route.fulfill({response,json});});
 await p.route('**/api/v1/me/growth/level-rewards/lv2/claim',async route=>{claimed=true;const response=await p.request.post(origin+'/api/v1/me/growth/achievements/tier-1/claim');const json=await response.json();json.data.receipt.id='receipt-level';await route.fulfill({status:200,json});});
 await ready(p);await p.locator('.account-dropdown summary').click();await p.locator('.account-dropdown a[href="/account/growth"]').click();await settle(p);
 const row=p.locator('.level-reward').first();await row.getByRole('button',{name:t(r.lang,'claimlevel'),exact:true}).click();await expect(row.getByRole('button')).toHaveText(t(r.lang,'claimed'));
 const o=await p.evaluate(()=>({focused:document.activeElement?.matches('.level-reward h3'),tag:document.activeElement?.tagName,text:document.activeElement?.textContent.slice(0,80)}));r.observations.level=o;check('level reward returns focus to corresponding level heading',o.focused,o);await shot(p,r.id,'level');
}

try{
 for(const [engine,lang,width]of [['webkit','zh',320],['webkit','en',320],['chromium','zh',768],['chromium','en',768]]){
  await run(`DEV21-L-${lang}-${width}`,engine,lang,width,layouts);
  await run(`DEV21-G-${lang}-${width}`,engine,lang,width,growthFocus);
  await run(`DEV21-R-${lang}-${width}`,engine,lang,width,levelFocus);
 }
}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
const summary={cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length};fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');if(summary.failed)process.exitCode=1;
