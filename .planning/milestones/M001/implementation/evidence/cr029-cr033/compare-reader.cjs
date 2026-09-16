const {chromium}=require('@playwright/test');
(async()=>{
const b=await chromium.launch();
const a=await b.newPage(), d=await b.newPage();
const results=[];
await d.addInitScript(()=>localStorage.clear());
const rules={
 '.reader-dialog':['width','maxWidth','borderRadius','padding'],
 '.reader-dialog .dialog-header':['padding','flexShrink','borderBottomWidth'],
 '.reader-body':['padding','overflowY','minHeight'],
 '.reader-metadata':['columnGap','rowGap','paddingBottom','marginBottom'],
 '.reader-body .reading-passage':['fontFamily','fontSize','lineHeight','maxWidth'],
 '.reader-resources':['paddingTop','marginTop','borderTopWidth'],
 '.reader-word':['padding','rowGap','columnGap'],
 '.reader-dialog .dialog-footer':['padding','flexShrink']
};
for(const locale of ['zh-CN','en-US']){
 await a.context().clearCookies();
 await a.context().addCookies([{name:'wordweave_session',value:'admin',url:'http://127.0.0.1:3300'},{name:'wordweave_ui_locale',value:locale,url:'http://127.0.0.1:3300'}]);
 for(const width of [320,390,720,1280,1440]){
  await a.setViewportSize({width,height:1000});await d.setViewportSize({width,height:1000});
  await a.goto('http://127.0.0.1:3300/admin/users/user-e2e?batch=batch-e2e');
  await a.locator('.reader-body .reading-passage').waitFor();
  await d.goto('http://127.0.0.1:3310/prototype/?page=PAGE-103&role=admin&state=batch-short&locale='+locale);
  await d.locator('.reader-body .reading-passage').waitFor();
  const metrics=async(p)=>p.evaluate(rules=>Object.fromEntries(Object.entries(rules).map(([sel,keys])=>{const node=document.querySelector(sel);if(!node)throw new Error(sel);const style=getComputedStyle(node);return[sel,Object.fromEntries(keys.map(key=>[key,style[key]]))]})),rules);
  const actual=await metrics(a),expected=await metrics(d),diff=[];
  for(const [sel,props] of Object.entries(expected))for(const [prop,value] of Object.entries(props))if(actual[sel][prop]!==value)diff.push({sel,prop,actual:actual[sel][prop],expected:value});
  const copy=await a.locator('.reader-dialog .dialog-footer').innerText(), expectedCopy=await d.locator('.reader-dialog .dialog-footer').innerText();
  const entry={locale,width,result:!diff.length&&copy===expectedCopy?'PASS':'FAIL',diff,copy,expectedCopy,metrics:actual};
  if(width===390||width===1440){
   const folder='../.planning/milestones/M001/implementation/evidence/cr029-cr033';
   await a.screenshot({path:folder+'/reader-app-'+locale+'-'+width+'.png'});
   await d.screenshot({path:folder+'/reader-design-'+locale+'-'+width+'.png'});
  }
  results.push(entry);
 }
}
console.log(JSON.stringify({comparison:'approved reader short state; same admin role, locale, viewport; synthetic body differs',results}));
await b.close();
})();
