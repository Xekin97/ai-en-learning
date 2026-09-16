import{webkit,dir}from'./lib.mjs';import{writeFileSync}from'node:fs';import{join}from'node:path';import os from'node:os';
const evidence={purpose:'Independent native macOS WebKit input control; no app, network, credentials or DOM injection into product',platform:os.platform(),release:os.release(),date:new Date().toISOString(),status:'NOT_RUN'};let browser;
try{browser=await webkit.launch();const p=await browser.newPage();await p.setContent('<!doctype html><html lang="en"><title>QA081 input control</title><body><label>Test<input type="password"></label></body></html>');await p.locator('input').fill('synthetic-control');evidence.status='INPUT_CONTROL_PASS';}
catch(e){evidence.status=/NSTextInputContext|textInputClientDidUpdateSelection|Target.*closed/.test(String(e))?'ENVIRONMENT_BLOCKED':'ERROR';evidence.error=String(e);}
finally{await browser?.close().catch(()=>{});writeFileSync(join(dir,'native-webkit-control.json'),JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify(evidence));}

