import{readFileSync}from'node:fs';import{join}from'node:path';import{chromium,expect,dir,origin,ready,login,api,recorder,sql,password}from'./lib.mjs';
const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),out=recorder('review-regression'),b=await chromium.launch(),c=await b.newContext({viewport:{width:390,height:844}});c.setDefaultTimeout(8000);
try{
 const token=await login(c,'qa078_learner');await api(c,'PUT','/api/v1/me/ui-locale',token,{ui_locale:'en-US'});const p=await c.newPage();
 for(const mode of['single_batch','range']){
 const create=await api(c,'POST','/api/v1/me/review-sessions',token,mode==='single_batch'?{mode,batch_id:f.batches[0].id}:{mode,start_date:'2026-08-10',end_date:'2026-08-10',timezone:'UTC'});expect([200,201]).toContain(create.status);
 const id=create.body.data.session_id;await p.goto(origin+'/review/'+id+(mode==='single_batch'?'?batch='+f.batches[0].id:''));await ready(p);
 await expect(p.locator('#review-spelling-answer')).toBeVisible();await p.locator('.hint-row input').check();out.record(mode+' hints blank all occurrences',await p.locator('.hint-phrase .blank').count(),2);out.record(mode+' hints no answer',/learn/i.test(await p.locator('.hint-phrase').innerText()),false);
 await p.locator('#review-spelling-answer').fill('learn');await p.locator('.review-card-actions .button-primary').click();await expect(p.locator('.cloze-input')).toHaveCount(3);
 const classes=await p.locator('.cloze-slot').evaluateAll(ns=>ns.map(n=>n.className));out.record(mode+' same lemma grouping',new Set(classes).size,1);
 out.record(mode+' cloze no original spelling',/learn/i.test(await p.locator('.review-cloze-passage').innerText()),false);
 const boxes=await p.locator('.cloze-input').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
 out.record(mode+' no overlapping inputs',boxes.every((a,i)=>boxes.every((z,j)=>i===j||a.x+a.w<=z.x||z.x+z.w<=a.x||a.y+a.h<=z.y||z.y+z.h<=a.y)),true);
 await p.locator('.cloze-input').nth(0).fill('wrong');await p.locator('.review-card-actions .button-primary').click();await expect(p.locator('.feedback-error')).toBeVisible();
 out.record(mode+' group stable after wrong',await p.locator('.cloze-slot').evaluateAll(ns=>ns.map(n=>n.className.replace(' is-incorrect',''))),classes);
 for(const[i,value]of ['learn','learned','learning'].entries())await p.locator('.cloze-input').nth(i).fill(value);
 await p.screenshot({path:join(dir,'screenshots','cloze-'+mode+'.png')});
 await p.locator('.review-card-actions .button-primary').click();await expect(p.locator('.review-summary-card')).toBeVisible();
 out.record(mode+' summary labels',(await p.locator('.review-summary-card .stat-label').allInnerTexts()),['Completed','Mastered','Review again']);
 out.record(mode+' summary scope',await p.locator('.review-summary-card .eyebrow').innerText(),mode==='single_batch'?'STORY REVIEW COMPLETE':'DATE REVIEW COMPLETE');
 out.record(mode+' summary restart',await p.locator('.review-summary-actions button').innerText(),mode==='single_batch'?'Review this story again':'Review again');
 out.record(mode+' summary stats',await p.locator('.review-summary-card .stat-value').allInnerTexts(),['1','1','0']);
 await p.screenshot({path:join(dir,'screenshots','summary-'+mode+'.png')});
 }
 await c.close();
 const guest=await b.newContext();await guest.addCookies([{name:'wordweave_ui_locale',value:'en-US',url:origin}]);const p2=await guest.newPage();let newSessions=0;p2.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/v1/me/review-sessions')newSessions++;});
 const before=sql('SELECT count(*) FROM wordweave.review_sessions');
 await p2.goto(origin+'/login?redirect=%2Freview');await ready(p2);await p2.locator('input[autocomplete=username]').fill('qa078_empty');await p2.locator('input[type=password]').fill(password);await p2.locator('form button[type=submit]').click();await expect(p2).toHaveURL(origin+'/review');
 out.record('ordinary auth no auto review POST',newSessions,0);out.record('ordinary auth no DB session creation',sql('SELECT count(*) FROM wordweave.review_sessions'),before);await guest.close();
}catch(e){out.error('review execution',e);}finally{await b.close();out.save();}
