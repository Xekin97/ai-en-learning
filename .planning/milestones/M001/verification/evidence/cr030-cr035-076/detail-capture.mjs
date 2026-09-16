import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,webkit,expect,dir,origin,ready,login,api,recorder}from'./lib.mjs';
const name=JSON.parse(readFileSync(join(dir,'focus-fixtures.json')))[0],out=recorder('detail-capture');
// The earlier focus harness asserted the detail, then returned to results. Its final click
// screenshot lacked a navigation wait. Preserve those raw images; capture the awaited detail here.
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){const b=await type.launch();try{const c=await b.newContext(),token=await login(c,'qa076_focus_admin');
 for(const locale of['en-US','zh-CN']){await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();
 for(const width of[320,390,1440]){await p.setViewportSize({width,height:844});await p.goto(origin+'/admin/users/'+name.id+'?q='+name.username);await ready(p);await expect(p.locator('.user-detail-name')).toHaveText(name.username);await p.evaluate(()=>document.fonts.ready.then(()=>null));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 out.record(engine+' '+locale+' '+width+' actual detail visible',await p.locator('.admin-user-detail-grid').isVisible(),true);out.record(engine+' '+locale+' '+width+' page fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:join(dir,'screenshots','confirmed-detail-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});}
 await p.close();}await c.close();}catch(e){out.error(engine+' detail capture',e);}finally{await b.close();}}out.save();
