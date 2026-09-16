import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
const require=createRequire(process.env.QA132_FRONTEND_PACKAGE);
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
 const username="qa132_dedicated";
 const register=await context.request.post(base+"/api/v1/auth/login",{headers:{Origin:base,"Sec-Fetch-Site":"same-origin","X-CSRF-Token":csrf},data:{username,password:"qa132-synthetic-password",browser_ui_locale:"en-US"}});
 assert.equal(register.status(),200,"real dedicated auth login");
 for(const mode of ["valid","two-corrections","continuation","exhausted","cancel","leave","malformed","refund-pending"]) {
  const startedAt=Date.now();
  const before=await query("/mode?value="+(["cancel","leave"].includes(mode)?"hold-correction":mode),"POST");
  const previous=(await query("/state")).runs.length;
  const page=await context.newPage();
  page.setDefaultTimeout(45000);
  const pageErrors=[],responses=[];
  const wire=[];
  await page.exposeFunction("__qa132Chunk",chunk=>wire.push(Buffer.from(chunk)));
  await page.addInitScript(()=>{
   const original=window.fetch.bind(window);
   window.fetch=async(...args)=>{
    const response=await original(...args);
    if(response.url.endsWith("/generations/stream")&&response.body){
     const getReader=response.body.getReader.bind(response.body);
     response.body.getReader=(...readerArgs)=>{
      const reader=getReader(...readerArgs),read=reader.read.bind(reader);
      reader.read=async()=>{const next=await read();if(next.value)await window.__qa132Chunk([...next.value]);return next;};
      return reader;
     };
    }
    return response;
   };
  });
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
    await until(async()=>(await query("/state")).attempt===2);
    page.once("dialog",dialog=>dialog.accept());
    if(mode==="cancel")await page.locator(".output-header .button-danger-quiet").click();
    else {
     await page.locator('.main-nav a[href="/library"]').click();
     await page.waitForURL("**/library");
    }
   }
   if(["valid","two-corrections","continuation"].includes(mode)){
    await page.locator(".result-action-bar").waitFor();
    const passage=await page.locator(".reading-passage").innerText();
    result.render={characters:passage.length,sha256:sha(passage),has_provider_annotation:passage.includes("(grape)")};
    assert.equal(result.render.has_provider_annotation,false);
    const run=await until(async()=>{const all=(await query("/state")).runs;return all.length>previous&&all.at(-1).status==="valid"?all.at(-1):false;});
    assert.equal(run.charged,true);assert.equal(run.cumulative,true);assert.equal(run.drafts,1);
    if(["valid","two-corrections","continuation"].includes(mode)){
     await page.locator(".result-action-bar .button-primary").click();
     await until(async()=>((await query("/state")).runs.at(-1).batches===1));
    }
   } else if(mode!=="leave") {
    await page.locator(".output-empty").waitFor();
    assert.equal(await page.locator(".result-action-bar").count(),0);
    assert.equal(await page.locator(".generate-bar .button-primary").isEnabled(),true);
   }
   const want={valid:"valid","two-corrections":"valid",continuation:"valid",exhausted:"validation_failed",cancel:"user_cancelled",leave:"stream_failed",malformed:"provider_failed","refund-pending":"active"}[mode];
   result.db_before_recovery=await until(async()=>{
    const all=(await query("/state")).runs;return all.length>previous&&all.at(-1).status===want?all.at(-1):false;
   },20000);
   assert.equal(result.db_before_recovery.charged,["valid","two-corrections","continuation","cancel","refund-pending"].includes(mode));
   if(mode==="refund-pending"){
    await query("/restore-refund","POST");
    result.db_after_timer=await until(async()=>{
     const run=(await query("/state")).runs.at(-1);return run.status==="provider_failed"?run:false;
    },12000);
    assert.equal(result.db_after_timer.charged,false);
   }
   result.provider_calls=(await query("/state")).provider_calls-before.calls;
   assert.equal(result.provider_calls,{"two-corrections":3,continuation:2,exhausted:3,cancel:2,leave:2}[mode]??1);
   assert.equal(streams,1);assert.equal(cancels,mode==="cancel"?1:0);
   assert.deepEqual(pageErrors,[]);
   result.passed=true;
  }catch(e){result.passed=false;result.assertion=e.message;}
  finally {
   result.streams=streams;result.cancels=cancels;result.save_requests=saveRequests;result.page_errors=pageErrors;
   await page.close();
   result.cdp_response=await Promise.all(responses);
   result.transport=wire.length?[safeStream(Buffer.concat(wire).toString("utf8"),200)]:[];
   if(!["cancel","leave"].includes(mode)&&result.transport.length!==1){result.passed=false;result.assertion="missing browser reader evidence";}
   for(const s of result.transport) if(s.final_sha256) { if(s.delta_sha256!==s.final_sha256) {result.passed=false;result.assertion="preview/final mismatch";} }
   const evidence=await query("/evidence");
   const runID=result.db_before_recovery?.run_id;
   result.evidence={ordinary_leak:evidence.ordinary_leak,bundle:evidence.bundles.find(b=>b.summary?.run_id===runID),ordinary_summary:evidence.ordinary_summaries.find(s=>s.run_id===runID)};
   if(evidence.ordinary_leak){result.passed=false;result.assertion="ordinary log leaked private data";}
   result.elapsed_ms=Date.now()-startedAt;
   results.push(result);
   console.log(JSON.stringify({mode:result.mode,passed:result.passed,assertion:result.assertion,provider_calls:result.provider_calls,terminal:result.transport[0]?.terminal}));
  }
 }
 const summary={summary:true,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,scope:"real Chromium/Nuxt/Go/PG; isolated synthetic provider; no paid model or actual UAT state",final_state:await query("/state")};
 writeFileSync(new URL("./browser-results.json",import.meta.url),JSON.stringify({recorded_at:new Date().toISOString(),results,summary},null,2)+"\n");
 console.log(JSON.stringify({passed:summary.passed,failed:summary.failed}));
 if(results.some(r=>!r.passed))process.exitCode=1;
}finally {
 await context.close();
 await browser.close();
}
