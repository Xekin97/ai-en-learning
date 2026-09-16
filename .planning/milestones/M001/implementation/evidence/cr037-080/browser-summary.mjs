import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{dir}from'./lib.mjs';
const read=n=>JSON.parse(readFileSync(join(dir,n),'utf8')),mac=read('browser-final2-results.json'),linux=read('browser-linux-webkit-results.json');
const chromium=mac.checks.filter(c=>c.id.startsWith('Chromium')),webkit=linux.checks.filter(c=>c.id.startsWith('WebKit'));
const macRuntime=mac.checks.find(c=>c.id==='no browser runtime errors'),linuxRuntime=linux.checks.find(c=>c.id==='no browser runtime errors');
if(chromium.length!==84||webkit.length!==84||chromium.some(c=>c.status!=='PASS')||linux.counts.FAIL||linux.counts.ERROR||macRuntime?.status!=='PASS'||linuxRuntime?.status!=='PASS')throw Error('Incomplete browser coverage');
const checks=[...chromium,{...macRuntime,id:'macOS Chromium JavaScript runtime errors'},...webkit,{...linuxRuntime,id:'Linux WebKit JavaScript runtime errors'}];
const result={date:new Date().toISOString(),agent:'frontend-claire',counts:{PASS:checks.length,FAIL:0,ERROR:0},sources:[{file:'browser-final2-results.json',selection:'Completed Chromium suite only: 84 checks; native macOS WebKit aborted and is excluded, not passed.'},{file:'browser-linux-webkit-results.json',selection:'Complete Linux WebKit run: 84 checks plus runtime check.'}],platformLimit:'Native macOS WebKit interactive password flow remains unverified due native exception. Linux WebKit does not establish native Safari/macOS completion.',checks};
writeFileSync(join(dir,'browser-summary.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result.counts));

