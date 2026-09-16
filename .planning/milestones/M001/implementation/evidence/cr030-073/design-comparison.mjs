import{writeFileSync}from'node:fs';import{join}from'node:path';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('design-comparison'),observations=[];
const settle=async p=>{await p.evaluate(()=>document.fonts.ready.then(()=>null));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
const measure=p=>p.evaluate(()=>({locale:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth,elements:Object.fromEntries(['.admin-shell','.admin-sidebar','.admin-main','.page-heading','.admin-user-search','.toolbar-search','.admin-user-search input','.admin-user-empty'].filter(s=>document.querySelector(s)).map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return[s,{x:r.x,y:r.y,w:r.width,h:r.height,minHeight:c.minHeight}];}))}));
const norm=s=>s.replace(/\s+/gu,' ').trim();
const text=async(p,s)=>norm(await p.locator(s).innerText());
const problem={status:500,contentType:'application/problem+json',body:JSON.stringify({type:'about:blank',title:'Internal error',status:500,code:'internal_error',request_id:'req-dev073'})};
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{for(const locale of['en-US','zh-CN']){
 const c=await b.newContext({locale});c.setDefaultTimeout(8000);const token=await login(c,'dev073_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
 const p=await c.newPage(),d=await c.newPage();const pattern='**/api/v1/admin/users?**';
 const proto=async(state,width,height)=>{await d.setViewportSize({width,height});await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state='+state+'&locale='+locale);await d.addStyleTag({content:'.prototype-tools{display:none!important}'});await expect(d.locator('.locale-switch select')).toHaveValue(locale);await settle(d);};
 async function compare(state,width,height){
  await proto(state,width,height);await settle(p);await p.evaluate(()=>scrollTo(0,0));
  const actual=await measure(p),approved=await measure(d),key=engine+' '+locale+' '+state+' '+width+'x'+height;observations.push({key,actual,approved});
  out.record(key+' no overflow',actual.overflow,false);
  // Only state-matched idle/empty/loading/error carry identical content height.
  for(const s of['.admin-sidebar','.admin-user-search','.admin-user-search input',...(state==='default'||state==='empty'?['.admin-user-empty']:[])]){
   const a=actual.elements[s],z=approved.elements[s];out.record(key+' geometry '+s,['x','y','w','h'].every(k=>Math.abs(a[k]-z[k])<=0.1),true);
  }
  out.record(key+' heading',await text(p,'.page-heading'),await text(d,'.page-heading'));
  const selector=state==='default'||state==='empty'?'.admin-user-empty':state==='error'?'[role=alert]':'.admin-user-results';
  out.record(key+' state copy',await text(p,selector),await text(d,selector));
  if(height===1000&&((width===720&&state==='default')||(width===390&&state==='error'))){
   await p.screenshot({path:join(dir,'screenshots',engine+'-'+locale+'-'+state+'-'+width+'-actual.png'),fullPage:true});
   await d.screenshot({path:join(dir,'screenshots',engine+'-'+locale+'-'+state+'-'+width+'-design.png'),fullPage:true});
  }
 }
 for(const width of[390,720,901,1280,1440]){
  for(const height of[800,1000]){
   await p.setViewportSize({width,height});await p.goto(origin+'/admin/users');await ready(p);await compare('default',width,height);
   await p.getByRole('search').locator('input').fill('dev073_nobody');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-empty h2')).toHaveText(locale==='en-US'?'No users found':'没有找到用户');await compare('empty',width,height);
  }
  let release,entered;const hold=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
  await p.route(pattern,async route=>{entered();await hold;await route.fulfill(problem).catch(()=>{});});
  try{
   await p.getByRole('search').locator('input').fill('lin');await p.getByRole('search').locator('button').click();await entry;await expect(p.locator('.user-skeleton')).toHaveCount(3);await compare('loading',width,1000);
   out.record(engine+' '+locale+' '+width+' loading disabled',await p.getByRole('search').locator('input').isDisabled(),true);
  }finally{release();}
  await expect(p.locator('[role=alert]')).toBeVisible();await p.unrouteAll({behavior:'wait'});await compare('error',width,1000);
  await p.locator('[role=alert] button').click();await expect(p.locator('.admin-user-result')).toHaveCount(6);await proto('results',width,1000);
  for(const s of['.admin-user-results .card-title','.admin-user-results .card-header > .helper','.admin-user-result-list'])out.record(engine+' '+locale+' '+width+' results '+s,await text(p,s),await text(d,s));
  out.record(engine+' '+locale+' '+width+' terminal',await p.locator('.admin-user-pagination').count(),0);
  await p.getByRole('search').locator('input').fill('lin_weave');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);await proto('single',width,1000);out.record(engine+' '+locale+' '+width+' single result',await text(p,'.admin-user-result-list'),await text(d,'.admin-user-result-list'));
 }
 await c.close();console.log(engine+' '+locale+' design matrix complete');
 }}catch(e){out.error(engine+' execution',e);}finally{await b.close();}
}
writeFileSync(join(dir,'design-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();

