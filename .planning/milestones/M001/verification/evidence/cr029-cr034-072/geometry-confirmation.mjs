import{writeFileSync}from'node:fs';import{join}from'node:path';
import{chromium,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('users-geometry-confirmation'),observations=[],b=await chromium.launch();
try{for(const locale of['en-US','zh-CN']){
 const c=await b.newContext();const token=await login(c,'qa072_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage();
 for(const width of[390,720,1280]){
 await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users');await ready(p);await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=default&locale='+locale);await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
 for(const page of[p,d]){await page.evaluate(()=>document.fonts.ready.then(()=>null));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(150);}
 const measure=page=>page.evaluate(()=>({scrollY,fontStatus:document.fonts.status,view:[innerWidth,innerHeight],elements:Object.fromEntries(['.admin-shell','.admin-sidebar','.admin-brand','.admin-nav','.admin-account','.admin-main','.page-heading','.admin-user-search','.toolbar-search','.admin-user-search input'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return[s,{x:r.x,y:r.y,w:r.width,h:r.height,padding:c.padding,margin:c.margin,font:c.fontSize,maxWidth:c.maxWidth}];}))}));
 const actual=await measure(p),approved=await measure(d);observations.push({locale,width,actual,approved});
 const a=actual.elements['.admin-user-search input'],z=approved.elements['.admin-user-search input'];
 out.record('settled search dimensions '+locale+' '+width,{w:a.w,h:a.h},{w:z.w,h:z.h});
 out.record('settled card position '+locale+' '+width,actual.elements['.admin-user-search'].y,approved.elements['.admin-user-search'].y);
 await p.screenshot({path:join(dir,'screenshots','users-geometry-actual-'+locale+'-'+width+'.png'),fullPage:true});await d.screenshot({path:join(dir,'screenshots','users-geometry-design-'+locale+'-'+width+'.png'),fullPage:true});
 }await c.close();
}}catch(e){out.error('geometry confirmation execution',e);}finally{await b.close();writeFileSync(join(dir,'users-geometry-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();}

