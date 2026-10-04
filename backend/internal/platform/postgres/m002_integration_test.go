//go:build integration

package postgres

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func m002Database(t *testing.T, legacy bool) (*pgxpool.Pool, context.Context) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)
	url, cleanup := createMigrationTestDatabase(t, ctx, integrationDatabaseURL(t))
	t.Cleanup(cleanup)
	pool, err := Open(ctx, url, "m002-migration-test", 4)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if legacy {
		for _, name := range []string{"0001_roles_and_schema.sql", "0002_core_tables.sql", "0003_fixed_groups.sql", "0004_vocabulary_m001.sql", "0005_hint_occurrences_expand.sql", "0006_hint_occurrences_enforce.sql", "0007_entry_meaning.sql"} {
			applyEmbeddedMigration(t, ctx, pool, name)
		}
	} else if err := Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	return pool, ctx
}

func TestM002FreshMigrationDoesNotActivateOrSeedRewards(t *testing.T) {
	pool, ctx := m002Database(t, false)
	var count int
	var active *time.Time
	if err := pool.QueryRow(ctx, `SELECT activated_at FROM wordweave.growth_settings`).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != nil {
		t.Fatal("migration must not activate growth")
	}
	for _, table := range []string{"growth_balances", "growth_settlements", "growth_levels", "achievement_tiers", "checkin_rules", "user_masteries", "user_checkins", "user_items", "analytics_events"} {
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.`+pgx.Identifier{table}.Sanitize()).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("migration invented %s records: %d", table, count)
		}
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.vocabulary_entries v JOIN wordweave.lexemes l ON l.id=v.lexeme_id AND l.canonical_entry=v.entry`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 13860 {
		t.Fatalf("stable lexeme mapping: %d", count)
	}
	if err := Migrate(ctx, pool); err != nil {
		t.Fatalf("idempotent migration: %v", err)
	}
}

func TestM002MigrationPreservesLegacyContentReviewAndQuota(t *testing.T) {
	pool, ctx := m002Database(t, true)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var owner, batch, target, session, model uuid.UUID
	mustScan := func(row pgx.Row, out *uuid.UUID) {
		t.Helper()
		if err := row.Scan(out); err != nil {
			t.Fatal(err)
		}
	}
	mustScan(tx.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code,quota_reset_at) VALUES('migration_reader','test-only','learner','registered',now()-interval '12 hours') RETURNING id`), &owner)
	mustScan(tx.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Legacy model','test/legacy',true) RETURNING id`), &model)
	mustScan(tx.QueryRow(ctx, `INSERT INTO wordweave.learning_batches(owner_id,group_code_snapshot,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,passage,tags,expected_target_count,validator_version)
 VALUES($1,'registered','Legacy model','test/legacy','en','story','short','Learning brings steady progress.',ARRAY['study'],1,'m001-v1') RETURNING id`, owner), &batch)
	mustScan(tx.QueryRow(ctx, `INSERT INTO wordweave.batch_targets(owner_id,batch_id,vocabulary_entry_id,source_entry_snapshot,input_order,entry_meaning,hint_phrase,hint_surface,hint_start,hint_end)
 SELECT $1,$2,id,'learn',0,'gain knowledge','shared learning','learning',7,15 FROM wordweave.vocabulary_entries WHERE entry='learn' RETURNING id`, owner, batch), &target)
	for _, query := range []string{
		`INSERT INTO wordweave.hint_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES($1,$2,$3,0,'learning',7,15)`,
		`INSERT INTO wordweave.passage_occurrences(owner_id,batch_id,target_id,occurrence_order,surface,start_offset,end_offset) VALUES($1,$2,$3,0,'Learning',0,8)`,
	} {
		if _, err := tx.Exec(ctx, query, owner, batch, target); err != nil {
			t.Fatal(err)
		}
	}
	for _, skips := range []int{0, 1} {
		mustScan(tx.QueryRow(ctx, `INSERT INTO wordweave.review_sessions(owner_id,mode,single_batch_id,status,completed_at) VALUES($1,'single',$2,'completed',now()) RETURNING id`, owner, batch), &session)
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.review_session_batches(owner_id,session_id,batch_id,batch_order) VALUES($1,$2,$3,0)`, owner, session, batch); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.review_results(owner_id,session_id,batch_id,successful,error_count,skip_count,stage1_completed,stage2_completed) VALUES($1,$2,$3,$4,0,$5,true,true)`, owner, session, batch, skips == 0, skips); err != nil {
			t.Fatal(err)
		}
	}
	for _, hours := range []int{1, 13, 25} {
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.generation_runs(account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,max_entries_snapshot,call_status,counts_toward_cumulative,started_at,completed_at)
   VALUES($1,$1,'registered',$2,'Legacy model','test/legacy','en','story','short',50,5,'user_cancelled',true,now()-make_interval(hours=>$3),now()-make_interval(hours=>$3))`, owner, model, hours); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var before string
	if err := pool.QueryRow(ctx, `SELECT md5(to_jsonb(b)::text) FROM wordweave.learning_batches b WHERE id=$1`, batch).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var after, title string
	if err := pool.QueryRow(ctx, `SELECT md5((to_jsonb(b)-'title'-'title_revision'-'growth_event_id')::text),title FROM wordweave.learning_batches b WHERE id=$1`, batch).Scan(&after, &title); err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatal("legacy batch snapshot changed")
	}
	var passage string
	var unchanged bool
	if err := pool.QueryRow(ctx, `SELECT passage,entry_meaning='gain knowledge' AND source_entry_snapshot='learn' FROM wordweave.learning_batches b JOIN wordweave.batch_targets t ON t.batch_id=b.id WHERE b.id=$1`, batch).Scan(&passage, &unchanged); err != nil {
		t.Fatal(err)
	}
	if title != "learn" || passage != "Learning brings steady progress." || !unchanged {
		t.Fatal("legacy content changed")
	}
	var total, successful, skipped, unknown, progress, charged, cumulative int
	if err := pool.QueryRow(ctx, `SELECT count(*),count(*) FILTER(WHERE successful),count(*) FILTER(WHERE has_unanswered),count(*) FILTER(WHERE has_answer IS NULL AND started_at IS NULL AND origin='m001') FROM wordweave.review_attempts WHERE owner_id=$1`, owner).Scan(&total, &successful, &skipped, &unknown); err != nil {
		t.Fatal(err)
	}
	if total != 2 || successful != 1 || skipped != 1 || unknown != 2 {
		t.Fatalf("legacy facts %d/%d/%d/%d", total, successful, skipped, unknown)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.review_session_batches WHERE owner_id=$1 AND progress_status='completed' AND first_submitted_at IS NOT NULL`, owner).Scan(&progress); err != nil {
		t.Fatal(err)
	}
	if progress != 2 {
		t.Fatal("first submission progress missing")
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_charges c JOIN wordweave.plan_quota_states q ON q.owner_id=c.account_id AND q.plan_code=c.plan_code AND q.origin=c.origin AND q.reset_epoch=c.quota_epoch WHERE c.account_id=$1 AND c.charged_at>=greatest(now()-interval '24 hours',q.reset_at) AND c.state<>'refunded'`, owner).Scan(&charged); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_runs WHERE credited_account_id=$1 AND counts_toward_cumulative`, owner).Scan(&cumulative); err != nil {
		t.Fatal(err)
	}
	if charged != 1 || cumulative != 3 {
		t.Fatalf("quota/history changed: %d/%d", charged, cumulative)
	}
	verifyM002BackupRestore(t, ctx, pool)
}

func TestM002ConstraintsRejectPartialConfiguration(t *testing.T) {
	pool, ctx := m002Database(t, false)
	reject := func(sql string) {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		_, err = tx.Exec(ctx, sql)
		if err == nil {
			err = tx.Commit(ctx)
		}
		if err == nil {
			t.Fatalf("invalid state accepted: %s", sql)
		}
	}
	reject(`INSERT INTO wordweave.platform_notices(title_zh,body_en) VALUES('中文标题','English body')`)
	reject(`INSERT INTO wordweave.item_definitions(kind,name_en,description_en,exchange_price,activation_ttl_seconds,trial_seconds,retirement_points) VALUES('model_trial','Card','Description',0,3600,3600,0)`)
	reject(`INSERT INTO wordweave.item_definitions(kind,name_en,description_en,exchange_price,activation_ttl_seconds) VALUES('model_trial','Card','Description',0,3600)`)
	reject(`INSERT INTO wordweave.achievement_tiers(kind,threshold,enabled,name_en,title_en,description_zh,points,experience) VALUES('mastered_words',1,true,'Name','Title',' ',0,0)`)
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0),(2,100,true,0),(3,200,true,0),(4,400,true,0),(5,800,true,0)`); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SET CONSTRAINTS wordweave.growth_levels_min_experience_unique DEFERRED; UPDATE wordweave.growth_levels SET min_experience=200 WHERE level_no=2; UPDATE wordweave.growth_levels SET min_experience=300 WHERE level_no=3; SET CONSTRAINTS wordweave.growth_levels_min_experience_unique IMMEDIATE`); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var allowed bool
	for _, role := range []string{"wordweave_ai"} {
		if err := pool.QueryRow(ctx, `SELECT has_table_privilege($1,'wordweave.user_items','SELECT')`, role).Scan(&allowed); err != nil {
			t.Fatal(err)
		}
		if allowed {
			t.Fatal("AI role can access private inventory")
		}
	}
}
