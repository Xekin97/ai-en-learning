// Contract fixture verification only. Does not import or validate application code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const base='.planning/milestones/M003';
const dir=path.join(base,'technical/evidence/cr306');
const fixture=JSON.parse(fs.readFileSync(path.join(base,'technical/fixtures/cr306/compact-byte-vectors.json'),'utf8'));
const checks=[];
for(const c of fixture.accepted){
 const normalized=JSON.stringify(JSON.parse(c.raw));
 checks.push({id:c.id,pass:normalized===c.normalized_json&&new TextEncoder().encode(normalized).byteLength===c.bytes,bytes:new TextEncoder().encode(normalized).byteLength});
}
for(const c of fixture.size_recipes){
 const value={[c.key]:c.repeat.repeat(c.count)+c.suffix};
 const bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength;
 checks.push({id:c.id,pass:bytes===c.bytes&&(bytes<=16384)===c.accepted,bytes});
}
for(const c of fixture.rejected_numbers){
 const v=Number(c.token);
 checks.push({id:c.id,pass:Number.isInteger(v)&&!Number.isSafeInteger(v)&&c.code==='number_out_of_range'&&c.status===422});
}
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json'),'utf8'));
const suffixes=['technical/api/administration.md','technical/fixtures/cr306/index.json','technical/fixtures/cr306/compact-byte-vectors.json','handoffs/backend-architecture.md'];
for(const suffix of suffixes){
 const item=manifest.files.find(i=>i.path===`${base}/${suffix}`);
 const digest=crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex');
 checks.push({id:`manifest:${suffix}`,pass:digest===item.sha256});
}
const archive=path.join(dir,'compact-bytes-before.tar.gz');
const result={version:'M003-BE-07',scope:'static contract vectors against Node ECMAScript JSON.stringify/TextEncoder; not BE/FE application verification or complete number-token validator',passed:checks.every(c=>c.pass),checks,fixture_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'technical/fixtures/cr306/compact-byte-vectors.json'))).digest('hex'),before_archive:archive,before_archive_sha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),runtime:process.version,command:'node .planning/milestones/M003/technical/evidence/cr306/check_compact_bytes.mjs',not_executed:['application Go/FE tests','database','live provider','browser','full 131-item checker']};
fs.writeFileSync(path.join(dir,'compact-bytes-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,checks:checks.length,failed:checks.filter(c=>!c.pass)}));
process.exitCode=result.passed?0:1;
