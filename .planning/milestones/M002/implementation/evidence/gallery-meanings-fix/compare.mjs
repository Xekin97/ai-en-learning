import {chromium,expect} from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const evidence=new URL('./',import.meta.url);
const fixtures=JSON.parse(await readFile(new URL('../../../design/prototype/fixtures.json',import.meta.url),'utf8'));
let payload=JSON.parse(await readFile(new URL('public-presets.json',evidence),'utf8'));
const origin=process.env.GALLERY_ORIGIN || 'http://127.0.0.1:3324';
const run=origin.endsWith('3302')?'delivered':'fixed';
{
 payload=await(await fetch('http://127.0.0.1:3302/api/v1/presets')).json();
 expect(payload.meta.has_more).toBe(false);
 await writeFile(new URL(`${run}-public-presets.json`,evidence),JSON.stringify(payload,null,2));
}
fixtures.presets=payload.data.items.map(p=>({title:p.title,words:p.configuration.entries,model:p.configuration.model.name,style:{story:'Story',dialogue:'Dialogue',news:'News'}[p.configuration.scenario],length:{short:'Brief',medium:'Standard',long:'Extended'}[p.configuration.length],language:{zh:'中文',en:'English',ja:'日本語'}[p.configuration.meaning_language],sampleText:p.sample.passage,meanings:p.sample.targets.map(t=>({word:t.entry,meaning:t.entry_meaning}))}));
const b=await chromium.launch(),results=[],errors=[];
const measure=card=>card.evaluate(el=>{
 const bounds=q=>{const r=el.querySelector(q).getBoundingClientRect(),base=el.getBoundingClientRect();return {x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height}};
 const typography=q=>{const s=getComputedStyle(el.querySelector(q));return {font:s.font,color:s.color,margin:s.margin,padding:s.padding,border:s.borderTop}};
 return {language:el.querySelector('.preset-meanings-head > span').textContent,config:bounds('.gallery-config'),paper:bounds('.gallery-paper'),meanings:bounds('.preset-meanings'),dt:typography('.preset-meanings dt'),dd:typography('.preset-meanings dd')};
});
try {
 for(const width of [1440,390]){
  const values={};for(const mode of ['design',run]){
   const base=mode==='design'?'http://127.0.0.1:4186':origin;
   const p=await b.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
   p.on('pageerror',e=>errors.push(`${mode}: ${e.message}`));
   await p.context().addCookies([{name:'wordweave_ui_locale',value:'zh-CN',url:base}]);
   if(mode==='design'){
    await p.route(/\/fixtures\.json(?:\?|$)/,r=>r.fulfill({json:fixtures}));
    await p.goto(base+'/prototype/?page=explore&lang=zh');
   }else if(run==='fixed'){
    await p.route('**/api/v1/presets?**',r=>r.fulfill({json:payload}));
    await p.goto(base+'/');await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    await p.locator('header a[href="/explore"]').click();
   }else{
    await p.goto(base+'/explore');await p.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
   }
   await expect(p.locator('.gallery-card')).toHaveCount(payload.data.items.length);await p.evaluate(()=>document.fonts.ready);
   for(const [i,item] of payload.data.items.entries()){
    const card=p.locator('.gallery-card').nth(i);
    await expect(card.locator('.gallery-config .preset-meanings dt')).toHaveText(item.sample.targets.map(t=>t.entry));
    await expect(card.locator('.gallery-config .preset-meanings dd')).toHaveText(item.sample.targets.map(t=>t.entry_meaning));
    await expect(card.locator('.preset-meanings-head > span')).toHaveText({zh:'中文',en:'English',ja:'日本語'}[item.configuration.meaning_language]);
    await expect(card.locator('.gallery-paper .preset-meanings,.gallery-words')).toHaveCount(0);
    await expect(card.locator('.gallery-passage')).toHaveText(item.sample.passage.replace(/\n\s*\n/g,''));
   }
   const c=p.locator('.gallery-card').first();values[mode]=await measure(c);
   expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(run==='fixed'||mode!=='design') await c.screenshot({path:new URL(`${mode}-matched-${width}.png`,evidence).pathname});
   await p.close();
  }
  expect(values[run]).toEqual(values.design);results.push({width,status:'PASS',matched:values});
 }
 expect(errors).toEqual([]);
 await writeFile(new URL(`${run}-visual.json`,evidence),JSON.stringify({results,errors,data:'Same published presets, zh-CN, Chromium, fonts, DPR, reduced motion; structure and content checked on all cards. Delivered run uses actual API without interception.'},null,2));
 console.log(results.map(x=>({width:x.width,status:x.status})));
} catch(e) {
 await writeFile(new URL(`${run}-failure.json`,evidence),JSON.stringify({error:String(e),results,errors},null,2));throw e;
} finally {await b.close()}
