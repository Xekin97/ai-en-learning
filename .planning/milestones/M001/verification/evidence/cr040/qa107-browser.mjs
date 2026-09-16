import { createServer, request as upstreamRequest } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
const { chromium, expect } = await import(pathToFileURL(process.cwd()+"/frontend/node_modules/@playwright/test/index.mjs"));
const candidate=process.env.CR040_FRONTEND_ORIGIN;
if (!candidate || new URL(candidate).hostname!=="127.0.0.1") throw new Error("Explicit isolated frontend required");
const proxy=createServer((req,res)=>{
  const upstream=upstreamRequest(new URL(req.url,req.url.startsWith("/api/v1")?"http://127.0.0.1:38080":candidate),{method:req.method,headers:req.headers}, incoming=>{
    res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);
  });
  upstream.on("error",()=>{res.writeHead(502);res.end()});req.pipe(upstream);
});
proxy.listen(0,"127.0.0.1");await once(proxy,"listening");
const origin="http://127.0.0.1:"+proxy.address().port;
const browser=await chromium.launch({headless:true});
const checks=[];
try {
  for (const scenario of ["current-meaning","old-only","both-keys","null-meaning"]) {
    const context=await browser.newContext();
    await context.addCookies([{name:"wordweave_session",value:"learner",url:origin},{name:"wordweave_ui_locale",value:"en-US",url:origin}]);
    const page=await context.newPage();
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(origin+"/library");await page.waitForFunction(()=>document.documentElement.dataset.appReady==="true");
    let intercepted=0;
    await page.route("**/api/v1/me/batches/batch-e2e", async route=>{
      intercepted++;
      const response=await route.fetch();const body=await response.json();
      body.data.batch.configuration.meaning_language="zh";
      const target=body.data.batch.targets[0];
      target.entry_meaning="适应；调整";
      if(scenario==="old-only"){target.contextual_meaning=target.entry_meaning;delete target.entry_meaning;}
      if(scenario==="both-keys")target.contextual_meaning="LEGACY SHOULD NEVER RENDER";
      if(scenario==="null-meaning")target.entry_meaning=null;
      await route.fulfill({response,json:body});
    });
    await page.locator('a[href="/library/batch-e2e"]').click();
    await expect(page).toHaveURL(origin+"/library/batch-e2e");
    if(scenario==="current-meaning"){
      await expect(page.locator(".resource-card > p").first()).toHaveText("适应；调整");
      await expect(page.locator(".resource-card > h3")).toHaveText("adapt");
      await expect(page.locator(".app-error")).toHaveCount(0);
    }else{
      await expect(page.locator(".app-error[role=alert]")).toBeVisible();
      await expect(page.locator(".resource-card")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("LEGACY SHOULD NEVER RENDER");
    }
    if(intercepted!==1||errors.length)throw new Error("Unexpected request or runtime error: "+JSON.stringify({scenario,intercepted,errors}));
    checks.push({scenario,result:"PASS",detail:scenario==="current-meaning"?"English UI preserves complete Chinese entry meaning with semicolon":"Invalid DTO rejected; no old-field fallback or partial resource"});
    await context.close();
  }
  console.log(JSON.stringify({result:"PASS",checks,real_model_calls:0,method:"QA client navigation through production candidate; isolated intercepted API fixtures"},null,2));
}finally{
  await browser.close();proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));
}

