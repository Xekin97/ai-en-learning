import {readFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {chromium,expect} from "../../../../../../frontend/node_modules/@playwright/test/index.mjs";
import {dir,authority,counts,keepDigests,inspect,images,same,sql,publish} from "./helpers.mjs";
authority();
if(existsSync(join(dir,"smoke-recheck.json")))throw Error("Smoke recheck receipt exists");
const deploy=JSON.parse(readFileSync(join(dir,"deployment.json"),"utf8"));if(deploy.status!=="PASS")throw Error("Deployment incomplete");
const origin="http://localhost:6001",checks=[],errors=[],blocked=[],requests=[],contexts=[];
const check=(name,actual,expected=true)=>{checks.push({name,status:same(actual,expected)?"PASS":"FAIL",actual,expected});if(!same(actual,expected))throw Error("Smoke assertion failed: "+name);};
const before=counts(),retained=keepDigests();let admin,learner,adminLogged=false,learnerCreated=false,csrfLearner,csrfAdmin;
const username="uat_smoke108_"+randomBytes(3).toString("hex"),password="Smoke108_"+randomBytes(12).toString("hex");
const allowed=new Set(["POST /api/v1/auth/login","POST /api/v1/auth/logout","POST /api/v1/auth/register","DELETE /api/v1/me/account"]);
const browser=await chromium.launch({headless:true});
async function context(){const c=await browser.newContext({locale:"en-US",viewport:{width:1440,height:1000}});contexts.push(c);await c.addCookies([{name:"wordweave_ui_locale",value:"en-US",url:origin}]);c.on("page",p=>p.on("pageerror",e=>errors.push(e.message)));await c.route("**/api/v1/**",route=>{const req=route.request(),path=new URL(req.url()).pathname;requests.push({method:req.method(),path});if(!["GET","HEAD","OPTIONS"].includes(req.method())&&!allowed.has(req.method()+" "+path)){blocked.push(path);return route.abort();}return route.continue();});return c;}
async function get(c,path){const res=await c.request.get(origin+path);check("GET "+path+" status",res.status(),200);return (await res.json()).data;}
async function mutation(c,method,path,csrf,data){if(!allowed.has(method+" "+path))throw Error("Disallowed smoke mutation");return c.request.fetch(origin+path,{method,headers:{origin,"sec-fetch-site":"same-origin","x-csrf-token":csrf},data});}
async function page(c,path,selector){const p=await c.newPage();const res=await p.goto(origin+path);check(path+" document",res.status(),200);await p.waitForFunction(()=>document.documentElement.dataset.appReady==="true");await expect(p.locator(selector).first()).toBeVisible();check(path+" no app error",await p.locator(".app-error").count(),0);return p;}
try {
 const guest=await context();
 const boot=await get(guest,"/api/v1/bootstrap");check("Guest identity after reset",boot.actor.kind,"visitor");
 const options=await get(guest,"/api/v1/generation-options");check("Guest has no assigned models",options.models.length,0);check("Guest generation unavailable",options.availability.can_generate,false);
 const vocab=await get(guest,"/api/v1/vocabulary/search?q=vulnerable");check("Preserved vocabulary readable",vocab.items.some(x=>x.entry==="vulnerable"));
 await page(guest,"/",".hero-title");await page(guest,"/create",".studio-grid");
 await page(guest,"/review",".auth-gate");await page(guest,"/library",".auth-gate");
 check("Administrator locale already set; login will not mutate retained preference",sql("SELECT ui_locale IS NOT NULL FROM wordweave.accounts WHERE username='uat_admin' AND role='admin';"),"t");
 admin=await context();const ab=await get(admin,"/api/v1/bootstrap");
 const logged=await mutation(admin,"POST","/api/v1/auth/login",ab.csrf_token,{username:"uat_admin",password:"UatAdminPass6000!",browser_ui_locale:"en-US"});
 check("Original administrator password accepted",logged.status(),200);adminLogged=true;csrfAdmin=(await logged.json()).data.csrf_token;
 const models=await get(admin,"/api/v1/admin/models");check("Preserved model count visible",models.items.length,before.ai_models);
 const ap=await page(admin,"/admin/models",".model-list");await ap.screenshot({path:join(dir,"admin-models-recheck.png"),fullPage:true});
 const users=await get(admin,"/api/v1/admin/users?username=uat_learner");check("Old learner absent from user search",users.items.length,0);
 const groups=await get(admin,"/api/v1/admin/groups");check("All groups unassigned",groups.items.every(g=>g.models.length===0));
 learner=await context();const lb=await get(learner,"/api/v1/bootstrap");
 const reg=await mutation(learner,"POST","/api/v1/auth/register",lb.csrf_token,{username,password,password_confirmation:password,ui_locale:"en-US"});
 check("Fresh registration works",reg.status(),201);learnerCreated=true;csrfLearner=(await reg.json()).data.csrf_token;
 const summary=await get(learner,"/api/v1/me/learning-summary");check("All six learning statistics are zero",Object.values(summary).every(v=>v===0));check("Six learning statistics present",Object.keys(summary).length,6);
 const library=await get(learner,"/api/v1/me/batches");check("Fresh library empty",library.items.length,0);
 const learnerOptions=await get(learner,"/api/v1/generation-options");check("New learner has no assigned models",learnerOptions.models.length,0);check("New learner generation unavailable",learnerOptions.availability.can_generate,false);
 const lp=await page(learner,"/library",".page-title");await lp.screenshot({path:join(dir,"library-empty-recheck.png"),fullPage:true});
 await page(learner,"/create",".studio-grid");
} catch(error){checks.push({name:"Smoke execution",status:"ERROR",message:error.message});}
finally {
 if(learnerCreated){try{const res=await mutation(learner,"DELETE","/api/v1/me/account",csrfLearner,{current_password:password,confirmed:true});check("Own temporary learner removed by account API",res.status(),204);learnerCreated=false;}catch{checks.push({name:"Own temporary learner cleanup",status:"ERROR"});}}
 if(adminLogged){try{const res=await mutation(admin,"POST","/api/v1/auth/logout",csrfAdmin,{});check("Own administrator test session logged out",res.status(),204);adminLogged=false;}catch{checks.push({name:"Own administrator session cleanup",status:"ERROR"});}}
 for(const c of contexts)await c.close();await browser.close();
 const after=counts(),runtime=inspect();
 for(const [name,ok] of [["Preserved rows unchanged",same(retained,keepDigests())],["No generation/model calls",after.generation_runs===0],["No learner or session remains",after.learners===0&&after.account_sessions===0],["No batches created",after.learning_batches===0],["Paired images current",runtime.backend.Image===images.backend&&runtime.frontend.Image===images.frontend],["Four services healthy",Object.values(runtime).every(c=>c.State.Health?.Status==="healthy")],["No browser runtime errors",errors.length===0],["No prohibited mutation attempted",blocked.length===0]])checks.push({name,status:ok?"PASS":"FAIL"});
 const totals={PASS:0,FAIL:0,ERROR:0};for(const c of checks)totals[c.status]++;
 publish("smoke-recheck.json",{date:new Date().toISOString(),totals,checks,errors,blocked,requestCount:requests.length,realModelCalls:0,temporaryLearnerRemoved:!learnerCreated,temporaryAdminSessionRemoved:!adminLogged,countsBefore:before,countsAfter:after,note:"Visitor identities can be recreated by page/readiness requests; original 47737 visitors were deleted atomically. No second cleanup."});
 console.log(JSON.stringify({totals,temporaryLearnerRemoved:!learnerCreated,temporaryAdminSessionRemoved:!adminLogged,realModelCalls:0}));
 if(totals.FAIL||totals.ERROR)process.exitCode=1;
}
