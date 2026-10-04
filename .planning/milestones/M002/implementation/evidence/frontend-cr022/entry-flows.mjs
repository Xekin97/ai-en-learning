import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(process.cwd()+'/frontend/package.json');
const {chromium,webkit,expect}=require('@playwright/test');
const out=path.dirname(new URL(import.meta.url).pathname),root=process.cwd();
const design=root+'/.planning/milestones/M002/design';
const copy=JSON.parse(fs.readFileSync(design+'/copy.json'));
const fixtures=JSON.parse(fs.readFileSync(design+'/prototype/fixtures.json'));
const t=(l,k)=>copy.static[l+'.'+k]??copy.templates[l+'.'+k];
const results=[];const browsers={chromium:await chromium.launch(),webkit:await webkit.launch()};
async function run(id,engine,lang,width,fn){
 const c=await browsers[engine].newContext({viewport:{width,height:width===320?568:width===390?844:900},deviceScaleFactor:1});
 await c.addCookies([{name:'wordweave_ui_locale',value:lang==='zh'?'zh-CN':'en-US',url:'http://127.0.0.1:3300'}]);
 const p=await c.newPage(),r={id,engine,lang,width,checks:[],observations:{},runtime:[],requests:[]};
 p.on('pageerror',e=>r.runtime.push({type:'pageerror',text:e.message}));
 p.on('console',m=>{if(['warning','error'].includes(m.type()))r.runtime.push({type:m.type(),text:m.text()})});
 p.setDefaultTimeout(8000);p.on('request',q=>{if(new URL(q.url()).pathname.startsWith('/api/'))r.requests.push({method:q.method(),url:q.url()})});
 const check=(name,ok,actual)=>r.checks.push({name,pass:!!ok,...(actual===undefined?{}:{actual})});
 try{await fn(p,c,r,check);check('no runtime warning/error',r.runtime.length===0,r.runtime);}
 catch(e){r.error=e.stack;check('test completed',false,e.message);await p.screenshot({path:out+'/'+id+'-failure.png',fullPage:true}).catch(()=>{});}
 r.status=r.checks.every(x=>x.pass)?'PASS':'FAIL';results.push(r);fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');
 console.log(id,r.status,r.checks.filter(x=>!x.pass).map(x=>x.name).join('; '));await c.close();
}
async function ready(p,url='/'){await p.goto('http://127.0.0.1:3300'+url);await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');}
async function shot(p,id,suffix){await p.screenshot({path:out+'/'+id+'-'+suffix+'.png',fullPage:true});}
const origin='http://127.0.0.1:3300';
async function actor(c,value){await c.addCookies([{name:'wordweave_session',value,url:origin}]);}
async function settle(p){await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);}
async function reset(p,area){await p.request.post('http://127.0.0.1:38080/api/v1/__test/'+area+'-reset');}
async function roundTrip(p){await p.locator('header .nav a[href="/"]').click();await settle(p);await p.locator('header .nav a[href="/explore"]').click();await settle(p);await p.mouse.move(0,0);}
async function gallery(p,c,r,check){
 await p.emulateMedia({reducedMotion:'reduce'});await ready(p,'/explore');await settle(p);
 await p.locator('#gallery-language-en').click();await expect(p.locator('.gallery-card')).toHaveCount(1);await roundTrip(p);
 check('language and exact preset retained on SPA return',await p.locator('#gallery-language-en').getAttribute('aria-selected')==='true'&&await p.locator('.gallery-card').getAttribute('data-preset-id')==='preset-en');
 check('one card disables both arrows',await p.locator('.gallery-controls button:disabled').count()===2);
 check('matching preset link retained',await p.locator('.gallery-card a[href="/trial/preset-en"]').count()===1);
 await p.locator('#gallery-language-ja').click();await roundTrip(p);check('empty filter retained safely',await p.locator('#gallery-language-ja').getAttribute('aria-selected')==='true'&&await p.locator('.gallery-card').count()===0&&await p.locator('#gallery-results .empty').isVisible());
 await p.locator('#gallery-results .empty button').click();await expect(p.locator('.gallery-card')).toHaveCount(2);await p.locator('.gallery-track').focus();await p.keyboard.press('End');await expect(p.locator('.gallery-position')).toHaveText(t(r.lang,'gallery.position').replace('{current}','2').replace('{total}','2'));
 await roundTrip(p);const position=await p.locator('.gallery-position').innerText();check('full list returns to second card by ID and scroll offset',position===t(r.lang,'gallery.position').replace('{current}','2').replace('{total}','2')&&await p.locator('.gallery-track').evaluate(e=>e.scrollLeft>100));
 await p.getByRole('button',{name:t(r.lang,'language'),exact:true}).click();await settle(p);check('locale switch preserves position',await p.locator('.gallery-track').evaluate(e=>e.scrollLeft>100));
 for(let i=0;i<6;i++){await p.emulateMedia({reducedMotion:'no-preference'});await p.emulateMedia({reducedMotion:'reduce'});check('motion preference cycle '+i+' retains selected card',await p.locator('.gallery-position').innerText()===position);}
 await p.emulateMedia({reducedMotion:'no-preference'});await roundTrip(p);const g=p.locator('.preset-gallery');await expect(g).toHaveAttribute('data-rotation','auto');
 const frames=await g.evaluate(e=>new Promise(resolve=>{const out=[],start=performance.now();function tick(){out.push({ms:performance.now()-start,position:e.querySelector('.gallery-position').textContent,scroll:e.querySelector('.gallery-track').scrollLeft,overflow:document.documentElement.scrollWidth>innerWidth});if(performance.now()-start<8700)setTimeout(tick,80);else resolve(out)}tick()}));r.observations.frames=frames;
 check('return starts fresh eight-second rotation from retained second card',frames.filter(x=>x.ms<7200).every(x=>x.position===frames[0].position)&&frames.at(-1).position!==frames[0].position&&frames.at(-1).scroll<frames[0].scroll&&frames.every(x=>!x.overflow),{first:frames[0],last:frames.at(-1)});
 check('no generation while browsing',!r.requests.some(x=>x.method==='POST'&&x.url.includes('generations/stream')));await shot(p,r.id,'return');
}
try{await Promise.all(['zh','en'].flatMap(lang=>[run(`DEV22-${lang}-390`,'webkit',lang,390,gallery),run(`DEV22-${lang}-1440`,'chromium',lang,1440,gallery)]));}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
fs.writeFileSync(out+'/summary.json',JSON.stringify({cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length},null,2)+'\n');if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
