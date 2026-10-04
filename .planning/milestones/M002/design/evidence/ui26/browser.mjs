import {createRequire} from 'node:module';import fs from 'node:fs';
const R='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning';const require=createRequire(R+'/frontend/package.json'),{chromium}=require('@playwright/test');const D=R+'/.planning/milestones/M002/design',E=D+'/evidence/ui26',F=JSON.parse(fs.readFileSync(D+'/prototype/fixtures.json'));const browser=await chromium.launch({headless:true});const checks=[],errors=[];let screenshots=0;
const save=()=>fs.writeFileSync(E+'/browser-progress.json',JSON.stringify({checks,errors},null,2));
function check(name,pass,details){checks.push({name,pass,details});save();if(!pass)console.log('FAIL',name,JSON.stringify(details));}
async function open(route,lang='zh',width=1440,state='normal') { const p=await browser.newPage({viewport:{width,height:980},reducedMotion:'reduce'});p.setDefaultTimeout(7000);p.on('pageerror',e=>{errors.push({route,lang,width,message:e.message});save();});await p.goto(`http://127.0.0.1:4186/prototype/?page=${route}&lang=${lang}&state=${state}&role=learner&v=M002-UI-26`);await p.waitForSelector('#main');return p; }
const tags=(p,id)=>p.locator('#'+id+' .word-token > span').allTextContents();
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
async function remove(p,id,w){await p.locator(`#${id} [data-picker-remove]`).filter({has:p.locator('svg')}).evaluateAll((els,word)=>els.find(e=>e.dataset.pickerRemove===word).click(),w);}
async function search(p,id,q){await p.locator('#'+id+'-search').fill(q);}
async function select(p,id,value){const w=p.locator('#'+id).locator('..'); const ix=await p.locator('#'+id+' option').evaluateAll((els,v)=>els.findIndex(e=>e.value===v),value); if(ix<0)throw new Error('Missing option '+id+' '+value);await w.locator('.ww-select-trigger').click();await w.locator('[data-index="'+ix+'"]').click();}
async function add(p,id,q){await search(p,id,q);await p.locator('#'+id+'-search').press('Enter');}
try {
for(const route of ['create','presets'])for(const lang of ['zh','en'])for(const width of [1440,390,320]){
 const p=await open(route,lang,width),id=route==='create'?'create-words':'preset-words',field=p.locator('#'+id+'-search');await field.waitFor();
 const original=await tags(p,id);
 check(`initial layout ${route} ${lang} ${width}`,!await overflow(p)&&await p.locator('#'+id+' .word-token').count()===original.length);
 await remove(p,id,original[0]);check(`remove focus ${route} ${lang} ${width}`,(await tags(p,id)).length===original.length-1&&await p.evaluate(()=>document.activeElement!==document.body));
 if(route==='presets')await p.locator('#preset-title').fill('Picker draft');
 await search(p,id,'o');const options=await p.locator('#'+id+' [role=option] > span:first-child').allTextContents();
 check(`prefix before contains ${route} ${lang} ${width}`,options[0]==='ought to'&&options[1]==='owing to',options);
 await field.press('ArrowDown');const activeId=await field.getAttribute('aria-activedescendant');check(`keyboard active ${route} ${lang} ${width}`,!!activeId&&await p.locator('#'+activeId).count()===1);
 await field.press('Escape');check(`escape retains query ${route} ${lang} ${width}`,await field.getAttribute('aria-expanded')==='false'&&await field.inputValue()==='o');
 if(route==='create'&&lang==='zh'&&width===1440){await field.focus();await search(p,id,'o');await p.screenshot({path:E+'/01-create-desktop.png',fullPage:true});screenshots++;}
 await add(p,id,'ACCORDING TO');let current=await tags(p,id);
 check(`exact multiword addition ${route} ${lang} ${width}`,current.includes('according to')&&await field.inputValue()===''&&await field.evaluate(e=>e===document.activeElement));
 const n=current.length;await add(p,id,'according to');check(`duplicate blocked ${route} ${lang} ${width}`,(await tags(p,id)).length===n&&await p.locator('#'+id+' [role=option][aria-selected=true]').count()===1);
 await search(p,id,'not-a-catalog-word');await field.press('Enter');check(`free text rejected ${route} ${lang} ${width}`,(await tags(p,id)).length===n&&await p.locator('#'+id+' [role=option]').count()===0);
 if(route==='create'){
  const cap=F.admin.plans.find(plan=>plan.code===F.admin.users[0].plan).maxEntries;
  for(const w of F.candidates.filter(w=>w!=='gentle')){if((await tags(p,id)).length>=cap)break;if(!(await tags(p,id)).includes(w))await add(p,id,w);}
  const atCap=(await tags(p,id)).length;check(`reaches current plan cap ${lang} ${width}`,atCap===cap,{cap,atCap});
  check(`cap blocks adding and random ${lang} ${width}`,await p.locator('#'+id+'-feedback').isVisible()&&await p.locator('#'+id+' [data-picker-random]').isDisabled());
  await add(p,id,'gentle');check(`cap enforced ${lang} ${width}`,(await tags(p,id)).length===atCap);
  await remove(p,id,'according to');await add(p,id,"coup d'etat");check(`punctuation kept ${lang} ${width}`,(await tags(p,id)).includes("coup d'etat"));
  if(lang==='en'&&width===390){await p.screenshot({path:E+'/03-create-mobile.png',fullPage:true});screenshots++;}
 }else{
  check(`other draft fields retained ${lang} ${width}`,await p.locator('#preset-title').inputValue()==='Picker draft'&&await p.locator('[data-action="preset-publish"]').isDisabled());
  for(const w of ["coup d'etat",'ought to','owing to','gentle'])await add(p,id,w);
  current=await tags(p,id);check(`admin no learner cap ${lang} ${width}`,current.length===7&&['according to',"coup d'etat",'ought to','owing to'].every(w=>current.includes(w))&&!await p.locator('#'+id+'-feedback').isVisible());
  check(`preview marked stale ${lang} ${width}`,await p.locator('[data-preview-status] .notice').isVisible()&&await p.locator('[data-action="preset-publish"]').isDisabled());
  if(lang==='zh'&&width===1440){await field.blur();await p.screenshot({path:E+'/02-preset-desktop.png',fullPage:true});screenshots++;}
  if(lang==='en'&&width===320){await search(p,id,'bloom');await p.screenshot({path:E+'/04-preset-mobile.png',fullPage:true});screenshots++;}
 }
 check(`final layout ${route} ${lang} ${width}`,!await overflow(p));await p.close();
}
// State and integration boundaries, once per behavior rather than repeating every viewport.
let p=await open('create'),id='create-words';await p.locator('#'+id+' [data-picker-remove]').first().click();let before=await tags(p,id);await p.locator('[data-picker-random]').click();let after=await tags(p,id);let picked=after.find(w=>!before.includes(w));const inLibrary=new Set(F.library.flatMap(b=>b.targets.map(w=>w.word)));check('Random excludes selected and current library',!!picked&&!inLibrary.has(picked)&&after.length===before.length+1,{picked});
await p.locator('#'+id+' [data-picker-remove]').first().click();await search(p,id,'gentle');before=await tags(p,id);await p.locator('#'+id+'-search').dispatchEvent('keydown',{key:'Enter',isComposing:true});check('IME confirmation does not add word',(await tags(p,id)).length===before.length);
await select(p,'site-language','en');check('Locale preserves selected words and query',JSON.stringify(await tags(p,id))===JSON.stringify(before)&&await p.locator('#'+id+'-search').inputValue()==='gentle');
await select(p,'model','Model A');await select(p,'explain','chinese');await p.locator('#generate').click();check('Generation freezes selection',await p.locator('#'+id+'-search').isDisabled()&&await p.locator('[data-picker-random]').isDisabled()&&await p.locator('[data-picker-remove]').first().isDisabled());await p.close();
for(const route of ['create','presets']){
 id=route==='create'?'create-words':'preset-words';p=await open(route,'en',390,'word-error');await search(p,id,'bloom');check('Search error '+route,await p.locator('#'+id+' [data-picker-retry]').isVisible());await p.locator('#'+id+' [data-picker-retry]').click();check('Search retry '+route,await p.locator('#'+id+' [role=option]').count()===1);await p.close();
 p=await open(route,'en',390,'word-loading');await search(p,id,'bloom');check('Search loading '+route,await p.locator('#'+id+' [data-picker-search-state]').innerText()==='Searching…'&&await p.locator('#'+id+' [role=option]').count()===0);await p.close();
}
p=await open('presets');id='preset-words';await add(p,id,'bloom');const draft=await tags(p,id);await p.locator('[data-action="preset-edit:1"]').click();check('Different preset has separate selected words',JSON.stringify(await tags(p,id))!==JSON.stringify(draft));await p.locator('[data-action="preset-edit:0"]').click();check('Returning preset keeps draft',JSON.stringify(await tags(p,id))===JSON.stringify(draft));await p.locator('[data-action="preset-preview"]').click();check('Preview freezes word selection',await p.locator('#'+id+'-search').isDisabled());await p.locator('[data-action="preset-publish"]:not([disabled])').waitFor();check('New matching preview enables publish',await p.locator('#'+id+'-search').isEnabled());await p.close();
p=await open('presets','zh',1440,'save-error');await add(p,'preset-words','bloom');const failedDraft=await tags(p,'preset-words');await p.locator('[data-action="preset-save"]').click();check('Save failure retains selected words',JSON.stringify(await tags(p,'preset-words'))===JSON.stringify(failedDraft));await p.close();
p=await open('trial');check('Trial remains read-only',await p.locator('[data-word-picker],[data-picker-remove],[data-picker-random]').count()===0);await p.close();
check('No browser errors',errors.length===0,errors);
} catch(e) { errors.push({fatal:e.stack});save();console.log('ERROR',e.stack); }
const result={version:'M002-UI-26',status:errors.length===0&&checks.every(c=>c.pass)?'PASS':'FAIL',checks,errors,screenshots,real_provider_calls:0};fs.writeFileSync(E+'/browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,failed:checks.filter(c=>!c.pass),errors,screenshots},null,2));await browser.close();
