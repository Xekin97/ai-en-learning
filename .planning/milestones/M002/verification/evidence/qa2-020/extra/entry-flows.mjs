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
 check('browsing never generates',!r.requests.some(x=>x.method==='POST'&&/generations\/stream/.test(x.url)));
}
async function welcome(p,c,r,check){
 const variant=r.id.includes('new')?'no_learning':r.id.includes('today')?'same_day':'returning',reduced=r.id.includes('new');const name='<b>Reader</b>';
 await p.route('**/api/v1/auth/login',async route=>{const response=await route.fetch(),json=await response.json();json.data.ui_locale=r.lang==='zh'?'zh-CN':'en-US';json.data.welcome={kind:variant,display_name:name,days_since_learning:variant==='no_learning'?null:variant==='same_day'?0:5,previous_learning_at:variant==='no_learning'?null:'2026-09-15T05:00:00Z'};await route.fulfill({response,json});});
 await p.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await ready(p,'/login?redirect=/account');await p.getByLabel(t(r.lang,'i.username'),{exact:true}).fill('learner_e2e');await p.getByLabel(t(r.lang,'i.password'),{exact:true}).fill('CorrectPass123!');await p.locator('.auth-form button[type=submit]').click();const toast=p.locator('#toast');await expect(toast).toBeVisible();
 const start=await toast.evaluate(e=>{window.oldWelcome=e.getAnimations()[0];return {time:performance.now(),text:e.textContent,children:[...e.children].map(x=>x.tagName),animations:e.getAnimations().length}});r.observations.start=start;
 const expected=variant==='no_learning'?t(r.lang,'g.welcome.new').replace('{name}',name):variant==='same_day'?t(r.lang,'welcome.today'):t(r.lang,'welcome').replace('{name}',name).replace('{elapsed}',t(r.lang,'welcome.elapsed').replace('{days}','5'));
 check('correct welcome variant with literal name and no fabricated days',start.text===expected&&await toast.locator('b').count()===0&&(variant==='returning'||await toast.locator('.toast-days').count()===0),{actual:start.text,expected});
 if(reduced){check('initial reduced motion renders immediately without animation',start.animations===0);await p.waitForTimeout(9000);check('no-learning welcome keeps full ten-second dwell',await toast.isVisible());await expect(toast).toBeHidden({timeout:2000});}
 else if(variant==='same_day'){
  await p.keyboard.press('Escape');await p.getByLabel(t(r.lang,'nickname'),{exact:true}).fill('Updated reader');await p.getByRole('button',{name:t(r.lang,'save'),exact:true}).click();await expect(toast).toHaveText(t(r.lang,'saved'));const replacement=await toast.evaluate(e=>({old:window.oldWelcome?.playState,duration:e.getAnimations()[0]?.effect.getTiming().duration,same:e.getAnimations()[0]===window.oldWelcome}));check('ordinary feedback cancels old welcome timeline and uses five-second dwell',replacement.old==='idle'&&replacement.duration===5600&&!replacement.same,replacement);await expect(toast).toBeHidden({timeout:6500});
 }else{
  await p.waitForTimeout(500);await p.emulateMedia({reducedMotion:'reduce'});check('runtime reduced-motion stops active opacity animation and keeps toast readable',await toast.evaluate(e=>e.getAnimations().length===0&&Number(getComputedStyle(e).opacity)===1));await expect(toast).toBeHidden({timeout:11000});
 }
 r.observations.end=await p.evaluate(()=>performance.now());
}
async function profile(p,c,r,check){
 await actor(c,'learner');await p.emulateMedia({reducedMotion:'reduce'});await ready(p,'/account');await settle(p);const nickname=p.getByLabel(t(r.lang,'nickname'),{exact:true});await nickname.fill('Draft nickname');await p.getByLabel(t(r.lang,'gender'),{exact:true}).selectOption('female');await p.getByRole('button',{name:t(r.lang,'language'),exact:true}).click();await settle(p);const lang=r.lang==='zh'?'en':'zh';check('locale switch preserves unsaved profile values',await p.getByLabel(t(lang,'nickname'),{exact:true}).inputValue()==='Draft nickname'&&await p.getByLabel(t(lang,'gender'),{exact:true}).inputValue()==='female');
 await p.getByLabel(t(lang,'nickname'),{exact:true}).fill('');await p.getByRole('button',{name:t(lang,'save'),exact:true}).click();await expect(p.locator('#toast')).toHaveText(t(lang,'saved'));check('empty nickname returns to username in shared identity',await p.locator('.account-identity h2').innerText()==='learner_e2e');
 await p.getByRole('button',{name:t(lang,'password'),exact:true}).click();const dialog=p.locator('#change-password');await expect(dialog).toBeVisible();await dialog.locator('input').first().fill('temporary-password');await p.keyboard.press('Escape');await p.getByRole('button',{name:t(lang,'password'),exact:true}).click();check('cancelled password input clears before reopen',await dialog.locator('input').evaluateAll(es=>es.every(e=>e.value==='')));await p.keyboard.press('Escape');
}
try{
 await Promise.all([
  run('A20-zh-390','webkit','zh',390,gallery),run('A20-en-1440','chromium','en',1440,gallery),
  ...['zh','en'].flatMap(lang=>['new','today','returning'].map(kind=>run(`W20-${lang}-${kind}`,lang==='zh'?'webkit':'chromium',lang,lang==='zh'?320:1440,welcome))),
  run('P20-zh-390','webkit','zh',390,profile),run('P20-en-1440','chromium','en',1440,profile)
 ]);
}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
const summary={cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length};fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2)+'\n');
