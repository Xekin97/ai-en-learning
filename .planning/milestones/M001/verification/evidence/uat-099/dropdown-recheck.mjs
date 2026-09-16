import {join} from 'node:path';
import {chromium,expect} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {dir,origin,output,data,privateData,same,assertAuthority} from './helpers.mjs';
assertAuthority();
const before=data(),privateBefore=privateData(),checks=[],blocked=[];
const record=(id,actual,expected=true)=>checks.push({id,status:same(actual,expected)?'PASS':'FAIL',actual,expected});
const browser=await chromium.launch(),context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:1000}});
await context.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);
await context.route('**/api/v1/**',async r=>{if(r.request().method()!=='GET'){blocked.push(new URL(r.request().url()).pathname);await r.abort();}else await r.continue();});
try{
 const p=await context.newPage();await p.goto(origin+'/create');await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 const reply=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/vocabulary/search'&&new URL(r.url()).searchParams.get('q')==='vulnerable');
 await p.locator('#word-search').fill('vulnerable');const response=await reply;record('Vocabulary response completed before content assertion',response.status(),200);
 await expect(p.locator('#word-search-results .search-result').first()).toContainText('vulnerable');
 record('Live vocabulary dropdown rendered',await p.locator('#word-search-results .search-result').allTextContents().then(a=>a.some(s=>s.trim().startsWith('vulnerable'))));
 record('Dropdown does not enter layout flow',await p.locator('#word-search-results').evaluate(e=>getComputedStyle(e).position),'absolute');
 await p.screenshot({path:join(dir,'dropdown-recheck-1440.png'),fullPage:true});
}catch(e){checks.push({id:'Targeted dropdown recheck',status:'ERROR',error:e.message});}
finally{
 await context.close();await browser.close();record('No mutation attempts',blocked,[]);record('Scoped data unchanged',same(data(),before));record('Password credentials and sessions unchanged',same(privateData(),privateBefore));
 const counts={PASS:0,FAIL:0,ERROR:0};for(const c of checks)counts[c.status]++;
 output('dropdown-recheck-results.json',{date:new Date().toISOString(),counts,checks,supersedesOnly:'smoke-results.json / Live vocabulary dropdown rendered',methodCorrection:'Await the exact successful search response and the rendered option, not just the loading listbox container. create.vue displays listbox during loading; original post-assertion screenshot already contains both results.',productionCodeChanged:false,realModelCalls:0});console.log(JSON.stringify(counts));if(counts.FAIL||counts.ERROR)process.exitCode=1;
}
