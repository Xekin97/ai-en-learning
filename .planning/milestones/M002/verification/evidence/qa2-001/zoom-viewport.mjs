import {createRequire} from 'node:module';import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';
const {chromium,expect}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test'),out=new URL('./',import.meta.url),origin='http://127.0.0.1:3300',ext=new URL('ui-run2/zoom-extension/',out).pathname;
const ctx=await chromium.launchPersistentContext(mkdtempSync(tmpdir()+'/ww-qa-zoom-'),{channel:'chromium',headless:false,viewport:null,reducedMotion:'reduce',args:['--window-size=1440,1000','--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 await ctx.addCookies([{name:'wordweave_session',value:'learner',url:origin}]);
 const p=await ctx.newPage();await p.goto(origin+'/review');await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.waitForLoadState('networkidle');
 const w=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const zoom=await w.evaluate(async origin=>{const t=(await chrome.tabs.query({})).find(t=>t.url?.startsWith(origin));await chrome.tabs.setZoom(t.id,2);return chrome.tabs.getZoom(t.id)},origin);expect(zoom).toBe(2);
 await expect.poll(()=>p.evaluate(()=>innerWidth)).toBeLessThan(800);
 await p.locator('input[type=date]').first().scrollIntoViewIfNeeded();
 const metrics=await p.evaluate(()=>({innerWidth,innerHeight,scale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,fields:[...document.querySelectorAll('input[type=date]')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right}})}));
 expect(metrics.fields).toHaveLength(2);expect(metrics.fields.every(r=>r.x>=0&&r.right<=metrics.innerWidth)).toBe(true);
 const session=await ctx.newCDPSession(p),ss=await session.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false});
 writeFileSync(new URL('zoom-native-viewport.png',out),Buffer.from(ss.data,'base64'));
 writeFileSync(new URL('zoom-viewport.json',out),JSON.stringify({zoom,metrics,result:'PASS'},null,2));
}finally{await ctx.close()}
