import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';

const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../../../../../..');
const image='golang@sha256:e8c859f5632dcfde7b32d2012b4351728f6437930887c2f6a91ea242459e5514';
const commands={
  unit:['go','test','-race','./...','-count=1'],
  token:['go','test','-race','./internal/generation','-count=1'],
  targeted:['go','test','-race','-tags=integration','./internal/httpapi','-run','TestDraft','-count=1','-v'],
  related:['go','test','-race','-tags=integration','./internal/httpapi','-run','TestDraft|TestCR039(BrowserDisconnect|OneExplicit|InputVocabulary|InvalidFinal)|TestM001EndToEnd','-count=1','-v'],
  vet:['go','vet','-tags=integration','./...'],
  modules:['go','mod','verify'],
  fuzz:['go','test','./internal/generation','-run','^$','-fuzz','FuzzRunTokenVerifier','-fuzztime','5s','-parallel','2'],
  format:['gofmt','-l','internal/generation/token.go','internal/generation/token_test.go','internal/generation/service.go','internal/generation/registry.go','internal/learning/service.go','internal/maintenance/maintenance.go','internal/httpapi/cr039_snapshot_integration_test.go','internal/httpapi/draft_lifecycle_integration_test.go','internal/httpapi/draft_process_integration_test.go'],
  build:[],
};
const task=process.argv[2];
if(!commands[task])throw Error('Unknown check');
const integration=['targeted','related'].includes(task);
let args=['run','--rm','--network',integration?'ww-dev-cr039-095':'none','-v',join(root,'backend')+':/src','-w','/src','-v','wordweave-go-mod:/go/pkg/mod','-v','wordweave-go-build:/root/.cache/go-build','-e','GOPROXY=off','-e','GOSUMDB=off'];
if(integration)args.push('-e','TEST_DATABASE_URL=postgres://postgres@db:5432/postgres?sslmode=disable');
args.push(image,...commands[task]);
if(task==='build')args=['build','--network=none','-t','wordweave-backend:cr039-095',join(root,'backend')];
const start=Date.now();let output='',status=0;
try{output=execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024,timeout:300000});if(task==='format'&&output.trim())status=1;}
catch(error){status=error.status??1;output=String(error.stdout??'')+'\n'+String(error.stderr??'');}
writeFileSync(join(dir,task+'.log'),output);
writeFileSync(join(dir,task+'.json'),JSON.stringify({date:new Date().toISOString(),command:['docker',...args],exit_code:status,elapsed_ms:Date.now()-start,real_model_calls:0},null,2)+'\n');
if(task==='build'&&status===0){const id=execFileSync('docker',['image','inspect','--format','{{.Id}}','wordweave-backend:cr039-095'],{encoding:'utf8'}).trim();writeFileSync(join(dir,'candidate.json'),JSON.stringify({tag:'wordweave-backend:cr039-095',image:id,uat_deployed:false,legacy_rollback_candidate:false},null,2)+'\n');}
console.log(JSON.stringify({task,status,elapsed_ms:Date.now()-start,log:join(dir,task+'.log')}));
console.log(output.slice(-7000));process.exitCode=status;
