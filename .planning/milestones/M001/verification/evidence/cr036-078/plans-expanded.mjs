import{writeFileSync}from'node:fs';import{join}from'node:path';import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';import{chromium,webkit,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const out=recorder('plans-expanded'),observations=[],codes=['visitor','basic','pro','plus'];
const style=page=>page.locator('.notice-warning').evaluate(n=>{const s=getComputedStyle(n),title=n.querySelector('.notice-title'),t=getComputedStyle(title);return{padding:s.padding,gap:s.gap,border:s.border,bg:s.backgroundColor,color:s.color,radius:s.borderRadius,font:s.fontSize,line:s.lineHeight,title:{font:t.fontSize,weight:t.fontWeight,line:t.lineHeight,margin:t.marginBottom},margin:s.marginBottom};});
async function configure(p,mode){
 for(const n of await p.locator('fieldset input').all())await n.uncheck();
 if(!['no-models','empty-unlimited'].includes(mode))await p.locator('.checkbox-row input').first().check();
 if(!['no-length','empty-unlimited'].includes(mode))await p.locator('.chip input').first().check();
 await p.locator('.admin-unlimited-switch input').uncheck();await p.locator('#quota-limit').fill(mode==='zero-only'?'0':'5');
 if(['unlimited','empty-unlimited'].includes(mode))await p.locator('.admin-unlimited-switch input').check();
}
for(const[type,engine]of[[chromium,'chromium'],[webkit,'webkit']]){
const b=await type.launch();const c=await b.newContext();c.setDefaultTimeout(10000);const token=await login(c,'qa078_plans_admin'),initial=(await api(c,'GET','/api/v1/admin/groups')).body.data.items;
try{for(const locale of['en-US','zh-CN']){
 await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const dc=await b.newContext(),d=await dc.newPage(),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const width of[390,1440]){
  await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await d.goto(design+'/prototype/?page=PAGE-102&role=admin&state=invalid&locale='+locale);await d.locator('.notice-warning').waitFor();await d.addStyleTag({content:'.prototype-tools{display:none!important}'});await d.evaluate(()=>document.fonts.ready.then(()=>null));const approved=await d.locator('.notice-warning').innerText(),approvedStyle=await style(d),title=await d.locator('.notice-title').innerText();
  for(const[index,code]of codes.entries()){
   await p.goto(origin+'/admin/plans');await ready(p);await p.getByRole('tab').nth(index).click();
   for(const mode of['no-models','no-length','zero-only','finite','unlimited','empty-unlimited']){
    await configure(p,mode);const key=[engine,locale,width,code,mode].join(' '),expected=mode==='finite'||mode==='unlimited'?[]:[mode==='zero-only'?title:approved],notice=p.locator('.admin-plan-warning');
    if(expected.length)await expect(notice).toBeVisible();else await expect(notice).toHaveCount(0);
    out.record(key+' draft notice',await notice.allInnerTexts(),expected);
    const response=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/api/v1/admin/groups/'+code));await p.locator('.card-footer button').click();const r=await response,body=await r.json();
    out.record(key+' saved200',r.status(),200);out.record(key+' exact replacement keys',Object.keys(r.request().postDataJSON()).sort(),['allowed_lengths','max_entries','model_ids','rolling_24h_limit']);
    out.record(key+' server projection',[body.data.group.models.length,body.data.group.allowed_lengths.length,body.data.group.rolling_24h_limit],[['no-models','empty-unlimited'].includes(mode)?0:1,['no-length','empty-unlimited'].includes(mode)?0:1,['unlimited','empty-unlimited'].includes(mode)?null:mode==='zero-only'?0:5]);
    await p.reload();await ready(p);await p.getByRole('tab').nth(index).click();out.record(key+' restored notice',await notice.allInnerTexts(),expected);out.record(key+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(expected.length){await expect(notice).toHaveAttribute('role','status');out.record(key+' exact approved warning styles',await style(p),approvedStyle);}
    if(code==='visitor'&&mode==='no-models'){await p.screenshot({path:join(dir,'screenshots','expanded-'+engine+'-'+locale+'-'+width+'.png'),fullPage:true});observations.push({key,warning:await notice.innerText(),style:await style(p),approvedStyle});}
   }
  }
 }
 // Live language switch must not discard an unsaved non-generating draft.
 await p.goto(origin+'/admin/plans');await ready(p);await configure(p,'no-length');const alternate=locale==='en-US'?'zh-CN':'en-US';await p.locator('.locale-switch select').selectOption(alternate);await expect(p.locator('.notice-title')).toHaveText(alternate==='zh-CN'?'当前方案已暂停生成':'Creation is paused for this plan');out.record(engine+' '+locale+' locale preserves draft',[await p.locator('.checkbox-row input:checked').count(),await p.locator('.chip input:checked').count()],[1,0]);await p.locator('.locale-switch select').selectOption(locale);
 // Failed save retains warning/draft and cannot change the server; retry is an ordinary save.
 const before=(await api(c,'GET','/api/v1/admin/groups')).body.data.items[0];await p.route('**/api/v1/admin/groups/visitor',route=>route.request().method()==='PUT'?route.fulfill({status:500,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/internal_error',title:'Request failed',status:500,code:'internal_error',detail:'QA controlled failure',request_id:'req-078-plan'})}):route.continue());
 await p.locator('.card-footer button').click();await expect(p.locator('.app-error')).toBeVisible();out.record(engine+' '+locale+' failed save retains draft',[await p.locator('.chip input:checked').count(),await p.locator('.admin-plan-warning').count()],[0,1]);out.record(engine+' '+locale+' failed save leaves persisted policy',(await api(c,'GET','/api/v1/admin/groups')).body.data.items[0],before);
 await p.unroute('**/api/v1/admin/groups/visitor');const response=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/admin/groups/visitor'));await p.locator('.card-footer button').click();out.record(engine+' '+locale+' retry saved200',(await response).status(),200);await expect(p.locator('.app-error')).toHaveCount(0);
 const axe=await new AxeBuilder({page:p}).analyze();out.record(engine+' '+locale+' warning axe',axe.violations.filter(x=>['serious','critical'].includes(x.impact)).map(x=>x.id),[]);out.record(engine+' '+locale+' no runtime errors',errors,[]);
 await p.close();await dc.close();
}}
catch(e){out.error(engine+' expanded policies',e);}
finally{for(const g of initial)await api(c,'PUT','/api/v1/admin/groups/'+g.code,token,{rolling_24h_limit:g.rolling_24h_limit,max_entries:g.max_entries,allowed_lengths:g.allowed_lengths,model_ids:g.models.map(m=>m.id)});await c.close();await b.close();}
}
writeFileSync(join(dir,'plans-expanded-observations.json'),JSON.stringify(observations,null,2),{flag:'wx'});out.save();
