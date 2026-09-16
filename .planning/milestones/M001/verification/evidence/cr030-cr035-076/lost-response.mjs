import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,ready,login,api,recorder,sql,quote}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('lost-response'),b=await chromium.launch(),c=await b.newContext();const token=await login(c,'qa076_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});
const user=f.users.qa076_other;await api(c,'PUT','/api/v1/admin/users/'+user+'/group',token,{group_code:'basic',confirmed:true});
const p=await c.newPage();let puts=0,gets=0;
try{
 await p.goto(origin+'/admin/users/'+user);await ready(p);await expect(p.locator('.definition-list > div').nth(1).locator('dd')).toHaveText('5');
 p.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/group'))puts++;if(r.method()==='GET'&&r.url().endsWith('/admin/users/'+user))gets++;});
 await p.route('**/api/v1/admin/users/'+user+'/group',async route=>{
 const headers=await route.request().allHeaders();headers.origin=origin;headers['sec-fetch-site']='same-origin';
 const response=await route.fetch({headers});const body=await response.json();
 out.record('PUT reaches commit before dropping',response.status(),200);out.record('server group after intercepted PUT',sql('SELECT group_code FROM wordweave.accounts WHERE id='+quote(user)),'plus');
 console.log(JSON.stringify({responseStatus:response.status(),safeDetail:body.detail,csrfPresent:!!headers['x-csrf-token'],cookiePresent:!!headers.cookie}));
 await route.abort('connectionreset');
 });
 await p.getByRole('button',{name:'Change plan',exact:true}).click();await p.locator('dialog select').selectOption('plus');await p.locator('dialog').getByRole('button',{name:'Change plan',exact:true}).click();
 await expect(p.locator('.definition-list > div').nth(1).locator('dd')).toHaveText('0');await expect(p.locator('dialog')).toBeVisible();await expect(p.locator('dialog [role=alert]')).toBeVisible();out.record('no PUT replay and one reconcile GET',{puts,gets},{puts:1,gets:1});
}catch(e){out.error('lost response behavior',e);}finally{await b.close();out.save();}
