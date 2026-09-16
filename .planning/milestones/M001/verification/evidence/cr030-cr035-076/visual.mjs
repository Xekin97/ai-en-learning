import{readFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
import{chromium,webkit,expect,dir,origin,design,ready,login,recorder,api}from'./lib.mjs';
const fixture=JSON.parse(readFileSync(join(dir,'fixtures.json')));
const out=recorder('visual'),shots=join(dir,'screenshots');mkdirSync(shots,{recursive:true});
const tidy=s=>String(s).replace(/\s+/gu,' ').trim();
const copy=l=>l.innerText().then(tidy);
const rules={
 '.reader-dialog':['width','maxWidth','borderRadius','padding'],
 '.reader-dialog .dialog-header':['padding','flexShrink','borderBottomWidth'],
 '.reader-body':['padding','overflowY','minHeight'],
 '.reader-metadata':['columnGap','rowGap','paddingBottom','marginBottom'],
 '.reader-body .reading-passage':['fontFamily','fontSize','lineHeight','maxWidth'],
 '.reader-resources':['paddingTop','marginTop','borderTopWidth'],
 '.reader-word':['padding','rowGap','columnGap'],
 '.reader-dialog .dialog-footer':['padding','flexShrink']
};
const metrics=(p,map)=>p.evaluate(map=>Object.fromEntries(Object.entries(map).map(([sel,keys])=>{const n=document.querySelector(sel);if(!n)throw Error(sel);const s=getComputedStyle(n);return[sel,Object.fromEntries(keys.map(k=>[k,s[k]]))];})),map);
async function prototype(browser,id,role,state,locale,viewport){
 const c=await browser.newContext({locale,viewport});const p=await c.newPage();
 await p.goto(design+'/prototype/?page='+id+'&role='+role+'&state='+state+'&locale='+locale);await p.locator('main').waitFor();
 await p.locator('.prototype-tools').evaluate(n=>n.style.display='none');await p.evaluate(()=>document.fonts.ready.then(()=>null));
 return{c,p};
}
const browser=await chromium.launch();
const createContext=browser.newContext.bind(browser);
browser.newContext=async options=>{const c=await createContext(options);c.setDefaultTimeout(5000);c.setDefaultNavigationTimeout(10000);return c;};
try{
 for(const locale of['en-US','zh-CN'])for(const width of[390,1440]){
 const viewport={width,height:1000},label=locale+'-'+width;
 const guest=await browser.newContext({locale,viewport});await guest.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);const p=await guest.newPage();
 const privateRequests=[];p.on('request',r=>{if(/\/api\/v1\/(library|review|me|admin)/.test(r.url()))privateRequests.push(new URL(r.url()).pathname);});
 for(const[path,id,target]of[['/review','PAGE-007','review'],['/library','PAGE-005','library'],['/library/'+fixture.batches[0].id,'PAGE-006','story'],['/review/00000000-0000-0000-0000-000000000001','PAGE-008','review'],['/account','PAGE-009','account']]){
 let d;try{
 d=await prototype(browser,id,'visitor','default',locale,viewport);
 const response=await p.goto(origin+path);await ready(p);await p.evaluate(()=>document.fonts.ready.then(()=>null));
 out.record('gate URL '+path+' '+label,new URL(p.url()).pathname,path);
 out.record('gate full copy '+target+' '+label,await copy(p.locator('.auth-gate')),await copy(d.p.locator('.empty-state.card')));
 const gmap={'.empty-state.card':['padding','borderRadius','backgroundColor'],'.empty-state.card h1':['fontFamily','fontSize','lineHeight','color'],'.empty-state.card > p:not(.eyebrow)':['fontSize','color']};
 out.record('gate style '+target+' '+label,await metrics(p,gmap),await metrics(d.p,gmap));
 out.record('gate no overflow '+target+' '+label,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const ssr=await response.text();out.record('gate SSR no private payload '+target+' '+label,!['qa076_learner','generation_quota','csrf_token','End of alpha.','End of beta.'].some(s=>ssr.includes(s)),true);
 for(const kind of['login','register']){
 const href=await p.locator('.auth-gate a[href^="/'+kind+'"]').getAttribute('href');
 out.record('gate preserves '+kind+' '+target+' '+label,new URL(href,origin).searchParams.get('redirect'),path);
 }
 if((width===390||width===1440)&&target==='review'&&id==='PAGE-007'){await p.screenshot({path:join(shots,'gate-app-'+label+'.png')});await d.p.screenshot({path:join(shots,'gate-design-'+label+'.png')});}
 }catch(e){out.error('gate '+path+' '+label,e);}finally{if(d)await d.c.close();}
 }
 out.record('guest has no private browser calls '+label,privateRequests,[]);await guest.close();
 for(const role of['learner','admin']){
 const c=await browser.newContext({locale,viewport});const token=await login(c,'qa076_'+role,locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/hydration.*mismatch/i.test(m.text()))errors.push(m.text());});
 const items=role==='learner'?[['/','PAGE-001'],['/review','PAGE-007'],['/account','PAGE-009']]:[['/admin/users/'+fixture.users.qa076_learner+'?q=qa076','PAGE-103']];
 for(const[path,id]of items){let d;try{
 d=await prototype(browser,id,role,role==='admin'?'detail':'default',locale,viewport);
 await p.goto(origin+path);await ready(p);await p.evaluate(()=>document.fonts.ready.then(()=>null));
 if(id==='PAGE-001')out.record('learner home Review '+label,await copy(p.locator('.hero-actions a[href="/review"]')),await copy(d.p.locator('.hero-actions [data-value="PAGE-007"]')));
 if(id==='PAGE-007'){
 await p.locator('.date-range').waitFor();const m=p=>p.locator('.date-range .field').evaluateAll(ns=>ns.map(n=>{const i=n.querySelector('input'),r=i.getBoundingClientRect();return{height:r.height,width:r.width,top:r.top,margin:getComputedStyle(n).marginTop};}));
 const a=await m(p),b=await m(d.p);out.record('date equal height '+label,a.map(x=>x.height),[44,44]);out.record('date equal width '+label,a[0].width,a[1].width);out.record('date margins '+label,a.map(x=>x.margin),b.map(x=>x.margin));if(width>720)out.record('date alignment '+label,a[0].top,a[1].top);
 }
 if(id==='PAGE-009'){
 for(const sel of['.card-title','.card-subtitle','.card-body p'])out.record('account copy '+sel+' '+label,await copy(p.locator('.danger-zone '+sel)),await copy(d.p.locator('.danger-zone '+sel)));
 const map={'.danger-zone .card-subtitle':['color','fontSize','lineHeight'],'.danger-zone':['backgroundColor']};out.record('account style '+label,await metrics(p,map),await metrics(d.p,map));
 }
 if(id==='PAGE-103'){
 await p.locator('.admin-user-detail-grid').waitFor();
 out.record('detail search present '+label,await p.getByRole('search').count(),1);
 out.record('detail search initial '+label,await p.getByRole('search').locator('input').inputValue(),'qa076');
 for(const sel of['.admin-user-detail-toolbar .button','.admin-user-detail-grid > .card:nth-child(2) .card-subtitle','.model-row .button'])out.record('detail copy '+sel+' '+label,await copy(p.locator(sel).first()),await copy(d.p.locator(sel).first()));
 out.record('detail joined ISO '+label,await copy(p.locator('.admin-user-detail-grid > .card').first().locator('.card-subtitle')),(await copy(d.p.locator('.admin-user-detail-grid > .card').first().locator('.card-subtitle'))).replace(/\d{4}-\d{2}-\d{2}/,'2026-08-10'));
 out.record('detail labels '+label,await p.locator('.definition-list dt').allTextContents(),await d.p.locator('.definition-list dt').allTextContents());
 await p.locator('.model-row .button').first().click();await p.locator('.reader-body .reading-passage').waitFor();
 await d.p.locator('[data-action="admin-view-batch"]').first().click();await d.p.locator('.reader-body .reading-passage').waitFor();
 out.record('reader styles '+label,await metrics(p,rules),await metrics(d.p,rules));
 for(const sel of['.reader-title-row','.reader-metadata dt','.reader-story h3','.reader-resources h3','.reader-dialog .dialog-footer']){
 out.record('reader copy '+sel+' '+label,(await p.locator(sel).allTextContents()).map(tidy),(await d.p.locator(sel).allTextContents()).map(tidy));}
 out.record('reader correct first batch '+label,await p.locator('.reader-body .reading-passage').textContent(),fixture.batches[0].passage);
 out.record('reader readonly '+label,await p.locator('.reader-dialog input,.reader-dialog select,.reader-dialog a').count(),0);
 if(width===390||width===1440){await p.screenshot({path:join(shots,'reader-app-'+label+'.png')});await d.p.screenshot({path:join(shots,'reader-design-'+label+'.png')});}
 await p.keyboard.press('Escape');await expect(p.locator('dialog')).toHaveCount(0);
 out.record('reader closes without leaving detail '+label,new URL(p.url()).pathname,'/admin/users/'+fixture.users.qa076_learner);
 await p.locator('.model-row .button').nth(1).click();await p.locator('.reading-passage').waitFor();
 out.record('reader correct second long batch '+label,await p.locator('.reading-passage').textContent(),fixture.batches[1].passage);
 const geometry=()=>p.locator('.reader-dialog').evaluate(n=>{const h=n.querySelector('.dialog-header').getBoundingClientRect(),f=n.querySelector('.dialog-footer').getBoundingClientRect(),b=n.querySelector('.reader-body'),r=n.getBoundingClientRect();return{inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,headerTop:h.top,footerBottom:f.bottom,scroll:b.scrollHeight>b.clientHeight,overflow:b.scrollWidth>b.clientWidth};});
 const before=await geometry();await p.locator('.reader-body').evaluate(n=>n.scrollTop=n.scrollHeight);const after=await geometry();
 out.record('long reader fixed bounds '+label,before,{...before,inside:true,scroll:true,overflow:false});
 out.record('long reader stationary header footer '+label,[after.headerTop,after.footerBottom],[before.headerTop,before.footerBottom]);
 for(let i=0;i<7;i++){await p.keyboard.press('Tab');out.record('reader focus trap '+i+' '+label,await p.evaluate(()=>!!document.activeElement.closest('.reader-dialog')),true);}
 await p.locator('.dialog-footer button').click();await expect(p.locator('dialog')).toHaveCount(0);
 out.record('reader returns focus '+label,await p.locator('.model-row .button').nth(1).evaluate(n=>n===document.activeElement),true);
 }
 out.record('page no overflow '+id+' '+label,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if((width===390||width===1440)&&id!=='PAGE-103'){await p.screenshot({path:join(shots,id+'-app-'+label+'.png')});await d.p.screenshot({path:join(shots,id+'-design-'+label+'.png')});}
 }catch(e){out.error(id+' '+label,e);}finally{if(d)await d.c.close();}}
 out.record('browser errors '+role+' '+label,errors,[]);await c.close();
 }
 console.log('visual completed '+label);
 }
}finally{await browser.close();out.save();}
