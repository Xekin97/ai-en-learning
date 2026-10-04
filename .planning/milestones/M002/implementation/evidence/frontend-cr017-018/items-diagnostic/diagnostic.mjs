import {readFileSync} from 'node:fs';
import {chromium,start,stop,ok,call,sql,out,dump,env} from './harness.mjs';
const f=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const user=sql(`SELECT username FROM wordweave.accounts WHERE id='${f.owner}'`);
let b;const result={localProviderCalls:0,realProviderCalls:0,api:[]};
try{
 b=await start(chromium);const c=await b.newContext();await ok(c,'/auth/login','POST',{username:user,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 for(const path of ['/me/growth','/me/items']){
  const r=await call(c,path);result.api.push({path,status:r.status,body:r.body});
 }
 dump('results.json',result);
 console.log(JSON.stringify(result));
}finally{await stop(b);}
