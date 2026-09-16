import{readFileSync}from'node:fs';import{join}from'node:path';
import AxeBuilder from '../../../../../../frontend/node_modules/@axe-core/playwright/dist/index.js';
import{chromium,webkit,expect,dir,origin,design,ready,login,api,sql,quote,recorder}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'range-fixtures.json'))),out=recorder('range-matrix-corrected'),path='/api/v1/me/review-range/preview',createPath='/api/v1/me/review-sessions';
const preview='**/api/v1/me/review-range/preview?**';
const range={mode:'range',start_date:'2026-07-15',end_date:'2026-07-15',timezone:'Asia/Shanghai'};
const problem={status:500,contentType:'application/problem+json',body:JSON.stringify({type:'https://wordweave.example/problems/internal_error',title:'Request failed',status:500,code:'internal_error',detail:'QA controlled failure',request_id:'req_qa072'})};
async function setup(b,who='old',locale='en-US',width=1440){const c=await b.newContext({viewport:{width,height:1000},timezoneId:'Asia/Shanghai',locale});c.setDefaultTimeout(7000);const token=await login(c,f.users[who].username,locale);await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:locale});const p=await c.newPage();return{c,p,token};}
async function open(p){await p.goto(origin+'/review');await ready(p);await expect(p.locator('.range-editor')).toBeVisible();}
async function dates(p,start,end){await p.locator('#review-start').fill(start);await p.locator('#review-end').fill(end);}
const state=(p,s)=>expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview',s);
async function metrics(p){return p.evaluate(()=>{const rect=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return{form:rect('.range-editor > .card'),count:rect('.range-count'),start:rect('#review-start'),end:rect('#review-end'),font:getComputedStyle(document.querySelector('.count-number')).fontSize,gap:getComputedStyle(document.querySelector('.range-editor')).gap,overflow:document.documentElement.scrollWidth>innerWidth};});}
for(const[type,engine,widths]of[[chromium,'chromium',[320,390,560,561,720,900,901,960,1024,1079,1080,1081,1280,1440]],[webkit,'webkit',[901,1080,1081]]]){
 const b=await type.launch();
 try{
 for(const locale of['en-US','zh-CN']){
  const{c,p}=await setup(b,'empty',locale);const proto=await c.newPage();
  for(const width of widths){
   await p.setViewportSize({width,height:1000});await proto.setViewportSize({width,height:1000});await open(p);await state(p,'empty');
   for(const[status,protoState]of[['empty','empty'],['invalid','date-missing'],['failed','preview-error']]){
    if(status==='invalid'){await p.locator('#review-start').fill('');await state(p,'invalid');}
    if(status==='failed'){await p.route(preview,r=>r.fulfill(problem));await dates(p,'2026-07-15','2026-07-15');await state(p,'failed');}
    await proto.goto(design+'/prototype/?page=PAGE-007&role=learner&state='+protoState+'&locale='+locale);
    await proto.addStyleTag({content:'.prototype-tools{display:none!important}'});
    const actual=await metrics(p),approved=await metrics(proto),key=[engine,locale,width,status].join(' ');
    out.record(key+' dates equal 44',[actual.start.w===actual.end.w,actual.start.h,actual.end.h],[true,44,44]);
    out.record(key+' geometry against live prototype',actual,approved);
    out.record(key+' no horizontal overflow',actual.overflow,false);
    out.record(key+' layout contract',width<=1080?{stack:actual.count.y>=actual.form.b+23,gap:actual.gap,min:actual.count.h>=96,font:actual.font}:{width:actual.count.w,row:actual.form.y===actual.count.y,gap:actual.gap},width<=1080?{stack:true,gap:'24px',min:true,font:'40px'}:{width:320,row:true,gap:'24px'});
    if(status==='empty')out.record(key+' exact empty copy',await p.locator('.range-feedback').innerText(),await proto.locator('.range-feedback').innerText());
    if(status==='invalid')out.record(key+' exact field error',await p.locator('#range-date-error').innerText(),await proto.locator('#range-date-error').innerText());
    if(status==='failed'){out.record(key+' exact failure copy',await p.locator('.range-feedback').innerText(),await proto.locator('.range-feedback').innerText());await p.unroute(preview);}
    if([390,901,1080,1081,1440].includes(width))await p.screenshot({path:join(dir,'screenshots','range-'+key.replaceAll(' ','-')+'.png'),fullPage:true});
   }
  }
  await c.close();console.log('range matrix '+engine+' '+locale+' complete');
 }
 }catch(e){out.error(engine+' matrix',e);}finally{await b.close();}
}
out.save();

