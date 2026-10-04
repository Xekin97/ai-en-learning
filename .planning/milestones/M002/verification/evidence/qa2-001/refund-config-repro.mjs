import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';
const {request}=createRequire(process.cwd()+'/frontend/package.json')('@playwright/test');
const work=readFileSync('/tmp/wordweave-fe-m002-current','utf8'),env=JSON.parse(readFileSync(work+'/env.json'));
if(!env.APP_DATABASE_URL.includes('63541/wordweave_fe_m002'))throw Error('Private test DB required');
const c=await request.newContext({baseURL:'http://127.0.0.1:38081'});
async function api(path,method='GET',data){let headers={};if(method!=='GET'){const b=await (await c.get('/api/v1/bootstrap')).json();headers={origin:env.PUBLIC_ORIGIN,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token}}return c.fetch('/api/v1'+path,{method,data,headers})}
try{
 let r=await api('/auth/login','POST',{username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});if(r.status()!==200)throw Error('Admin setup failed');
 const items=(await (await api('/admin/growth/items')).json()).data.items;
 const def=items.find(x=>x.kind==='model_trial'&&x.effect.trial_seconds===518400);
 const before=(await (await api('/admin/growth/items/'+def.id)).json()).data;
 const v=before.item,payload={kind:v.kind,name:v.name,description:v.description,exchange_price:v.exchange_price,activation_ttl_seconds:v.activation_ttl_seconds,effect:{...v.effect,retirement_points:'35'},expected_revision:before.revision};
 r=await api('/admin/growth/items/'+def.id,'PUT',payload);
 const status=r.status(),problem=await r.json(),after=(await (await api('/admin/growth/items/'+def.id)).json()).data;
 const result={method:'PUT',path:'/api/v1/admin/growth/items/'+def.id,changedFields:['effect.retirement_points'],beforePoints:before.item.effect.retirement_points,requestedPoints:'35',modelIdsUnchanged:JSON.stringify(payload.effect.model_ids)===JSON.stringify(before.item.effect.model_ids),status,problem,afterPoints:after.item.effect.retirement_points,revisionUnchanged:before.revision===after.revision};
 writeFileSync(new URL('refund-config-repro.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await c.dispose()}
