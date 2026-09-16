import{chromium,webkit,expect,request,dir,origin,design,password,api,recorder}from'./lib.mjs';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.mjs';
import{join}from'node:path';
const engine=process.env.QA_ENGINE||'chromium',type=engine==='webkit'?webkit:chromium,run=process.env.QA_RUN||engine+'-'+process.platform;
const out=recorder('independent-'+run),runtime=[],diagnostics=[];
const browser=await type.launch();
const settle=async p=>p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
async function open(p,path){await p.goto(origin+path);await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await settle(p);}
async function context(locale,width){const c=await browser.newContext({locale,timezoneId:'Asia/Shanghai',viewport:{width,height:1000}});c.setDefaultTimeout(10000);await c.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);c.on('page',p=>{p.on('pageerror',e=>runtime.push(e.message));p.on('console',m=>{if(m.type()==='warning'&&/hydrat/i.test(m.text()))runtime.push(m.text());});});return c;}
const words=async(p,selector)=>(await p.locator(selector).allTextContents()).map(s=>s.replace(/\s+/gu,' ').trim());
const meta=async p=>p.locator('.auth-card').evaluate(e=>{const n=e.querySelector('.auth-intent'),h=e.querySelector('h2'),r=e.getBoundingClientRect(),b=n.getBoundingClientRect(),s=getComputedStyle(n);return{text:n.textContent.trim(),first:e.firstElementChild===n,before:!!(n.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING),role:n.getAttribute('role'),top:Math.round((b.top-r.top)*100)/100,gap:Math.round((h.getBoundingClientRect().top-b.bottom)*100)/100,style:[s.margin,s.padding,s.color,s.backgroundColor,s.borderRadius]};});
async function reference(c,page,locale){const p=await c.newPage();await p.goto(design+'/prototype/?page='+page+'&role=visitor&state=default&locale='+locale);await p.locator('.auth-gate').waitFor();await p.locator('.prototype-tools').evaluate(e=>e.style.display='none');return p;}
async function axe(p,id,selector){const r=await new AxeBuilder({page:p}).include(selector).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();out.record(id+' axe serious/critical',r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[]);}
async function register(c,username,locale){const b=await(await c.request.get(origin+'/api/v1/bootstrap')).json();const r=await api(c,'POST','/api/v1/auth/register',b.data.csrf_token,{username,password,password_confirmation:password,ui_locale:locale});out.record(username+' register',r.status,201);if(r.status!==201)throw Error('Fixture registration failed '+username);return r.body.data.csrf_token;}
async function apiLogin(c,username,secret,locale){const b=await(await c.request.get(origin+'/api/v1/bootstrap')).json();return api(c,'POST','/api/v1/auth/login',b.data.csrf_token,{username,password:secret,browser_ui_locale:locale});}
async function csrf(c){return(await(await c.request.get(origin+'/api/v1/bootstrap')).json()).data.csrf_token;}
const targets=[['/review','PAGE-007'],['/library','PAGE-005'],['/library/11111111-1111-4111-8111-111111111111','PAGE-006'],['/account','PAGE-009'],['/review/22222222-2222-4222-8222-222222222222?batch=11111111-1111-4111-8111-111111111111','PAGE-007']];
for(const locale of(process.env.QA_ACCOUNT_ONLY?[]:['en-US','zh-CN']))for(const width of[390,1440]){
 const c=await context(locale,width),p=await c.newPage(),key=run+' '+locale+' '+width;
 try{
  for(const [path,definition]of targets){
   const d=await reference(c,definition,locale),privateGets=[];const observe=r=>{if(r.method()==='GET'&&r.url().includes('/api/v1/me/'))privateGets.push(new URL(r.url()).pathname);};p.on('request',observe);
   await open(p,path);await expect(p.locator('.auth-gate')).toBeVisible();out.record(key+path+' visitor private GETs',privateGets,[]);p.off('request',observe);
   await p.locator('.auth-gate .button-primary').click();await expect(p).toHaveURL(u=>u.pathname==='/login');await d.locator('[data-action=navigate][data-value=PAGE-003]').last().click();await settle(p);await settle(d);
   for(const mode of['login','register']){
    if(mode==='register'){await p.locator('.auth-alt a').click();await expect(p).toHaveURL(u=>u.pathname==='/register');await d.locator('.auth-alt [data-value=PAGE-002]').click();await settle(p);await settle(d);}
    out.record(key+path+mode+' exact hint DOM/geometry/style',await meta(p),await meta(d));out.record(key+path+mode+' preserved intent',new URL(p.url()).searchParams.get('redirect'),path);
    out.record(key+path+mode+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(path==='/review'){await axe(p,key+mode,'.auth-card');for(const[n,v]of[['actual',p],['design',d]])await v.screenshot({path:join(dir,run+'-'+locale+'-'+width+'-'+mode+'-'+n+'.png'),fullPage:true});}
   }
   await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');out.record(key+path+' reload keeps hint',await p.locator('.auth-intent').count(),1);
   await p.locator('.auth-alt a').click();await expect(p).toHaveURL(u=>u.pathname==='/login');out.record(key+path+' return to login retains target',new URL(p.url()).searchParams.get('redirect'),path);await d.close();
  }
  for(const mode of['login','register'])for(const suffix of['','?redirect=https%3A%2F%2Fevil.invalid','?redirect=%2F%2Fevil.invalid','?redirect=%2Fadmin%2Fusers']){await open(p,'/'+mode+suffix);out.record(key+mode+suffix+' no unsafe hint',await p.locator('.auth-intent').count(),0);}
  await open(p,'/login?claim=1&redirect=%2Freview');out.record(key+' stale claim ordinary hint',await p.locator('.auth-intent').count(),1);out.record(key+' stale claim no saved warning',await p.locator('.auth-card .notice-warning').count(),0);
  const originalHint=await p.locator('.auth-intent').innerText();
  await p.locator('input[autocomplete=username]').fill('qa081_diag');await p.locator('input[type=password]').fill('Incorrect081Only!');await p.locator('form button[type=submit]').click();await expect(p.locator('.app-error')).toBeVisible();
  out.record(key+' wrong auth error remains above form',await p.locator('.auth-card .app-error').count(),1);out.record(key+' wrong auth preserves hint',await p.locator('.auth-intent').innerText(),originalHint);await axe(p,key+' auth error','.auth-card');
  const switcher=p.locator('.app-header .locale-switch select');if(await switcher.count()){await switcher.selectOption(locale==='en-US'?'zh-CN':'en-US');await expect(p.locator('.auth-intent')).not.toHaveText(originalHint);out.record(key+' locale change retains intent',new URL(p.url()).searchParams.get('redirect'),'/review');out.record(key+' locale change retains username',await p.locator('input[autocomplete=username]').inputValue(),'qa081_diag');}else out.record(key+' global locale control exists',false,true);
  await p.screenshot({path:join(dir,run+'-'+locale+'-'+width+'-login-error.png'),fullPage:true});
 }catch(e){out.error(key+' auth execution',e);}finally{await c.close().catch(()=>{});}
}
for(const locale of(process.env.QA_LOCALE?[process.env.QA_LOCALE]:['en-US','zh-CN'])){
 const c=await context(locale,1440),other=await context(locale,1440),key=run+' '+locale+' account',username='qa081_'+run.replaceAll('-','_').slice(0,13)+'_'+locale.slice(0,2),newPassword='Qa081UpdatedOnly!';
 try{
  await register(c,username,locale);out.record(key+' parallel old session login',(await apiLogin(other,username,password,locale)).status,200);
  const p=await c.newPage(),d=await c.newPage();await open(p,'/account');await d.goto(design+'/prototype/?page=PAGE-009&role=learner&state=default&locale='+locale);await d.locator('[data-action=change-password]').waitFor();await d.locator('.prototype-tools').evaluate(e=>e.style.display='none');
  const trigger=p.locator('.settings-grid .card-footer .button-secondary');await trigger.click();await d.locator('[data-action=change-password]').click();await expect(p.locator('dialog[open]')).toBeVisible();
  for(const width of[390,1440]){
   await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await settle(p);await settle(d);
   for(const selector of['dialog h2','dialog .field-label','dialog .helper','dialog .notice','dialog .dialog-footer button'])out.record(key+' '+width+selector,await words(p,selector),await words(d,selector));
   out.record(key+' '+width+' no field overlap',await p.locator('dialog input').evaluateAll(es=>es.every((e,i)=>i===0||es[i-1].getBoundingClientRect().bottom<=e.getBoundingClientRect().top)),true);
   out.record(key+' '+width+' dialog fits viewport',await p.locator('dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
   await axe(p,key+' '+width,'dialog');for(const[n,v]of[['actual',p],['design',d]])await v.screenshot({path:join(dir,run+'-'+locale+'-'+width+'-password-'+n+'.png'),fullPage:true});
  }
  const inputs=p.locator('dialog input[type=password]'),submit=p.locator('dialog button[type=submit]');out.record(key+' initially disabled',await submit.isDisabled(),true);out.record(key+' initial focus on current password',await inputs.nth(0).evaluate(e=>e===document.activeElement),true);
  for(let i=0;i<7;i++)await p.keyboard.press('Tab');out.record(key+' keyboard focus contained',await p.locator('dialog').evaluate(e=>e.contains(document.activeElement)),true);
  let writes=0;p.on('request',r=>{if(r.method()==='PUT'&&r.url().endsWith('/me/password'))writes++;});
  await inputs.nth(0).fill(password);await inputs.nth(1).fill(newPassword);await inputs.nth(2).fill('Mismatch081Only!');out.record(key+' mismatched disabled',await submit.isDisabled(),true);
  await inputs.nth(2).fill(newPassword);out.record(key+' valid enabled',await submit.isEnabled(),true);await p.locator('dialog .button-secondary').click();await expect(p.locator('dialog')).toHaveCount(0);out.record(key+' cancel no request',writes,0);out.record(key+' cancel returns focus',await trigger.evaluate(e=>e===document.activeElement),true);
  await trigger.click();out.record(key+' cleared on reopen',await inputs.evaluateAll(es=>es.map(e=>e.value)),['','','']);await p.keyboard.press('Escape');await expect(p.locator('dialog')).toHaveCount(0);out.record(key+' Escape returns focus',await trigger.evaluate(e=>e===document.activeElement),true);await trigger.click();
  await inputs.nth(0).fill('Incorrect081Only!');await inputs.nth(1).fill(newPassword);await inputs.nth(2).fill(newPassword);let wait=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/me/password'));await submit.click();let response=await wait;
  out.record(key+' wrong current422',response.status(),422);await expect(p.locator('.app-error')).toBeVisible();out.record(key+' error modal stays open',await p.locator('dialog[open]').count(),1);
  out.record(key+' error available within modal accessibility boundary',await p.locator('dialog[open]').evaluate(d=>{const errors=Array.from(document.querySelectorAll('.app-error,[role=alert]'));return errors.some(e=>d.contains(e)&&e.textContent.trim());}),true);
  await p.screenshot({path:join(dir,run+'-'+locale+'-password-invalid.png'),fullPage:true});diagnostics.push({case:key+' invalid password',alertText:await words(p,'.app-error'),alertInsideDialog:await p.locator('.app-error').evaluate(e=>!!e.closest('dialog')),dialogText:await words(p,'dialog')});
  out.record(key+' failed update other session valid',(await api(other,'GET','/api/v1/me/account')).status,200);
  await inputs.nth(0).fill(password);wait=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/me/password'));await submit.click();response=await wait;out.record(key+' updated204',response.status(),204);out.record(key+' exact password request keys',Object.keys(response.request().postDataJSON()).sort(),['current_password','new_password','new_password_confirmation']);
  if(engine==='webkit')out.record(key+' 204 omits content type',response.headers()['content-type']??null,null);else out.record(key+' empty204body',await response.text(),'');await expect(p.locator('dialog')).toHaveCount(0);out.record(key+' success focus',await trigger.evaluate(e=>e===document.activeElement),true);out.record(key+' localized success notice',await words(p,'.account-notice .notice-title'),[locale==='en-US'?'Password updated':'密码已更新']);
  out.record(key+' current session stays',(await api(c,'GET','/api/v1/me/account')).status,200);out.record(key+' other session revoked',(await api(other,'GET','/api/v1/me/account')).status,401);
  const probe=await request.newContext();out.record(key+' old password rejected',(await apiLogin({request:probe},username,password,locale)).status,401);out.record(key+' new password accepted',(await apiLogin({request:probe},username,newPassword,locale)).status,200);await probe.dispose();
  await d.keyboard.press('Escape');await p.locator('.danger-zone .button-danger').click();await d.locator('[data-action=delete-account]').click();await expect(d.locator('dialog[open]')).toBeVisible();out.record(key+' shared identity copy',await words(p,'dialog .field .helper'),await words(d,'dialog .field .helper'));await p.keyboard.press('Escape');await d.keyboard.press('Escape');
  out.record(key+' locale preserved',(await(await c.request.get(origin+'/api/v1/bootstrap')).json()).data.ui_locale,locale);out.record(key+' no secrets in storage',await p.evaluate(values=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(s=>values.some(v=>s.includes(v))),[password,newPassword]),false);
 }catch(e){out.error(key+' execution',e);}finally{await c.close().catch(()=>{});await other.close().catch(()=>{});}
}
out.record('browser JavaScript/hydration errors',runtime,[]);await browser.close().catch(()=>{});out.save();
const{writeFileSync}=await import('node:fs');writeFileSync(join(dir,'independent-'+run+'-observations.json'),JSON.stringify(diagnostics,null,2),{flag:'wx'});
