const {chromium}=require('@playwright/test');
(async()=>{
const b=await chromium.launch(); const a=await b.newPage(),d=await b.newPage();const results=[];
await d.addInitScript(()=>localStorage.clear());
for(const locale of ['zh-CN','en-US']){await a.context().clearCookies();await a.context().addCookies([{name:'wordweave_ui_locale',value:locale,url:'http://127.0.0.1:3300'}]);
for(const width of [320,390,720,1280,1440]){
await a.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});
await a.goto('http://127.0.0.1:3300/review');await a.locator('.auth-gate h1').waitFor();
await d.goto('http://127.0.0.1:3310/prototype/?page=PAGE-007&role=visitor&locale='+locale);await d.locator('.auth-gate h1').waitFor();
const read=async(p,selector)=>p.locator(selector).evaluate(card=>{const s=getComputedStyle(card),r=card.getBoundingClientRect(),h=card.querySelector('h1'),hs=getComputedStyle(h);return{copy:card.innerText,width:r.width,x:r.x,y:r.y,padding:s.padding,gap:s.gap,borderRadius:s.borderRadius,background:s.backgroundColor,titleSize:hs.fontSize,titleWeight:hs.fontWeight,titleFamily:hs.fontFamily,descriptionColor:getComputedStyle(card.querySelector('h1+p')).color}});
const actual=await read(a,'.auth-gate'),expected=await read(d,'.auth-gate .empty-state'),diff=[];
for(const [key,value] of Object.entries(expected))if(actual[key]!==value)diff.push({key,actual:actual[key],expected:value});
if(width===390||width===1440){const base='../.planning/milestones/M001/implementation/evidence/cr029-cr033/';await a.screenshot({path:base+'guest-app-'+locale+'-'+width+'.png'});await d.screenshot({path:base+'guest-design-'+locale+'-'+width+'.png'});}
results.push({locale,width,result:diff.length?'FAIL':'PASS',diff,actual,expected});
}}
console.log(JSON.stringify({comparison:'visitor Review gate same locale and viewport',results}));await b.close();
})();
