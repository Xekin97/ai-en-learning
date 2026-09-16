import{readFileSync}from'node:fs';import{join}from'node:path';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,sql,quote,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'range-fixtures.json'))),out=recorder('range-flows'),path='/api/v1/me/review-range/preview',createPath='/api/v1/me/review-sessions';
const preview='**/api/v1/me/review-range/preview?**';
const range={mode:'range',start_date:'2026-07-15',end_date:'2026-07-15',timezone:'Asia/Shanghai'};
const problem={status:500,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/internal_error',title:'Request failed',status:500,code:'internal_error',detail:'QA controlled failure',request_id:'req_qa076'})};
async function setup(b,who='old',locale='en-US',width=1440){const c=await b.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',locale});c.setDefaultTimeout(7000);const token=await login(c,f.users[who].username,locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();return{c,p,token};}
async function open(p){await p.goto(origin+'/review');await ready(p);await expect(p.locator('.range-editor')).toBeVisible();}
async function dates(p,start,end){await p.locator('#review-start').fill(start);await p.locator('#review-end').fill(end);}
const state=(p,s)=>expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview',s);
async function metrics(p){return p.evaluate(()=>{const rect=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return{form:rect('.range-editor form'),count:rect('.range-count'),start:rect('#review-start'),end:rect('#review-end'),font:getComputedStyle(document.querySelector('.count-number')).fontSize,gap:getComputedStyle(document.querySelector('.range-editor')).gap,overflow:document.documentElement.scrollWidth>innerWidth};});}
const b=await chromium.launch();
try{
 for(const who of['empty','old','paused']){
  const{c,p,token}=await setup(b,who);await open(p);await state(p,'empty');
  out.record(who+' default has both date controls',await p.locator('input[type=date]').count(),2);
  const r=await api(c,'GET',path+'?start_date=2026-07-15&end_date=2026-07-15&timezone=Asia%2FShanghai',token);
  out.record(who+' exact real counts',r.body.data,who==='old'?{batch_count:3,entry_count:6,empty:false}:{batch_count:0,entry_count:0,empty:true});
  await dates(p,'2026-07-15','2026-07-15');await state(p,who==='old'?'ready':'empty');
  out.record(who+' dates remain chosen',await p.locator('input[type=date]').evaluateAll(ns=>ns.map(n=>n.value)),['2026-07-15','2026-07-15']);
  await c.close();
 }
 {
  const{c,p,token}=await setup(b);await open(p);await dates(p,'2026-07-15','2026-07-15');await state(p,'ready');
  const start=await p.locator('#review-start').elementHandle(),end=await p.locator('#review-end').elementHandle();
  let gets=0,posts=0;p.on('request',r=>{if(r.url().includes(path))gets++;if(r.method()==='POST'&&new URL(r.url()).pathname===createPath)posts++;});
  await p.locator('#review-start').focus();
  for(const width of[1081,1080,901,900,1081])await p.setViewportSize({width,height:1000});
  out.record('resize no queries or sessions',{gets,posts},{gets:0,posts:0});
  out.record('resize retains nodes focus',await start.evaluate(n=>n===document.querySelector('#review-start')&&n===document.activeElement),true);
  await p.locator('.locale-switch select').selectOption('zh-CN');await expect(p.locator('.locale-switch select')).toHaveValue('zh-CN');
  out.record('locale keeps chosen dates and ready',await p.locator('input[type=date]').evaluateAll(ns=>ns.map(n=>n.value)),['2026-07-15','2026-07-15']);out.record('locale no preview or create',{gets,posts},{gets:0,posts:0});
  await p.locator('#review-start').fill('');await state(p,'invalid');out.record('missing no query',gets,0);out.record('missing aria association',await p.locator('#review-start').getAttribute('aria-describedby'),'range-date-error');await expect(p.locator('.range-editor button[type=submit]')).toBeDisabled();
  await dates(p,'2026-07-16','2026-07-15');await state(p,'invalid');out.record('reverse no query',gets,0);out.record('reverse end association',await p.locator('#review-end').getAttribute('aria-invalid'),'true');
  await dates(p,'2026-07-15','2026-07-15');await state(p,'ready');out.record('equal endpoints valid',await p.locator('.count-number').innerText(),'3');
  await dates(p,'2026-07-01','2026-07-02');await state(p,'empty');await dates(p,'2026-07-15','2026-07-15');await state(p,'ready');
  out.record('ready empty ready nodes persist',await start.evaluate(n=>n===document.querySelector('#review-start')),true);out.record('end node persists',await end.evaluate(n=>n===document.querySelector('#review-end')),true);
  await p.route(preview,r=>r.fulfill(problem));await dates(p,'2026-07-14','2026-07-15');await state(p,'failed');await p.unroute(preview);
  await p.locator('.range-feedback button').focus();await p.keyboard.press('Enter');await state(p,'ready');out.record('retry removed button returns focus to start',await p.locator('#review-start').evaluate(n=>n===document.activeElement),true);
  let release,entered;const hold=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
  await p.route(preview,async route=>{if(new URL(route.request().url()).searchParams.get('start_date')==='2026-07-15'){const response=await route.fetch();entered();await hold;await route.fulfill({response}).catch(()=>{});}else await route.continue();});
  await p.locator('#review-start').fill('2026-07-15');await entry;await state(p,'loading');await expect(p.locator('.range-editor button[type=submit]')).toBeDisabled();
  await dates(p,'2026-07-01','2026-07-02');await state(p,'empty');release();await p.unrouteAll({behavior:'wait'});
  out.record('late ready response cannot replace empty',await p.locator('.range-editor').getAttribute('data-range-preview'),'empty');
  await dates(p,'2026-07-15','2026-07-15');await state(p,'ready');
  const before=sql('SELECT count(*) FROM wordweave.review_sessions');
  const response=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===createPath);await p.locator('.range-editor button[type=submit]').click();const create=await response;out.record('explicit UI create201',create.status(),201);const body=await create.json(),id=body.data.session_id;
  await expect(p).toHaveURL(origin+'/review/'+id);await expect(p.locator('#review-spelling-answer')).toBeVisible();
  out.record('single explicit create only',posts,1);out.record('one new DB session',Number(sql('SELECT count(*) FROM wordweave.review_sessions'))-Number(before),1);
  const order=sql('SELECT batch_id,batch_order FROM wordweave.review_session_batches WHERE session_id='+quote(id)+' ORDER BY batch_order');
  const targets=sql('SELECT batch_id,target_id,target_order FROM wordweave.review_session_targets WHERE session_id='+quote(id)+' ORDER BY batch_id,target_order');
  out.record('actual selection has3 batches',order.split('\n').length,3);out.record('randomized fixed target rows',targets.split('\n').length,6);
  const original=(await api(c,'GET',createPath+'/'+id,token)).body.data.session;
  const attempt=await api(c,'POST',createPath+'/'+id+'/attempts',token,{});
  await p.reload();await ready(p);await expect(p.locator('#review-spelling-answer')).toBeVisible();
  out.record('refresh preserves batch order',sql('SELECT batch_id,batch_order FROM wordweave.review_session_batches WHERE session_id='+quote(id)+' ORDER BY batch_order'),order);
  out.record('refresh preserves target order',sql('SELECT batch_id,target_id,target_order FROM wordweave.review_session_targets WHERE session_id='+quote(id)+' ORDER BY batch_id,target_order'),targets);
  out.record('spelling hint hides both',attempt.body.data.item.hint.segments.filter(s=>s.kind==='blank').length,2);
  const reuse=await api(c,'POST',createPath,token,{...range,start_date:'2026-07-14'});
  out.record('unfinished range reused',[reuse.status,reuse.body.data.session_id,reuse.body.data.reused,reuse.body.data.date_range],[200,id,true,original.date_range]);
  const single=await api(c,'POST',createPath,token,{mode:'single_batch',batch_id:f.batches.find(x=>x.label==='start').id});
  out.record('single coexists distinct',single.status===201&&single.body.data.session_id!==id,true);
  const active=await api(c,'GET',createPath+'/active-range',token);out.record('active-range excludes single',active.body.data.session.session_id,id);
  out.record('active-range no answers',/passage|entries|hint|attempt|answer/.test(JSON.stringify(active.body.data)),false);
  await open(p);await state(p,'empty');await expect(p.locator('.range-resume')).toBeVisible();await p.locator('#review-start').fill('');await state(p,'invalid');out.record('invalid retains real resume',await p.locator('.range-resume').isVisible(),true);
  await p.locator('.range-resume button').click();await expect(p).toHaveURL(origin+'/review/'+id);out.record('resume no additional POST',posts,1);
  await c.close();
 }
 {
  const{c,p}=await setup(b,'changed');await open(p);await dates(p,'2026-07-15','2026-07-15');await state(p,'ready');
  sql('UPDATE wordweave.learning_batches SET participates_in_range_review=false WHERE owner_id='+quote(f.users.changed.id));
  let posts=0;p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname===createPath)posts++;});
  const response=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===createPath);await p.locator('.range-editor button[type=submit]').click();out.record('membership changed create422',(await response).status(),422);await state(p,'empty');out.record('422 reconciles without auto replay',posts,1);out.record('422 retains chosen dates',await p.locator('input[type=date]').evaluateAll(ns=>ns.map(n=>n.value)),['2026-07-15','2026-07-15']);await c.close();
 }
 for(const[tz,now,start,end]of[['UTC','2028-03-01T01:00:00Z','2028-02-24','2028-03-01'],['Asia/Shanghai','2028-02-29T20:00:00Z','2028-02-24','2028-03-01'],['America/Los_Angeles','2026-03-08T10:30:00Z','2026-03-02','2026-03-08']]){
  const c=await b.newContext({timezoneId:tz});await login(c,f.users.empty.username);const p=await c.newPage();await p.clock.setFixedTime(new Date(now));const queries=[];p.on('request',r=>{if(r.url().includes(path))queries.push(Object.fromEntries(new URL(r.url()).searchParams));});await open(p);await state(p,'empty');
  out.record('browser local default '+tz,await p.locator('input[type=date]').evaluateAll(ns=>ns.map(n=>n.value)),[start,end]);out.record('one correct first query '+tz,queries,[{start_date:start,end_date:end,timezone:tz}]);await c.close();
 }
 for(const locale of['en-US','zh-CN']){
  const{c,p}=await setup(b,'empty',locale,390);await open(p);await state(p,'empty');const axe=await new AxeBuilder({page:p}).analyze();out.record('range empty axe '+locale,axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);await c.close();
 }
}catch(e){out.error('range functional execution',e);}finally{await b.close();out.save();}
