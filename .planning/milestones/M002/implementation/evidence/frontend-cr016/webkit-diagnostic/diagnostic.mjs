import {readFileSync} from 'node:fs';
import {webkit,start,stop,ok,sql,origin,out,dump,ready,env} from './harness.mjs';
const f=JSON.parse(readFileSync(new URL('input.json',out))).fixture;
const username=sql(`SELECT username FROM wordweave.accounts WHERE id='${f.owner}'`);
let browser;const results=[];
try{browser=await start(webkit);
for(const lang of ['en-US','zh-CN']){
 const c=await browser.newContext({locale:'zh-CN',viewport:{width:390,height:960},reducedMotion:'reduce'});
 await ok(c,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'zh-CN'});
 await ok(c,'/me/ui-locale','PUT',{ui_locale:lang});
 await c.addInitScript(()=>{window.__titleChanges=[];new MutationObserver(list=>{for(const m of list){const e=m.target.nodeType===3?m.target.parentElement:m.target;if(!e||['SCRIPT','STYLE'].includes(e.tagName))continue;const before=m.type==='characterData'?m.oldValue:[...m.removedNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');const after=m.type==='characterData'?m.target.textContent:[...m.addedNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');if(before&&before!==after)window.__titleChanges.push({tag:e.tagName,cls:e.className,before:before.slice(0,200),after:after.slice(0,200)});}}).observe(document,{subtree:true,characterData:true,characterDataOldValue:true,childList:true});});
 const p=await c.newPage(),errors=[];p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text())});p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/library/'+f.siblingB);await ready(p);await p.evaluate(()=>new Promise(requestAnimationFrame));
 results.push({accountLocale:lang,browserLocale:'zh-CN',errors,changes:await p.evaluate(()=>window.__titleChanges)});await c.close();
}
}finally{dump('results.json',{results,localProviderCalls:0,realProviderCalls:0});await stop(browser);}
