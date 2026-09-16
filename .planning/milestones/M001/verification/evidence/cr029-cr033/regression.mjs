import{readFileSync}from'node:fs';import{join}from'node:path';import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,expect,dir,origin,design,ready,login,api,recorder,sql,quote}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('regression-final'),b=await chromium.launch();
const normalize=s=>s.replace(/\s+/gu,' ').trim(),texts=async(p,s)=>(await p.locator(s).allInnerTexts()).map(normalize);
const shot=(p,n)=>p.screenshot({path:join(dir,'screenshots',n+'.png')});
async function proto(id,role,state,locale,width){
 const c=await b.newContext({viewport:{width,height:1000},locale}),p=await c.newPage();await p.goto(design+'/prototype/?page='+id+'&role='+role+'&state='+state+'&locale='+locale);await p.locator('main').waitFor();await p.locator('.prototype-tools').evaluate(n=>n.style.display='none');return{c,p};
}
try{
 for(const locale of['en-US','zh-CN'])for(const width of[390,1440]){
 const label=locale+'-'+width;
 for(const role of['admin','learner','empty']){
 const c=await b.newContext({viewport:{width,height:1000},locale});c.setDefaultTimeout(6000);const token=await login(c,'qa065_'+role,locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();
 const pages=role==='admin'?[['/admin/models','PAGE-101'],['/admin/plans','PAGE-102']]:[['/library','PAGE-005']];
 for(const[path,id]of pages){let d;try{
 d=await proto(id,role==='empty'?'learner':role,role==='empty'?'empty':'default',locale,width);await p.goto(origin+path);await ready(p);
 for(const sel of['.page-heading .eyebrow','.page-title','.page-description'])out.record(id+' '+role+' '+sel+' '+label,await texts(p,sel),await texts(d.p,sel));
 if(id==='PAGE-101'){
 await p.locator('.page-heading button').click();await d.p.locator('[data-action=add-model]').first().click();await p.locator('dialog[open]').waitFor();await d.p.locator('dialog[open]').waitFor();
 for(const sel of['dialog h2','dialog .field-label','dialog .helper','dialog .notice','dialog .dialog-footer'])out.record('add model '+sel+' '+label,await texts(p,sel),await texts(d.p,sel));
 const style=p=>p.locator('dialog input:not([type=checkbox]):not([type=password])').evaluateAll(ns=>ns.map(n=>{const s=getComputedStyle(n);return{background:s.backgroundColor,padding:s.padding};}));
 out.record('model input style '+label,await style(p),await style(d.p));
 await p.keyboard.press('Escape');await d.p.keyboard.press('Escape');
 await p.locator('.model-row button').first().click();await d.p.locator('[data-action=edit-model]').first().click();
 for(const sel of['dialog h2','dialog .field-label','dialog .helper','dialog .notice','dialog .dialog-footer'])out.record('edit model '+sel+' '+label,await texts(p,sel),await texts(d.p,sel));
 await p.keyboard.press('Escape');await d.p.keyboard.press('Escape');
 await p.locator('.admin-key-card .card-footer button').click();await d.p.locator('[data-action=replace-key]').click();
 out.record('key input background '+label,await p.locator('dialog input').evaluate(n=>getComputedStyle(n).backgroundColor),await d.p.locator('dialog input').evaluate(n=>getComputedStyle(n).backgroundColor));await p.keyboard.press('Escape');
 }
 if(id==='PAGE-102'){
 out.record('plan tabs '+label,await texts(p,'.tabs .tab'),await texts(d.p,'.tabs .tab'));
 out.record('plan labels '+label,await texts(p,'.field-label'),await texts(d.p,'.field-label'));
 out.record('plan save copy '+label,await texts(p,'.card-footer button.button-primary'),await texts(d.p,'[data-action=save-group]'));
 }
 if(id==='PAGE-005'&&role==='learner'){
 out.record('six statistics labels '+label,await texts(p,'.stat-label'),await texts(d.p,'.stat-label'));out.record('six statistics count '+label,await p.locator('.stat-label').count(),6);
 }
 if(id==='PAGE-005'&&role==='empty'){
 for(const sel of['.empty-state h2','.empty-state p','.empty-state .button'])out.record('library empty '+sel+' '+label,await texts(p,sel),await texts(d.p,sel));
 }
 const axe=await new AxeBuilder({page:p}).analyze();out.record('regression axe '+id+' '+role+' '+label,axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[]);
 await shot(p,id+'-'+role+'-'+label);
 }catch(e){out.error(id+' '+role+' '+label,e);}finally{if(d)await d.c.close();}}
 await c.close();
 }
 console.log('regression completed '+label);
 }
 // Reader loading/error/unavailable copy compared directly to approved prototype.
 for(const locale of['en-US','zh-CN']){
 const c=await b.newContext();c.setDefaultTimeout(6000);const token=await login(c,'qa065_admin',locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();
 for(const[status,state]of[[500,'error'],[404,'unavailable']]){
 const d=await proto('PAGE-103','admin','batch-'+state,locale,1440);
 try{
 await p.goto(origin+'/admin/users/'+f.users.qa065_learner);await ready(p);const pattern='**/api/v1/admin/users/'+f.users.qa065_learner+'/batches/'+f.batches[0].id;
 await p.route(pattern,route=>route.fulfill({status,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/failure',title:'Failure',status,code:status===404?'not_found':'internal_error',detail:'Safe failure',request_id:'qa_req'})}));
 await p.locator('.model-row button').first().click();await p.locator('.reader-state h3').waitFor();
 out.record('reader '+state+' full copy '+locale,await texts(p,'.reader-state'),await texts(d.p,'.reader-state'));await shot(p,'reader-'+state+'-'+locale);await p.keyboard.press('Escape');await p.unroute(pattern);
 }finally{await d.c.close();}
 }
 await c.close();
 }
}finally{await b.close();out.save();}
