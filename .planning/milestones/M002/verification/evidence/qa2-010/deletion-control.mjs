import {readFileSync} from 'node:fs';
import {expect,start,stop,ok,call,sql,dump,env} from './harness.mjs';
const browser=await start(),shared=await browser.newContext(),owner=await browser.newContext(),results=[];
const f=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url))),uid=f.uid;
const scalar=q=>Number(sql(q)),rows=q=>JSON.parse(sql(`SELECT coalesce(json_agg(x),'[]') FROM (${q}) x`));
const fingerprint=()=>rows(`SELECT day,metric,dimension_key,numerator,denominator,value,maturity_state FROM wordweave.analytics_daily WHERE day IN('${f.archiveDays[0]}','${f.archiveDays[1]}','${f.archivedCohort}') AND metric NOT LIKE 'review_cohort_%' ORDER BY day,metric,dimension_key`);
const event=async c=>{expect((await call(c,'/analytics/events','POST',{event_id:crypto.randomUUID(),kind:'page_view',page:'PAGE-205'})).status).toBe(204);};
try{
 const username=sql(`SELECT username FROM wordweave.accounts WHERE id='${uid}'`);
 for(const c of [shared,owner])await ok(c,'/auth/login','POST',{username,password:env.ADMIN_PASSWORD,browser_ui_locale:'en-US'});
 await event(shared);
 const linked=rows(`SELECT encode(t.browser_key_hash,'hex') hash FROM wordweave.traffic_sessions t JOIN wordweave.traffic_session_accounts s ON s.session_id=t.id WHERE s.owner_id='${uid}'`);expect(linked.length).toBe(3);
 const before=fingerprint();await ok(shared,'/auth/logout','POST',{});
 const other=(await ok(shared,'/auth/register','POST',{username:'qa10_shared_'+Date.now(),password:env.ADMIN_PASSWORD,password_confirmation:env.ADMIN_PASSWORD,ui_locale:'en-US'})).actor.id;
 await event(shared);await ok(shared,'/auth/logout','POST',{});await event(shared);
 expect(scalar(`SELECT count(*) FROM wordweave.analytics_events WHERE owner_id='${other}' AND event_kind='registered' AND browser_key_hash IS NOT NULL`)).toBe(1);
 const response=await call(owner,'/me/account','DELETE',{current_password:env.ADMIN_PASSWORD,confirmed:true});expect(response.status).toBe(204);
 const counts={};for(const table of ['analytics_events','analytics_accounts','traffic_session_accounts','review_attempts','user_learning_days']){counts[table]=scalar(`SELECT count(*) FROM wordweave.${table} WHERE owner_id='${uid}'`);expect(counts[table]).toBe(0);}
 for(const {hash} of linked){expect(scalar(`SELECT count(*) FROM wordweave.analytics_events WHERE browser_key_hash=decode('${hash}','hex')`)).toBe(0);expect(scalar(`SELECT count(*) FROM wordweave.traffic_sessions WHERE browser_key_hash=decode('${hash}','hex')`)).toBe(0);}
 const otherFacts=rows(`SELECT event_kind,browser_key_hash IS NULL detached_browser,traffic_session_id IS NULL detached_session FROM wordweave.analytics_events WHERE owner_id='${other}'`);expect(otherFacts).toEqual([{event_kind:'registered',detached_browser:true,detached_session:true}]);
 expect(scalar(`SELECT count(*) FROM wordweave.accounts WHERE id='${other}'`)).toBe(1);expect(fingerprint()).toEqual(before);
 results.push({id:'A09',result:'PASS',status:204,counts,linkedBrowserChainsRemoved:linked.length,otherFacts,anonymousRowsUnchanged:before.length,note:'Original A09 stopped before deletion because its synthetic username exceeded 32 characters; corrected fixture uses a shorter name. No product changes or relaxed deletion assertions.'});
}catch(e){results.push({id:'A09',result:'FAIL',error:String(e)});}
finally{dump('deletion-control-results.json',{results,localProviderCalls:0,realProviderCalls:0});console.log(JSON.stringify(results,null,2));await stop(browser);if(results.some(x=>x.result==='FAIL'))process.exitCode=1;}
