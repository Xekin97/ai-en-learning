import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('plans-edge'),observations=[],f=JSON.parse(readFileSync(join(dir,'layout-fixtures.json')));
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
  const c=await b.newContext();c.setDefaultTimeout(8000);const token=await login(c,'dev075_admin'),p=await c.newPage();
  const groups=(await api(c,'GET','/api/v1/admin/groups')).body.data.items;
  for(const locale of['en-US','zh-CN']){
   await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
   for(const width of[390,1440]){
    const key=engine+' '+locale+' '+width;await p.setViewportSize({width,height:1000});await p.goto(origin+'/admin/plans');await ready(p);
    for(let i=0;i<4;i++){
     const group=groups[i],label=key+' '+group.code;await p.getByRole('tab').nth(i).click();await expect(p.locator('.checkbox-row')).toHaveCount(3);
     out.record(label+' multi-model aligned gaps',await p.locator('.admin-plan-form fieldset').evaluateAll(ns=>ns.map(n=>{const l=n.querySelector('legend'),list=l.nextElementSibling,range=document.createRange();range.selectNodeContents(l);return[list.getBoundingClientRect().top-l.getBoundingClientRect().bottom,range.getBoundingClientRect().left-list.getBoundingClientRect().left]})),[[8,0],[8,0]]);
     const check=p.locator('.checkbox-row input').first(),before=await check.isChecked();await check.focus();await p.keyboard.press('Space');out.record(label+' keyboard toggle',await check.isChecked(),!before);await p.keyboard.press('Space');
     for(const n of await p.locator('fieldset input').all())await n.uncheck();
     const unlimited=p.locator('.admin-unlimited-switch input');await unlimited.setChecked(i===3);if(i!==3)await p.locator('#quota-limit').fill(String(i===0?0:7));
     out.record(label+' quota input disabled only for unlimited',await p.locator('#quota-limit').isDisabled(),i===3);
     const wait=p.waitForResponse(r=>r.url().endsWith('/api/v1/admin/groups/'+group.code)&&r.request().method()==='PUT');await p.locator('.card-footer button').click();const response=await wait,body=await response.json();
     out.record(label+' empty assignment save',response.status(),200);out.record(label+' zero/finite/unlimited projection',{models:body.data.group.models,lengths:body.data.group.allowed_lengths,limit:body.data.group.rolling_24h_limit},{models:[],lengths:[],limit:i===3?null:i===0?0:7});observations.push({label,request:response.request().postDataJSON(),response:body});
     await p.reload();await ready(p);await p.getByRole('tab').nth(i).click();out.record(label+' cleared choices persist',await p.locator('fieldset input:checked').count(),0);
     const restored=await api(c,'PUT','/api/v1/admin/groups/'+group.code,token,{rolling_24h_limit:group.rolling_24h_limit,max_entries:group.max_entries,allowed_lengths:group.allowed_lengths,model_ids:group.models.map(m=>m.id)});out.record(label+' restore owned fixture',restored.status,200);await p.reload();await ready(p);
    }
    for(const path of['/admin/plans','/admin/users/'+f.longUserId]){
     await p.goto(origin+path);await ready(p);const axe=await new AxeBuilder({page:p}).analyze();observations.push({key,path,axe:axe.violations});out.record(key+' '+path+' axe serious/critical',axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
    }
   }
  }await c.close();
 }catch(e){out.error(engine+' edge',e);}finally{await b.close();}
}
writeFileSync(join(dir,'plans-edge-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
