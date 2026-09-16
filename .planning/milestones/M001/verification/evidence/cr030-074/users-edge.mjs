import{readFileSync}from'node:fs';import{join}from'node:path';
import{chromium,expect,dir,origin,design,ready,login,api,sql,quote,password,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('users-edge'),b=await chromium.launch();
sql("INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale) SELECT 'qa074_edge_admin',password_hash,role,group_code,'en-US' FROM wordweave.accounts WHERE username='qa074_admin'; INSERT INTO wordweave.accounts(username,password_hash,role,group_code,ui_locale) SELECT 'abcdefghijklmnopqrstuvwxyz123456',password_hash,'learner','registered','en-US' FROM wordweave.accounts WHERE username='qa074_learner';");
try{
 const c=await b.newContext({viewport:{width:1440,height:1000}});c.setDefaultTimeout(7000);const token=await login(c,'qa074_edge_admin');const p=await c.newPage(),d=await c.newPage();
 const query='qa074_exact',actual=await api(c,'GET','/api/v1/admin/users?username='+encodeURIComponent('  '+query.toUpperCase()+'  '));
 const expected=sql("SELECT username FROM wordweave.accounts WHERE lower(username) LIKE '%qa074_exact%' ORDER BY CASE WHEN lower(username)='qa074_exact' THEN 0 ELSE 1 END,lower(username),id").split('\n');
 out.record('trim/case/exact tier HTTP',actual.status,200);out.record('trim/case exact ordering against SQL',actual.body.data.items.map(x=>x.username),expected);out.record('exact prioritized before lexical prefix',expected,['qa074_exact','a_qa074_exact','qa074_exact_z']);
 const first=await api(c,'GET','/api/v1/admin/users?username=qa074_search&limit=20'),cursor=first.body.meta.next_cursor;
 out.record('tampered cursor422',(await api(c,'GET','/api/v1/admin/users?username=qa074_search&cursor='+encodeURIComponent(cursor+'x'))).status,422);
 const other=await b.newContext();await login(other,'qa074_admin');out.record('cursor binds administrator',(await api(other,'GET','/api/v1/admin/users?username=qa074_search&cursor='+encodeURIComponent(cursor))).status,422);await other.close();
 for(const locale of['en-US','zh-CN']){
  await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
  for(const width of[320,390,720,721,900,901,1440]){
   await p.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users?q=abcdefghijklmnopqrstuvwxyz123456');await ready(p);await expect(p.locator('.admin-user-result')).toHaveCount(1);
   out.record('32-character username visible '+locale+' '+width,await p.locator('.user-name').innerText(),'abcdefghijklmnopqrstuvwxyz123456');
   out.record('single row only View is tabbable '+locale+' '+width,await p.locator('.admin-user-result').evaluate(n=>[...n.querySelectorAll('a,button,input,select,[tabindex]')].filter(n=>n.tabIndex>=0).length),1);
   out.record('long row fits '+locale+' '+width,await p.locator('.admin-user-result').evaluate(n=>n.scrollWidth<=n.clientWidth&&document.documentElement.scrollWidth<=innerWidth),true);
   await p.locator('.admin-user-result .button').click();await expect(p.locator('.admin-user-detail-grid')).toBeVisible();
   out.record('long detail fits '+locale+' '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
 }
 await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});await p.setViewportSize({width:1440,height:1000});
 await p.goto(origin+'/admin/users');await ready(p);
 let release,entered;const held=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
 const pattern='**/api/v1/admin/users?**';await p.route(pattern,async route=>{if(new URL(route.request().url()).searchParams.get('username')==='qa074_search'){const response=await route.fetch();entered();await held;await route.fulfill({response}).catch(()=>{});}else await route.continue();});
 await p.getByRole('search').locator('input').fill('qa074_search');await p.getByRole('search').locator('button').click();await entry;
 // Actual router navigation away supersedes an in-flight query; do not mutate disabled controls.
 await p.locator('a[href="/admin/models"]').click();await expect(p).toHaveURL(origin+'/admin/models');release();await p.unrouteAll({behavior:'wait'});
 await p.locator('a[href="/admin/users"]').click();await expect(p.getByRole('search')).toBeVisible();await p.getByRole('search').locator('input').fill('qa074_empty');await p.getByRole('search').locator('button').click();await expect(p.locator('.admin-user-result')).toHaveCount(1);out.record('late prior search cannot replace new query',await p.locator('.user-name').innerText(),'qa074_empty');
 for(const locale of['en-US','zh-CN']){
  await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});await p.setViewportSize({width:720,height:1000});await d.setViewportSize({width:720,height:1000});
  await p.goto(origin+'/admin/users');await ready(p);await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=default&locale='+locale);await d.locator('.admin-user-search').waitFor();
  const observe=page=>page.locator('.locale-switch').evaluate(n=>({options:[...n.querySelectorAll('option')].map(x=>x.textContent),width:n.getBoundingClientRect().width,selectWidth:n.querySelector('select').getBoundingClientRect().width}));
  out.record('shared locale baseline observation '+locale,await observe(p),await observe(d));
 }
 // Recover the earlier omitted logout check with a non-rate-limited admin actor.
 await p.goto(origin+'/admin/users/'+f.users.qa074_learner+'?batch='+f.batches[0].id);await ready(p);await expect(p.locator('.reading-passage')).toBeVisible();await p.keyboard.press('Escape');
 await p.locator('.admin-account button').click();await expect(p).toHaveURL(origin+'/');await p.goBack();await expect(p.locator('.reading-passage')).toHaveCount(0);
 out.record('logout removes private admin username',await p.locator('body').innerText().then(s=>s.includes('qa074_learner')),false);await c.close();
 // Explicitly establish account-language oracle before login/return check.
 const pre=await b.newContext(),t=await login(pre,'qa074_empty');await api(pre,'PUT','/api/v1/me/ui-locale',t,{ui_locale:'en-US'});await pre.close();
 const guest=await b.newContext();await guest.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);const q=await guest.newPage();await q.goto(origin+'/review');await ready(q);await q.locator('.auth-gate .button-primary').click();await q.locator('input[autocomplete=username]').fill('qa074_empty');await q.locator('input[type=password]').fill('WrongSyntheticPassword');await q.locator('form button[type=submit]').click();await expect(q.locator('[role=alert]')).toBeVisible();
 out.record('wrong-password message fits',await q.locator('[role=alert]').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 await q.locator('.locale-switch select').selectOption('zh-CN');await q.locator('input[type=password]').fill(password);const before=sql('SELECT count(*) FROM wordweave.review_sessions');let posts=0;q.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v1/me/review-sessions'))posts++;});await q.locator('form button[type=submit]').click();await expect(q).toHaveURL(origin+'/review');await expect(q.locator('.locale-switch select')).toHaveValue('en-US');out.record('account preference beats temporary browser language',true,true);out.record('login return no auto session request',posts,0);out.record('login return no DB session created',sql('SELECT count(*) FROM wordweave.review_sessions'),before);await guest.close();
}catch(e){out.error('edge execution',e);}finally{await b.close();out.save();}
