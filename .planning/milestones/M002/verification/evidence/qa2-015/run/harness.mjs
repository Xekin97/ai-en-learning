import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {execFileSync} from 'node:child_process';
export {randomUUID} from 'node:crypto';
export const {chromium,firefox,webkit,expect}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
export const work=readFileSync(process.env.QA_TITLE_STACK_FILE,'utf8').trim(),env=JSON.parse(readFileSync(work+'/env.json'));
export const origin='http://127.0.0.1:3301',out=new URL('./',import.meta.url);
if(env.APP_DATABASE_URL!=='postgres://fe_test@127.0.0.1:63541/wordweave_qa15_title_ui?sslmode=disable'||env.OPENROUTER_BASE_URL!=='http://127.0.0.1:38082')throw Error('Disposable stack required');
const copy=JSON.parse(readFileSync('.planning/milestones/M002/design/copy.json'));export const t=k=>copy.static['en.'+k]??copy.templates['en.'+k];
export const dump=(name,value)=>writeFileSync(new URL(name,out),JSON.stringify(value,null,2));
export const sql=query=>execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql',[env.APP_DATABASE_URL,'-v','ON_ERROR_STOP=1','-X','-A','-t','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export const proxy=createServer((req,res)=>{const up=httpRequest({hostname:'127.0.0.1',port:req.url.startsWith('/api/v1')?38081:3331,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-host':'127.0.0.1:3301','x-forwarded-proto':'http'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});up.on('error',()=>{res.writeHead(502);res.end()});req.pipe(up)});
export async function start(engine=chromium){await new Promise((r,j)=>{proxy.once('error',j);proxy.listen(3301,'127.0.0.1',r)});try{return await engine.launch();}catch(e){await new Promise(r=>proxy.close(r));throw e;}}
export async function call(c,path,method='GET',data,idem){const headers={origin,'sec-fetch-site':'same-origin'};if(method!=='GET'){headers['x-csrf-token']=(await(await c.request.get(origin+'/api/v1/bootstrap')).json()).data.csrf_token;if(idem)headers['Idempotency-Key']=idem;}const r=await c.request.fetch(origin+'/api/v1'+path,{method,data,headers});return{status:r.status(),body:r.status()===204?null:await r.json()};}
export async function ok(...args){const r=await call(...args);if(r.status<200||r.status>=300)throw Error(args[1]+' '+r.status+' '+JSON.stringify(r.body));return r.body?.data;}
export const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
export async function login(c){await ok(c,'/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});}
export function instrument(page,events,action){page.setDefaultTimeout(12000);page.on('pageerror',e=>events.push({kind:'pageerror',url:page.url(),action:action(),text:e.message}));page.on('console',m=>{if(['error','warning'].includes(m.type()))events.push({kind:m.type(),url:page.url(),action:action(),text:m.text()});});}
export async function stop(browser){await browser?.close();if(proxy.listening)await new Promise(r=>proxy.close(r));}
