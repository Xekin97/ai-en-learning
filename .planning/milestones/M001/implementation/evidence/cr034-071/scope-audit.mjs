// Read-only source/evidence audit, apart from its own generated result JSON.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../../../../../..');
const baseline=JSON.parse(readFileSync(join(dir,'source-baseline.json'),'utf8'));
const m='.planning/milestones/M001';
const allowed=[m+'/implementation/frontend-validation.md',m+'/handoffs/frontend-implementation.md',m+'/changes/CR-034.md'];
const inserted={"latest":"## 最新提交：071 原型同步后的实时开发复验\n\n- [本轮详细报告](./frontend-cr034-breakpoint-validation.md)：新生产候选与新原型102/102实时对照一致，原901–1080px争议不再复现；没有生产代码改动。\n- 156 unit、90完整desktop/mobile Mock E2E、真实隔离API/会话6组、36组作用域Axe、16项颜色检查通过；双语实际200%缩放经浏览器view截图复核通过。\n- 原WebKit普通Tab的两项失败保留；对照原型确认原生Option-Tab行为后，双语完整交互复验通过。异常surface截图也保留，不作为视觉通过依据。\n- 本机Node22质量检查有engine warning；固定Node24 Docker构建命中缓存，不冒称本轮重新执行内部质量/SSR build。\n- [命令/原始结果](./evidence/cr034-071/development-command-results.json)、[工作区计划](./frontend-cr034-breakpoint-worktree-plan.md)、[清理](./evidence/cr034-071/cleanup.json)。6001不变，无AI调用；CR-029–034全部open。\n- 提交qa-quinn独立复验审批；旧QA FAIL不变，以下均为保留的历史记录。\n\n","handoff":"## 最新交接：071 实时断点复验完成，待独立测试\n\n### 输入与产物\n\n- 依据[071批准](../reviews/technical-cr034-breakpoint-revalidation-approval.md)执行[BP01–04](../technical/frontend-cr034-breakpoint-confirmation.md)，沿API v1.4/原FR01–18；不制造无差异源码修改。\n- [本轮报告](../implementation/frontend-cr034-breakpoint-validation.md)、[工作区计划](../implementation/frontend-cr034-breakpoint-worktree-plan.md)、[命令证据](../implementation/evidence/cr034-071/development-command-results.json)、[实时102组对照](../implementation/evidence/cr034-071/comparison-results.json)。\n- 候选frontend sha256:1326b841346634992f1d6a9228e909d39e987efc2f04e986d446a2573a0ff5e7；配套backend sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5；生产源码、设计/API/依赖未改。\n\n### 结果与限制\n\n- 102对照、156 unit、90 desktop/mobile契约Mock E2E、真实隔离业务6组、36作用域Axe、16颜色检查PASS；双引擎双语连续resize/语言/草稿/焦点/恢复通过。\n- WebKit原Tab失败记录保留，对照两端后使用原生Option-Tab完成双语聚焦复验；不改页面tabindex。\n- 实际200%中英文通过；采用-compositor.png浏览器view截图及滚动证据，保留异常标准surface截图但不将其当作通过依据。\n- 主机Node22有engine warning；固定Node24构建质量/SSR层来自缓存。真机/人工读屏及068扩展DST矩阵未在本轮重跑，不虚报。\n- 只清理本轮4容器/2网络和合成tmpfs，6001 UAT及6010原型服务不变；模型凭据/生成记录均0。[范围核对](../implementation/evidence/cr034-071/source-scope-check.json)。\n\n### 未决项与下一步\n\n- 原断点上游冲突已由批准设计同步和本轮实时对照消除；无需再次返回产品、UI或技术设计。\n- CR-029–034仍open；原独立FAIL、真实AI发布门和未重新交付UAT状态保持。主报告旧“冲突待决”段落仅是历史快照。\n- 请求用户批准交verification / quality/base / qa-quinn独立复验全部开放项；重点真实Users列表/详情搜索/阅读弹窗、CR-031中文“重试”、CR-032颜色例外/认证、CR-033真实quota及CR-034旧记录/空范围/会话链路。\n- 不仅复测Review，不将90项Mock当作所有真实接口通过；独立QA应自行重建隔离夹具并保留真实配套检查。\n- 遵循agt-frontend-implement，提交后停止；workflow仍implementation/frontend-claire/active/TRANSITION-M001-071，本交接不作阶段迁移或UAT批准。\n\n","cr":"\n### 第071轮实时开发复验（2026-09-06）\n\n069设计同步已获批准、070完成技术确认后，用户经[071](../reviews/technical-cr034-breakpoint-revalidation-approval.md)授权frontend-claire进行有限实时复验。[本轮报告](../implementation/frontend-cr034-breakpoint-validation.md)：当前生产候选与新批准原型102组实时比较全部一致，原901–1080px冲突不再复现；无需修改生产代码。\n\n156 unit、90既有Mock E2E、真实隔离旧记录/边界/空库/暂停/会话/422对账、双语实际200%缩放及颜色检查通过。WebKit原Tab失败经实现/原型对照诊断，使用本机原生Option-Tab完整复验通过；标准缩放surface截图异常另存并用浏览器view证据复核，原失败均未覆盖。\n\n仅完成开发复验，**CR保持open**；待qa-quinn独立复验CR-029–034后判定关闭。没有修改原独立QA FAIL、技术/设计/API或workflow，没有更新6001，没有调用真实AI；合成临时环境已按所有权清理。\n"};
const hash=text=>createHash('sha256').update(text).digest('hex');
const fileHash=path=>hash(readFileSync(resolve(root,path)));
const changed=[],missing=[],unchanged=[],unexpected=[];
for(const [path,sha] of Object.entries(baseline.hashes)){
 if(!existsSync(resolve(root,path))){missing.push(path);continue;}
 const after=fileHash(path);
 if(after===sha)unchanged.push(path);else{changed.push({path,before:sha,after});if(!allowed.includes(path))unexpected.push(path);}
}
const preservedSections=[];
for(const [path,key] of [[allowed[0],'latest'],[allowed[1],'handoff'],[allowed[2],'cr']]){
 const content=readFileSync(resolve(root,path),'utf8');
 const variants=[inserted[key],inserted[key]+'\n'];
 const restoration=variants.find(section=>content.includes(section)&&hash(content.replace(section,''))===baseline.hashes[path]);
 preservedSections.push({path,previousBytesPreserved:Boolean(restoration)});
}
const snapshots=Object.entries(baseline.approvedTechnicalSnapshots).map(([path,v])=>({path,sha256:fileHash(path),matches:fileHash(path)===v.sha256}));
const docs=[m+'/implementation/frontend-cr034-breakpoint-validation.md',...allowed.slice(0,2),m+'/implementation/frontend-cr034-breakpoint-worktree-plan.md',allowed[2]];
const localLinks=[];
const ownOutput=join(dir,'source-scope-check.json');
for(const path of docs){
 const text=readFileSync(resolve(root,path),'utf8');
 for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1];if(/^(?:https?:\/\/|#)/.test(target))continue;
  const resolved=resolve(dirname(resolve(root,path)),decodeURIComponent(target.split('#')[0]));
  localLinks.push({document:path,target,exists:existsSync(resolved)||resolved===ownOutput});
 }
}
const state=execFileSync('ruby',['-ryaml','-rjson','-e','s=YAML.safe_load(File.read(ARGV[0])); puts JSON.generate(s.values_at("stage","active_role","active_agent","status","last_transition"))',resolve(root,'.planning/workflow/state.yaml')],{encoding:'utf8'});
const sourcePaths=Object.keys(baseline.hashes).filter(p=>/^(frontend|backend|nginx)\//.test(p));
const result={
 at:new Date().toISOString(),
 verdict:missing.length===0&&unexpected.length===0&&preservedSections.every(x=>x.previousBytesPreserved)&&snapshots.every(x=>x.matches)&&localLinks.every(x=>x.exists)?'PASS':'FAIL',
 originalFiles:Object.keys(baseline.hashes).length,unchanged:unchanged.length,changed,missing,unexpected,
 productionSourceFiles:sourcePaths.length,productionUnchanged:sourcePaths.every(p=>fileHash(p)===baseline.hashes[p]),
 previousTextRestoration:preservedSections,approvedTechnicalSnapshots:snapshots,
 localLinks:{count:localLinks.length,missing:localLinks.filter(x=>!x.exists),selfOutputWillBeCreated:true},
 state:JSON.parse(state),
 originalFailureEvidencePreserved:[
 m+'/implementation/evidence/cr034/comparison-results.json',
 m+'/design/evidence/cr034-breakpoint-069/before/results.json',
 m+'/verification/report.md'
 ].map(path=>({path,unchanged:fileHash(path)===baseline.hashes[path]})),
 allowedChangeRule:'Only append/prepend current development notes to 3 existing documents; no production/API/design/technical/QA/workflow changes.'
};
writeFileSync(ownOutput,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result,null,2));
if(result.verdict!=='PASS')process.exitCode=1;
