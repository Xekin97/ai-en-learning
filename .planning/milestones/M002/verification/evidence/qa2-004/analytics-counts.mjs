import {readFileSync} from 'node:fs';
import {expect,start,stop,login,ok,sql,out,dump} from './harness.mjs';
const browser=await start(),admin=await browser.newContext(),results=[];let details;
try{
 await login(admin);const f=JSON.parse(readFileSync(new URL('analytics-fixture.json',out))),one=await ok(admin,'/admin/analytics/traffic?start_day='+f.day+'&end_day='+f.day),range=await ok(admin,'/admin/analytics/traffic?start_day='+f.day+'&end_day='+f.tomorrow);
 details={one,range,expected:{oneDay:{pv:4,uv:3,bounced:1,endedSessions:3},twoDays:{pv:5,uv:3,sumDailyUV:4,bounced:2,endedSessions:4},channels:{utm:2,referrer:1,direct_unknown:2}},rationale:'Channel is assigned per traffic-session entry. The second-day session sent no source, so its page view is direct_unknown. Browser UV is still deduplicated across sessions/days.'};
 expect(one.pv.value).toBe(4);expect(one.uv.value).toBe(3);expect(one.bounce_rate).toMatchObject({numerator:1,denominator:3,status:'ready'});expect(one.bounce_rate.value).toBeCloseTo(1/3);expect(range.pv.value).toBe(5);expect(range.uv.value).toBe(3);expect(range.series.reduce((n,x)=>n+x.uv.value,0)).toBe(4);expect(range.bounce_rate).toMatchObject({value:0.5,numerator:2,denominator:4});expect(Object.fromEntries(range.channels.map(x=>[x.source_type,x.pv.value]))).toEqual(details.expected.channels);expect(range.clarity).toEqual({available:false,url:null});expect(Number(sql(`SELECT count(*) FROM wordweave.analytics_events WHERE event_key LIKE '%:${f.events[0].event_id}'`))).toBe(1);
 results.push({id:'T11',name:'Retry idempotency, per-browser range UV, ended-session bounce and per-session entry channels match independently computed totals',result:'PASS'});
}catch(e){results.push({id:'T11',result:'FAIL',error:String(e)});}
finally{dump('analytics-counts-results.json',{results,details});console.log(JSON.stringify(results,null,2));await stop(browser);if(results.some(r=>r.result==='FAIL'))process.exitCode=1;}
