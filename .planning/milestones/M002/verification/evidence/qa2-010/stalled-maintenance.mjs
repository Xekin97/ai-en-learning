import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {expect,start,stop,login,ok,sql,dump,randomUUID,env,work} from './harness.mjs';
const browser=await start(),admin=await browser.newContext(),results=[];let lock;
try{
 await login(admin);
 lock=spawn('/opt/homebrew/opt/postgresql@18/bin/psql',[env.APP_DATABASE_URL,'-X','-q','-A','-t'],{stdio:['pipe','pipe','pipe']});
 await new Promise((resolve,reject)=>{let seen='';lock.stdout.on('data',b=>{seen+=b;if(seen.includes('QA_LOCK_READY'))resolve();});lock.once('error',reject);lock.stdin.write("SELECT pg_advisory_lock(209002);SELECT 'QA_LOCK_READY';\n");});
 const event=randomUUID(),before=readFileSync(work+'/backend.log','utf8').length;
 sql(`UPDATE wordweave.growth_settings SET analytics_aggregated_through=clock_timestamp()-interval '5 minutes',analytics_updated_at=clock_timestamp()-interval '5 minutes' WHERE singleton;INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,source_kind) SELECT 'qa10-stalled:${event}','page_view',t,(t AT TIME ZONE 'UTC'+interval '4 hours')::date,'browser' FROM (SELECT clock_timestamp()-interval '91 days' t) x`);
 console.log('WAIT actual scheduled cleanup guard while aggregation lock is held');
 await expect.poll(()=>readFileSync(work+'/backend.log','utf8').slice(before).includes('analytics_cleanup_failed'),{timeout:75000,intervals:[1000,2000,3000]}).toBe(true);
 const remaining=Number(sql(`SELECT count(*) FROM wordweave.analytics_events WHERE event_key='qa10-stalled:${event}'`));expect(remaining).toBe(1);
 const day=sql("SELECT (clock_timestamp() AT TIME ZONE 'UTC'+interval '4 hours')::date-91"),response=await ok(admin,`/admin/analytics/traffic?start_day=${day}&end_day=${day}`);
 expect(response.freshness).toBe('delayed');expect(response.uv).toMatchObject({value:null,status:'unavailable',reason:'detail_expired'});
 const diagnostic=readFileSync(work+'/backend.log','utf8').slice(before).split('\n').filter(l=>l.includes('analytics_cleanup_failed')).map(l=>JSON.parse(l));
 expect(diagnostic.length).toBeGreaterThan(0);expect(diagnostic.every(x=>x.reason==='checkpoint_or_database_unavailable')).toBe(true);
 results.push({id:'A11',name:'Scheduled cleanup refuses to purge ahead of stale aggregation, logs a bounded failure and query still hides expired UV',result:'PASS',remainingExpiredRow:remaining,freshness:response.freshness,uv:response.uv,diagnostic});
}catch(e){results.push({id:'A11',result:'FAIL',error:String(e)});}
finally{if(lock){const done=new Promise(r=>lock.once('exit',r));lock.stdin.end();await done;}dump('stalled-results.json',{results,localProviderCalls:0,realProviderCalls:0});console.log(JSON.stringify(results,null,2));await stop(browser);if(results.some(x=>x.result==='FAIL'))process.exitCode=1;}
