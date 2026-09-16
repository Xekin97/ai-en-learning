import{writeFileSync}from'node:fs';import{join}from'node:path';import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('plans-warning-finite'),observations=[];
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{const c=await b.newContext();c.setDefaultTimeout(8000);const token=await login(c,'qa076_plans_admin');
 for(const locale of['en-US','zh-CN']){await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const dc=await b.newContext(),d=await dc.newPage(),p=await c.newPage();
 for(const width of[390,1440]){await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/plans');await ready(p);await p.getByRole('tab').first().click();
 // Only Guest is mutated: it cannot affect registered-account quota or review regression.
 const previous=(await api(c,'GET','/api/v1/admin/groups')).body.data.items[0];
 for(const n of await p.locator('fieldset input').all())await n.uncheck();await p.locator('.admin-unlimited-switch input').uncheck();await p.locator('#quota-limit').fill('5');
 const saved=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/api/v1/admin/groups/visitor'));await p.locator('.card-footer button').click();const r=await saved,body=await r.json();
 const key=engine+' '+locale+' '+width;out.record(key+' real save200',r.status(),200);out.record(key+' persisted non-generating configuration',[body.data.group.models,body.data.group.allowed_lengths,body.data.group.rolling_24h_limit],[[],[],5]);
 await p.reload();await ready(p);await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=invalid&locale='+locale);await d.locator('.notice-warning').waitFor();await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
 const expected=await d.locator('.notice-warning').innerText(),actual=await p.locator('.notice-warning').allInnerTexts();observations.push({key,response:body.data.group,actual,expected,actualPage:await p.locator('main').innerText()});out.record(key+' disabled-plan warning matches approved state',actual,[expected]);
 await p.screenshot({path:join(dir,'screenshots','plans-invalid-finite-'+engine+'-'+locale+'-'+width+'-app.png'),fullPage:true});await d.screenshot({path:join(dir,'screenshots','plans-invalid-finite-'+engine+'-'+locale+'-'+width+'-design.png'),fullPage:true});
 await api(c,'PUT','/api/v1/admin/groups/visitor',token,{rolling_24h_limit:previous.rolling_24h_limit,max_entries:previous.max_entries,allowed_lengths:previous.allowed_lengths,model_ids:previous.models.map(x=>x.id)});
 }await p.close();await dc.close();}await c.close();}catch(e){out.error(engine+' warning confirmation',e);}finally{await b.close();}
}
writeFileSync(join(dir,'plans-warning-finite-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
