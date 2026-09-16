import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,webkit,expect,dir,origin,ready,login,recorder,api,password}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('flows');
const browser=await chromium.launch();
async function run(name,fn,{role,viewport={width:1440,height:1000}}={}){
 const c=await browser.newContext({viewport});c.setDefaultTimeout(7000);await c.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);if(role){const token=await login(c,'qa074_'+role);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});}
 const p=await c.newPage();try{await fn(p,c);out.record(name,true,true);}catch(e){out.error(name,e);await p.screenshot({path:join(dir,'screenshots','failure-'+name.replace(/[^a-z0-9]/gi,'-')+'.png')}).catch(()=>{});}finally{await c.close();console.log('flow completed '+name);}
}
const open=async(p,path)=>{await p.goto(origin+path);await ready(p);};
const userPath='/admin/users/'+f.users.qa074_learner;
try{
 await run('login register intent errors locale refresh return',async(p,c)=>{
 await open(p,'/review');await p.locator('.auth-gate .button-primary').click();await expect(p.locator('.auth-intent')).toHaveText('Continue to Review when you’re done.');
 await p.locator('.auth-alt a').click();await expect(p).toHaveURL(u=>u.pathname==='/register'&&u.searchParams.get('redirect')==='/review');await p.reload();await ready(p);
 await p.locator('.auth-alt a').click();await expect(p).toHaveURL(u=>u.pathname==='/login');await p.locator('input[autocomplete=username]').fill('qa074_empty');await p.locator('input[type=password]').fill('WrongSyntheticPassword');
 await p.locator('form button[type=submit]').click();await expect(p.locator('[role=alert]')).toBeVisible();await expect(p.locator('.auth-intent')).toBeVisible();
 out.record('login error fits form',await p.locator('[role=alert]').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 await p.locator('.locale-switch select').selectOption('zh-CN');out.record('intent retained during locale',new URL(p.url()).searchParams.get('redirect'),'/review');
 await p.locator('input[type=password]').fill(password);
 let posts=0;p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/v1/me/review-sessions')posts++;});
 await p.locator('form button[type=submit]').click();await expect(p).toHaveURL(origin+'/review');await expect(p.locator('.locale-switch select')).toHaveValue('en-US');out.record('login no auto session',posts,0);
 });
 await run('registration returns single story without auto save',async(p,c)=>{
 const path='/library/'+f.batches[0].id;await open(p,path);await p.locator('.auth-gate .button-secondary').click();
 await p.locator('input[autocomplete=username]').fill('qa074_new_'+Date.now());await p.locator('input[type=password]').nth(0).fill(password);await p.locator('input[type=password]').nth(1).fill(password);
 const writes=[];p.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&!/auth\/register/.test(r.url()))writes.push(new URL(r.url()).pathname);});
 await p.locator('form button[type=submit]').click();await expect(p).toHaveURL(origin+path);await expect(p.locator('.reading-passage')).toHaveCount(0);out.record('register no save no session',writes,[]);
 });
 await run('admin priority and claim flag alone ignored',async(p)=>{
 await open(p,'/login?redirect=%2Freview&claim=1');await expect(p.locator('.auth-card .notice-warning')).toHaveCount(0);await p.locator('input[autocomplete=username]').fill('qa074_admin');await p.locator('input[type=password]').fill(password);await p.locator('form button[type=submit]').click();await expect(p).toHaveURL(origin+'/admin/models');
 });
 await run('invalid redirect and stale intent cleared',async(p)=>{
 for(const target of['https://example.invalid','//example.invalid','/review/../../admin','/review/a/b','/library%2f..%2fadmin','/review\\evil']){
 await open(p,'/login?redirect='+encodeURIComponent(target));await expect(p.locator('.auth-intent')).toHaveCount(0);await p.locator('.auth-alt a').click();await expect(p).toHaveURL(origin+'/register');out.record('unsafe not forwarded '+target,new URL(p.url()).searchParams.has('redirect'),false);}
 await open(p,'/login?redirect=%2Freview');await p.locator('.brand').first().click();await p.locator('a[href="/login"]').first().click();out.record('ordinary login clears old return',new URL(p.url()).searchParams.has('redirect'),false);
 });
 await run('header home mobile entry unification',async(p)=>{
 await open(p,'/');await p.locator('a[href="/review"]').first().click();await expect(p.locator('.auth-gate h1')).toHaveText('Sign in to open Review');
 await open(p,'/');await p.locator('.hero-actions a[href="/review"]').click();await expect(p.locator('.auth-gate h1')).toHaveText('Sign in to open Review');
 await p.setViewportSize({width:390,height:844});await open(p,'/');await p.locator('.mobile-nav-toggle').click();
 await p.locator('.mobile-menu-list a[href="/review"]').click();await expect(p.locator('.auth-gate h1')).toHaveText('Sign in to open Review');
 });
 await run('search pagination detail return and resubmit',async(p)=>{
 await open(p,'/admin/users?q=qa074_search');await expect(p.locator('.admin-user-result')).toHaveCount(20);
 await p.getByRole('button',{name:'Load more',exact:true}).click();await expect(p.locator('.admin-user-result')).toHaveCount(40);
 const row=p.locator('.admin-user-result').nth(32);
 const button=row.locator('.button');await button.scrollIntoViewIfNeeded();const scroll=await p.evaluate(()=>scrollY);await button.click();
 await expect(p.getByRole('search')).toBeVisible();await p.getByRole('search').locator('input').fill('unsubmitted');
 await p.locator('.admin-user-detail-toolbar .button').click();await expect(p.locator('.admin-user-result')).toHaveCount(40);
 await expect(p.locator('.admin-user-result').nth(32).locator('.button')).toBeFocused();
 out.record('search row focus restored',await p.locator('.admin-user-result').nth(32).locator('.button').evaluate(n=>n===document.activeElement),true);
 out.record('search exact scroll restored',Math.abs(await p.evaluate(()=>scrollY)-scroll)<2,true);
 await p.locator('.admin-user-result').nth(32).locator('.button').click();await expect(p.locator('.admin-user-detail-grid')).toBeVisible();await p.getByRole('search').locator('input').fill('qa074_other');await p.getByRole('search').locator('button').click();await expect(p).toHaveURL(u=>u.pathname==='/admin/users'&&u.searchParams.get('q')==='qa074_other');await expect(p.locator('.admin-user-result')).toHaveCount(1);await expect(p.locator('.admin-user-result')).toContainText('qa074_other');
 },{role:'admin'});
 await run('reader history deep old links and backdrop',async(p)=>{
 await open(p,userPath+'?q=qa074');await p.getByRole('search').locator('input').fill('unsent');await p.locator('.model-row button').first().click();await expect(p.locator('.reading-passage')).toContainText('End of alpha.');
 await p.goBack();await expect(p.locator('dialog')).toHaveCount(0);await p.goForward();await expect(p.locator('.reading-passage')).toContainText('End of alpha.');
 await p.locator('.reader-body').click({position:{x:10,y:10}});await expect(p.locator('dialog')).toBeVisible();await p.mouse.click(1,1);await expect(p.locator('dialog')).toHaveCount(0);await expect(p.getByRole('search').locator('input')).toHaveValue('unsent');
 await open(p,userPath+'?q=qa074&batch='+f.batches[1].id);await expect(p.locator('.reading-passage')).toContainText('End of beta.');await p.reload();await ready(p);await p.locator('.reader-close').click();await expect(p).toHaveURL(origin+userPath+'?q=qa074');
 await open(p,userPath+'/batches/'+f.batches[0].id+'?q=qa074');await expect(p).toHaveURL(u=>u.pathname===userPath&&u.searchParams.get('q')==='qa074'&&u.searchParams.get('batch')===f.batches[0].id);await expect(p.locator('.reading-passage')).toContainText('End of alpha.');
 },{role:'admin'});
 await run('reader failed unavailable retry loading close late',async(p)=>{
 await open(p,userPath);const endpoint='**/api/v1/admin/users/'+f.users.qa074_learner+'/batches/'+f.batches[0].id;
 const problem=(status,code)=>({status,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/'+code,title:'Request failed',status,code,detail:'Safe failure',request_id:'req_qa'})});
 await p.route(endpoint,route=>route.fulfill(problem(500,'internal_error')));await p.locator('.model-row button').first().click();await expect(p.locator('.reader-state')).toContainText('Couldn’t load this story');
 await p.unroute(endpoint);await p.getByRole('button',{name:'Try again',exact:true}).click();await expect(p.locator('.reading-passage')).toContainText('End of alpha.');await p.keyboard.press('Escape');
 await p.route(endpoint,route=>route.fulfill(problem(404,'not_found')));await p.locator('.model-row button').first().click();await expect(p.locator('.reader-state')).toContainText('This story is unavailable');await expect(p.locator('.reader-state button')).toHaveCount(0);await p.keyboard.press('Escape');await p.unroute(endpoint);
 let release;const held=new Promise(resolve=>release=resolve);let entered;const entry=new Promise(resolve=>entered=resolve);
 await p.route(endpoint,async route=>{const response=await route.fetch();entered();await held;await route.fulfill({response}).catch(()=>{});});await p.locator('.model-row button').first().click();await entry;await expect(p.locator('.reader-state[aria-busy=true]')).toBeVisible();await p.keyboard.press('Escape');release();await p.unroute(endpoint,{behavior:'wait'});await p.waitForTimeout(100);await expect(p.locator('dialog')).toHaveCount(0);
 await p.locator('.model-row button').nth(1).click();await expect(p.locator('.reading-passage')).toContainText('End of beta.');
 },{role:'admin'});
 await run('malformed quota GET fails whole detail and retry safe',async(p)=>{
 await open(p,'/admin/users?q=qa074_other');
 const endpoint='**/api/v1/admin/users/'+f.users.qa074_other;
 await p.route(endpoint,async route=>{const response=await route.fetch();const body=await response.json();body.data.user.generation_quota={kind:'limited',remaining:-1};await route.fulfill({response,json:body});});
 await p.locator('.admin-user-result .button').first().click();await expect(p.locator('.admin-user-detail-grid')).toHaveCount(0);await expect(p.locator('[role=alert]')).toBeVisible();out.record('malformed no unlimited',await p.locator('.definition-list').count(),0);
 },{role:'admin'});
 await run('logout removes private admin DOM and payload',async(p)=>{
 await open(p,userPath+'?batch='+f.batches[0].id);await expect(p.locator('.reading-passage')).toBeVisible();await p.keyboard.press('Escape');await p.getByRole('button',{name:'Sign out',exact:true}).click();await expect(p).toHaveURL(origin+'/');
 await p.goBack();await p.waitForTimeout(100);out.record('history after logout no username',await p.locator('body').innerText().then(s=>s.includes('qa074_learner')),false);await open(p,'/review');out.record('logout payload no username',(await p.locator('script[data-nuxt-data]').textContent()).includes('qa074_learner'),false);
 },{role:'admin'});
}finally{await browser.close();out.save();}
