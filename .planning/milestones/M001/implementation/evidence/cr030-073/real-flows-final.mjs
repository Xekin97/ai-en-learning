import{readFileSync}from'node:fs';import{join}from'node:path';import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('real-flows-final'),pattern='**/api/v1/admin/users?**';
const fail={status:500,contentType:'application/problem+json',body:JSON.stringify({type:'about:blank',title:'Internal error',status:500,code:'internal_error',request_id:'req-dev073-append'})};
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{for(const locale of['en-US','zh-CN']){
 const c=await b.newContext({locale,viewport:{width:1440,height:1000}});c.setDefaultTimeout(9000);const token=await login(c,'dev073_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 for(const width of[390,720,901,1280,1440]){
  const key=engine+' '+locale+' '+width;await p.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users');await ready(p);
  await p.getByRole('search').locator('input').fill('dev073_search');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-result')).toHaveCount(20);
  const original=await p.locator('.user-name').allInnerTexts();
  let release,entered;const hold=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
  await p.route(pattern,async route=>{if(new URL(route.request().url()).searchParams.has('cursor')){entered();await hold;await route.fulfill(fail).catch(()=>{});}else await route.continue();});
  try{await p.locator('.admin-user-pagination button').click();await entry;out.record(key+' appending retains rows',await p.locator('.user-name').allInnerTexts(),original);out.record(key+' append disabled',await p.locator('.admin-user-pagination button').isDisabled(),true);out.record(key+' append busy',await p.locator('.admin-user-results').getAttribute('aria-busy'),'true');}finally{release();}
  await expect(p.locator('.admin-user-append-error')).toBeVisible();out.record(key+' append failure retains rows',await p.locator('.user-name').allInnerTexts(),original);await p.unrouteAll({behavior:'wait'});
  await p.locator('.admin-user-pagination button').click();await expect(p.locator('.admin-user-result')).toHaveCount(40);
  const targetId=f.users.dev073_search_32;const trigger=p.locator('[data-result-id="'+targetId+'"] .button');await trigger.scrollIntoViewIfNeeded();const scroll=await p.evaluate(()=>scrollY);
  await trigger.click();await expect(p.locator('.user-detail-name')).toHaveText('dev073_search_32');out.record(key+' detail search retained',await p.getByRole('search').locator('input').inputValue(),'dev073_search');
  out.record(key+' detail input max',await p.getByRole('search').locator('input').evaluate(n=>n.getBoundingClientRect().width<=432),true);
  await p.getByRole('search').locator('input').fill('unsubmitted');await p.locator('.admin-user-detail-toolbar a').click();await expect(p.locator('.admin-user-result')).toHaveCount(40);await expect(trigger).toBeFocused();
  out.record(key+' restored submitted query',new URL(p.url()).searchParams.get('q'),'dev073_search');out.record(key+' restored row32 focus',await trigger.evaluate(n=>n===document.activeElement),true);
  out.record(key+' restored scroll',Math.abs(await p.evaluate(()=>scrollY)-scroll)<=2,true);
  await p.locator('.admin-user-pagination button').click();await expect(p.locator('.admin-user-result')).toHaveCount(45);
  out.record(key+' no duplicates',new Set(await p.locator('.user-name').allInnerTexts()).size,45);out.record(key+' terminal pagination hidden',await p.locator('.admin-user-pagination').count(),0);
  await p.goto(origin+'/admin/users/'+targetId+'?q=dev073_search');await ready(p);
  await p.getByRole('search').locator('input').fill('lin_weave');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);out.record(key+' detail resubmit correct row',await p.locator('.user-name').innerText(),'lin_weave');
  out.record(key+' no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(width===390||width===1440){const axe=await new AxeBuilder({page:p}).analyze();out.record(key+' Users axe serious/critical',axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);}
  for(const[path,id]of[['models','PAGE-101'],['plans','PAGE-102']]){
   await p.goto(origin+'/admin/'+path);await ready(p);await d.setViewportSize({width,height:1000});await d.goto(design+'/prototype/?page='+id+'&role=admin&state=default&locale='+locale);await expect(d.locator('.locale-switch select')).toHaveValue(locale);
   out.record(key+' '+path+' heading',(await p.locator('.page-heading').innerText()).replace(/\s+/g,' ').trim(),(await d.locator('.page-heading').innerText()).replace(/\s+/g,' ').trim());
   out.record(key+' '+path+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(path==='plans')out.record(key+' plans Guest',await p.locator('[role=tab]').first().innerText(),locale==='en-US'?'Guest':'访客');
  }
 }
 out.record(engine+' '+locale+' no page errors',errors,[]);await c.close();console.log(engine+' '+locale+' flow matrix complete');
 }}catch(e){out.error(engine+' execution',e);}finally{await b.close();}
}
out.save();


