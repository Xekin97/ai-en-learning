// Design reception only. No imports into the application, network, persistence or server.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../../..');
const { z } = createRequire(path.join(root, 'frontend/package.json'))('zod');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'M002-BE-03-contract-examples.json'), 'utf8'));
const output = path.join(__dirname, 'M002-FE-02-contract-check.json');
assert(!fs.existsSync(output), 'Evidence is immutable; preserve a failed run before retrying');
const checks = [];
function check(id, label, run) {
  try { run(); checks.push({id, label, status:'PASS'}); }
  catch (error) { checks.push({id, label, status:'FAIL', detail:error.message}); }
}
const eq = assert.deepEqual;
const clone = structuredClone;
const S = z.string().min(1);
const Amount = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => BigInt(v) <= 9223372036854775807n);
const Count = z.number().int().min(0).max(2147483647);
const Positive = z.number().int().min(1).max(9007199254740991);
const Kind = z.enum(['checkin_streak','review_streak','mastered_words','saved_passages']);
const ItemKind = z.enum(['makeup','extra_credit','model_trial','plan_trial']);
const Time = z.string().datetime({offset:true});
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const envelope = data => z.strictObject({data,meta:z.strictObject({request_id:S})});
const textSlot = max => z.string().refine(v => Array.from(v).length <= max).nullable();
const Description = z.strictObject({zh_CN:textSlot(2000),en_US:textSlot(2000)});
const RequiredText = z.strictObject({zh_CN:textSlot(200),en_US:textSlot(200)})
  .refine(v => Boolean(v.zh_CN?.trim() || v.en_US?.trim()));
const rewardShape = {points:Amount,item_definition_id:S.nullable(),item_count:Count};
const rewardValid = v => v.item_definition_id === null ? v.item_count === 0 : v.item_count > 0;
const Reward = z.strictObject(rewardShape).refine(rewardValid);
const AchievementReward = z.strictObject({...rewardShape,experience:Amount}).refine(rewardValid);
const checkinShape = {base_points:Amount,step_points:Amount,cap_points:Amount,normal_experience:Amount};
const capValid = v => BigInt(v.cap_points) >= BigInt(v.base_points);
const Checkin = z.strictObject({...checkinShape,effective_day:Day}).refine(capValid);
const SettingsInput = z.strictObject({...checkinShape,mastery_experience:Amount,expected_revision:S}).refine(capValid);
const Settings = z.strictObject({learning_day:Day,mastery_experience:Amount,growth_started_at:Time.nullable(),current:Checkin.nullable(),pending:Checkin.nullable(),revision:S});
const levelShape = {level_number:z.number().int().min(1).max(2147483647),min_experience:Amount,reward_enabled:z.boolean(),reward:Reward};
const Level = z.strictObject(levelShape);
const LevelConfig = z.strictObject({id:S,...levelShape});
const achievementShape = {threshold:Positive,enabled:z.boolean(),name:RequiredText,title:RequiredText,description:Description,reward:AchievementReward};
const AchievementFields = z.strictObject(achievementShape);
const AchievementConfig = z.strictObject({id:S,kind:Kind,...achievementShape});
const change = value => z.strictObject({client_key:z.string().uuid(),id:S.nullable(),value});
const uniqueChanges = rows => new Set(rows.map(r=>r.client_key)).size === rows.length && new Set(rows.filter(r=>r.id!==null).map(r=>r.id)).size === rows.filter(r=>r.id!==null).length;
const levelChangesShape = {expected_revision:S,changes:z.array(change(Level)).min(1).refine(uniqueChanges)};
const LevelChanges = z.strictObject(levelChangesShape);
const LevelSave = z.strictObject({...levelChangesShape,confirmation_token:S,confirmed:z.literal(true)});
const AchievementChanges = z.strictObject({kind:Kind,expected_revision:S,changes:z.array(change(AchievementFields)).min(1).refine(uniqueChanges)});
const LevelConfiguration = z.strictObject({items:z.array(LevelConfig),revision:S});
const AchievementConfiguration = z.strictObject({kind:Kind,items:z.array(AchievementConfig),revision:S})
  .refine(v=>v.items.every(x=>x.kind===v.kind));
const saved = configuration => z.strictObject({configuration,saved_rows:z.array(z.strictObject({client_key:z.string().uuid(),id:S}))});
const LevelImpact = z.strictObject({may_downgrade:z.boolean(),affected_users:z.number().int().min(0),rewards_use_latest_config:z.literal(true),confirmation_token:S,expires_at:Time,revision:S});
const Model = z.strictObject({id:S,name:S,description:z.string().nullable()});
const Options = z.strictObject({models:z.array(Model),meaning_languages:z.tuple([z.literal('zh'),z.literal('en'),z.literal('ja')]),scenarios:z.tuple([z.literal('discussion'),z.literal('story'),z.literal('business'),z.literal('news')]),lengths:z.tuple([z.literal('short'),z.literal('medium'),z.literal('long'),z.literal('xlong')]),vocabulary_version:S,revision:S,availability:z.strictObject({can_preview:z.boolean(),reason:z.enum(['credential_missing','no_models']).nullable()})})
  .refine(v=>v.availability.can_preview ? v.models.length>0 && v.availability.reason===null : v.availability.reason==='credential_missing' || v.availability.reason==='no_models' && v.models.length===0);
const Problem = z.strictObject({type:S,title:S,status:z.number().int().min(400).max(599),code:S,detail:S,request_id:S,field_errors:z.array(z.strictObject({field:S,code:S})).optional(),context:z.strictObject({current_revision:S}).optional()})
  .refine(v=>v.code==='revision_conflict' ? v.context!==undefined : v.context===undefined);
const UserReward = z.strictObject({points:Amount,experience:Amount,item:z.strictObject({definition_id:S,name:S,kind:ItemKind,count:Positive}).nullable()});
const UserAchievement = z.strictObject({id:S,tier_id:S,kind:Kind,name:z.string(),title:z.string(),description:z.string().nullable(),threshold:Positive,progress:z.number().int().min(0),state:z.enum(['unachieved','claimable','blocked','claimed']),block_reason:z.enum(['tier_disabled','reward_unavailable','level_required']).nullable(),achieved_at:Time.nullable(),claimed_at:Time.nullable(),reward:UserReward,settlement_id:S.nullable()});

// Explicit mapping samples, deliberately separate from transport shape.
const mapLocalized = v => ({zh:v.zh_CN,en:v.en_US});
const encodeDescription = v => ({zh_CN:v.zh?.trim() ? v.zh : null,en_US:v.en?.trim() ? v.en : null});
const mapReward = v => ({points:v.points,itemDefinitionId:v.item_definition_id,itemCount:v.item_count});
const mapAchievement = v => ({id:v.id,kind:v.kind,threshold:v.threshold,enabled:v.enabled,nameText:mapLocalized(v.name),honorText:mapLocalized(v.title),descriptionText:mapLocalized(v.description),reward:{...mapReward(v.reward),experience:v.reward.experience}});
const encodeAchievement = v => ({threshold:v.threshold,enabled:v.enabled,name:{zh_CN:v.nameText.zh?.trim()||null,en_US:v.nameText.en?.trim()||null},title:{zh_CN:v.honorText.zh?.trim()||null,en_US:v.honorText.en?.trim()||null},description:encodeDescription(v.descriptionText),reward:{points:v.reward.points,item_definition_id:v.reward.itemDefinitionId,item_count:v.reward.itemCount,experience:v.reward.experience}});
const mapCheckin = v => v===null ? null : ({effectiveDay:v.effective_day,basePoints:v.base_points,stepPoints:v.step_points,capPoints:v.cap_points,normalExperience:v.normal_experience});
const mapSettings = v => ({learningDay:v.learning_day,masteryExperience:v.mastery_experience,growthStartedAt:v.growth_started_at,current:mapCheckin(v.current),pending:mapCheckin(v.pending),revision:v.revision});
const mapOptions = v => ({models:v.models.map(m=>({id:m.id,name:m.name,description:m.description})),meaningLanguages:[...v.meaning_languages],scenarios:[...v.scenarios],lengths:[...v.lengths],vocabularyVersion:v.vocabulary_version,revision:v.revision,availability:v.availability.can_preview?{kind:'ready'}:{kind:'blocked',reason:v.availability.reason==='credential_missing'?'credentialMissing':'noModels'}});
function validateSaved(command, result) {
  eq(result.saved_rows.length, command.changes.length);
  eq(new Set(result.saved_rows.map(x=>x.id)).size,result.saved_rows.length);
  command.changes.forEach((row,i)=>{
    const savedRow=result.saved_rows[i]; eq(savedRow.client_key,row.client_key);
    assert(result.configuration.items.some(x=>x.id===savedRow.id));
    if(row.id!==null) eq(row.id,savedRow.id);
  });
}
const issueRow = (submission,pointer) => {
  const match=/^\/changes\/(0|[1-9][0-9]*)\/(.+)$/.exec(pointer);
  return match && submission.changes[Number(match[1])] ? {clientKey:submission.changes[Number(match[1])].client_key,path:match[2]} : null;
};
const reject = (schema,value) => assert.equal(schema.safeParse(value).success,false);

check('FE2-C01-01','Approved six description inputs, raw language slots and selected user projection',()=>{
  for(const v of fixture.description_cases){
    Description.parse(v.input);
    eq(encodeDescription(mapLocalized(v.input)),v.stored);
    const dto={id:'award_fixture',tier_id:'tier_fixture',kind:'mastered_words',name:'Name',title:'Historic honor',description:v.projection,threshold:10,progress:10,state:'claimable',block_reason:null,achieved_at:'2026-09-20T00:00:00Z',claimed_at:null,reward:{points:'10',experience:'5',item:null},settlement_id:null};
    const parsed=UserAchievement.parse(dto);
    const app={descriptionText:parsed.description,honorText:parsed.title};
    eq(app.descriptionText,v.projection);eq(app.descriptionText!==null,v.projection!==null);
    eq(app.honorText,'Historic honor');
  }
});
check('FE2-C01-02','Missing object, null, missing slot, invalid slot and unknown key rejected',()=>{
  for(const v of fixture.description_invalid_cases) reject(Description,v.value);
  reject(Description,{zh_CN:null,en_US:null,html:'unsafe'});
  reject(Description,undefined); reject(RequiredText,{zh_CN:null,en_US:null});
});
check('FE2-C01-03','Unicode limits, nonblank whitespace preserved, no HTML parsing',()=>{
  Description.parse({zh_CN:'😀'.repeat(2000),en_US:null});
  reject(Description,{zh_CN:'😀'.repeat(2001),en_US:null});
  RequiredText.parse({zh_CN:'😀'.repeat(200),en_US:null});
  reject(RequiredText,{zh_CN:'😀'.repeat(201),en_US:null});
  eq(encodeDescription({zh:'  <b>文字</b>\n',en:'\n ' }),{zh_CN:'  <b>文字</b>\n',en_US:null});
});
check('FE2-C01-04','Admin row mapper and encoder preserve missing translation and reward values',()=>{
  const row=fixture.achievement_save.response.data.configuration.items[1];
  const app=mapAchievement(AchievementConfig.parse(row));
  eq(app.descriptionText,{zh:null,en:'Master more words.'});
  eq(encodeAchievement(app),fixture.achievement_save.request.changes[0].value);
  eq(Object.hasOwn(app,'description'),false);eq(Object.hasOwn(app.reward,'item_count'),false);
  const missing=clone(row);delete missing.description;reject(AchievementConfig,missing);
});
check('FE2-C02-01','Five-value request, current/pending date separation and uninitialized nulls',()=>{
  SettingsInput.parse(fixture.settings.request);
  const dto=envelope(Settings).parse(fixture.settings.response).data;
  const app=mapSettings(dto);eq(app.current.basePoints,'1');eq(app.pending.basePoints,'2');eq(app.masteryExperience,'5');
  eq(app.pending.effectiveDay,'2026-09-21');
  const empty=mapSettings(envelope(Settings).parse(fixture.settings.uninitialized).data);
  eq([empty.current,empty.pending,empty.growthStartedAt],[null,null,null]);
  reject(SettingsInput,{...fixture.settings.request,cap_points:'0'});
  reject(SettingsInput,{...fixture.settings.request,idempotency_key:'unexpected'});
});
check('FE2-C02-02','Four-to-six level rows, full-set response, preview and stable saved row binding',()=>{
  LevelConfiguration.parse(fixture.level_save.before);
  LevelChanges.parse(fixture.level_save.preview_request);
  envelope(LevelImpact).parse(fixture.level_save.preview_response);
  LevelSave.parse(fixture.level_save.request);
  const result=envelope(saved(LevelConfiguration)).parse(fixture.level_save.response).data;
  eq(fixture.level_save.before.items.length,4);eq(result.configuration.items.length,6);
  validateSaved(fixture.level_save.request,result);
  eq(result.configuration.items.map(x=>x.min_experience),['0','200','300','400','500','600']);
});
check('FE2-C02-03','One-kind changes preserve untouched rows and add fifth/sixth tier',()=>{
  AchievementConfiguration.parse(fixture.achievement_save.before);
  AchievementChanges.parse(fixture.achievement_save.request);
  const result=envelope(saved(AchievementConfiguration)).parse(fixture.achievement_save.response).data;
  validateSaved(fixture.achievement_save.request,result);
  eq(result.configuration.items.length,6);
  eq(result.configuration.items.filter(x=>['ac_1','ac_3','ac_4'].includes(x.id)),fixture.achievement_save.before.items.filter(x=>['ac_1','ac_3','ac_4'].includes(x.id)));
  reject(envelope(AchievementConfiguration),{data:result.configuration,meta:{request_id:'r',next_cursor:null,has_more:false}});
});
check('FE2-C02-04','Amount range, integer limits, required fields, empty/duplicate changes',()=>{
  eq(Amount.parse('9223372036854775807'),'9223372036854775807');
  for(const v of ['9223372036854775808','01','-1','1.5',9007199254740991])reject(Amount,v);
  reject(Positive,9007199254740992);reject(Positive,1.5);reject(Count,2147483648);
  reject(Reward,{points:'1',item_definition_id:null,item_count:1});
  reject(LevelChanges,{expected_revision:'r',changes:[]});
  reject(LevelChanges,{expected_revision:'r',changes:[fixture.level_save.request.changes[0],fixture.level_save.request.changes[0]]});
  reject(LevelSave,{...fixture.level_save.request,confirmed:false});
  reject(LevelChanges,{level_number:2,min_experience:'10',expected_revision:'r'});
});
check('FE2-C02-05','Field pointer stays attached to submission row after reordering/filtering',()=>{
  AchievementChanges.parse(fixture.row_error.request);Problem.parse(fixture.row_error.response);
  const target=issueRow(fixture.row_error.request,fixture.row_error.response.field_errors[0].field);
  eq(target,{clientKey:'00000000-0000-4000-8000-000000000105',path:'value/threshold'});
  const visible=[...fixture.row_error.request.changes].reverse();
  eq(visible.findIndex(x=>x.client_key===target.clientKey),0);
  eq(issueRow(fixture.row_error.request,'/changes/99/value/name'),null);
  eq(issueRow(fixture.row_error.request,'/changes'),null);
  eq(fixture.row_error.state_after,fixture.achievement_save.before);
});
check('FE2-C02-06','Invalid saved rows cannot partially replace client state',()=>{
  for(const mutate of [v=>v.saved_rows.reverse(),v=>v.saved_rows.pop(),v=>v.saved_rows[0].id='missing',v=>v.saved_rows[0].client_key='00000000-0000-4000-8000-000000000999']){
    const bad=clone(fixture.level_save.response.data);mutate(bad);
    assert.throws(()=>validateSaved(fixture.level_save.request,bad));
  }
});
check('FE2-C03-01','Preview and save changes identical; token stripped from mapped display data',()=>{
  eq(fixture.level_save.preview_request.changes,fixture.level_save.request.changes);
  eq(fixture.level_save.preview_request.expected_revision,fixture.level_save.request.expected_revision);
  const dto=fixture.level_save.preview_response.data;
  const display={mayDowngrade:dto.may_downgrade,affectedUsers:dto.affected_users,rewardsUseLatestConfig:dto.rewards_use_latest_config};
  eq(Object.hasOwn(display,'confirmation_token'),false);
  eq(dto.confirmation_token,fixture.level_save.request.confirmation_token);
});
check('FE2-C03-02','Unknown result fixture: old revision conflict and current read is not receipt',()=>{
  Problem.parse(fixture.unknown_commit.retry_response);
  eq(fixture.unknown_commit.retry_http_status,409);
  const read=envelope(LevelConfiguration).parse(fixture.unknown_commit.read_after);
  assert(read.data.revision!==fixture.unknown_commit.request_expected_revision);
  eq(Object.hasOwn(read.data,'saved_rows'),false);
  reject(Problem,{...fixture.unknown_commit.retry_response,context:{current_revision:'new',token:'unexpected'}});
});
check('FE2-C04-01','Four distinct admin availability fixtures, full ordered options, independent application mapping',()=>{
  const expected=['ready','credentialMissing','noModels','credentialMissing'];
  fixture.admin_options_cases.forEach((v,i)=>{
    const dto=envelope(Options).parse(v.response).data;const app=mapOptions(dto);
    eq(app.availability.kind==='ready'?'ready':app.availability.reason,expected[i]);
    eq(app.meaningLanguages,['zh','en','ja']);eq(app.lengths,['short','medium','long','xlong']);
    eq(Object.hasOwn(app,'quota'),false);eq(Object.hasOwn(app,'maxEntries'),false);
    if(i===1)eq(app.models.length,1);
    if(i>=2)eq(app.models.length,0);
  });
});
check('FE2-C04-02','Unavailable HTTP error is not an empty successful options response',()=>{
  eq(fixture.admin_options_failure.http_status,503);
  Problem.parse(fixture.admin_options_failure.response);
  reject(envelope(Options),fixture.admin_options_failure.response);
});
check('FE2-C04-03','Unknown/provider/plan fields, null arrays and inconsistent availability rejected',()=>{
  const good=fixture.admin_options_cases[0].response.data;
  for(const key of ['quota','max_entries','access','openrouter_model_id','prompt'])reject(Options,{...good,[key]:'unexpected'});
  reject(Options,{...good,models:[{...good.models[0],openrouter_model_id:'private'}]});
  reject(Options,{...good,models:null});reject(Options,{...good,meaning_languages:['zh','en']});
  reject(Options,{...good,models:[],availability:{can_preview:true,reason:null}});
  reject(Options,{...good,availability:{can_preview:false,reason:'no_models'}});
  const missing=clone(good);delete missing.vocabulary_version;reject(Options,missing);
});
const report={version:'M002-FE-02',recorded_at:new Date().toISOString(),status:checks.every(x=>x.status==='PASS')?'PASS':'FAIL',input:'M002-BE-03-contract-examples.json',checks,scope:'Design-level strict schema and mapping examples. No application/store/browser/HTTP/PostgreSQL tests. Scenario choreography remains FE2-V18–20 implementation work.',production_tests:false,real_ai_calls:0};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.length,failed:checks.filter(x=>x.status==='FAIL')}));
process.exitCode=report.status==='PASS'?0:1;
