// Bounded real dictionary failure -> speech probe; isolated installed Chrome context.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
const {chromium}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><button id="play">Play hello</button>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={at:new Date().toISOString(),mock:false,tlsBypass:false,humanListening:false,applicationVerification:false,environment:'Installed Chrome, headed, separate new context; async fallback from first gesture',requests:[]};let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:false});report.browserVersion=browser.version();const page=await browser.newPage();
 page.on('request',r=>report.requests.push({url:r.url(),type:r.resourceType()}));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 report.voiceReady=await page.evaluate(()=>new Promise(resolve=>{let timer;const done=()=>{speechSynthesis.removeEventListener('voiceschanged',check);clearTimeout(timer);resolve({voices:speechSynthesis.getVoices().length,english:speechSynthesis.getVoices().filter(v=>/^en(?:-|$)/i.test(v.lang)).length});};const check=()=>{if(speechSynthesis.getVoices().some(v=>/^en(?:-|$)/i.test(v.lang)))done();};speechSynthesis.addEventListener('voiceschanged',check);timer=setTimeout(done,1500);check();}));
 await page.evaluate(()=>{
  document.querySelector('#play').onclick=async()=>{
   const t=performance.now(),events=[];const stamp=event=>events.push({event,ms:Math.round(performance.now()-t)});stamp('click');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500);
   try{const r=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/hello',{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});await r.arrayBuffer();clearTimeout(timer);window.result={outcome:'dictionary_returned_fallback_not_exercised',http:r.status,events};return;}
   catch(e){stamp('dictionary_'+e.name);}finally{clearTimeout(timer);}
   const voice=speechSynthesis.getVoices().find(v=>/^en(?:-|$)/i.test(v.lang));if(!voice){window.result={outcome:'no_english_voice',events};return;}
   const u=new SpeechSynthesisUtterance('hello');u.voice=voice;u.lang=voice.lang;let done=false,endTimer;const activation={isActive:navigator.userActivation.isActive,hasBeenActive:navigator.userActivation.hasBeenActive};
   const finish=outcome=>{if(done)return;done=true;clearTimeout(startTimer);clearTimeout(endTimer);window.result={outcome,events,milliseconds:Math.round(performance.now()-t),activationAtSpeak:activation,voice:{name:voice.name,lang:voice.lang,localService:voice.localService}};speechSynthesis.cancel();};
   const startTimer=setTimeout(()=>finish('speech_start_deadline'),2000);
   u.onstart=()=>{if(done)return;clearTimeout(startTimer);stamp('speech_start');endTimer=setTimeout(()=>finish('speech_end_deadline'),12000);};u.onend=()=>{stamp('speech_end');finish('ended');};u.onerror=e=>finish(e.error);speechSynthesis.speak(u);
  };
 });
 await page.click('#play');await page.waitForFunction(()=>window.result,undefined,{timeout:18000});report.result=await page.evaluate(()=>window.result);
}catch(e){report.probeError=e.name+': '+e.message;}
finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile(new URL('./fallback-probe.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
process.stdout.write(JSON.stringify(report.result??report.probeError,null,2)+'\n');
