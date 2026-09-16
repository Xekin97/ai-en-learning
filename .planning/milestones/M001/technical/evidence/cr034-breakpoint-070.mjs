import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const m='.planning/milestones/M001';
const paths={
 design:m+'/design/theme.css',
 theme:'frontend/app/assets/css/theme.css',
 styles:'frontend/app/assets/css/application.css',
 config:'frontend/nuxt.config.ts',
 page:'frontend/app/pages/review/index.vue',
 component:'frontend/app/presentation/components/review/ReviewRangeSetup.vue',
 controller:'frontend/app/presentation/controllers/review-setup.ts',
 store:'frontend/app/runtime/stores/review-setup.ts',
 presenter:'frontend/app/presentation/review/review-setup-presenter.ts',
 actions:'frontend/app/application/review/range-setup.ts',
 schemas:'frontend/app/infrastructure/http/schemas/review.ts',
 mapper:'frontend/app/infrastructure/http/mappers/index.ts',
 repository:'frontend/app/infrastructure/http/repositories/api-repository.ts',
 api:m+'/technical/api/index.md',
 contract:m+'/design/cr034-interaction-contract.md',
 technical:m+'/technical/frontend-cr034.md',
 result:m+'/design/evidence/cr034-breakpoint-069/after/results.json',
 comparison:m+'/implementation/evidence/cr034/comparison-results.json'
};
const src=Object.fromEntries(Object.entries(paths).map(([k,v])=>[k,readFileSync(v,'utf8')]));
const checks=[];
function check(id,description,pass){checks.push({id,description,pass});}
const compact=s=>s.replace(/\s+/g,'');
const rule=(s,pattern)=>{const hit=s.match(pattern);return hit?compact(hit[1]):null;};
const gridPattern=/@media\s*\(max-width:\s*1080px\)\s*\{\s*\.range-editor\s*\{([^}]+)\}/;
check('TC01','Both sources explicitly stack range-editor at max-width 1080px',rule(src.design,gridPattern)==='grid-template-columns:minmax(0,1fr);'&&rule(src.styles,gridPattern)==='grid-template-columns:minmax(0,1fr);');
for(const [id,label,pattern] of [
 ['TC02','Compact result declarations match',/\.range-editor\s+\.range-count\s*\{([^}]+)\}/],
 ['TC03','Compact number declarations match',/\.range-count\s+\.count-number\s*\{([^}]+)\}/],
 ['TC04','Small-screen date grid declarations match',/@media\s*\(max-width:\s*560px\)\s*\{\s*\.range-editor\s+\.date-range\s*\{([^}]+)\}/],
 ['TC05','Date field margin and minimum width match',/\.range-editor\s+\.date-range\s+\.field\s*\{([^}]+)\}/],
 ['TC06','Date input size declarations match',/\.range-editor\s+\.date-input\s*\{([^}]+)\}/],
 ['TC07','Desktop outer grid declarations match',/\.review-setup\s*\{([^}]+)\}/]
]){
 const b=id==='TC07'?src.theme:src.styles;const x=rule(src.design,pattern),y=rule(b,pattern);check(id,label,x!==null&&x===y);
}
check('TC08','Compact result uses min-height 6rem, not forced height',/min-height:\s*6rem/.test(src.styles)&&!/(?:^|[;{\s])height:\s*(?:6rem|96px)/.test(src.styles));
check('TC09','Nuxt loads application CSS after shared theme',/css:\s*\["~\/assets\/css\/theme.css",\s*"~\/assets\/css\/application.css"\]/.test(src.config));
check('TC10','Date form is unconditional within learner setup; component has no dynamic key',/<form class="card" novalidate @submit.prevent="emit\('start'\)">/.test(src.component)&&!/:key=|<form[^>]*v-if/.test(src.component));
check('TC11','Page/component surfaces do not import transport or call raw fetch',![src.page,src.component].some(s=>/infrastructure|\bDTO\b|Dto|\$fetch|useFetch|\bfetch\(/.test(s)));
check('TC12','Reviewed setup layers have no viewport-driven state or component switch',![src.page,src.component,src.controller,src.store,src.presenter,src.actions].some(s=>/matchMedia|innerWidth|useWindowSize|useBreakpoints|screen\.width/.test(s)));
check('TC13','API preview returns mapped envelope data; app accepts application result',src.repository.includes('return mapReviewRangePreviewDto(envelope.data)')&&src.mapper.includes('batchCount: dto.batch_count')&&src.actions.includes('input.api.previewReviewRange('));
const historical=JSON.parse(src.result),hash=s=>createHash('sha256').update(s).digest('hex');
check('TC14','Current prototype matches approved design result theme digest',hash(src.design)===historical.themeSha256);
check('TC15','Frozen production comparison digest is unchanged',hash(src.comparison)===historical.productionSnapshotSha256);
const sources=Object.fromEntries(Object.entries(paths).map(([k,p])=>[p,{sha256:hash(src[k]),bytes:Buffer.byteLength(src[k])}]));
const result={date:'2026-09-06',role:'frontend-architect/base',agent:'frontend-bob',authorization:'TRANSITION-M001-070',scope:'Static source and handoff checks only. No browser, runtime, unit, build, API or independent QA run.',status:checks.every(c=>c.pass)?'PASS':'FAIL',checks,sources,referencedDesignCounts:historical.counts};
console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
