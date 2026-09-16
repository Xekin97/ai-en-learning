import { webkit, expect } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { origin, dir, login } from './real-stack.mjs';
const results=[],browser=await webkit.launch();
try{
 for(const locale of ['en-US','zh-CN']){
  for(const side of ['production','prototype']){
   const c=await browser.newContext({locale,viewport:{width:1081,height:1000}});
   try{
    if(side==='production')await login(c,'dev071_old',locale);else await c.addInitScript(()=>localStorage.clear());
    const p=await c.newPage();await p.goto(side==='production'?origin+'/review':'http://127.0.0.1:6010/prototype/?page=PAGE-007&role=learner&state=empty-library&locale='+locale);
    const actions=p.locator('.range-feedback .inline-actions > *');await expect(actions).toHaveCount(2);
    for(const key of ['Tab','Alt+Tab']){
     await actions.first().focus();await p.keyboard.press(key);
     const nextFocused=await actions.last().evaluate(n=>n===document.activeElement);
     const active=await p.evaluate(()=>({tag:document.activeElement?.tagName,id:document.activeElement?.id,href:document.activeElement?.getAttribute('href')}));
     results.push({locale,side,key,nextFocused,active});
     if(key==='Alt+Tab')expect(nextFocused).toBe(true);
    }
   }finally{await c.close();}
  }
 }
}finally{
 await browser.close();writeFileSync(join(dir,'keyboard-diagnostic.json'),JSON.stringify({at:new Date().toISOString(),officialReference:'https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac',method:'Actual macOS WebKit keyboard events on production links and prototype navigation buttons. No DOM tabindex or OS/browser setting changed.',results},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(results));
}
