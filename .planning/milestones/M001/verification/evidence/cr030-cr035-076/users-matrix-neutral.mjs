import{mkdirSync}from'node:fs';import{join}from'node:path';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('users-matrix-neutral');mkdirSync(join(dir,'screenshots'),{recursive:true});
const problem={status:500,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/internal_error',title:'Request failed',status:500,code:'internal_error',detail:'QA controlled failure',request_id:'qa076_matrix'})};
const norm=s=>s.replace(/\s+/gu,' ').trim();
const settle=async p=>{await p.mouse.move(0,0);await p.waitForTimeout(160);await p.evaluate(()=>document.fonts.ready.then(()=>null));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.evaluate(()=>scrollTo(0,0));};
const measure=(p,state)=>p.evaluate(state=>{
 const selectors=['.admin-sidebar','.page-heading','.admin-user-search','.admin-user-search .card-body','.admin-user-search .toolbar','.toolbar-search','.admin-user-search input','.admin-user-search button'];
 if(state==='default'||state==='empty')selectors.push('.admin-user-empty','.empty-symbol','.admin-user-empty h2','.admin-user-empty p');
 if(state==='loading')selectors.push('.admin-user-results','.admin-user-results .card-header','.admin-user-results .card-body','.user-skeleton','.user-skeleton span:first-child','.user-skeleton span:nth-child(2)','.user-skeleton span:nth-child(3)');
 if(state==='error')selectors.push('[role=alert]','[role=alert] .notice-title','[role=alert] button');
 return Object.fromEntries(selectors.map(sel=>{const n=document.querySelector(sel);if(!n)throw Error(sel);const r=n.getBoundingClientRect(),s=getComputedStyle(n);return[sel,{x:r.x,y:r.y,w:r.width,h:r.height,padding:s.padding,font:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,gap:s.gap,columns:sel==='.admin-sidebar'?'SHARED_LOCALE_OBSERVATION_SEPARATE':s.gridTemplateColumns,align:s.alignItems}];}));
},state);
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();
 try{for(const locale of['en-US','zh-CN']){
  const c=await b.newContext({locale,viewport:{width:1440,height:1000}});c.setDefaultTimeout(7000);const token=await login(c,'qa076_matrix_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
  const p=await c.newPage(),d=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/hydration.*mismatch/i.test(m.text()))errors.push(m.text());});
  const pattern='**/api/v1/admin/users?**';let release;
  for(const state of['default','empty','loading','error']){
   await p.goto(origin+'/admin/users');await ready(p);
   if(state==='empty'){await p.getByRole('search').locator('input').fill('qa076_nobody');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-empty h2')).toHaveText(locale==='en-US'?'No users found':'没有找到用户');}
   if(state==='loading'){
    const held=new Promise(r=>release=r);let enter;const entered=new Promise(r=>enter=r);
    await p.route(pattern,async route=>{const response=await route.fetch();enter();await held;await route.fulfill({response}).catch(()=>{});});
    await p.getByRole('search').locator('input').fill('qa076_search');await p.getByRole('search').locator('button').click();await entered;await p.locator('.user-skeleton').first().waitFor();
   }
   if(state==='error'){await p.route(pattern,r=>r.fulfill(problem));await p.getByRole('search').locator('input').fill('qa076_empty');await p.getByRole('search').locator('button').click();await p.locator('[role=alert]').waitFor();}
   await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state='+state+'&locale='+locale);await d.locator('.admin-user-search').waitFor();await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
   out.record(engine+' '+locale+' '+state+' prototype locale',await d.locator('.locale-switch select').inputValue(),locale);
   for(const width of[320,390,720,721,900,901,1280,1440])for(const height of[800,1000]){
    const label=[engine,locale,state,width,height].join(' ');
    await p.setViewportSize({width,height});await d.setViewportSize({width,height});await settle(p);await settle(d);
    out.record(label+' exact geometry and computed styles',await measure(p,state),await measure(d,state));
    const sel=state==='loading'?'.admin-user-results':state==='error'?'[role=alert]':'.admin-user-empty';
    out.record(label+' full state copy',norm(await p.locator(sel).innerText()),norm(await d.locator(sel).innerText()));
    out.record(label+' heading copy',norm(await p.locator('.page-heading').innerText()),norm(await d.locator('.page-heading').innerText()));
    out.record(label+' search label',await p.getByRole('search').locator('button').innerText(),await d.getByRole('search').locator('button').innerText());
    out.record(label+' no page/form overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.admin-user-search,.admin-user-empty,.user-skeleton')].every(n=>n.scrollWidth<=n.clientWidth)),true);
    if(engine==='chromium'&&height===1000&&[390,720,901,1440].includes(width)){
     await p.screenshot({path:join(dir,'screenshots','neutral-users-'+locale+'-'+state+'-'+width+'-app.png')});
     await d.screenshot({path:join(dir,'screenshots','neutral-users-'+locale+'-'+state+'-'+width+'-design.png')});
    }
   }
   if(state==='loading'){out.record(engine+' '+locale+' initial loading disables search',await p.getByRole('search').locator('input').isDisabled(),true);release();await p.unrouteAll({behavior:'wait'});await expect(p.locator('.admin-user-result')).toHaveCount(20);}
   if(state==='error'){await p.unrouteAll();await p.locator('[role=alert] button').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);out.record(engine+' '+locale+' retry retains query',await p.getByRole('search').locator('input').inputValue(),'qa076_empty');out.record(engine+' '+locale+' retry uses original query',await p.locator('.user-name').innerText(),'qa076_empty');}
   console.log([engine,locale,state,'matrix complete'].join(' '));
  }
  out.record(engine+' '+locale+' runtime/hydration errors',errors,[]);await c.close();
 }}catch(e){out.error(engine+' matrix execution',e);}finally{await b.close();}
}
out.save();
