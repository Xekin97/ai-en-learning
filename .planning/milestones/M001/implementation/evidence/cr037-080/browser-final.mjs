import{join}from'node:path';import{chromium,webkit,expect,request,dir,origin,design,password,ready,api,login,recorder}from'./lib.mjs';
const out=recorder('browser-final'),errors=[];
const settled=async p=>p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
const text=async(p,s)=>(await p.locator(s).allInnerTexts()).map(v=>v.replace(/\s+/gu,' ').trim());
const intent=async p=>p.locator('.auth-card').evaluate(card=>{const hint=card.querySelector('.auth-intent'),h=card.querySelector('h2'),r=card.getBoundingClientRect(),v=hint.getBoundingClientRect(),s=getComputedStyle(hint);return{text:hint.textContent.trim(),role:hint.getAttribute('role'),first:card.firstElementChild===hint,before:!!(hint.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING),top:Math.round((v.top-r.top)*100)/100,titleGap:Math.round((h.getBoundingClientRect().top-v.bottom)*100)/100,style:[s.backgroundColor,s.color,s.padding,s.margin,s.borderRadius]};});
async function ctx(b,locale,width){const c=await b.newContext({locale,viewport:{width,height:1000}});c.setDefaultTimeout(15000);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));await c.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);return c;}
async function proto(c,id,role,locale){const p=await c.newPage();await p.goto(design+'/prototype/?page='+id+'&role='+role+'&state=default&locale='+locale);await p.locator('main').waitFor();await p.locator('.prototype-tools').evaluate(e=>e.style.display='none');await settled(p);return p;}
async function freshLogin(username,secret,locale){const c=await request.newContext(),b=await(await c.get(origin+'/api/v1/bootstrap')).json();const r=await c.post(origin+'/api/v1/auth/login',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token},data:{username,password:secret,browser_ui_locale:locale}});await c.dispose();return r.status();}
for(const[engine,type]of[['Chromium',chromium],['WebKit',webkit]]){
 const b=await type.launch();
 try{
  for(const locale of['en-US','zh-CN'])for(const width of[390,1440]){
   const c=await ctx(b,locale,width),p=await c.newPage(),d=await proto(c,'PAGE-007','visitor',locale),key=engine+'-'+locale+'-'+width;
   try{
    await p.goto(origin+'/review');await ready(p);await p.locator('.auth-gate .button-primary').click();await ready(p);
    await d.locator('.auth-gate [data-value=PAGE-003]').click();await settled(d);await settled(p);
    for(const mode of['login','register']){
     if(mode==='register'){await p.locator('.auth-alt a').click();await ready(p);await d.locator('.auth-alt [data-value=PAGE-002]').click();await settled(p);await settled(d);}
     out.record(key+' '+mode+' exact placement/status/copy/style',await intent(p),await intent(d));
     out.record(key+' '+mode+' safe return',new URL(p.url()).searchParams.get('redirect'),'/review');
     out.record(key+' '+mode+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     for(const[n,page]of[['actual',p],['design',d]])await page.screenshot({path:join(dir,'final-'+key+'-'+mode+'-'+n+'.png'),fullPage:true});
    }
   }finally{await c.close();}
  }
  for(const locale of['en-US','zh-CN']){
   const c=await ctx(b,locale,1440),other=await ctx(b,locale,1440),username='dev080_final_'+engine.toLowerCase()+'_'+locale.slice(0,2),changed='Dev080ChangedOnly!';
   try{
    const bootstrap=await(await c.request.get(origin+'/api/v1/bootstrap')).json(),created=await api(c,'POST','/api/v1/auth/register',bootstrap.data.csrf_token,{username,password,password_confirmation:password,ui_locale:locale});
    out.record(engine+' '+locale+' synthetic registration',created.status,201);if(created.status!==201)throw Error('Synthetic registration failed');
    await login(other,username,locale);
    const p=await c.newPage(),d=await proto(c,'PAGE-009','learner',locale);
    await p.goto(origin+'/account');await ready(p);const trigger=p.locator('.settings-grid .card-footer .button-secondary');
    await trigger.click();await d.locator('[data-action=change-password]').click();await expect(p.locator('dialog[open]')).toBeVisible();
    for(const width of[390,1440]){
     await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await settled(p);await settled(d);const key=engine+'-'+locale+'-'+width+'-password';
     for(const s of['dialog h2','dialog .field-label','dialog .helper','dialog .notice','dialog .dialog-footer button'])out.record(key+' '+s,await text(p,s),await text(d,s));
     out.record(key+' fields fit',await p.locator('dialog input').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect(),v=e.closest('dialog').getBoundingClientRect();return r.left>=v.left&&r.right<=v.right;})),true);
     for(const[n,page]of[['actual',p],['design',d]])await page.screenshot({path:join(dir,'final-'+key+'-'+n+'.png'),fullPage:true});
    }
    const inputs=p.locator('dialog input[type=password]'),submit=p.locator('dialog button[type=submit]');
    await expect(submit).toBeDisabled();await inputs.nth(0).fill(password);await inputs.nth(1).fill(changed);await inputs.nth(2).fill('DifferentSecret!');
    out.record(engine+' '+locale+' mismatch disabled',await submit.isDisabled(),true);
    await inputs.nth(2).fill(changed);out.record(engine+' '+locale+' matching enabled',await submit.isEnabled(),true);
    let calls=0;p.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/me/password'))calls++;});
    await p.locator('dialog .button-secondary').click();await expect(p.locator('dialog')).toHaveCount(0);await expect(trigger).toBeFocused();out.record(engine+' '+locale+' cancel does not change password',calls,0);
    await trigger.click();out.record(engine+' '+locale+' reopen clears secrets',await p.locator('dialog input[type=password]').evaluateAll(es=>es.map(e=>e.value)),['','','']);
    await inputs.nth(0).fill('WrongDev080Secret!');await inputs.nth(1).fill(changed);await inputs.nth(2).fill(changed);
    let response=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/me/password'));await submit.click();out.record(engine+' '+locale+' invalid current rejected',(await response).status(),422);
    await expect(p.locator('.app-error')).toBeVisible();out.record(engine+' '+locale+' error retains modal',await p.locator('dialog[open]').count(),1);
    out.record(engine+' '+locale+' failed update does not revoke other session',(await api(other,'GET','/api/v1/me/account')).status,200);
    await inputs.nth(0).fill(password);response=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/me/password'));await submit.click();const saved=await response;
    out.record(engine+' '+locale+' success204',saved.status(),204);out.record(engine+' '+locale+' exact API keys',Object.keys(saved.request().postDataJSON()).sort(),['current_password','new_password','new_password_confirmation']);
    await expect(p.locator('dialog')).toHaveCount(0);out.record(engine+' '+locale+' success notice',await text(p,'.account-notice .notice-title'),[locale==='en-US'?'Password updated':'密码已更新']);
    out.record(engine+' '+locale+' current session retained',(await api(c,'GET','/api/v1/me/account')).status,200);
    out.record(engine+' '+locale+' other session revoked',(await api(other,'GET','/api/v1/me/account')).status,401);
    out.record(engine+' '+locale+' old credential rejected',await freshLogin(username,password,locale),401);
    out.record(engine+' '+locale+' new credential works',await freshLogin(username,changed,locale),200);
    await d.keyboard.press('Escape');await p.locator('.danger-zone .button-danger').click();await d.locator('[data-action=delete-account]').click();await expect(d.locator('dialog[open]')).toBeVisible();
    out.record(engine+' '+locale+' shared deletion identity copy',await text(p,'dialog .field .helper'),await text(d,'dialog .field .helper'));
    await p.keyboard.press('Escape');await expect(p.locator('dialog')).toHaveCount(0);
    const fresh=await(await c.request.get(origin+'/api/v1/bootstrap')).json();out.record(engine+' '+locale+' account language unchanged',fresh.data.ui_locale,locale);
    out.record(engine+' '+locale+' own logout',(await api(c,'POST','/api/v1/auth/logout',fresh.data.csrf_token,{})).status,204);
   }finally{await other.close();await c.close();}
  }
 }catch(e){out.error(engine+' execution',e);}
 finally{await b.close();}
}
out.record('no browser runtime errors',errors,[]);out.save();


