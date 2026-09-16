import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const phase=process.argv[2];if(!['before','after'].includes(phase))throw Error('Use before or after');
const out=recorder('layout-'+phase),observations=[],f=JSON.parse(readFileSync(join(dir,'layout-fixtures.json')));
mkdirSync(join(dir,'screenshots'),{recursive:true});
const settle=async p=>{await p.evaluate(()=>document.fonts.ready.then(()=>null));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.mouse.move(0,0);};
const planMeasure=p=>p.locator('.checkbox-list,.chip-list').evaluateAll(nodes=>nodes.map(n=>{const label=n.previousElementSibling,range=document.createRange();range.selectNodeContents(label);return{label:label.textContent.trim(),gap:n.getBoundingClientRect().top-label.getBoundingClientRect().bottom,offset:range.getBoundingClientRect().left-n.getBoundingClientRect().left};}));
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
  const c=await b.newContext();c.setDefaultTimeout(8000);const token=await login(c,'dev075_admin');
  for(const locale of['en-US','zh-CN']){
   out.record(engine+' '+locale+' preference HTTP',(await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale})).status,200);
   const p=await c.newPage(),dc=await b.newContext(),d=await dc.newPage();
   await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=default&locale='+locale);await d.locator('.checkbox-list').waitFor();await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
   out.record(engine+' '+locale+' fresh prototype preference',await d.locator('.locale-switch select').inputValue(),locale);
   for(const width of phase==='before'?[390,1440]:[320,390,720,900,901,1440]){
    await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});
    for(const username of phase==='before'?[f.longUsername]:[f.longUsername,'dev075_other']){
     await p.goto(origin+'/admin/users?q='+username);await ready(p);await expect(p.locator('.admin-user-result')).toHaveCount(1);
     out.record(engine+' '+locale+' '+width+' '+username+' full list name',await p.locator('.user-name').innerText(),username);
     await p.locator('.admin-user-result .button').click();await expect(p.locator('.user-detail-name')).toHaveText(username);await settle(p);
     const m=await p.locator('.admin-user-detail-grid > .card').first().evaluate(card=>{const n=card.querySelector('.user-detail-name'),badge=card.querySelector('.status-badge'),nr=n.getBoundingClientRect(),br=badge.getBoundingClientRect(),cr=card.getBoundingClientRect();return{pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,text:n.textContent,nameWidth:nr.width,nameHeight:nr.height,font:getComputedStyle(n).fontSize,lineHeight:getComputedStyle(n).lineHeight,overflowWrap:getComputedStyle(n).overflowWrap,contained:n.scrollWidth<=n.clientWidth+1&&nr.left>=cr.left&&nr.right<=br.left&&br.right<=cr.right&&badge.scrollWidth<=badge.clientWidth+1};});
     observations.push({engine,locale,width,username,detail:m});
     out.record(engine+' '+locale+' '+width+' '+username+' detail containment',m.pageWidth<=width&&m.contained,phase==='before'?width!==390:true);
     out.record(engine+' '+locale+' '+width+' search retained',await p.getByRole('search').locator('input').inputValue(),username);
     if(username===f.longUsername&&[390,1440].includes(width))await p.screenshot({path:join(dir,'screenshots',phase+'-detail-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});
    }
    await p.goto(origin+'/admin/plans');await ready(p);await settle(p);await settle(d);
    const expected=await planMeasure(d);
    for(let group=0;group<(phase==='before'?1:4);group++){
     await p.getByRole('tab').nth(group).click();await settle(p);const actual=await planMeasure(p);
     observations.push({engine,locale,width,group,actual,expected});
     out.record(engine+' '+locale+' '+width+' group'+group+' label copy',actual.map(x=>x.label),expected.map(x=>x.label));
     out.record(engine+' '+locale+' '+width+' group'+group+' gaps',actual.map(x=>x.gap),phase==='before'?[8,0]:expected.map(x=>x.gap));
     out.record(engine+' '+locale+' '+width+' group'+group+' alignment',actual.map(x=>x.offset),phase==='before'?[2,2]:expected.map(x=>x.offset));
     out.record(engine+' '+locale+' '+width+' group'+group+' semantics',await p.locator('.admin-plan-form fieldset > legend').count(),2);
     out.record(engine+' '+locale+' '+width+' group'+group+' page fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     if(group===0&&[390,1440].includes(width)){await p.screenshot({path:join(dir,'screenshots',phase+'-plans-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});if(phase==='after')await d.screenshot({path:join(dir,'screenshots','design-plans-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});}
    }
   }
   await p.close();await dc.close();
  }await c.close();
 }catch(e){out.error(engine+' '+phase,e);}finally{await b.close();}
}
writeFileSync(join(dir,'layout-'+phase+'-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
