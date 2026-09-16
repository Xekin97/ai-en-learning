import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const require=createRequire(process.env.FRONT133_PACKAGE);
const {chromium}=require("@playwright/test");
const base=process.env.FRONT133_BASE??"http://127.0.0.1:16031";
const mock="http://127.0.0.1:38080";
const sha=s=>createHash("sha256").update(s).digest("hex");
const frame=(event,data)=>"event: "+event+"\ndata: "+JSON.stringify(data)+"\n\n";
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const mode of ["valid","refunded","refund-pending"]){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:"wordweave_session",value:"learner",url:base}]);
  const requests={streams:0,saves:0,synthetic_api:0};
  const pageErrors=[];
  await context.route("**/*",async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==base)return route.abort();
   if(!u.pathname.startsWith("/api/v1/"))return route.continue();
   requests.synthetic_api++;
   if(u.pathname==="/api/v1/generations/stream"){
    requests.streams++;
    const run="front133-"+mode;
    let body=frame("generation.started",{run_id:run,generation_token:"synthetic-only-capability"})+frame("passage.delta",{text:"We adapt."});
    body+=mode==="valid"?frame("generation.validated",{run_id:run,result:{passage:"We adapt.",tags:["Study"],targets:[{entry:"adapt",entry_meaning:"change to fit a new situation",hint_phrase:"adapt well",hint_blanks:[{start:0,end:5}],occurrences:[{start:3,end:8,surface:"adapt"}]}]}}):frame("generation.failed",{code:"content_validation_failed",quota_refunded:mode==="refunded",retryable:true,request_id:"front133-synthetic-request"});
    return route.fulfill({status:200,contentType:"text/event-stream",headers:{"cache-control":"no-store"},body});
   }
   if(u.pathname.endsWith("/save")){
    requests.saves++;
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{batch_id:"batch-e2e",saved_at:"2026-08-10T09:00:00+08:00"},meta:{request_id:"front133-save"}})});
   }
   return route.fulfill({response:await route.fetch({url:mock+u.pathname+u.search})});
  });
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror",e=>pageErrors.push(e.message));
  const result={mode,requests,pageErrors};
  try{
   const response=await page.goto(base+"/create");
   assert.equal(response.status(),200);
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
   await page.locator("#word-search").fill("ada");
   await page.locator(".word-search-overlay").getByRole("option",{name:"adapt",exact:true}).click();
   await page.locator(".choice-grid-model button.choice").first().click();
   await page.locator(".choice-grid-3 button.choice").filter({hasText:"English"}).click();
   await page.locator(".choice-grid-scenario button.choice").filter({hasText:"Story"}).click();
   await page.locator(".choice-grid-4 button.choice").filter({hasText:"Brief"}).click();
   await page.locator(".generate-bar .button-primary").click();
   if(mode==="valid"){
    await page.locator(".result-action-bar").waitFor();
    assert.equal(await page.locator(".reading-passage").innerText(),"We adapt.");
    assert.equal(await page.locator(".resource-grid").count(),1);
    await page.locator(".result-action-bar .button-primary").click();
    await page.waitForURL("**/library/batch-e2e");
    assert.equal(requests.saves,1);
   }else{
    await page.locator(".app-error").waitFor();
    await page.locator(".output-empty").waitFor();
    assert.equal(await page.locator(".result-action-bar").count(),0);
    assert.equal(await page.locator(".generate-bar .button-primary").isEnabled(),true);
    result.visible_error=(await page.locator(".app-error").allTextContents()).join("").trim();
    result.error_sha256=sha(result.visible_error);
    assert.ok(result.visible_error.length>0);
    assert.equal(requests.saves,0);
   }
   assert.equal(requests.streams,1);
   assert.deepEqual(pageErrors,[]);
   result.passed=true;
  }catch(error){result.passed=false;result.error=error.message;}
  results.push(result);
  console.log(JSON.stringify(result));
  await context.close();
 }
 const failures=results.filter(r=>!r.passed);
 const sameFailureUI=results[1].visible_error===results[2].visible_error&&!!results[1].visible_error;
 const summary={recorded_at:new Date().toISOString(),base,production_build:true,browser:"Chromium",api_mode:"all browser API requests intercepted; synthetic fixture only",real_model_calls:0,results,same_failure_ui:sameFailureUI,passed:results.length-failures.length,failed:failures.length};
 writeFileSync(new URL("./smoke-results.json",import.meta.url),JSON.stringify(summary,null,2)+"\n");
 assert.deepEqual(failures,[]);
 assert.equal(sameFailureUI,true);
}finally{await browser.close();}
