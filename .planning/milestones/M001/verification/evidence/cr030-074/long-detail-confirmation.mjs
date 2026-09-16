import{writeFileSync}from'node:fs';import{join}from'node:path';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,sql,recorder}from'./lib.mjs';
const out=recorder('long-detail-confirmation'),observations=[];
const id=sql("SELECT id FROM wordweave.accounts WHERE username='abcdefghijklmnopqrstuvwxyz123456'");
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
  const c=await b.newContext();const token=await login(c,'qa074_edge_admin');
  for(const locale of['en-US','zh-CN']){
   await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
   const dc=await b.newContext(),d=await dc.newPage(),p=await c.newPage();
   await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=detail&locale='+locale);await d.locator('.admin-user-detail-grid').waitFor();await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
   out.record(engine+' fresh prototype locale '+locale,await d.locator('.locale-switch select').inputValue(),locale);
   for(const width of[320,390,720,1440]){
    await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users/'+id);await ready(p);await p.locator('.admin-user-detail-grid').waitFor();
    await p.evaluate(()=>document.fonts.ready.then(()=>null));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.mouse.move(0,0);
    const measurement=await p.evaluate(()=>{
     const n=document.querySelector('.user-detail-name'),s=getComputedStyle(n),r=n.getBoundingClientRect();
     return{viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,name:{text:n.textContent,x:r.x,y:r.y,w:r.width,h:r.height,overflowWrap:s.overflowWrap,wordBreak:s.wordBreak},overflow:[...document.querySelectorAll('main *')].map(n=>({tag:n.tagName,class:n.className,rect:n.getBoundingClientRect()})).filter(x=>x.rect.right>innerWidth+1).slice(0,12).map(x=>({tag:x.tag,class:x.class,x:x.rect.x,w:x.rect.width,right:x.rect.right}))};
    });
    observations.push({engine,locale,width,measurement});out.record(engine+' '+locale+' '+width+' 32-character detail page fits',measurement.pageWidth<=width,true);
    if([320,390].includes(width))await p.screenshot({path:join(dir,'screenshots','long-name-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});
    if(width===720){
     const m=page=>page.locator('.locale-switch').evaluate(n=>({options:[...n.querySelectorAll('option')].map(x=>x.textContent),width:n.getBoundingClientRect().width}));
     observations.push({engine,locale,width,localeActual:await m(p),localeApproved:await m(d)});
     out.record(engine+' '+locale+' locale options and width',await m(p),await m(d));
    }
   }await p.close();await dc.close();
  }await c.close();
 }catch(e){out.error(engine+' confirmation',e);}finally{await b.close();}
}
writeFileSync(join(dir,'long-detail-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
