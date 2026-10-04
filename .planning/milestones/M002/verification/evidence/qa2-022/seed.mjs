import { chromium, expect, dump, ok, raw, login, sql, providerStats } from './harness.mjs';
const browser = await chromium.launch(), admin = await browser.newContext();
try {
  await login(admin);
  const credential = await ok(admin, '/admin/openrouter-credential');
  await ok(admin, '/admin/openrouter-credential', 'PUT', { api_key: 'local-fixed-fixture-only', confirmed: true, expected_revision: credential.revision });
  const model = await ok(admin, '/admin/models', 'POST', { display_name: 'Local sample model', description: 'Local fixed sample: learn, weave, book; no external AI', openrouter_model_id: 'provider/integration' });
  await ok(admin, '/admin/models/' + model.model.id + '/enable', 'POST', { expected_revision: model.revision });
  for (const code of ['visitor', 'basic', 'pro']) {
    const groups = await ok(admin, '/admin/groups'), group = groups.items.find(x => x.code === code);
    await ok(admin, '/admin/groups/' + code, 'PUT', { expected_revision: groups.revision, priority: group.priority, max_entries: 3, rolling_24h_limit: 50, model_ids: [model.model.id], allowed_lengths: ['short', 'medium'] });
  }
  sql("UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '60 days'; INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0) ON CONFLICT(level_no) DO NOTHING; INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience) VALUES(CURRENT_DATE-60,1,1,7,1) ON CONFLICT(effective_day) DO NOTHING");
  const created = await ok(admin, '/admin/presets', 'POST', { title: 'A small habit of learning', configuration: { model_id: model.model.id, entries: ['learn', 'weave', 'book'], meaning_language: 'en', scenario: 'story', length: 'short' } });
  const id = created.preset.id;
  const preview = await raw(admin, '/admin/presets/' + id + '/previews/stream', 'POST', { draft_version: created.preset.draft_version });
  expect(preview.status()).toBe(200);
  expect(await preview.text()).toContain('event: preview.validated');
  const current = await ok(admin, '/admin/presets/' + id);
  await ok(admin, '/admin/presets/' + id + '/publish', 'POST', { draft_version: current.preset.draft_version, expected_revision: current.revision, confirmed: true });
  dump('fixture.json', { presetId: id, modelId: model.model.id, modelName: 'Local sample model', entries: ['learn', 'weave', 'book'], seeding: 'Model/plan/preset via real admin API, growth activation/rule via disposable SQL fixture only', provider: await providerStats() });
  console.log('Local model, plan, growth fixture and published preset ready.');
} finally { await browser.close(); }
