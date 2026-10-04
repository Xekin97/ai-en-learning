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
async function gallery(p,c,r,check){
 await p.emulateMedia({reducedMotion:'no-preference'});await ready(p,'/explore');await settle(p);await p.mouse.move(0,0);
 const g=p.locator('.preset-gallery');await expect(g).toHaveAttribute('data-rotation','auto');check('only previous and next controls',await g.locator('.gallery-controls button').count()===2);
 const frames=await g.evaluate(e=>new Promise(resolve=>{const samples=[],start=performance.now();function tick(){samples.push({ms:performance.now()-start,position:e.querySelector('.gallery-position').textContent,scroll:e.querySelector('.gallery-track').scrollLeft,announce:e.querySelector('.gallery-announcement')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth});if(performance.now()-start<8600)setTimeout(tick,60);else resolve(samples)}tick()}));r.observations.frames=frames;
 check('actual eight-second automatic rotation moves full card without announcing',frames.at(-1).position!==frames[0].position&&frames.at(-1).scroll!==frames[0].scroll&&frames.every(x=>!x.announce&&!x.overflow),{first:frames[0],last:frames.at(-1)});
 await g.locator('.gallery-track').focus();await p.keyboard.press('Home');await expect(g).toHaveAttribute('data-rotation','paused');await p.getByRole('button',{name:t(r.lang,'language'),exact:true}).click();await settle(p);check('keyboard reading and locale redraw preserve pause',await g.getAttribute('data-rotation')==='paused');
 await p.emulateMedia({reducedMotion:'reduce'});await g.locator('.gallery-track').focus();await p.keyboard.press('End');check('reduced motion still allows immediate manual positioning',await g.getAttribute('data-rotation')==='paused');
 await p.locator('#gallery-language-en').click();await expect(p.locator('.gallery-card')).toHaveCount(1);const before=await p.locator('.gallery-card').getAttribute('data-preset-id');
 await p.locator('header .nav a[href="/"]').click();await settle(p);await p.locator('header .nav a[href="/explore"]').click();await settle(p);
 const selection={selected:await p.locator('#gallery-language-en').getAttribute('aria-selected'),ids:await p.locator('.gallery-card').evaluateAll(es=>es.map(e=>e.dataset.presetId)),before};r.observations.reentry=selection;
 check('returning to gallery retains chosen language and position per CAR11',selection.selected==='true'&&selection.ids.length===1&&selection.ids[0]===before,selection);await shot(p,r.id,'reentry');
 
 // A retained one-item filter alone cannot prove restoring a position in the full list.
 await p.locator('#gallery-language-all').click();await p.locator('.gallery-track').focus();await p.keyboard.press('End');await expect(p.locator('.gallery-position')).toHaveText('2 / 2');
 const returnToGallery=async()=>{await p.locator('header .nav a[href="/"]').click();await settle(p);await p.locator('header .nav a[href="/explore"]').click();await settle(p);await p.mouse.move(0,0);};
 await returnToGallery();
 const geometry=()=>p.locator('.gallery-track').evaluate(e=>{const cards=[...e.querySelectorAll('.gallery-card')],nearest=cards.reduce((a,b)=>Math.abs(b.offsetLeft-cards[0].offsetLeft-e.scrollLeft)<Math.abs(a.offsetLeft-cards[0].offsetLeft-e.scrollLeft)?b:a);return {id:nearest.dataset.presetId,left:e.scrollLeft,position:document.querySelector('.gallery-position').textContent};});
 const kept=await geometry();check('all-items view restores selected ID and visible card',kept.id==='preset-en'&&kept.position==='2 / 2',kept);
 const prefs=[];for(let i=0;i<8;i++){await p.emulateMedia({reducedMotion:i%2?'reduce':'no-preference'});prefs.push(await geometry());}r.observations.preferenceChanges=prefs;
 check('runtime preference changes cannot let stale listeners reset the selected ID',prefs.every(x=>x.id==='preset-en'&&x.position==='2 / 2'));
 await p.emulateMedia({reducedMotion:'no-preference'});await returnToGallery();await expect(g).toHaveAttribute('data-rotation','auto');
 const resumed=await g.evaluate(e=>new Promise(resolve=>{const samples=[],start=performance.now();function tick(){samples.push({ms:performance.now()-start,position:e.querySelector('.gallery-position').textContent,scroll:e.querySelector('.gallery-track').scrollLeft,announce:e.querySelector('.gallery-announcement').textContent,overflow:document.documentElement.scrollWidth>innerWidth});if(performance.now()-start<8700)setTimeout(tick,60);else resolve(samples)}tick()}));r.observations.resumed=resumed;
 check('return keeps position then starts a fresh eight-second automatic cycle',resumed[0].position==='2 / 2'&&resumed.filter(x=>x.ms<7000).every(x=>x.position==='2 / 2')&&resumed.at(-1).position==='1 / 2'&&resumed.at(-1).scroll<resumed[0].scroll&&resumed.every(x=>!x.announce&&!x.overflow),{first:resumed[0],last:resumed.at(-1)});
 await p.locator('#gallery-language-ja').click();await returnToGallery();check('empty matching set persists on return and has no carousel instance',await p.locator('#gallery-language-ja').getAttribute('aria-selected')==='true'&&await p.locator('.preset-gallery').count()===0&&await p.locator('#gallery-results .empty').isVisible());
 await p.locator('#gallery-results .empty button').click();await expect(p.locator('.gallery-card')).toHaveCount(2);check('empty filter reset stays usable',await p.locator('#gallery-language-all').getAttribute('aria-selected')==='true');
 await p.locator('#gallery-language-en').click();check('filtered try link maps to the correct preset',await p.locator('.gallery-card a[href="/trial/preset-en"]').count()===1);await shot(p,r.id,'final');
check('browsing never generates',!r.requests.some(x=>x.method==='POST'&&/generations\/stream/.test(x.url)));
}
try{await Promise.all(['zh','en'].flatMap(lang=>[run(`A21-${lang}-390`,'webkit',lang,390,gallery),run(`A21-${lang}-1440`,'chromium',lang,1440,gallery)]));}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
fs.writeFileSync(out+'/summary.json',JSON.stringify({cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length},null,2)+'\n');if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
