import{writeFileSync}from'node:fs';import{join}from'node:path';import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('plans'),observations=[],codes=['visitor','basic','pro','plus'];
const measure=p=>p.locator('.checkbox-list,.chip-list').evaluateAll(ns=>ns.map(n=>{const l=n.previousElementSibling,r=l.getBoundingClientRect(),b=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(l);return{label:l.textContent.trim(),gap:b.top-r.bottom,offset:range.getBoundingClientRect().left-b.left};}));
const wait=p=>p.evaluate(()=>document.fonts.ready.then(()=>null));
for(const modelCount of[0,3]){
 if(modelCount===3){const b=await chromium.launch(),c=await b.newContext(),t=await login(c,'qa076_plans_admin');try{for(let i=1;i<=3;i++){const r=await api(c,'POST','/api/v1/admin/models',t,{display_name:'QA076 display '+i,description:i===2?'Safe synthetic model description':null,openrouter_model_id:'qa076/disabled-'+i});out.record('synthetic model created '+i,[r.status,r.body.data.model.enabled],[201,false]);}}finally{await b.close();}}
 for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
  const b=await type.launch();try{
   const c=await b.newContext();c.setDefaultTimeout(8000);const t=await login(c,'qa076_plans_admin'),initial=(await api(c,'GET','/api/v1/admin/groups')).body.data.items;
   for(const locale of['en-US','zh-CN']){
    await api(c,'PUT','/api/v1/me/ui-locale',t,{ui_locale:locale});const p=await c.newPage(),dc=await b.newContext(),d=await dc.newPage();await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=default&locale='+locale);await d.locator('.checkbox-list').waitFor();await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
    for(const width of[320,390,720,900,901,1440]){
     await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/plans');await ready(p);await wait(p);await wait(d);
     for(const[index,code]of codes.entries()){
      const key=[modelCount,engine,locale,width,code].join(' ');await p.getByRole('tab').nth(index).click();const a=await measure(p),e=await measure(d);observations.push({key,actual:a,approved:e});out.record(key+' exact field geometry and copy',a,e);out.record(key+' accessible fieldset grouping',await p.locator('.admin-plan-form fieldset > legend').count(),2);out.record(key+' correct model count',await p.locator('.checkbox-row').count(),modelCount);out.record(key+' no page overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(width===390){
       for(const checkbox of await p.locator('fieldset input').all())await checkbox.uncheck();if(modelCount===3){const first=p.locator('.checkbox-row input').first();await first.focus();await p.keyboard.press('Space');out.record(key+' keyboard selection',await first.isChecked(),true);await p.locator('.chip input').nth(index).check();}
       await p.locator('.admin-unlimited-switch input').setChecked(index===3);if(index!==3)await p.locator('#quota-limit').fill(index===0?'0':'7');out.record(key+' correct disabled quota',await p.locator('#quota-limit').isDisabled(),index===3);
       const response=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/api/v1/admin/groups/'+code));await p.locator('.card-footer button').click();const r=await response,body=await r.json(),sent=r.request().postDataJSON();out.record(key+' save returns200',r.status(),200);out.record(key+' full PUT keys',Object.keys(sent).sort(),['allowed_lengths','max_entries','model_ids','rolling_24h_limit']);out.record(key+' persisted selection and limit',[body.data.group.models.length,body.data.group.allowed_lengths.length,body.data.group.rolling_24h_limit],[modelCount?1:0,modelCount?1:0,index===3?null:index===0?0:7]);
       await p.reload();await ready(p);await p.getByRole('tab').nth(index).click();out.record(key+' reloaded choices',await p.locator('fieldset input:checked').count(),modelCount?2:0);
       observations.push({key,invalidConfigurationNotice:await p.locator('.notice-warning').allInnerTexts(),bodyText:await p.locator('main').innerText(),saved:body.data.group});
       const old=initial[index];await api(c,'PUT','/api/v1/admin/groups/'+code,t,{rolling_24h_limit:old.rolling_24h_limit,max_entries:old.max_entries,allowed_lengths:old.allowed_lengths,model_ids:old.models.map(x=>x.id)});await p.reload();await ready(p);
      }
     }
     if([390,1440].includes(width)){await p.screenshot({path:join(dir,'screenshots','plans-'+modelCount+'-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});await d.screenshot({path:join(dir,'screenshots','plans-approved-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});}
    }await p.close();await dc.close();
   }await c.close();
  }catch(e){out.error(modelCount+' '+engine+' plans execution',e);}finally{await b.close();}
 }
}
writeFileSync(join(dir,'plans-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
