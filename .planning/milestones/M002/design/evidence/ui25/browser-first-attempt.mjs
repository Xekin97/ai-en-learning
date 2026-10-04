import {createRequire} from 'node:module';import fs from 'node:fs';
const R='/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning';
const require=createRequire(R+'/frontend/package.json');const {chromium}=require('@playwright/test');
const D=R+'/.planning/milestones/M002/design',E=D+'/evidence/ui25';const copy=JSON.parse(fs.readFileSync(D+'/copy.json'));const text=(lang,k)=>copy.static[lang+'.'+k]??copy.templates[lang+'.'+k];
const browser=await chromium.launch({headless:true});const checks=[],errors=[];let shots=0;
const routes=['home','explore','create','library','batch','range','sessiondone','login','register','review','overview','summary','profile','notices','growth','bag','shop','trial'];
function check(name,pass,details){checks.push({name,pass,details});if(!pass)console.log('FAIL',name,JSON.stringify(details));}
async function open(route,lang='zh',width=1440,state='normal',inspect=false){const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push({route,lang,width,error:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({route,lang,width,error:m.text()});});await page.goto(`http://127.0.0.1:4186/prototype/?page=${route}&lang=${lang}&role=learner&state=${state}&v=M002-UI-25${inspect?'&inspect=1':''}`);await page.waitForSelector('#main');return page;}
for(const width of [1440,320])for(const lang of ['zh','en'])for(const route of routes){
 const p=await open(route,lang,width);
 const facts=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,debugVisible:!document.getElementById('demo').hidden,copy:document.getElementById('main').innerText,heading:!!document.querySelector('#main h1')}));
 check(`user screen ${route} ${lang} ${width}`,!facts.overflow&&!facts.debugVisible&&!facts.copy.includes('undefined')&&!facts.copy.includes('[missing'),{overflow:facts.overflow,debugVisible:facts.debugVisible});
 if(route==='notices'){
  check(`notice labels removed ${lang} ${width}`,await p.locator('.notice-entry .badge,.notice-entry-badge').count()===0&&!facts.copy.includes(lang==='zh'?'登录提醒':'Login reminder'));
  await p.locator('.notice-entry').first().focus();await p.keyboard.press('Enter');await p.waitForSelector('#dialog[open]');
  check(`matching notice opens ${lang} ${width}`,await p.locator('#dialog-title').innerText()===await p.locator('.notice-entry-title').first().innerText());
  await p.keyboard.press('Escape');check(`notice focus returns ${lang} ${width}`,await p.locator('.notice-entry').first().evaluate(e=>e===document.activeElement));
  if(width===1440&&lang==='zh'){await p.locator('h1').click();await p.screenshot({path:E+'/01-notices-1440.png',fullPage:true});shots++;}
 }
 if(route==='trial'){
  check(`trial speaks to learners ${lang} ${width}`,facts.copy.includes(text(lang,'trial.config.title'))&&!/预设|preset/i.test(facts.copy));
  if(width===1440&&lang==='zh'){await p.screenshot({path:E+'/02-trial-1440.png',fullPage:true});shots++;}
 }
 if(route==='range'){
  check(`date help retained ${lang} ${width}`,facts.copy.includes(text(lang,'l.dates.desc'))&&facts.copy.includes(text(lang,'l.matches'))&&!facts.copy.includes('已排除'));
  if(width===320&&lang==='en'){await p.screenshot({path:E+'/03-range-320.png',fullPage:true});shots++;}
 }
 if(route==='profile')check(`deletion consequence retained ${lang} ${width}`,facts.copy.includes(text(lang,'deleteaccount.desc')));
 if(route==='bag')check(`card expiry and usage retained ${lang} ${width}`,facts.copy.includes(text(lang,'card.modelnote'))&&facts.copy.includes(text(lang,'card.countnote'))&&facts.copy.includes(text(lang,'account.useby')));
 await p.close();
}
for(const lang of ['zh','en']){
 let p=await open('messages',lang);check(`admin reminder controls retained ${lang}`,await p.locator('#remind').isVisible()&&await p.locator('#visible').isVisible());await p.close();
 p=await open('notices',lang,1440,'normal',true);check(`reviewer tools remain opt-in ${lang}`,await p.locator('.demo-bar').isVisible());await p.close();
 p=await open('review',lang,320,'resume');await p.waitForSelector('#dialog[open]');check(`resume consequence retained ${lang}`,(await p.locator('#dialog').innerText()).includes(text(lang,'l.resume.desc')));await p.close();
 p=await open('library',lang);await p.locator('[data-action^="learn-delete:"]').first().click();await p.waitForSelector('#dialog[open]');check(`story deletion consequence retained ${lang}`,(await p.locator('#dialog').innerText()).includes(text(lang,'l.delete.desc'))&&(await p.locator('#dialog-title').innerText())===text(lang,'l.delete.title'));await p.close();
 p=await open('trial',lang,320,'invalid');check(`unavailable copy gives next action ${lang}`,(await p.locator('#main').innerText()).includes(text(lang,'preset.invaliddesc')));await p.close();
 p=await open('range',lang,320,'preview-error');check(`count failure is user-facing ${lang}`,(await p.locator('#main').innerText()).includes(text(lang,'l.preview.error')));await p.close();
}
check('No browser or copy errors',errors.length===0,errors);
const result={version:'M002-UI-25',status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,errors,screenshots:shots,real_provider_calls:0};fs.writeFileSync(E+'/browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:checks.length,failed:checks.filter(c=>!c.pass),screenshots:shots},null,2));await browser.close();
