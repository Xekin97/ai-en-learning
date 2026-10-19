import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const evidenceDir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(evidenceDir,'../../../../../..');
const sha=async(file)=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const exists=async(file)=>fs.access(file).then(()=>true,()=>false);
const report={version:'M003-UI-14',checks:[],details:{}};
const record=(name,passed,details={})=>report.checks.push({name,passed,details});

const manifestPath=path.join(evidenceDir,'M003-UI-14-source-manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const mismatches=[];
for(const [relative,expected] of Object.entries(manifest.files)) {
  const actual=await sha(path.join(repo,relative));
  if(actual!==expected)mismatches.push({relative,expected,actual});
}
const archiveActual=await sha(path.join(repo,manifest.archive.path));
record('current-source-manifest',mismatches.length===0&&archiveActual===manifest.archive.sha256,{file_count:Object.keys(manifest.files).length,mismatches,archive_expected:manifest.archive.sha256,archive_actual:archiveActual});

const oldManifest=JSON.parse(await fs.readFile(path.join(repo,'.planning/milestones/M003/design/evidence/cr312-r4/M003-UI-13-R4-source-manifest.json'),'utf8'));
const retained=[
  'design/copy.json','design/theme.css','design/prototype/index.html','design/prototype/app.js','design/prototype/fixtures.json','design/fixtures/ui13-r3-bookshop.json'
];
const oldMismatches=[];
for(const relative of retained){
  const actual=await sha(path.join(repo,'.planning/milestones/M003',relative));
  const expected=oldManifest.source_files[relative];
  if(actual!==expected)oldMismatches.push({relative,expected,actual});
}
record('accepted-ui13-files-unchanged',oldMismatches.length===0,{checked:retained,mismatches:oldMismatches});

const docs=[
  '.planning/milestones/M003/design/pronunciation/design-spec.md',
  '.planning/milestones/M003/design/pronunciation/interactions.md',
  '.planning/milestones/M003/design/pronunciation/responsive-accessibility.md',
  '.planning/milestones/M003/handoffs/uiux.md',
  '.planning/milestones/M003/design/design-spec.md',
  '.planning/milestones/M003/design/interactions.md',
  '.planning/milestones/M003/design/responsive-accessibility.md'
];
const broken=[];let checkedLinks=0;
for(const relative of docs){
  const file=path.join(repo,relative),source=await fs.readFile(file,'utf8');
  for(const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    let target=match[1].trim();
    if(!target||target.startsWith('#')||/^(https?:|mailto:)/.test(target))continue;
    target=decodeURIComponent(target.split('#')[0]);
    const resolved=path.resolve(path.dirname(file),target);checkedLinks++;
    if(!await exists(resolved))broken.push({from:relative,target});
  }
}
record('current-document-links',broken.length===0,{checked:checkedLinks,broken});

const copy=JSON.parse(await fs.readFile(path.join(repo,'.planning/milestones/M003/design/pronunciation/copy.json'),'utf8'));
const keys=[...Object.keys(copy.static),...Object.keys(copy.templates)];
record('copy-shape-and-key-uniqueness',copy.static&&copy.templates&&keys.length===new Set(keys).size,{static:Object.keys(copy.static).length,templates:Object.keys(copy.templates).length,total:keys.length});

const currentPointerDocs=docs.slice(4);
const pointerMissing=[];
for(const relative of currentPointerDocs){
  const source=await fs.readFile(path.join(repo,relative),'utf8');
  if(!source.includes('pronunciation/'))pointerMissing.push(relative);
}
record('canonical-current-scope-pointers',pointerMissing.length===0,{checked:currentPointerDocs,pointerMissing});

report.summary={total:report.checks.length,passed:report.checks.filter(item=>item.passed).length,failed:report.checks.filter(item=>!item.passed).length};
await fs.writeFile(path.join(evidenceDir,'M003-UI-14-source-check.json'),JSON.stringify(report,null,2)+'\n');
if(report.summary.failed)process.exitCode=1;
