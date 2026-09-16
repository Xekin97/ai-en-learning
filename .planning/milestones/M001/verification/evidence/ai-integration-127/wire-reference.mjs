import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const require=createRequire(process.env.QA127_FRONTEND_PACKAGE);
const {request}=require("@playwright/test");
const base="http://127.0.0.1:16011",control="http://127.0.0.1:16012";
const ctx=await request.newContext();
try{
 const health=await (await fetch(control+"/health")).json();
 const bootstrap=await ctx.get(base+"/api/v1/bootstrap");
 const csrf=(await bootstrap.json()).data.csrf_token;
 const registration=await ctx.post(base+"/api/v1/auth/register",{headers:{Origin:base,"Sec-Fetch-Site":"same-origin","X-CSRF-Token":csrf},data:{username:"qa127_wire_"+Date.now(),password:"qa127-synthetic-password",password_confirmation:"qa127-synthetic-password",ui_locale:"en-US"}});
 assert.equal(registration.status(),201);
 const headers={Origin:base,"Sec-Fetch-Site":"same-origin","X-CSRF-Token":(await registration.json()).data.csrf_token};
 await fetch(control+"/mode?value=large",{method:"POST"});
 const response=await ctx.post(base+"/api/v1/generations/stream",{headers,data:{model_id:health.model_id,meaning_language:"en",scenario:"story",length:"short",entries:["grape"]},timeout:60000});
 assert.equal(response.status(),200);
 const wire=await response.text();
 const events=wire.split("\n\n").map(e=>({name:e.match(/^event: (.*)$/m)?.[1],data:e.match(/^data: (.*)$/m)?.[1]})).filter(e=>e.name);
 const finalEvent=events.find(e=>e.name==="generation.validated");
 assert.ok(finalEvent);
 const final=JSON.parse(finalEvent.data).result;
 const clean=events.filter(e=>e.name==="passage.delta").map(e=>JSON.parse(e.data).text).join("");
 assert.equal(clean===final.passage,true,"clean stream equals validated passage");
 assert.equal(final.passage==="Fresh grapes are delicious. "+"Neighbors offer practical ideas and helpful support. ".repeat(22000).trim(),true,"independent expected passage");
 assert.equal(final.targets[0].entry,"grape");
 const occurrence=final.targets[0].occurrences[0];
 assert.equal([...final.passage].slice(occurrence.start,occurrence.end).join(""),"grapes");
 const {createParser}=require("eventsource-parser");
 const parserErrors=[];let sawValidated=false;
 const parser=createParser({maxBufferSize:1048576,onError:e=>parserErrors.push(e.type),onEvent:e=>{if(e.event==="generation.validated")sawValidated=true;}});
 try { for(let i=0;i<wire.length;i+=16384)parser.feed(wire.slice(i,i+16384)); }catch(e){parserErrors.push(e.type??e.name);}
 assert.equal(sawValidated,false);assert.ok(parserErrors.length>0);
 console.log(JSON.stringify({passed:true,mode:"large-wire-reference",node:process.version,http_status:response.status(),events:events.length,terminal:events.at(-1).name,validated_data_characters:finalEvent.data.length,validated_data_bytes:Buffer.byteLength(finalEvent.data),clean_passage_characters:clean.length,clean_sha256:createHash("sha256").update(clean).digest("hex"),clean_equals_final:true,span_matches:true,annotated_text_visible:clean.includes("(grape)"),frontend_parser_limit:1048576,limit_unit:"JS string buffer (ASCII fixture has equal bytes/chars)",frontend_library_errors:parserErrors,frontend_library_validated_seen:sawValidated,provider_calls_for_this_reference:1}));
}finally{await ctx.dispose();}
