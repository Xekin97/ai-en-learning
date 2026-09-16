import{chromium,request,expect,dir,origin,password,api,login,ready,recorder}from'./lib.mjs';import{join}from'node:path';import{writeFileSync}from'node:fs';
const out=recorder('residual-proof'),browser=await chromium.launch(),context=await browser.newContext({locale:'en-US',viewport:{width:390,height:1000}});let evidence={};
try{
 await login(context,'qa081_diag');const p=await context.newPage();await p.goto(origin+'/account');await ready(p);await p.locator('.settings-grid .card-footer .button-secondary').click();const inputs=p.locator('dialog input');for(let i=0;i<3;i++)await inputs.nth(i).fill(i===0?'Incorrect081Only!':'Qa081UnusedOnly!');
 const wait=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/me/password'));await p.locator('dialog button[type=submit]').click();out.record('wrong current response',(await wait).status(),422);
 await expect(p.locator('.app-error')).toBeVisible();const snapshot=await p.locator('body').ariaSnapshot(),alert=(await p.locator('.app-error').innerText()).trim();
 evidence.ui={viewport:390,alertText:alert,alertInsideModal:await p.locator('.app-error').evaluate(e=>!!e.closest('dialog')),accessibleTree:snapshot,alertInAccessibleTree:snapshot.includes(alert)};
 out.record('error exposed to modal accessibility tree',evidence.ui.alertInAccessibleTree,true);await p.screenshot({path:join(dir,'residual-password-error-390.png'),fullPage:true});
 await p.keyboard.press('Escape');out.record('cancel after failure restores page access',await p.locator('dialog').count(),0);
 const c={request:await request.newContext()},b=await(await c.request.get(origin+'/api/v1/bootstrap')).json();const r=await api(c,'POST','/api/v1/auth/register',b.data.csrf_token,{username:'qa081_header_proof',password,password_confirmation:password,ui_locale:'en-US'});out.record('header fixture created',r.status,201);
 const token=(await(await c.request.get(origin+'/api/v1/bootstrap')).json()).data.csrf_token;
 const response=await c.request.put(origin+'/api/v1/me/password',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':token},data:{current_password:password,new_password:'Qa081HeaderUpdated!',new_password_confirmation:'Qa081HeaderUpdated!'}});
 evidence.api={method:'PUT',path:'/api/v1/me/password',status:response.status(),headers:Object.fromEntries(Object.entries(response.headers()).filter(([k])=>!['set-cookie'].includes(k))),bodyBytes:(await response.body()).length};
 out.record('password204',evidence.api.status,204);out.record('empty body',evidence.api.bodyBytes,0);out.record('private password response cache policy',evidence.api.headers['cache-control']??null,'no-store');await c.request.dispose();
}catch(e){out.error('residual proof execution',e);}finally{await context.close();await browser.close();}
writeFileSync(join(dir,'residual-proof-observations.json'),JSON.stringify(evidence,null,2),{flag:'wx'});out.save();

