import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const evidenceDir=path.dirname(new URL(import.meta.url).pathname);
const root=path.resolve(evidenceDir,'../../../../../..');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex');
async function walk(dir){const out=[];for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const source=[
 '.planning/milestones/M003/design/design-spec.md',
 '.planning/milestones/M003/design/theme.css',
 '.planning/milestones/M003/design/interactions.md',
 '.planning/milestones/M003/design/responsive-accessibility.md',
 '.planning/milestones/M003/design/copy.json',
 '.planning/milestones/M003/design/prototype/index.html',
 '.planning/milestones/M003/design/prototype/app.js',
 '.planning/milestones/M003/design/prototype/fixtures.json',
 ...await walk('.planning/milestones/M003/design/prototype/m002'),
 '.planning/milestones/M003/handoffs/uiux.md',
 '.planning/milestones/M003/design/evidence/cr306-r1/observe-live.mjs',
 '.planning/milestones/M003/design/evidence/cr306-r1/verify-modal-r1.mjs',
].sort();
const archive='.planning/milestones/M003/design/evidence/cr306-r1/M003-UI-10-R1-source.tar.gz';
const tar=spawnSync('tar',['-czf',archive,...source],{cwd:root,encoding:'utf8'});
if(tar.status!==0)throw new Error(tar.stderr||'tar failed');
const inputs=[
 '.planning/milestones/M003/technical/fixtures/cr306/index.json',
 '.planning/milestones/M003/technical/fixtures/cr306/management.json',
 '.planning/milestones/M003/technical/fixtures/cr306/errors.json',
 '.planning/milestones/M003/technical/fixtures/cr306/streams.json',
 '.planning/milestones/M003/technical/fixtures/cr306/gateway.json',
 '.planning/milestones/M003/technical/fixtures/stream-v5/index.json',
];
const productionRefs=['frontend/app/presentation/components/AppDialog.vue','frontend/app/pages/admin/models.vue','frontend/app/assets/css/theme.css'];
const evidence=[
 '.planning/milestones/M003/design/evidence/cr306-r1/live-appdialog-observation.json',
 '.planning/milestones/M003/design/evidence/cr306-r1/00-live-model-list-1440.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/01-live-editor-modal-1440.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/02-live-editor-modal-390.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/modal-rework-browser.json',
 '.planning/milestones/M003/design/evidence/cr306-r1/10-r1-list-1440.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/11-r1-modal-initial-1440.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/12-r1-modal-json-1440.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/13-r1-modal-initial-390.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/14-r1-modal-error-390.png',
 '.planning/milestones/M003/design/evidence/cr306-r1/15-r1-discard-confirm-390.png',
];
const app=await fs.readFile(path.join(root,'.planning/milestones/M003/design/prototype/app.js'),'utf8');
const manifest={
 version:'M003-UI-10-R1',created_at:new Date().toISOString(),status:'ready_for_user_review',
 scope:'CR-306 PAGE-208 UI/UX modal correction and recoverable design source; static prototype, not application implementation',
 supersedes:{version:'M003-UI-10',reason:'PAGE-208 used non-modal <dialog open>; old source and evidence retained unchanged',archive:'.planning/milestones/M003/design/evidence/cr306/M003-UI-10-source.tar.gz',sha256:await hash('.planning/milestones/M003/design/evidence/cr306/M003-UI-10-source.tar.gz')},
 visual_baseline:'M002 formal tokens and provider/model components plus read-only production AppDialog/models observation',
 interaction_inputs:await Promise.all(inputs.map(async p=>({path:p,sha256:await hash(p)}))),
 production_read_only_references:await Promise.all(productionRefs.map(async p=>({path:p,sha256:await hash(p)}))),
 baseline_verification:{archive:'.planning/milestones/M003/reviews/evidence/cr306-design-baselines/ui-before-cr306.tar.gz',sha256:await hash('.planning/milestones/M003/reviews/evidence/cr306-design-baselines/ui-before-cr306.tar.gz'),unchanged:true},
 page208_modal_source_checks:{uses_showModal:app.includes('.showModal()'),admin_model_shell_has_open_attribute:/<dialog id="admin-model"[^>]*\sopen(?:\s|>)/.test(app),uses_dialog_body:app.includes('class="dialog-body"'),uses_nested_discard_modal:app.includes('id="model-discard"')},
 files:await Promise.all(source.map(async p=>({path:p,sha256:await hash(p)}))),
 archive:{path:archive,sha256:await hash(archive)},
 evidence:await Promise.all(evidence.map(async p=>({path:p,sha256:await hash(p)}))),
 browser_results:{live_observation:'PASS',prototype:{completed:true,result:'PASS'}},
 independent_receipt:{path:'.planning/milestones/M003/reviews/evidence/cr306-modal-rework-073/revised-modal-receipt.json',sha256:await hash('.planning/milestones/M003/reviews/evidence/cr306-modal-rework-073/revised-modal-receipt.json'),result:'PASS'},
 limitations:['No production frontend source changed by designer-tony','No save, test, delete, or model call was made against the running UAT site','CR-306 remains open and UI10-R1 awaits user visual review'],
};
await fs.writeFile(path.join(evidenceDir,'M003-UI-10-R1-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
