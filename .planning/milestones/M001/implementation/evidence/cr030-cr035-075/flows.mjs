import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
import{chromium,webkit,expect,dir,origin,ready,login,api,sql,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'layout-fixtures.json'))),out=recorder('flows'),observations=[];
const initialCounts=sql('SELECT (SELECT count(*) FROM wordweave.learning_batches),(SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.review_sessions);');
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
  const c=await b.newContext();c.setDefaultTimeout(10000);const token=await login(c,'dev075_admin'),p=await c.newPage();
  for(const locale of['en-US','zh-CN']){
   await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
   for(const width of[390,1440]){
    const key=engine+' '+locale+' '+width;await p.setViewportSize({width,height:1000});
    await p.goto(origin+'/admin/users?q=dev075_search');await ready(p);await expect(p.locator('.admin-user-result')).toHaveCount(20);
    await p.locator('.admin-user-pagination button').click();await expect(p.locator('.admin-user-result')).toHaveCount(40);
    const link=p.locator('.admin-user-result .button').nth(30),href=await link.getAttribute('href');await link.scrollIntoViewIfNeeded();await link.focus();const scroll=await p.evaluate(()=>scrollY);await link.click();
    await expect(p.locator('.user-detail-name')).toHaveText('dev075_search_31');await expect(p.getByRole('search').locator('input')).toHaveValue('dev075_search');
    await p.locator('.admin-user-detail-toolbar a').click();await expect(p.locator('.admin-user-result')).toHaveCount(40);await expect(p.locator('.admin-user-result .button').nth(30)).toBeFocused();
    out.record(key+' return query',await p.getByRole('search').locator('input').inputValue(),'dev075_search');out.record(key+' return focus target',await p.locator(':focus').getAttribute('href'),href);out.record(key+' return scroll',Math.abs(await p.evaluate(()=>scrollY)-scroll)<=2,true);
    await p.goto(origin+'/admin/users?q='+f.longUsername);await ready(p);await p.locator('.admin-user-result .button').click();await expect(p.locator('.user-detail-name')).toHaveText(f.longUsername);
    out.record(key+' full-name API→detail',await p.locator('.user-detail-name').innerText(),f.longUsername);
    for(let index=0;index<2;index++){
     const button=p.locator('.admin-user-detail-grid .model-row button').nth(index);await button.scrollIntoViewIfNeeded();const y=await p.evaluate(()=>scrollY);await button.click();await expect(p.locator('.reading-passage')).toBeVisible();
     out.record(key+' reader'+index+' parent retained',new URL(p.url()).pathname,'/admin/users/'+f.longUserId);out.record(key+' reader'+index+' username',await p.locator('.reader-context > span').innerText(),f.longUsername);
     out.record(key+' reader'+index+' read-only',await p.locator('.reader-dialog input,.reader-dialog textarea,.reader-dialog select').count(),0);
     out.record(key+' reader'+index+' no overflow',await p.locator('.reader-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth&&document.documentElement.scrollWidth<=innerWidth),true);
     const id=new URL(p.url()).searchParams.get('batch'),expected=sql("SELECT passage FROM wordweave.learning_batches WHERE id='"+id+"'");
     out.record(key+' reader'+index+' whole passage',await p.locator('.reading-passage').innerText().then(t=>t.trim()===expected.trim()),true);
     await p.locator('.reader-body').evaluate(n=>n.scrollTop=n.scrollHeight);await expect(p.locator('.dialog-footer button')).toBeInViewport();
     if(index===0)await p.keyboard.press('Escape');else await p.locator('.dialog-footer button').click();
     await expect(p.locator('.reader-dialog')).toHaveCount(0);await expect(button).toBeFocused();out.record(key+' reader'+index+' return scroll',Math.abs(await p.evaluate(()=>scrollY)-y)<=2,true);
    }
    await p.getByRole('search').locator('input').fill('dev075_other');await p.getByRole('search').getByRole('button').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);out.record(key+' detail search replaces query',await p.locator('.user-name').innerText(),'dev075_other');
   }
  }await c.close();
 }catch(e){out.error(engine+' users interaction',e);}finally{await b.close();}
}
// Create disabled synthetic models only. Never invoke enable/compatibility or a provider.
const b=await chromium.launch();try{
 const c=await b.newContext(),token=await login(c,'dev075_admin'),p=await c.newPage();c.setDefaultTimeout(10000);
 out.record('initial empty model options',(await api(c,'GET','/api/v1/admin/models')).body.data.items.length,0);
 const ids=[];for(let i=1;i<=3;i++){const r=await api(c,'POST','/api/v1/admin/models',token,{display_name:'DEV075 model '+i,description:i===2?'Synthetic display-only description':null,openrouter_model_id:'dev075/no-provider-'+i});out.record('create disabled fixture '+i,r.status,201);out.record('fixture disabled '+i,r.body.data.model.enabled,false);ids.push(r.body.data.model.id);}
 for(const locale of['en-US','zh-CN']){
  await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
  for(const width of[390,1440]){
   await p.setViewportSize({width,height:1000});await p.goto(origin+'/admin/plans');await ready(p);
   for(const [index,code] of ['visitor','basic','pro','plus'].entries()){
    const key=locale+' '+width+' '+code;await p.getByRole('tab').nth(index).click();out.record(key+' all models displayed',await p.locator('.checkbox-row').count(),3);
    const selected=index%2===0;for(let i=0;i<3;i++)await p.locator('.checkbox-row input').nth(i).setChecked(selected||i===0);
    for(let i=0;i<4;i++)await p.locator('fieldset .chip input').nth(i).setChecked(i<=index);
    const expectedIds=(selected?ids:[ids[0]]).sort();
    const wait=p.waitForResponse(r=>r.url().endsWith('/api/v1/admin/groups/'+code)&&r.request().method()==='PUT');await p.locator('.card-footer button').click();const response=await wait;out.record(key+' save HTTP',response.status(),200);
    const sent=response.request().postDataJSON(),returned=await response.json();
    out.record(key+' full replacement keys',Object.keys(sent).sort(),['allowed_lengths','max_entries','model_ids','rolling_24h_limit']);out.record(key+' persisted models',returned.data.group.models.map(x=>x.id).sort(),expectedIds);out.record(key+' persisted lengths',returned.data.group.allowed_lengths,['short','medium','long','xlong'].slice(0,index+1));
    observations.push({key,request:sent,response:returned});
    await p.reload();await ready(p);await p.getByRole('tab').nth(index).click();out.record(key+' reloaded choices',await p.locator('.checkbox-row input').evaluateAll(ns=>ns.map(n=>n.checked)),[true,selected,selected]);
    out.record(key+' multiple-model geometry',await p.locator('.admin-plan-form fieldset').evaluateAll(ns=>ns.map(n=>{const l=n.querySelector('legend'),list=l.nextElementSibling,range=document.createRange();range.selectNodeContents(l);return[list.getBoundingClientRect().top-l.getBoundingClientRect().bottom,range.getBoundingClientRect().left-list.getBoundingClientRect().left]})),[[8,0],[8,0]]);
    out.record(key+' multiple-model page fits',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await p.screenshot({path:join(dir,'screenshots','after-plans-multiple-'+locale+'-'+width+'.png'),fullPage:true});
  }
 }
 await c.close();
}catch(e){out.error('Plans save flow',e);}finally{await b.close();}
out.record('read-only flows preserve batches/generations/review sessions',sql('SELECT (SELECT count(*) FROM wordweave.learning_batches),(SELECT count(*) FROM wordweave.generation_runs),(SELECT count(*) FROM wordweave.review_sessions);'),initialCounts);
writeFileSync(join(dir,'flows-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
