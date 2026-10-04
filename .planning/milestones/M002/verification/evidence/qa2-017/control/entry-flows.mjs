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
 p.on('request',q=>{if(new URL(q.url()).pathname.startsWith('/api/'))r.requests.push({method:q.method(),url:q.url()})});
 const check=(name,ok,actual)=>r.checks.push({name,pass:!!ok,...(actual===undefined?{}:{actual})});
 try{await fn(p,c,r,check);check('no runtime warning/error',r.runtime.length===0,r.runtime);}
 catch(e){r.error=e.stack;check('test completed',false,e.message);await p.screenshot({path:out+'/'+id+'-failure.png',fullPage:true}).catch(()=>{});}
 r.status=r.checks.every(x=>x.pass)?'PASS':'FAIL';results.push(r);fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2)+'\n');
 console.log(id,r.status,r.checks.filter(x=>!x.pass).map(x=>x.name).join('; '));await c.close();
}
async function ready(p,url='/'){await p.goto('http://127.0.0.1:3300'+url);await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');}
async function shot(p,id,suffix){await p.screenshot({path:out+'/'+id+'-'+suffix+'.png',fullPage:true});}
function snapshotHome(){
 const all=s=>[...document.querySelectorAll(s)];
 const b=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
 return{hero:document.querySelector('.home-hero').innerText.replace(/\s+/g,' ').trim(),path:document.querySelector('.home-path').innerText.replace(/\s+/g,' ').trim(),
  cards:all('.home-paper').map(e=>({title:e.querySelector('h2').textContent,paragraphs:e.querySelectorAll('p.home-story').length,text:e.querySelector('.home-story').textContent,words:[...e.querySelectorAll('.home-word')].map(x=>x.textContent),marks:[...e.querySelectorAll('mark')].map(x=>x.textContent),meaning:e.querySelector('.home-word-meaning').innerText.replace(/\s+/g,' ').trim(),box:b(e),transform:getComputedStyle(e).transform,font:getComputedStyle(e.querySelector('.home-story')).fontSize,overflow:e.querySelector('.home-story').scrollHeight>e.querySelector('.home-story').clientHeight,tabindex:e.tabIndex})),
  nav:all('header .nav a').map(e=>({text:e.textContent.trim(),current:e.getAttribute('aria-current')})),overflow:document.documentElement.scrollWidth>innerWidth,
  intro:b(document.querySelector('.home-intro')),example:b(document.querySelector('.home-example')),svg:document.querySelectorAll('.home-hero svg,.home-path svg').length};
}
async function home(p,c,r,check){
 await p.emulateMedia({reducedMotion:'reduce'});await ready(p);const a=await p.evaluate(snapshotHome);r.observations.production=a;
 const q=await c.newPage();await q.emulateMedia({reducedMotion:'reduce'});await q.goto('http://127.0.0.1:3332/prototype/index.html?page=home&lang='+r.lang);await q.locator('.home-paper').nth(1).waitFor();const b=await q.evaluate(snapshotHome);r.observations.prototype=b;
 check('approved hero and path exact visible copy',a.hero===b.hero&&a.path===b.path);
 for(let i=0;i<2;i++){const s=fixtures.hero.stories[i],item=a.cards[i];
 check('story '+i+' complete single paragraph with exact title, 6 chips and marked words',item.title===s.title&&item.paragraphs===1&&item.text===s.parts.map(x=>typeof x==='string'?x:x.word).join('')&&JSON.stringify(item.words)===JSON.stringify(s.words)&&item.marks.length===6,item);
 check('story '+i+' approved meaning, font and rotated layout',item.meaning===b.cards[i].meaning&&item.font===b.cards[i].font&&item.transform===b.cards[i].transform&&!item.overflow&&item.tabindex===0);
 }
 check('navigation ordered approved bilingual labels',JSON.stringify(a.nav.map(x=>x.text))===JSON.stringify(['home','explore','create','range','library'].map(k=>t(r.lang,'nav.'+k))));
 check('home current link only',a.nav.filter(x=>x.current==='page').length===1&&a.nav[0].current==='page');
 check('responsive columns and no horizontal overflow',!a.overflow&&(r.width>1100?a.example.x>a.intro.x+a.intro.width-1:a.example.y>a.intro.y));
 const cards=a.cards.map(x=>x.box);check('two cards overlap',Math.min(cards[0].y+cards[0].height,cards[1].y+cards[1].height)>Math.max(cards[0].y,cards[1].y));
 check('approved SVG count',a.svg===b.svg,{production:a.svg,prototype:b.svg});
 check('home has no generation request',!r.requests.some(x=>x.method==='POST'&&/generat/.test(x.url)));
 if(r.width===320||r.width===1440){await shot(p,r.id,'production');await shot(q,r.id,'prototype');}
 await q.close();
}
async function menuObservations(p){
 const d=p.locator('.account-dropdown'),s=d.locator('summary'),links=d.locator('nav a');
 const opened=()=>d.evaluate(e=>e.open),focus=()=>p.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.trim().slice(0,120),isSummary:document.activeElement?.matches('.account-dropdown summary'),isHeading:document.activeElement?.matches('h1,h2')}));
 async function ensureOpen(){if(!await opened())await s.click();}
 const o={};await s.focus();await p.keyboard.press('Enter');o.enterOpens=await opened();
 if(await opened())await p.keyboard.press('Space');o.spaceCloses=!await opened();await p.keyboard.press('Space');o.spaceOpens=await opened();
 o.labels=await links.allTextContents();await p.keyboard.press('Tab');o.firstLinkFocused=await links.first().evaluate(e=>e===document.activeElement);
 await p.keyboard.press('Escape');o.escapeCloses=!await opened();o.escapeFocus=await focus();
 await ensureOpen();const outside={x:4,y:p.viewportSize().height-4};o.outsideTarget=await p.evaluate(pt=>{const e=document.elementFromPoint(pt.x,pt.y);return{tag:e?.tagName,inDropdown:!!e?.closest('.account-dropdown')}},outside);if(o.outsideTarget.inDropdown)throw new Error('Outside target overlaps dropdown');await p.mouse.click(outside.x,outside.y);o.outsideCloses=!await opened();await p.screenshot({path:out+'/outside-'+new URL(p.url()).port+'-'+p.viewportSize().width+'-'+(await p.locator('.home-intro h1').innerText()).slice(0,2)+'.png',fullPage:true});
 await ensureOpen();await links.last().focus();await p.keyboard.press('Tab');o.tabExitCloses=!await opened();o.tabExitFocus=await focus();
 await ensureOpen();await links.first().click();await p.waitForTimeout(250);o.selectionCloses=!await opened();o.selectionFocus=await focus();o.current=await links.first().getAttribute('aria-current');return o;
}
async function header(p,c,r,check){
 await c.addCookies([{name:'wordweave_session',value:'learner',url:'http://127.0.0.1:3300'}]);await p.emulateMedia({reducedMotion:'reduce'});await ready(p);
 const a=await menuObservations(p);r.observations.production=a;await shot(p,r.id,'production-after-selection');
 const q=await c.newPage();await q.emulateMedia({reducedMotion:'reduce'});await q.goto('http://127.0.0.1:3332/prototype/index.html?page=home&lang='+r.lang);await q.locator('.account-dropdown').waitFor();
 const b=await menuObservations(q);r.observations.prototype=b;await shot(q,r.id,'prototype-after-selection');
 check('approved four account labels',JSON.stringify(a.labels.map(x=>x.trim()))===JSON.stringify(['profile','growth','bag','shop'].map(k=>t(r.lang,k))));
 for(const [name,value]of Object.entries(a))if(['enterOpens','spaceCloses','spaceOpens','firstLinkFocused','escapeCloses','outsideCloses','tabExitCloses','selectionCloses'].includes(name))check(name,value,{production:value,prototype:b[name]});
 check('Escape returns focus to avatar',a.escapeFocus.isSummary,{production:a.escapeFocus,prototype:b.escapeFocus});
 check('selecting section focuses page heading',a.selectionFocus.isHeading,{production:a.selectionFocus,prototype:b.selectionFocus});
 check('selected section has aria-current',a.current==='page',a.current);
 check('header no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await q.close();
}
async function motion(p,c,r,check){
 await p.emulateMedia({reducedMotion:'no-preference'});await ready(p);const stack=p.locator('.home-card-stack');await stack.scrollIntoViewIfNeeded();await p.mouse.move(0,0);
 await expect(stack).toHaveAttribute('data-motion','running');
 const frames=await stack.evaluate(e=>new Promise(resolve=>{const out=[],start=performance.now();function tick(){out.push({time:performance.now()-start,top:e.dataset.top,switching:e.dataset.switching,motion:e.dataset.motion,transforms:[...e.children].map(x=>getComputedStyle(x).transform),translations:[...e.children].map(x=>getComputedStyle(x).translate),positions:[...e.children].map(x=>x.getBoundingClientRect().y)});if(performance.now()-start<9200)setTimeout(tick,80);else resolve(out)}tick()}));r.observations.frames=frames;
 check('real idle cycle switches top card after 8 seconds',frames[0].top==='1'&&frames.at(-1).top==='0'&&frames.some(x=>x.switching==='true'),{initial:frames[0],last:frames.at(-1)});
 const floatFrames=frames.filter(x=>x.time<7500);const ys=floatFrames.map(x=>x.positions[0]);check('floating translation changes with amplitude at most 6px',new Set(floatFrames.map(x=>x.translations[0])).size>4&&Math.max(...ys)-Math.min(...ys)>4&&Math.max(...ys)-Math.min(...ys)<=6.1,{amplitude:Math.max(...ys)-Math.min(...ys)});
 await p.locator('.home-paper-front').focus();await expect(stack).toHaveAttribute('data-top','1');await expect(stack).toHaveAttribute('data-motion','paused');check('keyboard reading stops auto and moves requested card in front',true);
 await p.emulateMedia({reducedMotion:'reduce'});await expect(stack).toHaveAttribute('data-motion','reduced');
 await p.locator('.home-paper-back').focus();await expect(stack).toHaveAttribute('data-top','0');check('runtime reduced motion and immediate keyboard switch',await stack.getAttribute('data-switching')!=='true');
 await p.getByRole('button',{name:t(r.lang,'language'),exact:true}).click();await p.emulateMedia({reducedMotion:'no-preference'});await expect(stack).toHaveAttribute('data-motion','paused');check('language change preserves reading pause',true);
 await p.locator('header .nav a[href="/explore"]').click();await p.waitForURL('**/explore');await p.locator('header .nav a[href="/"]').click();await p.mouse.move(0,0);await stack.scrollIntoViewIfNeeded();await expect(stack).toHaveAttribute('data-motion','running');check('reentry creates fresh automatic visit',true);await shot(p,r.id,'reentry');
 check('motion never calls generation',!r.requests.some(x=>x.method==='POST'&&/generat/.test(x.url)));
}
async function toast(p,c,r,check){
 const loc=r.lang==='zh'?'zh-CN':'en-US';
 await p.route('**/api/v1/auth/login',async route=>{const response=await route.fetch();const json=await response.json();json.data.ui_locale=loc;await route.fulfill({response,json});});
 const notices=[1,2].map(i=>({id:'qa17-notice-'+i,title:r.lang==='zh'?'消息示例 '+i:'Sample update '+i,body_html:'<p>'+ (r.lang==='zh'?'阅读短文，复习词语。':'Read a story and review your words.')+'</p>',content_locale:loc,remind:true,published_at:`2026-09-${21-i}T01:00:00Z`,revision:'qa17-'+i}));
 await p.route('**/api/v1/notices**',async route=>{const u=new URL(route.request().url());const notice=notices.find(x=>u.pathname.endsWith('/'+x.id));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:notice?{notice}:{items:notices},meta:{request_id:'qa17-notice',...(notice?{}:{next_cursor:null,has_more:false})}})});});
 await p.emulateMedia({reducedMotion:'no-preference'});await ready(p,'/login');
 await p.evaluate(()=>{window.qa17frames=[];window.qa17sampling=true;const step=()=>{const e=document.getElementById('toast');if(e){const a=e.getAnimations()[0];window.qa17frames.push({time:performance.now(),visible:e.matches(':popover-open'),opacity:getComputedStyle(e).opacity,animationTime:a?.currentTime,startTime:a?.startTime,parent:e.parentElement?.tagName})}if(window.qa17sampling)requestAnimationFrame(step)};requestAnimationFrame(step)});
 await p.getByLabel(t(r.lang,'i.username'),{exact:true}).fill('learner_e2e');await p.getByLabel(t(r.lang,'i.password'),{exact:true}).fill('CorrectPass123!');await p.locator('.auth-form button[type=submit]').click();
 const toast=p.locator('#toast'),dialog=p.locator('#platform-notice');await expect(dialog).toBeVisible();await expect(toast).toBeVisible();await expect(toast.locator('.toast-days')).toHaveText(t(r.lang,'welcome.elapsed').replace('{days}','5'));
 await p.waitForFunction(()=>document.getElementById('toast')?.getAnimations()[0]?.startTime!=null);
 await toast.evaluate(e=>{window.qa17node=e;window.qa17animation=e.getAnimations()[0]});
 const snap=()=>p.evaluate(()=>{const e=document.getElementById('toast'),d=document.getElementById('platform-notice'),s=getComputedStyle(e),b=e.getBoundingClientRect(),db=d?.getBoundingClientRect(),day=e.querySelector('.toast-days'),a=e.getAnimations()[0];return{sameNode:e===window.qa17node,sameAnimation:a===window.qa17animation,time:a?.currentTime,duration:a?.effect?.getTiming().duration,start:a?.startTime,visible:e.matches(':popover-open'),parent:e.parentElement?.tagName,status:e.getAttribute('role'),live:e.getAttribute('aria-live'),atomic:e.getAttribute('aria-atomic'),pointer:s.pointerEvents,tabIndex:e.tabIndex,font:day&&getComputedStyle(day).fontSize,weight:day&&getComputedStyle(day).fontWeight,text:e.textContent,activeToast:document.activeElement===e,toastBox:{top:b.top,bottom:b.bottom},dialogBox:db&&{top:db.top,bottom:db.bottom},dialogOpen:d?.open,reserved:d?.classList.contains('with-toast-space')}});
 const observations=[];observations.push({step:'login',...await snap()});
 check('single polite atomic noninteractive toast within modal accessible subtree',await toast.count()===1&&observations[0].parent==='DIALOG'&&observations[0].status==='status'&&observations[0].live==='polite'&&observations[0].atomic==='true'&&observations[0].pointer==='none'&&observations[0].tabIndex===-1&&!observations[0].activeToast);
 check('emphasized 5 days and 10 second dwell plus fades',observations[0].font==='24px'&&observations[0].weight==='700'&&observations[0].duration===10600,observations[0]);
 await expect(dialog.locator('h2')).toHaveText(notices[0].title);await dialog.getByRole('button',{name:t(r.lang,'next'),exact:true}).click();await expect(dialog.locator('h2')).toHaveText(notices[1].title);observations.push({step:'next-message',...await snap()});
 check('reminder opens body and supports multiple messages',await dialog.locator('.dialog-body').innerText().then(x=>x.includes(r.lang==='zh'?'阅读短文':'Read a story')));
 await p.waitForTimeout(350);await shot(p,r.id,'welcome-over-message');
 await p.keyboard.press('Escape');await expect(dialog).toBeHidden();observations.push({step:'escape',...await snap()});
 await p.locator('header a[href="/notices"]').click();await p.waitForURL('**/notices');await p.locator('.notice-entry').first().click();await expect(dialog).toBeVisible();observations.push({step:'reopen-message',...await snap()});
 await p.setViewportSize({width:r.width,height:r.width===320?600:880});await p.waitForTimeout(100);observations.push({step:'resize',...await snap()});
 check('same toast node, animation and deadline across pagination, Escape, route, reopen, resize',observations.every(x=>x.sameNode&&x.sameAnimation&&x.start===observations[0].start)&&observations.every((x,i)=>i===0||x.time>=observations[i-1].time),observations);
 check('Escape continues toast in body',observations.find(x=>x.step==='escape').parent==='BODY'&&observations.find(x=>x.step==='escape').visible);
 const last=observations.at(-1);check('dialog and toast stay inside viewport with readable separation',last.toastBox.top>=0&&last.toastBox.bottom<=(r.width===320?600:880)+1&&last.dialogBox.bottom+11<=last.toastBox.top,last);
 await expect(toast).toBeHidden({timeout:12500});await p.evaluate(()=>window.qa17sampling=false);r.observations.lifecycle=observations;r.observations.frames=await p.evaluate(()=>window.qa17frames);
 const frames=r.observations.frames.filter(x=>x.visible&&x.animationTime!=null);check('actual fade-in and fade-out rendered',frames.some(x=>x.animationTime<300&&Number(x.opacity)>0&&Number(x.opacity)<1)&&frames.some(x=>x.animationTime>10300&&Number(x.opacity)>0&&Number(x.opacity)<1));
 check('full middle dwell remains visible',frames.filter(x=>x.animationTime>=320&&x.animationTime<=10280).every(x=>Number(x.opacity)>.99));
 check('short-screen reservation released at end',!await dialog.evaluate(e=>e.classList.contains('with-toast-space')));
 await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');check('refresh does not trigger welcome or automatic reminder',await p.locator('dialog[open]').count()===0&&!await toast.isVisible());
}
try{
 await Promise.all(['zh','en'].map(lang=>run(`N17-${lang}-320`,'webkit',lang,320,header)));
 await Promise.all([run('M17-en-1440','chromium','en',1440,motion),run('M17-zh-390','webkit','zh',390,motion)]);
 await Promise.all(['zh','en'].map(lang=>run(`W17-${lang}-320`,'webkit',lang,320,toast)));
}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
fs.writeFileSync(out+'/summary.json',JSON.stringify({cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,findings:results.flatMap(r=>r.checks.filter(x=>!x.pass).map(x=>({id:r.id,...x})))},null,2)+'\n');
