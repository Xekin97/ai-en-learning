import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const require=createRequire(process.env.QA127_FRONTEND_PACKAGE);
const {chromium}=require("@playwright/test");
const base="http://127.0.0.1:16011",control="http://127.0.0.1:16012";
const query=async(path,method="GET")=>{
 const res=await fetch(control+path,{method});
 assert.equal(res.status,200,"QA control "+path);
 return res.json();
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=10000)=>{
 const deadline=Date.now()+ms;
 for (;;) {const result=await fn();if(result)return result;if(Date.now()>deadline)throw Error("QA state wait timed out");await delay(100);}
};
const sha=s=>createHash("sha256").update(s).digest("hex");
function safeStream(body,status) {
 const names=[],deltas=[];let final=null,failure=null,maxDataBytes=0;
 for(const event of body.split(/\r?\n\r?\n/)) {
  const name=event.match(/^event: ([^\r\n]+)/m)?.[1];
  if(!name)continue;
  names.push(name);
  const data=event.match(/^data: (.*)$/m)?.[1];
  if(!data)continue;
  maxDataBytes=Math.max(maxDataBytes,Buffer.byteLength(data));
  const value=JSON.parse(data);
  if(name==="passage.delta")deltas.push(value.text);
  if(name==="generation.validated")final=value.result.passage;
  if(name==="generation.failed")failure={code:value.code,quota_refunded:value.quota_refunded,request_id_present:typeof value.request_id==="string"};
 }
 const text=deltas.join("");
 return {status,event_counts:Object.fromEntries([...new Set(names)].map(n=>[n,names.filter(x=>x===n).length])),terminal:names.at(-1),max_data_bytes:maxDataBytes,delta_chars:text.length,delta_sha256:sha(text),final_chars:typeof final==="string"?final.length:null,final_sha256:typeof final==="string"?sha(final):null,failure};
}
const browser=await chromium.launch({headless:true});
const results=[];
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route("**/*",route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
try {
 const boot=await context.request.get(base+"/api/v1/bootstrap");
 assert.equal(boot.status(),200);
 const csrf=(await boot.json()).data.csrf_token;
 const username="qa127_"+Date.now();
 const register=await context.request.post(base+"/api/v1/auth/register",{headers:{Origin:base,"Sec-Fetch-Site":"same-origin","X-CSRF-Token":csrf},data:{username,password:"qa127-synthetic-password",password_confirmation:"qa127-synthetic-password",ui_locale:"en-US"}});
 assert.equal(register.status(),201,"real auth register");
 for(const mode of ["valid","invalid","open-error","cancel","leave","slow","refund-pending","large"]) {
  const startedAt=Date.now();
  const before=await query("/mode?value="+(["cancel","leave"].includes(mode)?"hold":mode),"POST");
  const previous=(await query("/state")).runs.length;
  const page=await context.newPage();
  page.setDefaultTimeout(45000);
  const pageErrors=[],responses=[];
  let streams=0,cancels=0,saveRequests=0;
  const result={mode};
  page.on("pageerror",e=>pageErrors.push(e.message));
  page.on("request",r=>{
   if(r.url().endsWith("/generations/stream"))streams++;
   if(r.url().endsWith("/cancel"))cancels++;
   if(r.url().endsWith("/save"))saveRequests++;
  });
  page.on("response",r=>{
   if(r.url().endsWith("/generations/stream"))
    responses.push(r.text().then(body=>safeStream(body,r.status())).catch(()=>({status:r.status(),body_unavailable_after_client_close:true})));
  });
  try {
   await page.goto(base+"/create");
   await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
   await page.locator("#word-search").fill("gra");
   await page.locator(".word-search-overlay").getByRole("option",{name:"grape",exact:true}).click();
   await page.locator(".choice-grid-model button.choice").first().click();
   await page.locator(".choice-grid-3 button.choice").filter({hasText:"English"}).click();
   await page.locator(".choice-grid-scenario button.choice").filter({hasText:"Story"}).click();
   await page.locator(".choice-grid-4 button.choice").filter({hasText:"Brief"}).click();
   await page.locator(".generate-bar .button-primary").click();
   await until(async()=>streams===1);
   if(["cancel","leave"].includes(mode)){
    await page.waitForFunction(()=>document.querySelector(".stream-passage")?.textContent?.includes("delicious"));
    page.once("dialog",dialog=>dialog.accept());
    if(mode==="cancel")await page.locator(".output-header .button-danger-quiet").click();
    else {
     await page.locator('.main-nav a[href="/library"]').click();
     await page.waitForURL("**/library");
    }
   }
   if(["valid","slow"].includes(mode)){
    await page.locator(".result-action-bar").waitFor();
    const passage=await page.locator(".reading-passage").innerText();
    result.render={characters:passage.length,sha256:sha(passage),has_provider_annotation:passage.includes("(grape)")};
    assert.equal(result.render.has_provider_annotation,false);
    const run=await until(async()=>{const all=(await query("/state")).runs;return all.length>previous&&all.at(-1).status==="valid"?all.at(-1):false;});
    assert.equal(run.charged,true);assert.equal(run.cumulative,true);assert.equal(run.drafts,1);
    if(mode==="valid"){
     await page.locator(".result-action-bar .button-primary").click();
     await until(async()=>((await query("/state")).runs.at(-1).batches===1));
    }
   } else if(mode==="large"){
    await page.waitForFunction(()=>!!document.querySelector(".result-action-bar")||!!document.querySelector(".app-error"));
    result.visible_error=(await page.locator(".app-error").allTextContents()).join("").trim();
    result.save_visible=await page.locator(".result-action-bar").count()===1;
   } else if(mode!=="leave") {
    await page.locator(".output-empty").waitFor();
    assert.equal(await page.locator(".result-action-bar").count(),0);
    assert.equal(await page.locator(".generate-bar .button-primary").isEnabled(),true);
   }
   const want={valid:"valid",invalid:"validation_failed","open-error":"provider_failed",cancel:"user_cancelled",leave:"stream_failed",slow:"valid","refund-pending":"active",large:"valid"}[mode];
   result.db_before_recovery=await until(async()=>{
    const all=(await query("/state")).runs;return all.length>previous&&all.at(-1).status===want?all.at(-1):false;
   },20000);
   assert.equal(result.db_before_recovery.charged,["valid","cancel","slow","refund-pending","large"].includes(mode));
   if(mode==="refund-pending"){
    await query("/restore-refund","POST");
    result.db_after_timer=await until(async()=>{
     const run=(await query("/state")).runs.at(-1);return run.status==="validation_failed"?run:false;
    },12000);
    assert.equal(result.db_after_timer.charged,false);
   }
   result.provider_calls=(await query("/state")).provider_calls-before.calls;
   assert.equal(result.provider_calls,1);
   assert.equal(streams,1);assert.equal(cancels,mode==="cancel"?1:0);
   assert.deepEqual(pageErrors,[]);
   if(mode==="large")assert.equal(result.save_visible,true,"backend accepted and charged valid output must remain saveable");
   result.passed=true;
  }catch(e){result.passed=false;result.assertion=e.message;}
  finally {
   result.streams=streams;result.cancels=cancels;result.save_requests=saveRequests;result.page_errors=pageErrors;
   await page.close();
   result.transport=await Promise.all(responses);
   result.elapsed_ms=Date.now()-startedAt;
   results.push(result);
   console.log(JSON.stringify(result));
  }
 }
 console.log(JSON.stringify({summary:true,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,scope:"real Chromium/Nuxt/Go/PG; isolated synthetic provider; no paid model or actual UAT state",final_state:await query("/state")}));
 if(results.some(r=>!r.passed))process.exitCode=1;
}finally {
 await context.close();
 await browser.close();
}
