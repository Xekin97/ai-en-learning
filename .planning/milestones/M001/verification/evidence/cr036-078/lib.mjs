import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';import{fileURLToPath}from'node:url';
import{writeFileSync}from'node:fs';
export {chromium,webkit,expect,request} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
export const dir=dirname(fileURLToPath(import.meta.url)),origin='http://127.0.0.1:6101',design='http://127.0.0.1:6010';
export const password='Qa078SyntheticOnly!';
export const sql=s=>execFileSync('docker',['exec','-i','ww-qa-078-db','psql','-U','postgres','-d','qa','-X','-A','-t','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8'}).trim();
export const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
export async function login(context,username,locale='en-US'){
 const b=await(await context.request.get(origin+'/api/v1/bootstrap')).json();
 const response=await context.request.post(origin+'/api/v1/auth/login',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token},data:{username,password,browser_ui_locale:locale}});
 if(response.status()!==200)throw Error('Login '+username+' '+response.status());
 await context.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);
 return(await response.json()).data.csrf_token;
}
export async function api(context,method,path,csrf,data){
 const r=await context.request.fetch(origin+path,{method,headers:{origin,'sec-fetch-site':'same-origin',...(csrf?{'x-csrf-token':csrf}:{})},...(data===undefined?{}:{data})});
 return{status:r.status(),headers:r.headers(),body:r.status()===204?null:await r.json()};
}
export function recorder(name){
 const checks=[];return{checks,record:(id,actual,expected)=>checks.push({id,status:JSON.stringify(actual)===JSON.stringify(expected)?'PASS':'FAIL',actual,expected}),error:(id,error)=>checks.push({id,status:'ERROR',error:String(error)}),save:()=>{const counts={PASS:0,FAIL:0,ERROR:0};for(const c of checks)counts[c.status]++;writeFileSync(join(dir,name+'-results.json'),JSON.stringify({date:new Date().toISOString(),agent:'qa-quinn',counts,checks},null,2),{flag:'wx'});if(counts.FAIL||counts.ERROR)process.exitCode=1;console.log(JSON.stringify({name,counts,failures:checks.filter(c=>c.status!=='PASS')}));}};
}
