import{writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
import{chromium,dir,origin,design,ready,login,api}from'./lib.mjs';
const b=await chromium.launch(),observations=[];mkdirSync(join(dir,'screenshots'),{recursive:true});
const measure=p=>p.evaluate(()=>Object.fromEntries(['.admin-shell','.admin-sidebar','.admin-main','.admin-content','.page-heading','.admin-user-search','.toolbar-search','.admin-user-search input','.admin-user-empty'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return[s,{x:r.x,y:r.y,w:r.width,h:r.height,minHeight:c.minHeight,maxWidth:c.maxWidth,gridRows:c.gridTemplateRows,margin:c.margin,padding:c.padding}];})));
try{for(const locale of['en-US','zh-CN']){const c=await b.newContext();const token=await login(c,'dev073_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage();
for(const [width,height] of[[390,1000],[720,1000],[720,800],[1280,1000]]){for(const page of[p,d])await page.setViewportSize({width,height});
await p.goto(origin+'/admin/users');await ready(p);await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=default&locale='+locale);await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
for(const page of[p,d]){await page.evaluate(()=>document.fonts.ready.then(()=>null));await page.waitForTimeout(150);}
const actual=await measure(p),approved=await measure(d);
await p.addStyleTag({content:'.admin-user-empty{min-height:20rem}.admin-user-search .toolbar-search{max-width:27rem}'});
const experiment=await measure(p);observations.push({locale,width,height,actual,approved,experiment});
if(width===720&&height===1000){await p.screenshot({path:join(dir,'screenshots','experiment-'+locale+'.png'),fullPage:true});await d.screenshot({path:join(dir,'screenshots','baseline-design-'+locale+'.png'),fullPage:true});}
}
await c.close();}}finally{await b.close();writeFileSync(join(dir,'root-cause-confirmed.json'),JSON.stringify(observations,null,2),{flag:'wx'});}
console.log(JSON.stringify(observations.map(o=>({locale:o.locale,view:[o.width,o.height],emptyMin:[o.actual['.admin-user-empty'].minHeight,o.approved['.admin-user-empty'].minHeight],cardY:[o.actual['.admin-user-search'].y,o.approved['.admin-user-search'].y,o.experiment['.admin-user-search'].y],inputWidth:[o.actual['.toolbar-search'].w,o.approved['.toolbar-search'].w,o.experiment['.toolbar-search'].w]})),null,2));


