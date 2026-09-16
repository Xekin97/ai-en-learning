import{chromium,expect,origin,design,ready,login,api,sql,recorder}from'./lib.mjs';
const out=recorder('models-list-corrected'),b=await chromium.launch();
try{
 out.record('fixture is disabled',sql("SELECT enabled FROM wordweave.ai_models WHERE display_name='QA quota fixture'"),'f');
 for(const locale of['en-US','zh-CN']){
  const c=await b.newContext();const token=await login(c,'qa072_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage();
  await p.goto(origin+'/admin/models');await ready(p);await d.goto(design+'/prototype/?page=PAGE-101&role=admin&state=default&locale='+locale);
  await expect(d.locator('.locale-switch select')).toHaveValue(locale);
  const a=p.locator('.model-row').first(),approved=d.locator('.model-row').nth(2);
  for(const s of['.status-badge','button'])out.record('same disabled model copy '+s+' '+locale,await a.locator(s).innerText(),await approved.locator(s).innerText());
  out.record('zero-plan references '+locale,await a.locator('.helper').innerText(),await approved.locator('.helper').innerText());
  await c.close();
 }
}catch(e){out.error('model matched fixture execution',e);}finally{await b.close();out.save();}

