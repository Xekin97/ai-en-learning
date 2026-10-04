import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {randomUUID} from 'node:crypto';
const require=createRequire(process.cwd()+'/frontend/package.json'),{chromium,expect}=require('@playwright/test');
const copy=JSON.parse(readFileSync(process.cwd()+'/.planning/milestones/M002/design/copy.json'));const t=k=>copy.static['en.'+k]??copy.templates['en.'+k];
const work=readFileSync('/tmp/wordweave-fe-m002-current','utf8'),env=JSON.parse(readFileSync(work+'/env.json'));
if(!env.APP_DATABASE_URL.includes('63541/wordweave_fe_m002')||env.OPENROUTER_BASE_URL!=='http://127.0.0.1:38082')throw Error('Isolated stack required');
const origin='http://127.0.0.1:3301',out=new URL('./',import.meta.url),results=[];
const proxy=createServer((req,res)=>{const up=httpRequest({hostname:'127.0.0.1',port:req.url.startsWith('/api/v1')?38081:3331,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-host':'127.0.0.1:3301','x-forwarded-proto':'http'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});up.on('error',()=>{res.writeHead(502);res.end()});req.pipe(up)});
await new Promise(r=>proxy.listen(3301,'127.0.0.1',r));
const browser=await chromium.launch(),admin=await browser.newContext(),user=await browser.newContext();
async function call(c,path,method='GET',data,idem){
 const headers={origin,'sec-fetch-site':'same-origin'};
 if(method!=='GET'){headers['x-csrf-token']=(await (await c.request.get(origin+'/api/v1/bootstrap')).json()).data.csrf_token;if(idem)headers['Idempotency-Key']=idem;}
 const r=await c.request.fetch(origin+'/api/v1'+path,{method,data,headers});return {status:r.status(),body:r.status()===204?null:await r.json()};
}
async function ok(...args){const r=await call(...args);if(r.status<200||r.status>=300)throw Error(args[1]+' '+r.status+' '+JSON.stringify(r.body));return r.body?.data;}
async function check(id,name,fn){try{await fn();results.push({id,name,result:'PASS'})}catch(e){results.push({id,name,result:'FAIL',error:String(e)})}console.log(id,results.at(-1).result)}
try{
 const {execFileSync}=await import('node:child_process');await ok(admin,'/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 const d=(await ok(admin,'/admin/growth/items')).items.find(i=>i.name.en_US==='Mixed model card'),id=d.effect.model_ids.find(id=>id===JSON.parse(readFileSync(new URL('S08-paginated-reference.json',out))).beforeModels[0]);if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Wrong fixture ID');execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql',[env.APP_DATABASE_URL,'-v','ON_ERROR_STOP=1','-c',`UPDATE wordweave.ai_models SET enabled=true WHERE id='${id}' AND retired_at IS NULL`],{stdio:'pipe'});
 await check('S06-live','Mixed enabled plus retired models remain selected and persisted',async()=>{const p=await admin.newPage();await p.goto(origin+'/admin/growth');await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await p.locator('tr').filter({hasText:'Mixed model card'}).getByRole('button',{name:t('edit'),exact:true}).click();const dialog=p.locator('dialog[open]');expect((await dialog.getByRole('listbox',{name:t('model'),exact:true}).evaluate(e=>Array.from(e.selectedOptions,o=>o.value))).sort()).toEqual([...d.effect.model_ids].sort());await dialog.getByLabel(t('retirementpoints'),{exact:true}).fill('46');await dialog.getByRole('button',{name:t('save'),exact:true}).click();await expect(dialog).toHaveCount(0);const current=(await ok(admin,'/admin/growth/items/'+d.id)).item;expect(current.effect.model_ids).toEqual(d.effect.model_ids);expect(current.effect.retirement_points).toBe('46');const models=await ok(admin,'/admin/models');expect(models.items.find(m=>m.id===id).enabled).toBe(true);});
}catch(e){results.push({id:'setup',result:'FAIL',error:String(e)})}
finally{writeFileSync(new URL('mixed-live-results.json',out),JSON.stringify({results},null,2));await browser.close();await new Promise(r=>proxy.close(r));if(results.some(r=>r.result==='FAIL'))process.exitCode=1}
