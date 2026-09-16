const {chromium,expect}=require('@playwright/test');
(async()=>{
const b=await chromium.launch(); const c=await b.newContext();const p=await c.newPage();
try{
const origin='http://127.0.0.1:6101';
const boot=await (await c.request.get(origin+'/api/v1/bootstrap')).json();
const login=await c.request.post(origin+'/api/v1/auth/login',{headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','x-csrf-token':boot.data.csrf_token},data:{username:'cr033_admin',password:'CR033_test_only_12345',browser_ui_locale:'en-US'}});
expect(login.status()).toBe(200);
await c.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);
const list=await (await c.request.get(origin+'/api/v1/admin/users?username=cr033_learner&limit=20')).json();
const id=list.data.items[0].id;
const result={combination:process.env.COMBINATION};
await p.goto(origin+'/admin/users/'+id+'?q=cr033_learner');
await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
if(process.env.EXPECT_ERROR==='1'){
 await expect(p.locator('.app-error')).toBeVisible(); await expect(p.locator('.definition-list dd')).toHaveCount(0);
 result.ssr='contract safely rejected; no quota value';
 await p.goto(origin+'/admin/users');
 await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 await p.locator('form[role=search] input').fill('cr033_learner');
 await p.locator('form[role=search] button').click();
 await p.locator('.admin-user-result a').first().click();
 await expect(p.locator('.app-error')).toBeVisible();
 await expect(p.locator('.definition-list dd')).toHaveCount(0);
 result.client='contract safely rejected; no quota value';
}else{
 await expect(p.locator('.definition-list dd')).not.toHaveCount(0);
 result.ssr='compatible detail rendered';
 result.scope=process.env.COMBINATION==='old-old'?'rollback smoke only; quota fix absent':'v1.4';
}
result.result='PASS';console.log(JSON.stringify(result));
}finally{await b.close();}
})();
