import{readFileSync,writeFileSync,mkdtempSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import{chromium,webkit,expect,dir,origin,ready,login,api,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),rf=JSON.parse(readFileSync(join(dir,'range-fixtures.json'))),out=recorder('zoom-boundaries');
for(const[type,name]of[[chromium,'chromium'],[webkit,'webkit']]){
 const b=await type.launch();try{
  for(const locale of['en-US','zh-CN']){
   const c=await b.newContext({timezoneId:'Asia/Shanghai'});c.setDefaultTimeout(7000);const token=await login(c,rf.users.old.username,locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();let posts=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v1/me/review-sessions'))posts++;});
   for(const width of[901,1080,1081]){
    await p.setViewportSize({width,height:1000});await p.goto(origin+'/review');await ready(p);await expect(p.locator('.range-resume')).toBeVisible();
    const node=await p.locator('#review-start').elementHandle();
    for(const status of['empty','ready','loading']){
     let release,entry,entered;if(status==='ready'){await p.locator('#review-start').fill('2026-07-15');await p.locator('#review-end').fill('2026-07-15');}
     if(status==='loading'){const hold=new Promise(r=>release=r);entry=new Promise(r=>entered=r);await p.route('**/api/v1/me/review-range/preview?**',async route=>{const response=await route.fetch();entered();await hold;await route.fulfill({response}).catch(()=>{});});await p.locator('#review-start').fill('2026-07-14');await entry;}
     await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview',status);
     out.record(name+' '+locale+' '+width+' '+status+' resume stable',await p.locator('.range-resume').isVisible(),true);
     out.record(name+' '+locale+' '+width+' '+status+' geometry',await p.locator('.range-editor').evaluate((n,width)=>{const a=n.querySelector('.card').getBoundingClientRect(),b=n.querySelector('.range-count').getBoundingClientRect();return{inside:n.scrollWidth<=n.clientWidth,layout:width<=1080?b.y>=a.bottom+23:b.y===a.y&&b.width===320};},width),{inside:true,layout:true});
     out.record(name+' '+locale+' '+width+' '+status+' stable input',await node.evaluate(n=>n===document.querySelector('#review-start')),true);
     if(release){await p.locator('#review-end').focus();release();await p.unrouteAll({behavior:'wait'});await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','ready');out.record(name+' '+locale+' '+width+' no focus steal',await p.locator('#review-end').evaluate(n=>n===document.activeElement),true);}
    }
   }
   out.record(name+' '+locale+' boundary changes no create',posts,0);await c.close();
  }
 }catch(e){out.error(name+' boundary execution',e);}finally{await b.close();}
}
try{
 const ext=join(dir,'zoom-extension'),profile=mkdtempSync(join(tmpdir(),'wordweave-qa072-zoom-'));
 const c=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,timezoneId:'Asia/Shanghai',args:['--window-size=1440,1000','--disable-extensions-except='+ext,'--load-extension='+ext]});c.setDefaultTimeout(7000);
 try{
 const worker=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker',{timeout:10000});const p=await c.newPage(),cdp=await c.newCDPSession(p),metadata=[];
 for(const role of['range','reader']){
  const token=await login(c,role==='range'?rf.users.old.username:'qa072_admin');
  for(const locale of['en-US','zh-CN']){
   await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
   await p.goto(origin+(role==='range'?'/review':'/admin/users/'+f.users.qa072_learner+'?batch='+f.batches[1].id));await ready(p);await p.locator(role==='range'?'.range-editor':'.reader-passage').waitFor();
   const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:6101/'));await chrome.tabs.setZoom(tab.id,2);return await chrome.tabs.getZoom(tab.id);});
   await expect.poll(()=>p.evaluate(()=>innerWidth)).toBeLessThanOrEqual(720);out.record('actual tab zoom '+role+' '+locale,zoom,2);
   const view=await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visual:{w:visualViewport.width,h:visualViewport.height,scale:visualViewport.scale},overflow:document.documentElement.scrollWidth>innerWidth}));metadata.push({role,locale,zoom,view});
   out.record('real200 no overflow '+role+' '+locale,view.overflow,false);
   if(role==='range'){await p.locator('#review-start').fill('2026-07-15');await p.locator('#review-end').fill('2026-07-15');await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','ready');out.record('real200 usable dates '+locale,await p.locator('input[type=date]').evaluateAll(ns=>ns.map(n=>n.value)),['2026-07-15','2026-07-15']);}
   else out.record('real200 reader bounded '+locale,await p.locator('dialog').evaluate(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}),true);
   const capture=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});writeFileSync(join(dir,'screenshots','real200-'+role+'-'+locale+'.png'),Buffer.from(capture.data,'base64'),{flag:'wx'});
   if(role==='reader'){await p.locator('.dialog-footer button').click();await expect(p.locator('dialog')).toHaveCount(0);out.record('real200 close usable '+locale,true,true);}
  }
 }
 writeFileSync(join(dir,'zoom-metadata.json'),JSON.stringify({metadata,profile,captureMethod:'CDP browser view fromSurface:false, actual chrome.tabs zoom=2; no CSS scaling'},null,2),{flag:'wx'});
 }finally{await c.close();}
}catch(e){out.error('real browser zoom execution',e);}
out.save();

