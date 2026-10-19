import playwright from '../../../../../../frontend/node_modules/@playwright/test/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const {chromium}=playwright;
const dir=path.dirname(new URL(import.meta.url).pathname);
const url='http://127.0.0.1:4175/M003/design/pronunciation/formal/?page=picker&lang=en&scenario=dictionary&longwords=1';
const report={version:'M003-UI-14',scope:'390px selected-word token layout only',url,checks:[],console_errors:[],page_errors:[],screenshots:[]};
const record=(name,passed,details)=>report.checks.push({name,passed,details});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
page.on('pageerror',error=>report.page_errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')report.console_errors.push(message.text())});
try {
  await page.goto(url,{waitUntil:'networkidle'});
  for(const fixture of [
    {word:'communication',menu:false},
    {word:'pronunciation',menu:true}
  ]){
    const token=page.locator('.pron-word-token').filter({has:page.locator(`span[lang="en"]`,{hasText:fixture.word})});
    const details=await token.evaluate((node,expected)=>{
      const label=node.querySelector(':scope > span[lang="en"]');
      const controls=[...node.querySelectorAll(':scope > .pron-control > button, :scope > .pron-remove')];
      return {
        expected,
        text:label.textContent.trim(),
        label_client_width:label.clientWidth,
        label_scroll_width:label.scrollWidth,
        label_client_height:label.clientHeight,
        line_height:getComputedStyle(label).lineHeight,
        white_space:getComputedStyle(label).whiteSpace,
        overflow_wrap:getComputedStyle(label).overflowWrap,
        text_overflow:getComputedStyle(label).textOverflow,
        token_width:node.getBoundingClientRect().width,
        token_height:node.getBoundingClientRect().height,
        controls:controls.map(control=>({name:control.getAttribute('aria-label'),width:control.getBoundingClientRect().width,height:control.getBoundingClientRect().height})),
        menu_trigger_count:node.querySelectorAll('[data-pron-menu-trigger]').length
      };
    },fixture.word);
    const controlsMeetTarget=details.controls.every(control=>control.width>=44&&control.height>=44);
    const readable=details.text===fixture.word&&details.label_scroll_width<=details.label_client_width&&details.text_overflow!=='ellipsis'&&details.white_space==='normal'&&details.overflow_wrap==='anywhere';
    const menuCorrect=details.menu_trigger_count===(fixture.menu?1:0);
    record(`${fixture.word}-readable-with-44px-controls`,readable&&controlsMeetTarget&&menuCorrect,{...details,readable,controlsMeetTarget,menuCorrect});
  }
  const pageState=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll_width:document.documentElement.scrollWidth,horizontal_overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)}));
  record('390px-no-horizontal-overflow',pageState.horizontal_overflow===0,pageState);
  const screenshot='06-formal-picker-long-words-mobile-en.png';
  await page.screenshot({path:path.join(dir,screenshot),fullPage:true});
  report.screenshots.push(screenshot);
} finally {
  record('browser-console',report.console_errors.length===0&&report.page_errors.length===0,{console_errors:report.console_errors,page_errors:report.page_errors});
  report.summary={total:report.checks.length,passed:report.checks.filter(item=>item.passed).length,failed:report.checks.filter(item=>!item.passed).length};
  await fs.writeFile(path.join(dir,'M003-UI-14-long-word.json'),JSON.stringify(report,null,2)+'\n');
  await context.close();await browser.close();
}
if(report.summary.failed)process.exitCode=1;
