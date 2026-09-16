import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,design,ready,login,api,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),rf=JSON.parse(readFileSync(join(dir,'range-fixtures.json'))),out=recorder('final-supplement'),b=await chromium.launch();
try{
 const c=await b.newContext({viewport:{width:1440,height:1000}});c.setDefaultTimeout(8000);let token=await login(c,'qa072_admin');const p=await c.newPage(),d=await c.newPage(),observations=[];
 for(const locale of['en-US','zh-CN']){
  await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});await p.goto(origin+'/admin/models');await ready(p);await d.goto(design+'/prototype/?page=PAGE-101&role=admin&state=default&locale='+locale);await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
  for(const s of['.model-row .status-badge','.model-row button'])out.record('Models list copy '+s+' '+locale,await p.locator(s).first().innerText(),await d.locator(s).first().innerText());
  // Numeric group counts are fixture data. Compare the complete template after replacing only digits.
  out.record('Models list plan references '+locale,(await p.locator('.model-row .helper').first().innerText()).replace(/\d+/g,'N'),(await d.locator('.model-row .helper').first().innerText()).replace(/\d+/g,'N'));
 }
 await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});
 for(const width of[390,1440]){
  await p.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});await p.goto(origin+'/admin/users');await ready(p);await p.route('**/api/v1/admin/users?**',r=>r.fulfill({status:500,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/internal_error',title:'Failure',status:500,code:'internal_error',detail:'QA controlled failure',request_id:'req_qa072'})}));
  await p.getByRole('search').locator('input').fill('qa072_search');await p.getByRole('search').locator('button').click();await expect(p.locator('[role=alert]')).toBeVisible();await d.goto(design+'/prototype/?page=PAGE-103&role=admin&state=error&locale=en-US');await d.addStyleTag({content:'.prototype-tools{display:none!important}'});
  observations.push({width,locale:'en-US',actual:await p.locator('[role=alert]').innerText(),expected:await d.locator('[role=alert]').innerText()});
  await p.screenshot({path:join(dir,'screenshots','CR030-R072-01-actual-'+width+'.png'),fullPage:true});await d.screenshot({path:join(dir,'screenshots','CR030-R072-01-design-'+width+'.png'),fullPage:true});await p.unrouteAll();
 }
 writeFileSync(join(dir,'CR030-R072-01.json'),JSON.stringify({issue:'CR030-R072-01',verdict:'FAIL',kind:'exact-copy implementation mismatch',observations},null,2),{flag:'wx'});
 const timing=[];for(let i=0;i<20;i++){const start=performance.now();const r=await api(c,'GET','/api/v1/admin/users/'+f.users.qa072_other,token);out.record('local detail HTTP '+i,r.status,200);timing.push(performance.now()-start);}const sorted=[...timing].sort((a,b)=>a-b);
 writeFileSync(join(dir,'local-performance.json'),JSON.stringify({samplesMs:timing,p95Ms:sorted[Math.ceil(timing.length*.95)-1],scope:'20 sequential loopback Nginx+API+SQL reads; not load or Internet performance'},null,2),{flag:'wx'});out.record('local detail p95 under1s',sorted[Math.ceil(timing.length*.95)-1]<1000,true);
 await c.close();
 const learner=await b.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});token=await login(learner,rf.users.old.username);await api(learner,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const page=await learner.newPage();
 const created=await api(learner,'POST','/api/v1/me/review-sessions',token,{mode:'single_batch',batch_id:rf.batches.find(x=>x.label==='start').id});expect(created.status).toBe(200);
 await page.goto(origin+'/review/'+created.body.data.session_id);await ready(page);
 for(let i=0;i<2;i++){await expect(page.locator('#review-spelling-answer')).toBeVisible();await page.locator('.review-card-actions button').filter({hasText:'Skip'}).click();}
 await expect(page.locator('.cloze-input')).toHaveCount(4);
 const styles=await page.locator('.cloze-slot').evaluateAll(ns=>ns.map(n=>n.className));
 out.record('two lemmas create two colors',new Set(styles).size,2);out.record('interleaved surface groups',[styles[0]===styles[3],styles[1]===styles[2],styles[0]!==styles[1]],[true,true,true]);
 out.record('two-target cloze no spelling visible',/build|built|learn/i.test(await page.locator('.review-cloze-passage').innerText()),false);
 const positions=await page.locator('.cloze-input').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));out.record('two-target cloze no overlap',positions.every((a,i)=>positions.every((z,j)=>i===j||a.x+a.w<=z.x||z.x+z.w<=a.x||a.y+a.h<=z.y||z.y+z.h<=a.y)),true);
 await page.screenshot({path:join(dir,'screenshots','two-target-colors.png')});
 await page.locator('.review-card-actions button').filter({hasText:'Skip'}).click();await expect(page.locator('.review-summary-card')).toBeVisible();
 out.record('skipped story unsuccessful summary',await page.locator('.review-summary-card .stat-value').allInnerTexts(),['1','0','1']);
 const session=await api(learner,'GET','/api/v1/me/review-sessions/'+created.body.data.session_id,token);out.record('skipped session actual counts',session.body.data.session.summary,{total_batches:1,successful_batches:0,unsuccessful_batches:1,skipped_batches:1});
 await learner.close();
}catch(e){out.error('final supplemental execution',e);}finally{await b.close();out.save();}

