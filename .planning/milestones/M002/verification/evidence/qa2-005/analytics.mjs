import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {expect,start,stop,login,ok,origin,out,dump,ready,instrument,sql,env} from './harness.mjs';
const {firefox,webkit}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const AxeBuilder=createRequire(process.cwd()+'/frontend/package.json')('@axe-core/playwright').default;
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));
const tr=(lang,key)=>copy.static[lang+'.'+key]??copy.templates[lang+'.'+key];
const browser=await start(),others=[],results=[],samples=[],runtime=[];let action='setup';
const admin=await browser.newContext(),page=await admin.newPage();instrument(page,runtime,()=>action);
async function test(id,name,fn){action=id;try{await fn();results.push({id,name,result:'PASS'});}catch(e){results.push({id,name,result:'FAIL',error:String(e)});}dump('analytics-results.json',{results,samples,runtime});console.log(id,results.at(-1).result);}
async function visit(p,width,lang){await p.setViewportSize({width,height:900});await p.goto(origin+'/admin/analytics');await ready(p);await p.waitForLoadState('networkidle');if(!await p.getByRole('button',{name:tr(lang,'language'),exact:true}).count()){await p.getByRole('button',{name:tr(lang==='en'?'zh':'en','language'),exact:true}).click();await p.waitForLoadState('networkidle');}await expect(p.locator('h1')).toHaveText(tr(lang,'metrics.title'));await expect(p.locator('select')).toBeEnabled();}
const dayOffset=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
let today,oldest;
async function inspect(p,c,width,lang,days,state,engine){
 await p.getByRole('combobox',{name:tr(lang,'period'),exact:true}).selectOption(String(days));await expect(p.locator('select')).toBeEnabled();await expect(p.locator('.chart .bar')).toHaveCount(days);
 const data=await ok(c,`/admin/analytics/traffic?start_day=${dayOffset(today,1-days)}&end_day=${today}`);
 expect(data.series).toHaveLength(days);expect(data.range).toEqual({start_day:dayOffset(today,1-days),end_day:today});
 await expect(p.locator('.split > section > h2')).toHaveText([tr(lang,'traffic'),tr(lang,'funnel')]);
 await p.locator('.chart').scrollIntoViewIfNeeded();
 const g=await p.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height}};const chart=document.querySelector('.chart');return{viewport:innerWidth,document:document.documentElement.scrollWidth,chart:rect(chart),panels:[...document.querySelectorAll('.split > .panel')].map(rect),bars:[...chart.children].map(e=>({...rect(e),title:e.title})),labels:[...chart.querySelectorAll('span')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return{...rect(e),text:e.textContent,uncovered:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e};})};});
 samples.push({action,engine,width,lang,days,state,geometry:g,api:data});
 await p.locator('.split').screenshot({path:new URL(`${action}-${engine}-${lang}-${width}-${days}.png`,out).pathname});
 expect(g.document).toBeLessThanOrEqual(width);if(width>760)expect(Math.abs(g.panels[0].width-g.panels[1].width)).toBeLessThan(2);
 expect(g.bars.map(x=>x.title.split(' · ')[0])).toEqual(data.series.map(x=>x.day));
 for(const bar of g.bars){expect(bar.width).toBeGreaterThan(0);expect(bar.x).toBeGreaterThanOrEqual(g.chart.x-1);expect(bar.right).toBeLessThanOrEqual(g.chart.right+1);}
 expect(g.labels[0].text).toBe(data.range.start_day.slice(5));expect(g.labels.at(-1).text).toBe(today.slice(5));
 for(let i=0;i<g.labels.length;i++){const x=g.labels[i];expect(x.uncovered).toBe(true);expect(x.x).toBeGreaterThanOrEqual(g.chart.x-1);expect(x.right).toBeLessThanOrEqual(g.chart.right+1);if(i)expect(x.x).toBeGreaterThanOrEqual(g.labels[i-1].right+1);}
 const details=p.locator('.split > .panel').first().locator('details');await details.locator('summary').focus();await p.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');
 const rows=await details.locator('tbody tr').evaluateAll(es=>es.map(e=>[...e.cells].map(c=>c.textContent.trim())));
 const display=m=>m.value!==null?String(m.value):tr(lang,m.status==='no_sample'?'nosample':m.status==='observing'?'observing':'unknown');
 expect(rows.map(x=>x.slice(0,3))).toEqual(data.series.map(x=>[x.day,display(x.pv),display(x.uv)]));
 await details.locator('.table-wrap').focus();await expect(details.locator('.table-wrap')).toBeFocused();expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await details.locator('summary').click();
 if(state==='ready'){
  for(const row of data.series){const i=Math.round((Date.parse(row.day)-Date.parse(oldest))/86400000);expect(row.pv.value).toBe(i%5);expect(row.uv.value).toBe(i%5===0?0:1);}
  await expect(p.locator('.split')).toContainText(tr(lang,'nosample'));await expect(p.locator('.data-table').filter({hasText:'D30'})).toContainText(tr(lang,'observing'));
  const time=p.locator('.section-head time');await expect(time).toHaveAttribute('datetime',new Date(data.updated_at).toISOString());
  const text=await p.evaluate(({value,locale})=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(value)),{value:data.updated_at,locale:lang==='zh'?'zh-CN':'en-US'});await expect(p.locator('.section-head > span')).toHaveText(tr(lang,'updated').replace('{time}',text));
 }
}
try{
 await login(admin);today=(await ok(admin,'/admin/overview')).learning_day;oldest=dayOffset(today,-29);
 const prototype=await admin.newPage();await prototype.goto('http://127.0.0.1:4186/prototype/?page=metrics&lang=en');await prototype.locator('.split').screenshot({path:new URL('V01-prototype.png',out).pathname});await prototype.close();
 await test('V01','CR010 unknown/empty metric layout and bilingual copy at 320px',async()=>{for(const lang of ['en','zh']){await visit(page,320,lang);for(const days of [7,30])await inspect(page,admin,320,lang,days,'empty','chromium');}});
 sql("UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0) ON CONFLICT(level_no) DO NOTHING");
 const learner=await browser.newContext();await ok(learner,'/auth/register','POST',{username:'qa5_analytics_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'});await learner.close();
 sql(`INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,browser_key_hash,event_outcome,source_kind) SELECT 'qa5:'||i::text||':'||n,'page_view',(('${oldest}'::date+i)::timestamp+interval '5 hours') AT TIME ZONE 'Asia/Shanghai','${oldest}'::date+i,decode(repeat('ce',32),'hex'),'anonymous','browser' FROM generate_series(0,29) x(i) CROSS JOIN LATERAL generate_series(1,i%5) y(n)`);
 await expect.poll(()=>Number(sql(`SELECT coalesce(value,0) FROM wordweave.analytics_daily WHERE day='${today}' AND metric='pv' AND dimension_key='all'`)),{timeout:75000,intervals:[1000,3000,5000]}).toBe(4);
 await test('V02','CR010 populated/zero/observing data: both periods, languages, four widths',async()=>{for(const lang of ['en','zh'])for(const width of [320,390,1280,1440]){await visit(page,width,lang);for(const days of [7,30])await inspect(page,admin,width,lang,days,'ready','chromium');}});
 await test('V03','CR010 Firefox/WebKit layout, language switching and timestamp hydration',async()=>{for(const [engine,name]of[[firefox,'firefox'],[webkit,'webkit']]){const b=await engine.launch();others.push(b);const c=await b.newContext();await login(c);const p=await c.newPage();instrument(p,runtime,()=>action);for(const [width,lang] of [[320,'en'],[1440,'zh'],[390,'en']]){await visit(p,width,lang);await inspect(p,c,width,lang,30,'ready',name);}}});
 await test('V04','Scoped accessibility and runtime errors',async()=>{await visit(page,320,'en');await page.getByRole('combobox',{name:'Period',exact:true}).selectOption('30');await expect(page.locator('.chart .bar')).toHaveCount(30);const scan=await new AxeBuilder({page}).include('.split').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();dump('analytics-axe.json',{violations:scan.violations,passes:scan.passes.map(x=>x.id)});expect(scan.violations).toEqual([]);expect(runtime).toEqual([]);});
}catch(e){results.push({id:'SETUP',result:'FAIL',error:String(e)});console.log(String(e));}
finally{dump('analytics-results.json',{results,samples,runtime,realProviderCalls:0,localProviderCalls:0});for(const b of others)await b.close();await stop(browser);if(results.some(x=>x.result==='FAIL'))process.exitCode=1;console.log(JSON.stringify(results,null,2));}
