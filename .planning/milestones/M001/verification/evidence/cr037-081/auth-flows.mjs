import{chromium,webkit,expect,dir,origin,password,ready,recorder}from'./lib.mjs';import{join}from'node:path';
const engine=process.env.QA_ENGINE||'chromium',run=process.env.QA_RUN||'flows-chromium',out=recorder(run),browser=await(engine==='webkit'?webkit:chromium).launch();let serial=0;
const open=async(p,path)=>{await p.goto(origin+path);await ready(p);};
async function context(locale='en-US',width=1440){const c=await browser.newContext({locale,viewport:{width,height:1000}});c.setDefaultTimeout(10000);await c.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);return c;}
async function fill(p,user,registration=false){await p.locator('input[autocomplete=username]').fill(user);const fields=p.locator('input[type=password]');for(let i=0;i<(registration?2:1);i++)await fields.nth(i).fill(password);}
const safe=['/review','/library','/account','/library/11111111-1111-4111-8111-111111111111','/review/22222222-2222-4222-8222-222222222222?batch=11111111-1111-4111-8111-111111111111'];
for(const mode of(process.env.QA_CLAIM_ONLY?[]:['login','register']))for(const target of[...safe,null,'https://evil.invalid']){
 const c=await context(),p=await c.newPage(),key=mode+' '+(target||'direct'),user=mode==='login'?'qa081_diag':'qa081_'+engine+'_flow_'+(++serial),writes=[];
 try{
 p.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/review-sessions'))writes.push(r.url());});
 await open(p,'/'+mode+(target?'?redirect='+encodeURIComponent(target):''));await fill(p,user,mode==='register');await p.locator('form button[type=submit]').click();
 const dest=safe.includes(target)?target:'/library';await expect(p).toHaveURL(origin+dest);out.record(key+' destination',new URL(p.url()).pathname+new URL(p.url()).search,dest);out.record(key+' no automatic review start',writes,[]);
 const r=await c.request.get(origin+'/api/v1/me/account');out.record(key+' authenticated learner',r.status(),200);
 }catch(e){out.error(key,e);}finally{await c.close();}
}
for(const [user,expected]of(process.env.QA_CLAIM_ONLY?[]:[['qa081_diag','/review'],['qa081_admin','/admin/models']])){
 const c=await context('zh-CN'),p=await c.newPage(),key=user+' role/locale';try{
 await open(p,'/login?redirect=%2Freview');await fill(p,user);await p.locator('form button[type=submit]').click();await expect(p).toHaveURL(origin+expected);out.record(key+' destination',new URL(p.url()).pathname,expected);
 const b=await(await c.request.get(origin+'/api/v1/bootstrap')).json();if(user==='qa081_diag')out.record(key+' account preferred locale',b.data.ui_locale,'en-US');
 }catch(e){out.error(key,e);}finally{await c.close();}
}
for(const locale of['en-US','zh-CN'])for(const width of[390,1440]){
 const c=await context(locale,width),p=await c.newPage(),key='effective claim '+locale+' '+width,seen=[],claim='qa081_contract_claim_only',generation='qa081_contract_generation_only';
 const envelope=data=>({data,meta:{request_id:'req_qa081_claim'}});
 try{
 await p.route('**/api/v1/generation-options',r=>r.fulfill({json:envelope({models:[{id:'mdl_qa081_fixture',name:'QA fixture',description:'Contract-only resource'}],meaning_languages:['en'],scenarios:['discussion'],lengths:['short'],max_entries:5,availability:{can_generate:true,reason:null},quota:{kind:'limited',limit:5,remaining:5,window_hours:24,refreshes_at:null}})}));
 await p.route('**/api/v1/vocabulary/search?*',r=>r.fulfill({json:envelope({items:[{entry:'adapt'}],vocabulary_version:'qa081-fixture'})}));
 const passage='Teams adapt quickly when the context changes.';
 const event=(name,data)=>'event: '+name+'\ndata: '+JSON.stringify(data)+'\n\n';
 await p.route('**/api/v1/generations/stream',r=>{seen.push('stream');return r.fulfill({contentType:'text/event-stream',headers:{'cache-control':'no-store'},body:event('generation.started',{run_id:'gen_qa081_fixture',generation_token:generation})+event('passage.delta',{text:passage})+event('generation.validated',{run_id:'gen_qa081_fixture',result:{passage,tags:['Adaptation'],targets:[{entry:'adapt',contextual_meaning:'to adjust to new conditions',hint_phrase:'adapt to change',hint_blanks:[{start:0,end:5}],occurrences:[{surface:'adapt',start:6,end:11}]}]}})});});
 await p.route('**/api/v1/generations/gen_qa081_fixture/visitor-claim',r=>{seen.push('claim');out.record(key+' claim generation token',r.request().headers()['x-generation-token'],generation);return r.fulfill({json:envelope({claim_token:claim,expires_at:new Date(Date.now()+1800000).toISOString()})});});
 await open(p,'/');await p.locator('main a.button-primary[href="/create"]').click();await expect(p.locator('.choice-grid-model .choice')).toBeVisible();
 await p.locator('#word-search').fill('adapt');await p.locator('#word-search-results button').click();for(const selector of['.choice-grid-model','.choice-grid-3','.choice-grid-scenario','.choice-grid-4'])await p.locator(selector+' .choice').first().click();
 await p.locator('.generate-bar button').click();await expect(p.locator('.result-action-bar .button-primary')).toBeVisible();await p.locator('.result-action-bar .button-primary').click();await expect(p).toHaveURL(u=>u.pathname==='/login'&&u.searchParams.get('claim')==='1');
 for(const mode of['login','register']){
  if(mode==='register'){await p.locator('.auth-alt a').click();await expect(p).toHaveURL(u=>u.pathname==='/register');}
  out.record(key+mode+' warning first',await p.locator('.auth-card').evaluate(e=>e.firstElementChild.matches('.notice-warning')),true);out.record(key+mode+' ordinary hint absent',await p.locator('.auth-intent').count(),0);out.record(key+mode+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:join(dir,run+'-'+locale+'-'+width+'-claim-'+mode+'.png'),fullPage:true});
 }
 await p.locator('.auth-alt a').click();out.record(key+' login roundtrip keeps claim',await p.locator('.auth-card .notice-warning').count(),1);
 out.record(key+' pipeline used',seen,['stream','claim']);out.record(key+' tokens not persisted or URL',await p.evaluate(values=>values.some(v=>location.href.includes(v)||[...Object.values(localStorage),...Object.values(sessionStorage)].some(x=>x.includes(v))),[claim,generation]),false);
 await p.reload();await ready(p);out.record(key+' refresh clears memory claim warning',await p.locator('.auth-card .notice-warning').count(),0);out.record(key+' refresh ordinary Library hint',await p.locator('.auth-intent').count(),1);
 }catch(e){out.error(key,e);}finally{await c.close();}
}
await browser.close();out.save();
