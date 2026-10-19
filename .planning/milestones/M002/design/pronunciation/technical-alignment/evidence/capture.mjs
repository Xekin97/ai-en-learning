import {createRequire} from 'node:module';import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(resolve('frontend/package.json'));const {chromium}=require('@playwright/test');
const dir=dirname(fileURLToPath(import.meta.url));const browser=await chromium.launch();const page=await browser.newPage();
for(const [name,width,view,query] of [
 ['TA1-reverse-single-desktop.png',1440,'formal','page=result&lang=zh&scenario=accent&lost=en-US&alternatives=en-GB'],
 ['TA1-library-single-mobile.png',320,'formal','page=library&lang=en&longwords=1&scenario=accent&lost=en-US&alternatives=en-GB'],
 ['TA1-prototype-single.png',1280,'prototype','lang=en&scenario=accent&lost=en-US&alternatives=en-GB']
]){
 await page.setViewportSize({width,height:width===320?844:1000});
 await page.goto(`http://127.0.0.1:4175/M002/design/pronunciation/technical-alignment/${view}/?${query}`);
 await page.waitForSelector('#app:not([aria-busy])');const control=page.locator('[data-pron-control]').first();
 await control.locator('[data-pron-play]').click();await control.locator('[data-play-state="accent"]').waitFor();
 await control.locator('[data-pron-play]').click();await page.evaluate(async()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished)));
 await page.screenshot({path:resolve(dir,name),animations:'disabled'});console.log(name);
}
await browser.close();
