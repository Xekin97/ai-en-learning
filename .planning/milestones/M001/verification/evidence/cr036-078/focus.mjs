import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const names=JSON.parse(readFileSync(join(dir,'focus-fixtures.json'))),out=recorder('focus'),observations=[];mkdirSync(join(dir,'screenshots'),{recursive:true});
const settle=async p=>{await p.evaluate(()=>document.fonts.ready.then(()=>null));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.mouse.move(0,0);};
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
  const c=await b.newContext();c.setDefaultTimeout(8000);const token=await login(c,'qa078_focus_admin');
  for(const locale of['en-US','zh-CN']){
   await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const dc=await b.newContext(),d=await dc.newPage(),p=await c.newPage();await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=detail&locale='+locale);await d.locator('.user-detail-name').waitFor();
   const font=await d.locator('.user-detail-name').evaluate(n=>{const s=getComputedStyle(n);return[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight]});
   for(const {username,id}of names){
    for(const width of[320,390,720,721,900,901,1280,1440]){
     await p.setViewportSize({width,height:844});await p.goto(origin+'/admin/users?q='+username);await ready(p);await expect(p.locator('.admin-user-result')).toHaveCount(1);await expect(p.locator('.user-name')).toHaveText(username);
     out.record(engine+' '+locale+' '+width+' '+username+' list fits',await p.locator('.admin-user-result').evaluate(n=>n.scrollWidth<=n.clientWidth&&document.documentElement.scrollWidth<=innerWidth),true);
     await p.locator('.admin-user-result .button').click();await expect(p).toHaveURL(u=>u.pathname==='/admin/users/'+id);await expect(p.locator('.user-detail-name')).toHaveText(username);await settle(p);
     const m=await p.locator('.admin-user-detail-grid > .card').first().evaluate(card=>{const n=card.querySelector('.user-detail-name'),badge=card.querySelector('.status-badge'),r=n.getBoundingClientRect(),b=badge.getBoundingClientRect(),cr=card.getBoundingClientRect(),s=getComputedStyle(n);const range=document.createRange();range.selectNodeContents(n);return{viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,text:n.textContent,box:{x:r.x,y:r.y,w:r.width,h:r.height},textRects:[...range.getClientRects()].map(x=>({x:x.x,y:x.y,w:x.width,h:x.height})),nameFits:n.scrollWidth<=n.clientWidth+1,badgeFits:badge.scrollWidth<=badge.clientWidth+1&&b.right<=cr.right&&r.right<=b.left,font:[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight],clip:[s.overflowX,s.textOverflow],header:getComputedStyle(card.querySelector('.card-header')).padding};});
     observations.push({engine,locale,width,username,measurement:m});out.record(engine+' '+locale+' '+width+' '+username+' full-name containment',[m.pageWidth<=width,m.nameFits,m.badgeFits],[true,true,true]);out.record(engine+' '+locale+' '+width+' font not reduced',m.font,font);out.record(engine+' '+locale+' '+width+' full content',m.text,username);
     await expect(p.getByRole('search').locator('input')).toHaveValue(username);await p.locator('.admin-user-detail-toolbar a').click();await expect(p.locator('.admin-user-result .button')).toBeFocused();out.record(engine+' '+locale+' '+width+' restored query',new URL(p.url()).searchParams.get('q'),username);
     if(username===names[0].username&&[320,390,1440].includes(width)){await p.locator('.admin-user-result .button').click();await expect(p.locator('.user-detail-name')).toHaveText(username);await settle(p);await p.screenshot({path:join(dir,'screenshots','long-detail-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});}
    }
   }
   await p.goto(origin+'/admin/users/'+names[0].id);await ready(p);const axe=await new AxeBuilder({page:p}).analyze();out.record(engine+' '+locale+' long-detail axe',axe.violations.filter(x=>['serious','critical'].includes(x.impact)).map(x=>x.id),[]);await p.close();await dc.close();
  }await c.close();
 }catch(e){out.error(engine+' long-name execution',e);}finally{await b.close();}
}
writeFileSync(join(dir,'focus-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
