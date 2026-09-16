//go:build integration

package postgres

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func cutoverTestDatabase(t *testing.T) (context.Context, *pgxpool.Pool, CutoverOptions, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	url, cleanup := createMigrationTestDatabase(t, ctx, integrationDatabaseURL(t))
	t.Cleanup(cleanup)
	pool, err := Open(ctx, url, "cr040-cutover-test", 1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	for _, name := range []string{"0001_roles_and_schema.sql", "0002_core_tables.sql", "0003_fixed_groups.sql", "0004_vocabulary_m001.sql", "0005_hint_occurrences_expand.sql", "0006_hint_occurrences_enforce.sql"} {
		applyEmbeddedMigration(t, ctx, pool, name)
	}
	if _, err := pool.Exec(ctx, cutoverSeed); err != nil {
		t.Fatal("synthetic cutover seed failed", err)
	}
	o := CutoverOptions{WritersStopped: true, LockTimeout: 100 * time.Millisecond, StatementTimeout: 20 * time.Second}
	if err := pool.QueryRow(ctx, "SELECT current_database(),system_identifier::text,current_user FROM pg_control_system()").Scan(&o.ExpectedDatabase, &o.ExpectedSystemID, &o.ExpectedRole); err != nil {
		t.Fatal(err)
	}
	return ctx, pool, o, url
}

// All values below are synthetic; no application configuration or live secrets.
const cutoverSeed = `
DO $$
DECLARE a uuid; u uuid; v uuid; m uuid; r uuid; r2 uuid; b uuid; t uuid; s uuid; w bigint;
BEGIN
 INSERT INTO wordweave.accounts(username,password_hash,role,group_code)
 VALUES ('cutover_admin','synthetic-admin-password-hash','admin',NULL) RETURNING id INTO a;
 INSERT INTO wordweave.accounts(username,password_hash,role,group_code)
 VALUES ('cutover_learner','synthetic-learner-password-hash','learner','registered') RETURNING id INTO u;
 INSERT INTO wordweave.account_sessions(account_id,token_hash,expires_at)
 VALUES (a,'admin-session'::bytea,clock_timestamp()+interval '1 day'),(u,'learner-session'::bytea,clock_timestamp()+interval '1 day');
 INSERT INTO wordweave.visitor_identities(token_hash) VALUES ('visitor'::bytea) RETURNING id INTO v;
 INSERT INTO wordweave.ai_models(display_name,description,provider_model_id,enabled)
 VALUES ('Synthetic kept model','unchanged','test/offline',true) RETURNING id INTO m;
 INSERT INTO wordweave.openrouter_credentials(ciphertext,nonce,encryption_key_version,display_fingerprint,updated_by)
 VALUES ('synthetic-ciphertext'::bytea,'synthetic-nonce'::bytea,1,'synthetic',a);
 INSERT INTO wordweave.group_models SELECT code,m FROM wordweave.entitlement_groups;
 UPDATE wordweave.entitlement_groups SET rolling_quota_limit=19,max_entries_per_run=9;
 DELETE FROM wordweave.group_lengths WHERE length_code<>'short';
 SELECT id INTO w FROM wordweave.vocabulary_entries WHERE entry='learn';
 INSERT INTO wordweave.generation_runs(visitor_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,
 meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,disposition,counts_toward_cumulative,completed_at)
 VALUES (v,u,'visitor',m,'Synthetic kept model','test/offline','en','story','short',1,5,'valid','saved',true,clock_timestamp()) RETURNING id INTO r;
 INSERT INTO wordweave.generation_runs(visitor_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,
 meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,counts_toward_cumulative,completed_at)
 VALUES (v,'visitor',m,'Synthetic kept model','test/offline','en','story','short',1,5,'valid',true,clock_timestamp()) RETURNING id INTO r2;
 INSERT INTO wordweave.generation_run_entries VALUES (r,w,0,'learn'),(r2,w,0,'learn');
 INSERT INTO wordweave.generation_drafts(run_id,access_token_hash,payload,expires_at)
 VALUES (r2,'draft-token'::bytea,'{"targets":[{"contextual_meaning":"old synthetic content"}]}',clock_timestamp()+interval '1 hour');
 INSERT INTO wordweave.learning_batches(owner_id,generation_run_id,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,
 meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version)
 VALUES (u,r,'visitor','Synthetic kept model','test/offline','en','story','short','Learn and learn.',ARRAY['study'],1,'m001-v3-wn31-r1') RETURNING id INTO b;
 INSERT INTO wordweave.batch_targets(owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,contextual_meaning,hint_phrase,hint_surface,hint_start,hint_end)
 VALUES(u,b,w,'learn',0,'old synthetic meaning','learn and learn','learn',0,5) RETURNING id INTO t;
 INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset)
 VALUES(u,b,t,0,'learn',0,5),(u,b,t,1,'learn',10,15);
 INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset)
 VALUES(u,b,t,0,'Learn',0,5),(u,b,t,1,'learn',10,15);
 INSERT INTO wordweave.visitor_claims(run_id,visitor_id,token_hash,status,consumed_account_id,consumed_batch_id,consumed_at,expires_at)
 VALUES(r,v,'consumed-claim'::bytea,'consumed',u,b,clock_timestamp(),clock_timestamp()+interval '1 hour');
 INSERT INTO wordweave.visitor_claims(run_id,visitor_id,token_hash,expires_at)
 VALUES(r2,v,'active-claim'::bytea,clock_timestamp()+interval '1 hour');
 INSERT INTO wordweave.review_sessions(owner_id,mode,single_batch_id,status,completed_at)
 VALUES(u,'single',b,'completed',clock_timestamp()) RETURNING id INTO s;
 INSERT INTO wordweave.review_session_batches VALUES(u,s,b,0);
 INSERT INTO wordweave.review_session_targets VALUES(s,b,t,0);
 INSERT INTO wordweave.review_results(owner_id,session_id,batch_id,successful,error_count,skip_count,stage1_completed,stage2_completed)
 VALUES(u,s,b,true,0,0,true,true);
END $$;`

func cutoverDigest(t *testing.T, ctx context.Context, pool *pgxpool.Pool) map[string]string {
	t.Helper()
	result := map[string]string{}
	for table := range cutoverColumns {
		var digest string
		if err := pool.QueryRow(ctx, "SELECT md5(COALESCE(jsonb_agg(row ORDER BY row)::text,'[]')) FROM (SELECT to_jsonb(t) AS row FROM "+pgx.Identifier{"wordweave", table}.Sanitize()+" t) s").Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result[table] = digest
	}
	return result
}

func TestCR040CutoverPreservesAndClearsOnlyApprovedData(t *testing.T) {
	ctx, pool, o, _ := cutoverTestDatabase(t)
	before := cutoverDigest(t, ctx, pool)
	result, err := CutoverEntryMeaning(ctx, pool, o)
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "committed" || result.Deleted["learner_accounts"] != 1 || result.Deleted["visitor_claims"] != 2 {
		t.Fatal("incomplete deletion report")
	}
	after := cutoverDigest(t, ctx, pool)
	for _, table := range []string{"ai_models", "openrouter_credentials", "vocabulary_snapshots", "vocabulary_entries"} {
		if before[table] != after[table] {
			t.Fatal("retained data changed in", table)
		}
	}
	var admins, sessions, models, limits, lengths int
	if err := pool.QueryRow(ctx, `SELECT
	 (SELECT count(*) FROM wordweave.accounts WHERE username='cutover_admin' AND password_hash='synthetic-admin-password-hash'),
	 (SELECT count(*) FROM wordweave.account_sessions),(SELECT count(*) FROM wordweave.group_models),
	 (SELECT count(*) FROM wordweave.entitlement_groups WHERE max_entries_per_run=5),
	 (SELECT count(*) FROM wordweave.group_lengths)`).Scan(&admins, &sessions, &models, &limits, &lengths); err != nil {
		t.Fatal(err)
	}
	if admins != 1 || sessions != 0 || models != 0 || limits != 4 || lengths != 16 {
		t.Fatal("postconditions differ")
	}
	if err := Verify(ctx, pool); err != nil {
		t.Fatal(err)
	}
	// Ordinary startup must accept fresh business data and custom group policies.
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code) VALUES ('new_learner','synthetic','learner','registered');
	UPDATE wordweave.entitlement_groups SET rolling_quota_limit=7 WHERE code='visitor';`); err != nil {
		t.Fatal(err)
	}
	newData := cutoverDigest(t, ctx, pool)
	if _, err := CutoverEntryMeaning(ctx, pool, o); err == nil {
		t.Fatal("repeated destructive cutover accepted")
	}
	if err := Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(newData, cutoverDigest(t, ctx, pool)) {
		t.Fatal("rerun or ordinary migration changed new data")
	}
}

func TestCR040CutoverRollsBackEveryFailureBoundary(t *testing.T) {
	for _, point := range []string{"delete_visitor_claims", "delete_batch_targets", "before_constraints", "before_migration", "after_migration", "before_commit"} {
		t.Run(point, func(t *testing.T) {
			ctx, pool, o, _ := cutoverTestDatabase(t)
			before := cutoverDigest(t, ctx, pool)
			result, err := cutoverEntryMeaning(ctx, pool, o, cutoverHooks{at: func(stage string, tx pgx.Tx) error {
				if stage == point {
					return errors.New("synthetic injected failure")
				}
				return nil
			}})
			if err == nil || result.Outcome != "rolled_back" {
				t.Fatal("failure not reported")
			}
			if !reflect.DeepEqual(before, cutoverDigest(t, ctx, pool)) {
				t.Fatal("failure left partial data")
			}
			tx, e := pool.Begin(ctx)
			if e != nil {
				t.Fatal(e)
			}
			e = checkCutoverPrestate(ctx, tx)
			_ = tx.Rollback(ctx)
			if e != nil {
				t.Fatal("source schema or ledger changed")
			}
		})
	}
}

func TestCR040CutoverRefusesUnexpectedTargetAndSchema(t *testing.T) {
	for _, scenario := range []string{"database", "system", "role", "writers", "column", "table", "credential_owner", "unflushed_constraint", "ledger_write"} {
		t.Run(scenario, func(t *testing.T) {
			ctx, pool, o, _ := cutoverTestDatabase(t)
			switch scenario {
			case "database":
				o.ExpectedDatabase += "_wrong"
			case "system":
				o.ExpectedSystemID += "1"
			case "role":
				o.ExpectedRole = "wordweave_app"
			case "writers":
				o.WritersStopped = false
			case "column":
				_, err := pool.Exec(ctx, "ALTER TABLE wordweave.accounts ADD COLUMN unknown_data text")
				if err != nil {
					t.Fatal(err)
				}
			case "table":
				_, err := pool.Exec(ctx, "CREATE TABLE wordweave.unknown_data(id int)")
				if err != nil {
					t.Fatal(err)
				}
			case "credential_owner":
				_, err := pool.Exec(ctx, "UPDATE wordweave.openrouter_credentials SET updated_by=(SELECT id FROM wordweave.accounts WHERE role='learner')")
				if err != nil {
					t.Fatal(err)
				}
			case "unflushed_constraint":
				_, err := pool.Exec(ctx, `CREATE FUNCTION wordweave.cr040_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic constraint'; END $$;
				CREATE CONSTRAINT TRIGGER cr040_fail AFTER DELETE ON wordweave.visitor_claims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wordweave.cr040_fail();`)
				if err != nil {
					t.Fatal(err)
				}
			case "ledger_write":
				_, err := pool.Exec(ctx, `CREATE FUNCTION wordweave.cr040_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic ledger'; END $$;
				CREATE TRIGGER cr040_fail BEFORE INSERT ON wordweave.schema_migrations FOR EACH ROW EXECUTE FUNCTION wordweave.cr040_fail();`)
				if err != nil {
					t.Fatal(err)
				}
			}
			before := cutoverDigest(t, ctx, pool)
			if _, err := CutoverEntryMeaning(ctx, pool, o); err == nil {
				t.Fatal("unsafe or failed operation accepted")
			}
			if !reflect.DeepEqual(before, cutoverDigest(t, ctx, pool)) {
				t.Fatal("rejected operation changed data")
			}
		})
	}
}

func TestCR040CutoverCommitUnknownIsNotRetried(t *testing.T) {
	for _, committed := range []bool{false, true} {
		t.Run(map[bool]string{false: "not_committed", true: "committed"}[committed], func(t *testing.T) {
			ctx, pool, o, _ := cutoverTestDatabase(t)
			calls := 0
			result, err := cutoverEntryMeaning(ctx, pool, o, cutoverHooks{commit: func(ctx context.Context, tx pgx.Tx) error {
				calls++
				if committed {
					if e := tx.Commit(ctx); e != nil {
						return e
					}
				}
				return errors.New("synthetic connection loss")
			}})
			var cutoverError *CutoverError
			if !errors.As(err, &cutoverError) || result.Outcome != "unknown" || calls != 1 || result.Deleted != nil {
				t.Fatal("unknown commit was concealed or retried")
			}
			var applied bool
			if err := pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM wordweave.schema_migrations WHERE version=$1)", entryMeaningMigration).Scan(&applied); err != nil {
				t.Fatal(err)
			}
			if applied != committed {
				t.Fatal("read-only reconciliation differs")
			}
		})
	}
}

func TestCR040CutoverLockConflictDoesNotKillOtherSession(t *testing.T) {
	ctx, pool, o, url := cutoverTestDatabase(t)
	before := cutoverDigest(t, ctx, pool)
	var connection *pgx.Conn
	t.Cleanup(func() {
		if connection != nil {
			_ = connection.Close(context.Background())
		}
	})
	result, err := cutoverEntryMeaning(ctx, pool, o, cutoverHooks{at: func(stage string, tx pgx.Tx) error {
		if stage != "before_lock" {
			return nil
		}
		var e error
		connection, e = pgx.Connect(ctx, url)
		if e != nil {
			return e
		}
		_, e = connection.Exec(ctx, "BEGIN; LOCK TABLE wordweave.accounts IN ACCESS SHARE MODE")
		return e
	}})
	if err == nil || result.Outcome != "rolled_back" {
		t.Fatal("lock conflict not rejected")
	}
	if _, err := connection.Exec(ctx, "ROLLBACK"); err != nil {
		t.Fatal("other session was terminated")
	}
	_ = connection.Close(ctx)
	if !reflect.DeepEqual(before, cutoverDigest(t, ctx, pool)) {
		t.Fatal("lock failure changed data")
	}
}

func TestCR040OrdinaryMigrationRefusesOldDraftsWithoutCleanup(t *testing.T) {
	ctx, pool, _, _ := cutoverTestDatabase(t)
	before := cutoverDigest(t, ctx, pool)
	if err := Migrate(ctx, pool); err == nil {
		t.Fatal("ordinary migrate silently handled old drafts")
	}
	if !reflect.DeepEqual(before, cutoverDigest(t, ctx, pool)) {
		t.Fatal("ordinary migrate deleted or converted data")
	}
}
