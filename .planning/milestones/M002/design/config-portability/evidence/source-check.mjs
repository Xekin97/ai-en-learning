import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const evidenceDir=path.dirname(new URL(import.meta.url).pathname);
const repo=path.resolve(evidenceDir,'../../../../../..');
const scoped=path.resolve(evidenceDir,'..');
const manifestPath=path.join(evidenceDir,'M003-UI-15-source-manifest.json');
const beforePath=path.join(repo,'.planning/milestones/M003/reviews/evidence/cr313-design-entry-109/before-manifest.json');
const report={version:'M003-UI-15',scope:'source integrity, archive, fixture semantics, and protected UI14/canonical preservation',checks:[]};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});
const sha=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const hashFailures=[];
for(const [relative,expected] of Object.entries({...manifest.sources,...manifest.evidence})){
  const absolute=path.join(repo,relative);
  try{const actual=await sha(absolute);if(actual!==expected)hashFailures.push({relative,expected,actual});}
  catch(error){hashFailures.push({relative,error:String(error)});}
}
const archiveAbsolute=path.join(repo,manifest.archive.path);
const archiveHash=await sha(archiveAbsolute);
record('manifest-hashes-match-current-delivery',hashFailures.length===0&&archiveHash===manifest.archive.sha256,{hashFailures,archiveHash,expectedArchiveHash:manifest.archive.sha256});

const members=execFileSync('tar',['-tzf',archiveAbsolute],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
const expectedMembers=[...manifest.archive.members].sort();
record('source-archive-has-exact-declared-members',JSON.stringify(members)===JSON.stringify(expectedMembers),{members,expectedMembers});

const copy=JSON.parse(await fs.readFile(path.join(scoped,'copy.json'),'utf8'));
const fixture=JSON.parse(await fs.readFile(path.join(scoped,'fixtures/admin-safe.json'),'utf8'));
const duplicateCopyKeys=Object.keys(copy.static).filter(key=>Object.hasOwn(copy.templates,key));
const requiredCopy=['zh.changes.title','en.changes.title','zh.changes.confirmTitle','en.changes.confirmTitle','zh.changes.applied','en.changes.applied'];
record('copy-namespaces-and-item-detail-contract-are-complete',duplicateCopyKeys.length===0&&requiredCopy.every(key=>Object.hasOwn(copy.static,key)),{duplicateCopyKeys,missing:requiredCopy.filter(key=>!Object.hasOwn(copy.static,key))});

const fixtureFailures=[];
for(const category of ['models','plans','items','growth']){
  const preview=fixture[category].preview,changes=fixture[category].changes;
  for(const kind of ['add','update','remove']){
    if(!Array.isArray(changes?.[kind])||changes[kind].length!==preview[kind])fixtureFailures.push(`${category}.${kind}: expected ${preview[kind]}, got ${changes?.[kind]?.length}`);
  }
  const identities=['add','update','remove'].flatMap(kind=>changes[kind].map(item=>item.identity));
  if(new Set(identities).size!==identities.length)fixtureFailures.push(`${category}: duplicate safe identity`);
}
const forbiddenFixtureKeys=[];
const walk=(value,trail=[])=>{if(Array.isArray(value))return value.forEach((item,index)=>walk(item,[...trail,index]));if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(/(^|_)(api_?key|password|secret|token)$/i.test(key))forbiddenFixtureKeys.push([...trail,key].join('.'));walk(item,[...trail,key]);}};
walk(fixture);
record('fixture-counts-identities-and-secret-boundary-are-consistent',fixtureFailures.length===0&&forbiddenFixtureKeys.length===0,{fixtureFailures,forbiddenFixtureKeys});

const semanticBoundaries={
  modelHostname:fixture.models.changes.add[0].applied.zh.includes('hostname')&&fixture.models.changes.add[0].applied.zh.includes('本产品未设置')&&fixture.models.changes.add[0].name.zh.startsWith('api.backup.example'),
  planExplicitNull:fixture.plans.changes.update.some(item=>item.applied?.en?.includes('explicitly provides null')&&item.applied.en.includes('not an omitted default')),
  itemExistingType:fixture.items.changes.add.length===0&&fixture.items.changes.update.some(item=>item.identity==='item:plan'&&item.applied?.zh?.includes('英文说明显式为空')&&item.applied.zh.includes('回退显示中文说明')),
  growthOptionalReward:fixture.growth.changes.add.some(item=>item.applied?.en?.includes('No reward item')&&item.applied.en.includes('No item'))
};
record('field-table-examples-preserve-approved-null-and-omission-semantics',Object.values(semanticBoundaries).every(Boolean),semanticBoundaries);

const currentModels=fixture.models.providers.flatMap(provider=>provider.models.map(model=>model.name));
const currentItems=fixture.items.items.map(item=>item.kind);
const baselineAlignment={
  models:currentModels.join(',')==='Model A,Model B,Model C'&&fixture.models.changes.remove[0].identity==='model:model-b'&&fixture.models.references.every(ref=>ref.target==='Model B'),
  plans:fixture.plans.items.find(item=>item.code==='visitor').limit===2&&fixture.plans.items.find(item=>item.code==='pro').limit===16&&fixture.plans.items.find(item=>item.code==='plus').maxEntries===16,
  items:currentItems.join(',')==='makeup,extra,model,plan'&&fixture.items.items.find(item=>item.kind==='extra').price===30&&fixture.items.changes.remove[0].identity==='item:model'&&fixture.items.references.every(ref=>ref.target==='模型体验卡'),
  growth:fixture.growth.checkin.base===4&&fixture.growth.checkin.step===2&&fixture.growth.levels.find(item=>item.level===2).threshold===120&&fixture.growth.levels.find(item=>item.level===3).threshold===260
};
record('formal-current-baselines-align-with-preview-left-values-and-removals',Object.values(baselineAlignment).every(Boolean),baselineAlignment);

const before=JSON.parse(await fs.readFile(beforePath,'utf8')).files;
const protectedPaths=Object.keys(before).filter(relative=>
  relative.startsWith('.planning/milestones/M003/design/pronunciation/')||
  relative.startsWith('.planning/milestones/M003/design/prototype/')||
  relative.startsWith('.planning/milestones/M003/product/')||
  ['.planning/milestones/M003/design/design-spec.md','.planning/milestones/M003/design/interactions.md','.planning/milestones/M003/design/responsive-accessibility.md','.planning/milestones/M003/design/theme.css','.planning/milestones/M003/handoffs/uiux.md','.planning/milestones/M003/handoffs/product.md','.planning/milestones/M003/changes/CR-313.md'].includes(relative)
);
const protectedFailures=[];
for(const relative of protectedPaths){const actual=await sha(path.join(repo,relative));if(actual!==before[relative])protectedFailures.push({relative,before:before[relative],actual});}
record('UI14-canonical-product-and-existing-handoffs-preserved-byte-for-byte',protectedFailures.length===0,{checked:protectedPaths.length,protectedFailures});

const controller=await fs.readFile(path.join(scoped,'controller.js'),'utf8');
const formal=await fs.readFile(path.join(scoped,'formal/formal.js'),'utf8');
record('formal-business-dialog-keeps-internal-version-out-of-product-heading',controller.includes("inline?'<p class=\"eyebrow\">M003-UI-15</p>':''")&&formal.includes('<span class="demo-version">M003-UI-15</span>'),{});

report.summary={total:report.checks.length,passed:report.checks.filter(check=>check.passed).length,failed:report.checks.filter(check=>!check.passed).length};
await fs.writeFile(path.join(evidenceDir,'M003-UI-15-source-check.json'),JSON.stringify(report,null,2)+'\n');
if(report.summary.failed)process.exitCode=1;
