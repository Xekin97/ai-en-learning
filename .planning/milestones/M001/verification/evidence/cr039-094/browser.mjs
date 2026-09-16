import {chromium,webkit,expect} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {dir,origin,output} from './setup.mjs';
import {client,candidate,enqueue,check,checks,stats,cleanse} from './suite.mjs';
const input=JSON.parse(readFileSync(join(dir,'browser-input.json')));let browser;
try{
 const auth=await client(input.username,true);const storage=await auth.r.storageState();
 browser=await chromium.launch({headless:true});const context=await browser.newContext({storageState:storage,viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return ['127.0.0.1','localhost'].includes(host)?route.continue():route.abort();});
 await page.goto(origin+'/create');await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 const settings=page.getByRole('complementary',{name:'Story settings'});
 for(const entry of ['vulnerable','coherent']){await page.locator('#word-search').fill(entry);await page.getByRole('option',{name:entry,exact:true}).click();}
 await settings.getByRole('button',{name:/QA094 synthetic/}).click();await settings.getByRole('button',{name:/^English/}).click();await settings.getByRole('button',{name:/^Discussion/}).click();await settings.getByRole('button',{name:'Brief',exact:true}).click();
 const c=candidate(['vulnerable','coherent'],['vulnerability','coherent']);c.passage='Vulnerability in a coherent plan can be discussed openly. Vulnerable residents ask for coherent decisions to reduce vulnerabilities.'+c.passage;
 c.targets[0].hint_phrase='vulnerable communities facing vulnerability and vulnerabilities';c.targets[0].hint_forms=['vulnerable'];
 await enqueue({id:'browser-v3',candidate:c,escapeEmoji:true});const before=(await stats()).calls.length;
 const streamPromise=page.waitForResponse(r=>r.url().endsWith('/api/v1/generations/stream'));
 await page.getByRole('button',{name:'Create story',exact:true}).click();const sr=await streamPromise;
 await expect(page.getByRole('button',{name:'Save to library',exact:true})).toBeVisible();
 // Chromium may discard the SSE response body after the app closes its reader.
 // Observe actual rendered resources; read the immutable result after normal save.
 check('C39-17/browser-generation-strict-dto',sr.status()===200&&await page.locator('.resource-word').count()===2,{rendered_words:await page.locator('.resource-word').count(),single_call:(await stats()).calls.length===before+1});
 const saveResponse=page.waitForResponse(r=>/\/generations\/[^/]+\/save$/.test(r.url()));await page.getByRole('button',{name:'Save to library',exact:true}).click();const batch=(await(await saveResponse).json()).data.batch_id;
 const detail=await auth.api('GET','/api/v1/me/batches/'+batch);const result=detail.body.data.batch;
 await page.goto(origin+'/library/'+batch);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');await expect(page.locator('.resource-word')).toHaveCount(2);
 check('C39-17/browser-ssr-batch-dto',(await page.locator('.reading-passage').textContent()).includes('vulnerabilities'),{rendered:true});
 const session=await auth.api('POST','/api/v1/me/review-sessions',{mode:'single_batch',batch_id:batch});const sid=session.body.data.session_id;
 await page.goto(origin+'/review/'+sid+'?batch='+batch);await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
 for(let i=0;i<2;i++){
  await expect(page.locator('#review-spelling-answer')).toBeVisible();const meaning=await page.locator('.review-prompt').innerText();const target=result.targets.find(t=>t.contextual_meaning===meaning.trim());if(!target)throw Error('No spelling oracle');
  await page.getByRole('checkbox',{name:'Show a hint'}).check();await expect(page.locator('#review-hint .blank')).toHaveCount(target.hint_blanks.length);
  check('C39-14/browser-hints-'+target.entry,(await page.locator('#review-hint').textContent()).includes('••••••'),{blank_count:target.hint_blanks.length});
  await page.locator('#review-spelling-answer').fill(target.entry);const advance=page.waitForResponse(r=>r.url().includes('/review-attempts/')&&r.url().endsWith('/actions'));await page.getByRole('button',{name:'Check',exact:true}).click();await advance;
 }
 const expected=result.targets.flatMap(t=>t.occurrences.map(o=>({...o,entry:t.entry}))).sort((a,b)=>a.start-b.start);
 await expect(page.locator('.cloze-input')).toHaveCount(expected.length);
 const classes=await page.locator('.cloze-slot').evaluateAll(nodes=>nodes.map(n=>n.className));const byEntry={};let grouped=true;expected.forEach((o,i)=>{const cls=classes[i];if(byEntry[o.entry]&&byEntry[o.entry]!==cls)grouped=false;byEntry[o.entry]=cls;});
 check('C39-14/browser-anonymous-groups',grouped&&new Set(Object.values(byEntry)).size===2,{groups:Object.values(byEntry),gaps:expected.length});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:join(dir,`cloze-${width}.png`),fullPage:true});const boxes=await page.locator('.cloze-input').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1)overlaps.push([i,j]);}check('C39-14/browser-no-overlap-'+width,overlaps.length===0,{width,overlaps,boxes});}
 // Wrong answers preserve current grouping, then exact individual surfaces finish.
 for(let i=0;i<expected.length;i++)await page.locator('.cloze-input').nth(i).fill('wrong');
 let response=page.waitForResponse(r=>r.url().includes('/review-attempts/')&&r.url().endsWith('/actions'));await page.getByRole('button',{name:'Finish',exact:true}).click();await response;await expect(page.getByRole('alert')).toBeVisible();
 const afterClasses=await page.locator('.cloze-slot').evaluateAll(nodes=>nodes.map(n=>n.className.replace(/\s+is-(incorrect|group-active|group-muted)/g,'')));
 check('C39-14/browser-retry-stable',afterClasses.every((c,i)=>c===classes[i]),{stable:afterClasses.every((c,i)=>c===classes[i])});
 for(let i=0;i<expected.length;i++)await page.locator('.cloze-input').nth(i).fill(expected[i].surface);
 response=page.waitForResponse(r=>r.url().includes('/review-attempts/')&&r.url().endsWith('/actions'));await page.getByRole('button',{name:'Finish',exact:true}).click();const final=await(await response).json();
 check('C39-14/browser-complete',final.data?.outcome==='session_completed'&&final.data.batch_result.successful,{outcome:final.data?.outcome,successful:final.data?.batch_result?.successful});
 await expect(page.getByText('This story is complete',{exact:true})).toBeVisible();await page.screenshot({path:join(dir,'cloze-completed.png'),fullPage:true});
 check('C39-17/browser-no-runtime-errors',errors.length===0,{errors});output('browser-observations.json',{result,classes,completion:cleanse(final),errors});await auth.r.dispose();await context.close();
}catch(e){checks.push({id:'browser-harness',status:'ERROR',error:String(e),stack:e.stack});console.error(e);process.exitCode=1;}
finally{await browser?.close();output('browser-results.json',{date:new Date().toISOString(),engine:'Chromium native macOS',counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0}),checks});console.log(JSON.stringify({counts:checks.reduce((a,c)=>(a[c.status]++,a),{PASS:0,FAIL:0,ERROR:0})}));}
