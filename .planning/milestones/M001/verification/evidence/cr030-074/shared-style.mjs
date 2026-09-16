import{chromium,expect,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('shared-style'),b=await chromium.launch();
const metrics=(p,s)=>p.locator(s).evaluateAll(ns=>ns.map(n=>{const s=getComputedStyle(n);return{margin:s.margin,padding:s.padding,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,border:s.borderRadius,gap:s.gap};}));
try{for(const locale of['en-US','zh-CN']){
 const c=await b.newContext();c.setDefaultTimeout(6000);const t=await login(c,'qa074_edge_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',t,{ui_locale:locale});const p=await c.newPage(),dc=await b.newContext(),d=await dc.newPage();
 for(const width of[390,1440]){
  await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/plans');await ready(p);await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=default&locale='+locale);
  await d.locator('.field-label').first().waitFor();
  for(const s of['.page-heading','.field-label','.card-footer button.button-primary'])out.record('Plans '+s+' '+locale+' '+width,await metrics(p,s),await metrics(d,s));
 }await c.close();await dc.close();
 const l=await b.newContext(),lt=await login(l,'qa074_learner',locale);await api(l,'PUT','/api/v1/me/ui-locale',lt,{ui_locale:locale});const lp=await l.newPage(),ldc=await b.newContext(),ld=await ldc.newPage();
 for(const width of[390,1440]){await lp.setViewportSize({width,height:1000});await ld.setViewportSize({width,height:1000});await lp.goto(origin+'/library');await ready(lp);await ld.goto(design+'/prototype/?page=PAGE-005&role=learner&state=default&locale='+locale);
 for(const s of['.stat-card','.stat-label','.stat-value'])out.record('Library six statistics '+s+' '+locale+' '+width,await metrics(lp,s),await metrics(ld,s));}await l.close();await ldc.close();
}}catch(e){out.error('shared styles',e);}finally{await b.close();out.save();}
