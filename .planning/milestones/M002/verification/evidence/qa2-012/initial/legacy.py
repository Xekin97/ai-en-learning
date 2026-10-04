"""One real M001 row, inserted before migration 0008, for AC-220.

This is an isolated QA fixture. It does not add a production migration path.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import uuid

PSQL = '/opt/homebrew/opt/postgresql@18/bin/psql'


def sql(env, query):
    return subprocess.run(
        [PSQL, env['APP_DATABASE_URL'], '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
        input=query, text=True, capture_output=True, check=True,
    ).stdout.strip()


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def prepare_legacy(root, work, env):
    assert env['APP_DATABASE_URL'] == 'postgres://fe_test@127.0.0.1:63541/wordweave_fe_m002?sslmode=disable'
    assert env['OPENROUTER_BASE_URL'] == 'http://127.0.0.1:38082'
    vocab = (root / 'backend/assets/vocabulary/english-words.json').read_bytes()
    digest = hashlib.sha256(vocab).hexdigest()
    assert digest == 'de75e77fdff529b4e6726730c80c11415abbce215ec7852a6c4a670b061dea75'
    words = json.loads(vocab)
    assert len(vocab) == 144527 and len(words) == len(set(words)) == 13860
    applied = []
    for migration in sorted((root / 'backend/db/migrations').glob('*.sql')):
        if int(migration.name[:4]) > 7:
            break
        body = migration.read_text()
        if migration.name == '0004_vocabulary_m001.sql':
            body += f"""
INSERT INTO wordweave.vocabulary_snapshots(version,sha256,byte_size,entry_count)
VALUES ('m001',{quote(digest)},144527,13860);
INSERT INTO wordweave.vocabulary_entries(snapshot_id,entry,source_order)
SELECT s.id,j.value,j.ordinality-1
FROM wordweave.vocabulary_snapshots s,
jsonb_array_elements_text({quote(json.dumps(words))}::jsonb) WITH ORDINALITY AS j(value,ordinality)
WHERE s.version='m001';
"""
        sql(env, 'BEGIN;\n' + body + '\nINSERT INTO wordweave.schema_migrations(version) VALUES (' + quote(migration.name) + ');\nCOMMIT;')
        applied.append(migration.name)
    assert len(applied) == 7
    owner, batch, target = [str(uuid.uuid4()) for _ in range(3)]
    # Same validated legacy content shape used by the developer migration test.
    sql(env, f"""
BEGIN;
INSERT INTO wordweave.accounts(id,username,password_hash,role,group_code,ui_locale)
VALUES ('{owner}','qa_title_legacy','unusable-until-fixture-setup','learner','registered','en-US');
INSERT INTO wordweave.learning_batches(id,owner_id,group_code_snapshot,model_display_name_snapshot,
provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version)
VALUES ('{batch}','{owner}','registered','Legacy model','test/legacy','en','story','short',
'Learning brings steady progress.',ARRAY['study'],1,'m001-v1');
INSERT INTO wordweave.batch_targets(id,owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,
input_order,entry_meaning,hint_phrase,hint_surface,hint_start,hint_end)
SELECT '{target}','{owner}','{batch}',id,'learn',0,'gain knowledge','shared learning','learning',7,15
FROM wordweave.vocabulary_entries WHERE entry='learn';
INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset)
VALUES ('{owner}','{batch}','{target}',0,'learning',7,15);
INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset)
VALUES ('{owner}','{batch}','{target}',0,'Learning',0,8);
COMMIT;
""")
    before = sql(env, f"SELECT md5(to_jsonb(b)::text) FROM wordweave.learning_batches b WHERE id='{batch}'")
    (work / 'legacy-fixture.json').write_text(json.dumps({
        'owner': owner, 'batch': batch, 'username': 'qa_title_legacy',
        'inserted_after': applied, 'before_batch_md5': before,
        'verification': 'awaiting_current_migration',
    }, indent=2))


def finish_legacy(work, env):
    path = work / 'legacy-fixture.json'
    fixture = json.loads(path.read_text())
    batch = fixture['batch']
    after = sql(env, f"SELECT md5((to_jsonb(b)-'title'-'title_revision'-'growth_event_id')::text) FROM wordweave.learning_batches b WHERE id='{batch}'")
    assert after == fixture['before_batch_md5'], 'Legacy content changed during migration'
    assert sql(env, f"SELECT title FROM wordweave.learning_batches WHERE id='{batch}'") == 'learn'
    # A valid hash from the disposable admin only; credentials never enter evidence.
    sql(env, f"""UPDATE wordweave.accounts SET password_hash=(
SELECT password_hash FROM wordweave.accounts WHERE username={quote(env['ADMIN_USERNAME'])})
WHERE id='{fixture['owner']}';""")
    fixture.update(verification='migrated_with_content_unchanged', after_batch_md5=after, default_title='learn')
    path.write_text(json.dumps(fixture, indent=2))
