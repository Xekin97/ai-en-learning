import{readFileSync}from'node:fs';import{join}from'node:path';import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,sql,quote,password,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),rf=JSON.parse(readFileSync(join(dir,'range-fixtures.json'))),out=recorder('users-supplemental');
const problem=status=>({status,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/failure',title:'Failure',status,code:status===404?'not_found':'internal_error',detail:'QA controlled failure',request_id:'req_qa078'})});
const norm=s=>s.replace(/\s+/gu,' ').trim(),text=async(p,s)=>norm(await p.locator(s).innerText());
const b=await chromium.launch();
try{
 for(const locale of['en-US','zh-CN']){
  const c=await b.newContext({viewport:{width:1440,height:1000}});c.setDefaultTimeout(7000);const token=await login(c,'qa078_supp_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage(),d=await c.newPage();
  const proto=async(state,width)=>{await d.setViewportSize({width,height:1000});await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state='+state+'&locale='+locale);await d.addStyleTag({content:'.prototype-tools{display:none!important}'});};
  for(const width of[390,1440]){
   const key=locale+' '+width;await p.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users');await ready(p);await proto('default',width);
   for(const s of['.page-heading','.admin-user-empty'])out.record('Users idle '+s+' '+key,await text(p,s),await text(d,s));
   out.record('Users search copy '+key,await p.getByRole('search').locator('button').innerText(),await d.getByRole('search').locator('button').innerText());
   await p.getByRole('search').locator('input').fill('qa078_nobody');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-empty h2')).toHaveText(locale==='en-US'?'No users found':'没有找到用户');await proto('empty',width);out.record('Users empty copy '+key,await text(p,'.admin-user-empty'),await text(d,'.admin-user-empty'));
   const pattern='**/api/v1/admin/users?**';let release,entered;const hold=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
   await p.route(pattern,async route=>{const response=await route.fetch();entered();await hold;await route.fulfill({response}).catch(()=>{});});
   await p.getByRole('search').locator('input').fill('qa078_search');await p.getByRole('search').locator('button').click();await entry;await proto('loading',width);out.record('Users loading copy '+key,await text(p,'.admin-user-results'),await text(d,'.admin-user-results'));
   out.record('Users loading search disabled '+key,await p.getByRole('search').locator('input').isDisabled(),true);release();await p.unrouteAll({behavior:'wait'});await expect(p.locator('.admin-user-result')).toHaveCount(20);await proto('results',width);
   for(const s of['.admin-user-results .card-title','.admin-user-results .card-header > .helper','.admin-user-plan .helper','.admin-user-result .status-badge','.admin-user-result .button'])out.record('Users result '+s+' '+key,norm(await p.locator(s).first().innerText()),norm(await d.locator(s).first().innerText()));
   out.record('Users actual plan '+key,await p.locator('.admin-user-plan strong').first().innerText(),locale==='en-US'?'Basic':'基础版');
   out.record('Users ISO Joined date '+key,await p.locator('.user-meta').first().innerText().then(s=>new RegExp(locale==='en-US'?'^Learner · Joined \\d{4}-\\d{2}-\\d{2}$':'^学习者 · 创建于 \\d{4}-\\d{2}-\\d{2}$').test(s)),true);
   out.record('Users row/search no horizontal overflow '+key,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.admin-user-result,.admin-user-search')].every(n=>n.scrollWidth<=n.clientWidth)),true);
   await p.screenshot({path:join(dir,'screenshots','users-results-'+locale+'-'+width+'.png'),fullPage:true});
   const before=await p.locator('.user-name').allInnerTexts();await p.route(pattern,route=>new URL(route.request().url()).searchParams.has('cursor')?route.fulfill(problem(500)):route.continue());
   await p.locator('.admin-user-pagination button').click();await expect(p.locator('.admin-user-append-error')).toBeVisible();out.record('Users append failure retains rows '+key,await p.locator('.user-name').allInnerTexts(),before);await p.unrouteAll();
   await p.locator('.admin-user-pagination button').click();await expect(p.locator('.admin-user-result')).toHaveCount(40);await p.locator('.admin-user-pagination button').click();await expect(p.locator('.admin-user-result')).toHaveCount(45);
   out.record('Users terminal hides pagination '+key,await p.locator('.admin-user-pagination').count(),0);out.record('Users45 no duplicates '+key,new Set(await p.locator('.user-name').allInnerTexts()).size,45);
   await p.route(pattern,r=>r.fulfill(problem(500)));await p.getByRole('search').locator('input').fill('qa078_empty');await p.getByRole('search').locator('button').click();await expect(p.locator('[role=alert]')).toBeVisible();await proto('error',width);out.record('Users failed copy '+key,await text(p,'[role=alert]'),await text(d,'[role=alert]'));
   await p.unrouteAll();await p.locator('[role=alert] button').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);out.record('Users retry correct result '+key,await p.locator('.user-name').innerText(),'qa078_empty');
   const axe=await new AxeBuilder({page:p}).analyze();out.record('Users scope axe '+key,axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
   for(const[status,name]of[[500,'error'],[404,'unavailable']]){
    await p.goto(origin+'/admin/users/'+f.users.qa078_learner);await ready(p);
    const endpoint='**/api/v1/admin/users/'+f.users.qa078_learner+'/batches/'+f.batches[0].id;
    await p.route(endpoint,r=>r.fulfill(problem(status)));await p.locator('.model-row button').first().click();await p.locator('.reader-state h3').waitFor();await proto('batch-'+name,width);
    out.record('Reader '+name+' exact bilingual copy '+key,await text(p,'.reader-state'),await text(d,'.reader-state'));
    out.record('Reader '+name+' modal in bounds '+key,await p.locator('dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}),true);
    await p.screenshot({path:join(dir,'screenshots','reader-'+name+'-'+locale+'-'+width+'-supplement.png')});await p.keyboard.press('Escape');await p.unrouteAll();
   }
  }await c.close();console.log('Users full states '+locale+' complete');
 }
 // Exact-match tier uses separate fixtures; does not alter the 45-row pagination set.
 sql("INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale) SELECT n,password_hash,'learner','registered','en-US' FROM wordweave.accounts CROSS JOIN (VALUES('qa078_exact'),('a_qa078_exact'),('qa078_exact_z'))v(n) WHERE username='qa078_learner';");
 const c=await b.newContext();const token=await login(c,'qa078_supp_admin');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});
 const search=await api(c,'GET','/api/v1/admin/users?username='+encodeURIComponent('  QA078_EXACT  '),token);
 out.record('exact tier precedes lexical prefix',search.body.data.items.map(x=>x.username),['qa078_exact','a_qa078_exact','qa078_exact_z']);
 const admin=await api(c,'GET','/api/v1/admin/users/'+f.users.qa078_admin,token);
 out.record('admin not falsely Guest or unlimited',[admin.body.data.user.plan_code,admin.body.data.user.generation_quota],[null,null]);
 const old1=await b.newContext(),old2=await b.newContext();await login(old1,rf.users.password.username);await login(old2,rf.users.password.username);
 const p=await c.newPage();await p.goto(origin+'/admin/users/'+rf.users.password.id);await ready(p);await p.getByRole('button',{name:'Reset password',exact:true}).click();
 const changed='Qa078ChangedOnly!';await p.locator('dialog input').nth(0).fill(changed);await p.locator('dialog input').nth(1).fill('Mismatch');
 out.record('reset mismatch cannot submit',await p.locator('dialog button[type=submit]').isDisabled(),true);
 await p.locator('dialog input').nth(1).fill(changed);const response=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/password'));await p.locator('dialog button[type=submit]').click();
 out.record('UI reset real204',(await response).status(),204);await expect(p.locator('dialog')).toHaveCount(0);
 for(const[ctx,n]of[[old1,1],[old2,2]])out.record('old session invalidated '+n,(await ctx.request.get(origin+'/api/v1/me/account')).status(),401);
 const fresh=await b.newContext();const bs=await(await fresh.request.get(origin+'/api/v1/bootstrap')).json();
 async function tryPassword(pass){return fresh.request.post(origin+'/api/v1/auth/login',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':bs.data.csrf_token},data:{username:rf.users.password.username,password:pass,browser_ui_locale:'en-US'}});}
 out.record('old password rejected',(await tryPassword(password)).status(),401);out.record('new password accepted',(await tryPassword(changed)).status(),200);
 await c.close();await old1.close();await old2.close();await fresh.close();
}catch(e){out.error('Users supplemental execution',e);}finally{await b.close();}
for(const[type,name]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
 for(const locale of['en-US','zh-CN']){
  const c=await b.newContext({viewport:{width:1440,height:844},locale});c.setDefaultTimeout(7000);const token=await login(c,'qa078_supp_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();
  for(const width of[390,1440]){
   await p.setViewportSize({width,height:844});await p.goto(origin+'/admin/users/'+f.users.qa078_learner+'?batch='+f.batches[1].id);await ready(p);await p.locator('.reader-passage').waitFor();
   out.record(name+' complete long story '+locale+' '+width,await p.locator('.reader-passage').textContent(),f.batches[1].passage);
   out.record(name+' modal bounds '+locale+' '+width,await p.locator('dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),true);
   for(let i=0;i<6;i++){await p.keyboard.press(name==='webkit'?'Alt+Tab':'Tab');out.record(name+' modal keyboard containment '+locale+' '+width+' '+i,await p.evaluate(()=>!!document.activeElement?.closest('dialog')),true);}
   await p.locator('.reader-body').evaluate(n=>n.scrollTop=n.scrollHeight);out.record(name+' footer stays visible '+locale+' '+width,await p.locator('.dialog-footer button').isVisible(),true);
   const axe=await new AxeBuilder({page:p}).analyze();out.record(name+' reader axe '+locale+' '+width,axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
   await p.screenshot({path:join(dir,'screenshots',name+'-reader-'+locale+'-'+width+'.png')});await p.keyboard.press('Escape');await expect(p.locator('dialog')).toHaveCount(0);
  }await c.close();
 }
 }catch(e){out.error(name+' reader execution',e);}finally{await b.close();}
}
out.save();
