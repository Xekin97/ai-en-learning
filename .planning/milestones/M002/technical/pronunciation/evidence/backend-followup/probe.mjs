// Isolated capability research. Real external requests, no app/profile changes or mocks.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
const require=createRequire(process.cwd()+'/frontend/package.json');
const {chromium}=require('@playwright/test');
const out=new URL('./probe.json',import.meta.url);
const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','referrer-policy':'no-referrer','cache-control':'no-store'});res.end('<!doctype html><html lang="en"><title>Pronunciation capability check</title><button id="recording">Test recording</button><button id="speech">Test browser speech</button></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={at:new Date().toISOString(),environment:'Installed Google Chrome, headed, new isolated context on current Mac',mock:false,tlsBypass:false,usesPersonalBrowserProfile:false,humanListening:false,applicationVerification:false,requests:[]};
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:false});
 report.browserVersion=browser.version();
 const page=await browser.newPage();
 page.on('request',r=>report.requests.push({url:r.url(),method:r.method(),type:r.resourceType()}));
 page.on('requestfailed',r=>{const item=report.requests.findLast(x=>x.url===r.url());if(item)item.failure=r.failure()?.errorText;});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 report.dictionary=await page.evaluate(async()=>{
  const started=performance.now(),control=new AbortController(),timer=setTimeout(()=>control.abort(),2500);
  try {
   const r=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/hello',{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:control.signal});
   const reader=r.body.getReader(),chunks=[];let bytes=0;
   for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>262144){await reader.cancel();throw Error('size_limit');}chunks.push(value);}
   const b=JSON.parse(await new Blob(chunks).text());
   return {status:r.status,responseType:r.type,bytes,milliseconds:Math.round(performance.now()-started),phonetics:Array.isArray(b)?b.flatMap(e=>e.phonetics??[]):[]};
  } catch(e){return {error:e.name+': '+e.message,milliseconds:Math.round(performance.now()-started)};}
  finally{clearTimeout(timer);}
 });
 await page.evaluate(()=>{
  document.querySelector('#recording').onclick=()=>{
   const started=performance.now(),controller=new AbortController(),events=[];let audio,url,finished=false,startTimer,endTimer;
   const finish=outcome=>{
    if(finished)return;finished=true;clearTimeout(startTimer);clearTimeout(endTimer);controller.abort();
    window.recordingResult={outcome,events,milliseconds:Math.round(performance.now()-started),duration:Number.isFinite(audio?.duration)?audio.duration:null};
    if(audio){audio.pause();audio.removeAttribute('src');audio.load();}if(url)URL.revokeObjectURL(url);
   };
   startTimer=setTimeout(()=>finish('download_or_start_deadline'),2500);
   (async()=>{
    const r=await fetch('https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3',{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
    events.push({event:'response',status:r.status,responseType:r.type,type:r.headers.get('content-type'),ms:Math.round(performance.now()-started)});
    if(!r.ok)throw Error('http_'+r.status);
    const reader=r.body.getReader(),chunks=[];let bytes=0;
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576){await reader.cancel();throw Error('size_limit');}chunks.push(value);}
    if(finished)return;
    events.push({event:'downloaded',bytes,ms:Math.round(performance.now()-started)});
    url=URL.createObjectURL(new Blob(chunks,{type:r.headers.get('content-type')??'audio/mpeg'}));audio=new Audio(url);
    for(const event of ['loadedmetadata','playing','ended','error'])audio.addEventListener(event,()=>{
     if(finished)return;events.push({event,ms:Math.round(performance.now()-started)});
     if(event==='playing'){clearTimeout(startTimer);endTimer=setTimeout(()=>finish('end_deadline'),12000);}
     if(event==='ended'||event==='error')finish(event);
    });
    audio.play().catch(e=>finish(e.name+': '+e.message));
   })().catch(e=>finish(e.name+': '+e.message));
  };
  document.querySelector('#speech').onclick=()=>{
   const started=performance.now();
   if(!('speechSynthesis' in window)){window.speechResult={outcome:'unsupported'};return;}
   const voices=speechSynthesis.getVoices(),voice=voices.find(v=>/^en(?:-|$)/i.test(v.lang));
   if(!voice){window.speechResult={outcome:'no_english_voice',totalVoices:voices.length};return;}
   const u=new SpeechSynthesisUtterance('hello');u.voice=voice;u.lang=voice.lang;const events=[];let done=false,endTimer;
   const finish=outcome=>{if(done)return;done=true;clearTimeout(startTimer);clearTimeout(endTimer);window.speechResult={outcome,events,milliseconds:Math.round(performance.now()-started),voice:{name:voice.name,lang:voice.lang,localService:voice.localService}};speechSynthesis.cancel();};
   const startTimer=setTimeout(()=>finish('start_deadline'),2000);
   u.onstart=()=>{if(done)return;clearTimeout(startTimer);events.push({event:'start',ms:Math.round(performance.now()-started)});endTimer=setTimeout(()=>finish('end_deadline'),12000);};
   u.onend=()=>finish('ended');u.onerror=e=>finish(e.error);
   // Synchronous invocation in a real click; no awaited fetch/import here.
   speechSynthesis.speak(u);
  };
 });
 await page.click('#recording');await page.waitForFunction(()=>window.recordingResult,undefined,{timeout:16000});report.recording=await page.evaluate(()=>window.recordingResult);
 report.voices=await page.evaluate(()=>new Promise(resolve=>{
  if(!('speechSynthesis' in window)){resolve({supported:false,voices:[]});return;}
  const started=performance.now();let timer;const done=()=>{speechSynthesis.removeEventListener('voiceschanged',check);clearTimeout(timer);resolve({supported:true,milliseconds:Math.round(performance.now()-started),voices:speechSynthesis.getVoices().map(v=>({name:v.name,lang:v.lang,localService:v.localService}))});};
  const check=()=>{if(speechSynthesis.getVoices().some(v=>/^en(?:-|$)/i.test(v.lang)))done();};
  speechSynthesis.addEventListener('voiceschanged',check);timer=setTimeout(done,1500);check();
 }));
 await page.click('#speech');await page.waitForFunction(()=>window.speechResult,undefined,{timeout:16000});report.speech=await page.evaluate(()=>window.speechResult);
} catch(e){report.probeError=e.name+': '+e.message;}
finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile(out,JSON.stringify(report,null,2)+'\n');}
process.stdout.write(JSON.stringify({dictionary:report.dictionary,recording:report.recording,speech:report.speech,voices:report.voices?.voices.length,probeError:report.probeError},null,2)+'\n');
