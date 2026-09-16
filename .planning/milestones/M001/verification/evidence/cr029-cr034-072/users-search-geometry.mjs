import{chromium,expect,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('users-search-geometry'),b=await chromium.launch();
try{for(const locale of['en-US','zh-CN']){
 const c=await b.newContext();const token=await login(c,'qa072_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage();
 for(const width of[390,720,901,1080,1280,1440]){
 await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users');await ready(p);await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=default&locale='+locale);await d.locator('.admin-user-search').waitFor();
 const metrics=page=>page.locator('.admin-user-search').evaluate(n=>Object.fromEntries(['.card-body','.toolbar','.toolbar-search','input','button'].map(s=>{const e=n.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return[s,{x:r.x,y:r.y,w:r.width,h:r.height,padding:c.padding,font:c.fontSize}];})));
 out.record('Users search exact geometry '+locale+' '+width,await metrics(p),await metrics(d));
 }await c.close();
}}catch(e){out.error('search geometry execution',e);}finally{await b.close();out.save();}

