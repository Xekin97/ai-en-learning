import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../../../../..');
const files = [
  '.planning/milestones/M003/design/design-spec.md',
  '.planning/milestones/M003/design/theme.css',
  '.planning/milestones/M003/design/interactions.md',
  '.planning/milestones/M003/design/responsive-accessibility.md',
  '.planning/milestones/M003/design/copy.json',
  '.planning/milestones/M003/design/prototype/index.html',
  '.planning/milestones/M003/design/prototype/app.js',
  '.planning/milestones/M003/design/prototype/fixtures.json',
  '.planning/milestones/M003/design/prototype/m002/assets/README.md',
  '.planning/milestones/M003/design/prototype/m002/assets/lucide-LICENSE.txt',
  '.planning/milestones/M003/design/prototype/m002/assets/lucide.json',
  '.planning/milestones/M003/design/prototype/m002/icons.js',
  '.planning/milestones/M003/design/prototype/m002/select.js',
  '.planning/milestones/M003/design/prototype/m002/word-picker.js',
  '.planning/milestones/M003/handoffs/uiux.md',
  '.planning/milestones/M003/design/evidence/cr306/browser.mjs',
];
const digest = async file => createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
const archive = '.planning/milestones/M003/design/evidence/cr306/M003-UI-10-source.tar.gz';
const baselineArchive = '.planning/milestones/M003/reviews/evidence/cr306-design-baselines/ui-before-cr306.tar.gz';
const interactionInputFiles = [
  '.planning/milestones/M003/technical/fixtures/cr306/index.json',
  '.planning/milestones/M003/technical/fixtures/cr306/management.json',
  '.planning/milestones/M003/technical/fixtures/cr306/errors.json',
  '.planning/milestones/M003/technical/fixtures/cr306/streams.json',
  '.planning/milestones/M003/technical/fixtures/cr306/gateway.json',
  '.planning/milestones/M003/technical/fixtures/stream-v5/index.json',
];
const baselineManifest = JSON.parse(await fs.readFile(path.join(root,'.planning/milestones/M003/reviews/evidence/cr306-design-baselines/ui-before-manifest.json'),'utf8'));
const baselineActual = await digest(baselineArchive);
const output = {
  version:'M003-UI-10',
  created_at:new Date().toISOString(),
  scope:'CR-306 UI/UX source recovery package; static prototype, not application implementation',
  visual_baseline:'M002 current effective formal design via theme.css import and UI29–31 provider/model components',
  interaction_inputs:await Promise.all(interactionInputFiles.map(async file=>({path:file,sha256:await digest(file)}))),
  baseline_verification:{
    archive:baselineArchive,
    expected_sha256:baselineManifest.sha256,
    actual_sha256:baselineActual,
    unchanged:baselineActual===baselineManifest.sha256,
  },
  files:await Promise.all(files.map(async file=>({path:file,sha256:await digest(file)}))),
  archive,
  sha256:await digest(archive),
  evidence:{
    browser:'.planning/milestones/M003/design/evidence/cr306/M003-UI-10-browser.json',
    screenshots:[
      '.planning/milestones/M003/design/evidence/cr306/01-model-editor-1440-zh.png',
      '.planning/milestones/M003/design/evidence/cr306/02-model-protected-error-390-en.png',
      '.planning/milestones/M003/design/evidence/cr306/03-model-saved-1440-zh.png',
      '.planning/milestones/M003/design/evidence/cr306/04-create-timeout-1440-zh.png',
    ],
  },
};
await fs.writeFile(path.join(root,'.planning/milestones/M003/design/evidence/cr306/M003-UI-10-source-manifest.json'),JSON.stringify(output,null,2)+'\n');
if (!output.baseline_verification.unchanged) process.exitCode=1;
