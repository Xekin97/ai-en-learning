import{mkdirSync,readFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('plans-states-final');mkdirSync(join(dir,'screenshots'),{recursive:true});
const b=await chromium.launch();try{
const c=await b.newContext(),token=await login(c,'qa077_admin');if(!(await api(c,'GET','/api/v1/admin/models')).body.data.items.length)throw Error('Missing existing disabled model');
for(const locale of['en-US','zh-CN']){
 await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),dc=await b.newContext(),d=await dc.newPage();
 for(const width of[390,1440]){await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=invalid&locale='+locale);await d.addStyleTag({content:'.prototype-tools{display:none!important}'});const approved=await d.locator('.notice-warning').innerText();
 for(const[index,code]of['visitor','basic','pro','plus'].entries()){
  await p.goto(origin+'/admin/plans');await ready(p);await p.getByRole('tab').nth(index).click();
  for(const mode of['missing-zero','missing-finite','zero-only','ready','unlimited']){
   const missing=mode.startsWith('missing'),zero=mode==='missing-zero'||mode==='zero-only',unlimited=mode==='unlimited';
   for(const n of await p.locator('fieldset input').all())await n.uncheck();
   if(!missing){await p.locator('.admin-available-models input').first().check();await p.locator('.chip input').first().check();}
   await p.locator('.admin-unlimited-switch input').uncheck();await p.locator('#quota-limit').fill(zero?'0':'5');if(unlimited)await p.locator('.admin-unlimited-switch input').check();
   const key=[locale,width,code,mode].join(' '),warning=p.locator('.admin-plan-warning');
   out.record(key+' live warning count',await warning.count(),missing||zero?1:0);
   if(missing)out.record(key+' exact approved notice',await warning.innerText(),approved);
   if(mode==='zero-only')out.record(key+' title only',await warning.innerText(),locale==='zh-CN'?'当前方案已暂停生成':'Creation is paused for this plan');
   const saved=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/api/v1/admin/groups/'+code));await p.locator('.card-footer button').click();const r=await saved,body=await r.json();
   out.record(key+' allowed save200',r.status(),200);out.record(key+' response selections and quota',[body.data.group.models.length,body.data.group.allowed_lengths.length,body.data.group.rolling_24h_limit],[missing?0:1,missing?0:1,unlimited?null:zero?0:5]);
   await p.reload();await ready(p);await p.getByRole('tab').nth(index).click();out.record(key+' survives reload',await warning.count(),missing||zero?1:0);
   out.record(key+' no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const gap=await p.locator('fieldset').evaluateAll(nodes=>nodes.map(n=>{const l=n.querySelector('legend'),v=l.nextElementSibling,range=document.createRange();range.selectNodeContents(l);return[Math.round(v.getBoundingClientRect().top-l.getBoundingClientRect().bottom),Math.round(range.getBoundingClientRect().left-v.getBoundingClientRect().left)];}));out.record(key+' retained label geometry',gap,[[8,0],[8,0]]);
   if(missing){out.record(key+' warning bottom margin',await warning.evaluate(n=>getComputedStyle(n).marginBottom),'24px');await expect(warning).toHaveAttribute('role','status');}
   if(code==='visitor'&&mode==='missing-finite')await p.screenshot({path:join(dir,'screenshots','plans-final-'+locale+'-'+width+'.png'),fullPage:true});
  }
 }
 }await p.close();await dc.close();
}await c.close();
}catch(e){out.error('developer plan states',e);}finally{await b.close();out.save();}
