// Development-only disposable stack. No UAT data, configuration or AI credentials.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, request } from '../../../../../../frontend/node_modules/@playwright/test/index.mjs';
export const dir = dirname(fileURLToPath(import.meta.url));
export const origin = 'http://127.0.0.1:6101';
export const password = 'DevCr034SyntheticOnly!';
const prefix = 'ww-dev-cr034';
const docker = (args, options = {}) => execFileSync('docker', args, {encoding:'utf8', ...options}).trim();
const env = object => Object.entries(object).flatMap(([k,v]) => ['-e', k+'='+v]);
export const sql = input => docker(['exec','-i',prefix+'-db','psql','-U','postgres','-d','development','-X','-A','-t','-v','ON_ERROR_STOP=1'], {input});
export const quote = value => "'"+String(value).replaceAll("'","''")+"'";
const snapshot = () => JSON.parse(docker(['inspect','wordweave_uat-frontend-1','wordweave_uat-backend-1','wordweave_uat-nginx-1','wordweave_uat-postgres-1'])).map(x=>({name:x.Name,id:x.Id,image:x.Image,started:x.State.StartedAt}));
const save = (name, value) => writeFileSync(join(dir,name+'.json'),JSON.stringify(value,null,2)+'\n');
export async function login(context, username='dev034_old', locale='en-US') {
  const b = await (await context.request.get(origin+'/api/v1/bootstrap')).json();
  const r = await context.request.post(origin+'/api/v1/auth/login',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token},data:{username,password,browser_ui_locale:locale}});
  expect(r.status()).toBe(200);
  const csrf=(await r.json()).data.csrf_token;
  await context.request.put(origin+'/api/v1/me/ui-locale',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':csrf},data:{ui_locale:locale}});
  await context.addCookies([{name:'wordweave_ui_locale',value:locale,url:origin}]);
  return csrf;
}
export async function api(context, method, path, csrf, data) {
  const r = await context.request.fetch(origin+path,{method,headers:{origin,'sec-fetch-site':'same-origin',...(csrf?{'x-csrf-token':csrf}:{})},...(data?{data}:{})});
  return {status:r.status(),body:r.status()===204?null:await r.json()};
}
async function setup() {
  const existing=docker(['ps','-a','--format','{{.Names}}']).split('\n');
  if(existing.some(n=>n.startsWith(prefix)))throw Error('Existing owned name; inspect before reusing.');
  const probe=await import('node:net');
  await new Promise((resolve,reject)=>{const s=probe.createServer();s.once('error',reject);s.listen(6101,'127.0.0.1',()=>s.close(resolve));});
  save('environment-before',{at:new Date().toISOString(),uat:snapshot()});
  const frontend=docker(['image','inspect','wordweave-frontend:cr034-check','--format','{{.Id}}']);
  const backend='sha256:e8c4ee91a7c3265cda8c496ccc8fb485328d95b6c1662eaf2502011ce5d005a5';
  const pg='sha256:b85269e8c6aa961524542eb4dcca44c4aa1deba2cf507e9e28d5ba8f971aeab9';
  docker(['network','create','--internal','--label','wordweave.development=cr034',prefix]);
  docker(['network','create','--label','wordweave.development=cr034',prefix+'-edge']);
  docker(['run','-d','--name',prefix+'-db','--network',prefix,'--network-alias','db','--label','wordweave.development=cr034','--tmpfs','/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=development',pg]);
  for(let i=0;i<60;i++){try{docker(['exec',prefix+'-db','pg_isready','-U','postgres','-d','development']);break;}catch{}await new Promise(r=>setTimeout(r,500));}
  const common={PUBLIC_ORIGIN:origin,APP_DATABASE_URL:'postgres://postgres@db:5432/development?sslmode=disable',COOKIE_SECURE:'false',OPENROUTER_BASE_URL:'http://127.0.0.1:9/disabled',OPENROUTER_MASTER_KEYS:'1:'+randomBytes(32).toString('base64'),OPENROUTER_CURRENT_KEY_VERSION:'1',TRUSTED_PROXY_CIDRS:'0.0.0.0/0',LOG_LEVEL:'warn'};
  for(const key of ['SESSION_PEPPER','CAPABILITY_PEPPER','CSRF_HMAC_KEY','CURSOR_HMAC_KEY'])common[key]=randomBytes(32).toString('hex');
  docker(['run','--rm','--network',prefix,...env(common),'--entrypoint','/usr/local/bin/wordweave-admin',backend,'migrate']);
  sql('ALTER ROLE wordweave_app LOGIN; ALTER ROLE wordweave_ai LOGIN;');
  docker(['run','-d','--name',prefix+'-backend','--label','wordweave.development=cr034','--network',prefix,'--network-alias','backend',...env({...common,APP_DATABASE_URL:'postgres://wordweave_app@db:5432/development?sslmode=disable',AI_DATABASE_URL:'postgres://wordweave_ai@db:5432/development?sslmode=disable'}),backend]);
  docker(['run','-d','--name',prefix+'-frontend','--label','wordweave.development=cr034','--network',prefix,'--network-alias','frontend','-e','NUXT_BACKEND_INTERNAL_ORIGIN=http://backend:8080',frontend]);
  docker(['run','-d','--name',prefix+'-nginx','--label','wordweave.development=cr034','--network',prefix+'-edge','-p','127.0.0.1:6101:8080',...env({NGINX_LISTEN_PORT:'8080',BACKEND_HOST:'backend',BACKEND_PORT:'8080',FRONTEND_HOST:'frontend',FRONTEND_PORT:'3000'}),'wordweave_uat-nginx:latest']);
  docker(['network','connect',prefix,prefix+'-nginx']);
  docker(['restart',prefix+'-nginx']);
  let reachable=false;
  for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/v1/bootstrap',{signal:AbortSignal.timeout(2000)})).ok){reachable=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!reachable)throw Error('Disposable edge did not become ready');
  save('environment',{at:new Date().toISOString(),origin,frontend,backend,postgres:pg,network:'internal, no external provider access',uatUnchanged:JSON.stringify(snapshot())===JSON.stringify(JSON.parse(readFileSync(join(dir,'environment-before.json'))).uat)});
  console.log('Disposable production stack ready on 6101');
}
async function seed() {
  const users={};
  for(const username of ['dev034_old','dev034_empty','dev034_paused','dev034_changed']){
    const c=await request.newContext();const b=await(await c.get(origin+'/api/v1/bootstrap')).json();
    const r=await c.post(origin+'/api/v1/auth/register',{headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':b.data.csrf_token},data:{username,password,password_confirmation:password,ui_locale:'en-US'}});
    expect(r.status()).toBe(201);users[username]=sql('SELECT id FROM wordweave.accounts WHERE username='+quote(username));await c.dispose();
  }
  const batches=[];
  for(const [username,label,date,participates] of [
    ['dev034_old','before','2026-08-09T15:59:59Z',true],
    ['dev034_old','start','2026-08-09T16:00:00Z',true],
    ['dev034_old','middle','2026-08-10T12:00:00Z',true],
    ['dev034_old','end','2026-08-10T15:59:59Z',true],
    ['dev034_old','after','2026-08-10T16:00:00Z',true],
    ['dev034_old','paused','2026-08-10T12:00:00Z',false],
    ['dev034_paused','only-paused','2026-08-10T12:00:00Z',false],
    ['dev034_changed','changes-after-preview','2026-08-10T12:00:00Z',true],
  ]){
    const id=randomUUID(),target=randomUUID(),owner=users[username],passage='We learn together. They learned yesterday.';
    let commands='BEGIN;';
    commands+='INSERT INTO wordweave.learning_batches(id,owner_id,saved_at,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version,participates_in_range_review) VALUES('+[id,owner,date,'registered','Development fixture','disabled/fixture','zh','story','short',passage].map(quote).join(',')+",ARRAY['学习'],1,'m001-v2',"+participates+');';
    commands+='INSERT INTO wordweave.batch_targets(id,owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,contextual_meaning,hint_phrase,hint_surface,hint_start,hint_end) SELECT '+[target,owner,id].map(quote).join(',')+",id,'learn',0,'学习','learn and learn','learn',0,5 FROM wordweave.vocabulary_entries WHERE entry='learn';";
    for(const [i,surface] of ['learn','learned'].entries()){const offset=passage.indexOf(surface);commands+='INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES('+[quote(owner),quote(id),quote(target),i,quote(surface),offset,offset+surface.length].join(',')+');';}
    for(const [i,offset] of [0,10].entries())commands+='INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES('+[quote(owner),quote(id),quote(target),i,quote('learn'),offset,offset+5].join(',')+');';
    sql(commands+'COMMIT;');batches.push({id,owner,label,date,participates});
  }
  save('fixtures',{users,batches});console.log('Seeded 4 synthetic accounts and 8 saved batches; no generation calls');
}
async function smoke() {
  const f=JSON.parse(readFileSync(join(dir,'fixtures.json'))),checks=[];
  const browser=await chromium.launch();
  try{
    const c=await browser.newContext({timezoneId:'Asia/Shanghai',viewport:{width:1280,height:900}});
    const csrf=await login(c);const page=await c.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/hydration.*mismatch/i.test(m.text()))errors.push(m.text());});
    let previews=0;page.on('request',r=>{if(r.url().includes('/review-range/preview'))previews++;});
    await page.goto(origin+'/review');
    await expect(page.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
    expect(previews).toBe(1);await expect(page.locator('input[type=date]')).toHaveCount(2);
    checks.push('SSR/browser one correct-timezone preview; old-only range remains editable');
    await page.locator('#review-start').fill('2026-08-10');await page.locator('#review-end').fill('2026-08-10');
    await expect(page.locator('.range-count .count-number')).toHaveText('3');
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/me/review-sessions'));
    await page.locator('.range-editor button[type=submit]').click();
    const created=await(await response).json();expect(created.data.reused).toBe(false);expect(created.data.date_range).toEqual({start_date:'2026-08-10',end_date:'2026-08-10',timezone:'Asia/Shanghai'});
    const id=created.data.session_id;await expect(page).toHaveURL(origin+'/review/'+id);
    await expect(page.locator('.review-shell')).toBeVisible();
    const order=sql('SELECT batch_id FROM wordweave.review_session_batches WHERE session_id='+quote(id)+' ORDER BY batch_order').split('\n');
    expect([...order].sort()).toEqual(f.batches.filter(b=>['start','middle','end'].includes(b.label)).map(b=>b.id).sort());
    checks.push('Real inclusive local-day boundary selection, paused excluded, count=3 and exact session membership');
    const single=await api(c,'POST','/api/v1/me/review-sessions',csrf,{mode:'single_batch',batch_id:order[0]});
    expect(single.status).toBe(201);expect(single.body.data.mode).toBe('single_batch');expect(single.body.data.date_range).toBeNull();
    const active=await api(c,'GET','/api/v1/me/review-sessions/active-range');expect(active.body.data.session.session_id).toBe(id);
    const reused=await api(c,'POST','/api/v1/me/review-sessions',csrf,{mode:'range',start_date:'2026-08-09',end_date:'2026-08-11',timezone:'UTC'});
    expect(reused.status).toBe(200);expect(reused.body.data.reused).toBe(true);expect(reused.body.data.session_id).toBe(id);expect(reused.body.data.date_range).toEqual(created.data.date_range);
    checks.push('Range and single sessions coexist; different valid range reuses original server dates/session');
    await page.goto(origin+'/review');await expect(page.locator('.range-resume button')).toBeVisible();await page.locator('#review-start').fill('');
    await page.locator('.range-resume button').click();await expect(page).toHaveURL(origin+'/review/'+id);
    checks.push('Resume works while current draft invalid, with original session');
    expect(errors).toEqual([]);await c.close();
    for(const username of ['dev034_empty','dev034_paused']){
      const c=await browser.newContext();await login(c,username);const p=await c.newPage();await p.goto(origin+'/review');
      await p.locator('#review-start').fill('2020-01-01');await p.locator('#review-end').fill('2030-01-01');
      await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
      await expect(p.locator('.range-editor button[type=submit]')).toBeDisabled();await c.close();
    }
    checks.push('Independent empty-library and paused-only real data fixtures');
    const changed=await browser.newContext({timezoneId:'Asia/Shanghai'});await login(changed,'dev034_changed');const p=await changed.newPage();await p.goto(origin+'/review');
    await p.locator('#review-start').fill('2026-08-10');await p.locator('#review-end').fill('2026-08-10');await expect(p.locator('.count-number')).toHaveText('1');
    sql('UPDATE wordweave.learning_batches SET participates_in_range_review=false WHERE owner_id='+quote(f.users.dev034_changed));
    let posts=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/me/review-sessions'))posts++;});
    await p.locator('.range-editor button[type=submit]').click();
    await expect(p.locator('.app-error')).toBeVisible();await expect(p.locator('.range-editor')).toHaveAttribute('data-range-preview','empty');
    expect(posts).toBe(1);expect(sql('SELECT count(*) FROM wordweave.review_sessions WHERE owner_id='+quote(f.users.dev034_changed))).toBe('0');
    checks.push('Participation changes after preview: real 422, no empty session, GET reconciliation, no replay');
    await changed.close();
    save('real-smoke',{at:new Date().toISOString(),result:'PASS',checks,sessionOrder:order,providerCalls:0,runtimeErrors:errors});
    console.log(JSON.stringify({result:'PASS',checks}));
  }finally{await browser.close();}
}
async function cleanup() {
  const counts={accounts:sql('SELECT count(*) FROM wordweave.accounts'),batches:sql('SELECT count(*) FROM wordweave.learning_batches'),sessions:sql('SELECT count(*) FROM wordweave.review_sessions'),generationRuns:sql('SELECT count(*) FROM wordweave.generation_runs'),credentials:sql('SELECT count(*) FROM wordweave.openrouter_credentials')};
  const removed=[];
  for(const suffix of ['nginx','frontend','backend','db']){
    const name=prefix+'-'+suffix,info=JSON.parse(docker(['inspect',name]))[0];
    if(info.Config.Labels['wordweave.development']!=='cr034')throw Error('Not owned: '+name);
    docker(['stop',name]);docker(['rm',name]);removed.push(name);
  }
  const network=JSON.parse(docker(['network','inspect',prefix]))[0];
  if(network.Labels['wordweave.development']!=='cr034')throw Error('Not owned network');
  docker(['network','rm',prefix]);
  const edge=JSON.parse(docker(['network','inspect',prefix+'-edge']))[0];
  if(edge.Labels['wordweave.development']!=='cr034')throw Error('Not owned edge network');
  docker(['network','rm',prefix+'-edge']);
  save('cleanup',{at:new Date().toISOString(),removed,counts,syntheticData:'tmpfs deleted; not recoverable',uatUnchanged:JSON.stringify(snapshot())===JSON.stringify(JSON.parse(readFileSync(join(dir,'environment-before.json'))).uat)});
  console.log('Removed only owned disposable containers/network; synthetic tmpfs data deleted');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const command=process.argv[2];
  if(command==='setup')await setup();
  else if(command==='seed')await seed();
  else if(command==='smoke')await smoke();
  else if(command==='cleanup')await cleanup();
  else throw Error('Expected setup, seed, smoke or cleanup');
}
