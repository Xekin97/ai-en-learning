import{writeFileSync}from'node:fs';import{join}from'node:path';
import{chromium,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('plans-gap-confirmation'),observations=[],b=await chromium.launch();
try{for(const locale of['en-US','zh-CN']){
 const c=await b.newContext(),t=await login(c,'qa074_edge_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',t,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage();
 for(const width of[390,1440]){
  await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/plans');await ready(p);await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=default&locale='+locale);await d.locator('.checkbox-list').waitFor();
  const m=page=>page.locator('.checkbox-list,.chip-list').evaluateAll(ns=>ns.map(n=>{const l=n.previousElementSibling,r=l.getBoundingClientRect(),b=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(l);const t=range.getBoundingClientRect();return{label:l.textContent.trim(),gap:b.top-r.bottom,labelBoxX:r.x,textX:t.x,contentsX:b.x,relativeTextOffset:t.x-b.x};}));
  const actual=await m(p),expected=await m(d);observations.push({locale,width,actual,expected});
  out.record('rendered label/content gaps '+locale+' '+width,actual.map(x=>x.gap),expected.map(x=>x.gap));
  out.record('rendered label left alignment '+locale+' '+width,actual.map(x=>x.relativeTextOffset),expected.map(x=>x.relativeTextOffset));
  await p.screenshot({path:join(dir,'screenshots','plans-gap-'+locale+'-'+width+'-app.png'),fullPage:true});await d.screenshot({path:join(dir,'screenshots','plans-gap-'+locale+'-'+width+'-design.png'),fullPage:true});
 }await c.close();
}}catch(e){out.error('Plans gap confirmation',e);}finally{await b.close();writeFileSync(join(dir,'plans-gap-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();}
