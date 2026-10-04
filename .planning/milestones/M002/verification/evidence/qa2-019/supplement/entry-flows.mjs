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

async function diagnostics(p,c,r,check){
 await actor(c,'learner');await ready(p,'/account');await settle(p);
 const select=p.locator('select');const measure=()=>select.evaluate(e=>({height:e.getBoundingClientRect().height,min:getComputedStyle(e).minHeight,cssHeight:getComputedStyle(e).height,appearance:getComputedStyle(e).appearance}));
 r.observations.select={original:await measure()};const h=await p.addStyleTag({content:'select {height:46px}'});r.observations.select.explicitHeight=await measure();await h.evaluate(e=>e.remove());
 const a=await p.addStyleTag({content:'select {appearance:none}'});r.observations.select.withoutNativeAppearance=await measure();await a.evaluate(e=>e.remove());
 await p.setViewportSize({width:768,height:900});await p.goto(origin+'/account/exchange');await settle(p);await shot(p,r.id,'shop');r.observations.shop=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(x=>x.right>innerWidth+1||x.x<0)}));
 const q=await c.newPage();await q.goto('http://127.0.0.1:3332/prototype/index.html?page=profile&lang='+r.lang);await q.locator('select').first().waitFor();r.observations.prototypeSelect=await q.locator('main select').first().evaluate(e=>({height:e.getBoundingClientRect().height,min:getComputedStyle(e).minHeight,appearance:getComputedStyle(e).appearance}));
 await q.goto('http://127.0.0.1:3332/prototype/index.html?page=growth&lang='+r.lang);await q.locator('.achievement-group').first().waitFor();const button=q.locator('.achievement-group button:not([disabled])').first();await button.click();r.observations.prototypeClaim=await q.evaluate(()=>({summary:document.activeElement?.matches('.achievement-group summary'),tag:document.activeElement?.tagName}));check('approved prototype achievement focus confirms expected behavior',r.observations.prototypeClaim.summary);await q.close();
}
async function levelFocus(p,c,r,check){
 await actor(c,'learner');await reset(p,'growth');let claimed=false;
 await p.route('**/api/v1/me/growth/level-rewards?*',async route=>{const response=await route.fetch();const json=await response.json();const item=json.data.items[0];item.state=claimed?'claimed':'claimable';item.block_reason=null;item.claimed_at=claimed?'2026-09-20T05:00:00Z':null;item.settlement_id=claimed?'receipt-level':null;await route.fulfill({response,json});});
 await p.route('**/api/v1/me/growth/level-rewards/lv2/claim',async route=>{claimed=true;const response=await p.request.post(origin+'/api/v1/me/growth/achievements/tier-1/claim');const json=await response.json();json.data.receipt.id='receipt-level';await route.fulfill({status:200,json});});
 await ready(p);await p.locator('.account-dropdown summary').click();await p.locator('.account-dropdown a[href="/account/growth"]').click();await settle(p);
 const row=p.locator('.level-reward').first();await row.getByRole('button',{name:t(r.lang,'claimlevel'),exact:true}).click();await expect(row.getByRole('button')).toHaveText(t(r.lang,'claimed'));
 const o=await p.evaluate(()=>({focused:document.activeElement?.matches('.level-reward h3'),tag:document.activeElement?.tagName,text:document.activeElement?.textContent.slice(0,80)}));r.observations.level=o;check('level reward returns focus to corresponding level heading',o.focused,o);await shot(p,r.id,'level');
}
try{
 for(const lang of ['zh','en']){await run(`D19-${lang}-320`,'webkit',lang,320,diagnostics);for(const [engine,width]of [['webkit',320],['chromium',1440]])await run(`R19-${lang}-${width}`,engine,lang,width,levelFocus);}
}finally{await Promise.all(Object.values(browsers).map(x=>x.close()));}
fs.writeFileSync(out+'/summary.json',JSON.stringify({cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length},null,2)+'\n');
