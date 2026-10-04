//go:build integration

package generation

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func presetFixture(t *testing.T) (*Service, *pgxpool.Pool, context.Context, identity.Actor, PresetInput) {
	t.Helper()
	pool, ctx := testdb.Open(t)
	var admin, model uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role) VALUES('preset_admin','fixture-only','admin') RETURNING id`).Scan(&admin); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Preview model','test/preview',true) RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	env, err := security.NewEnvelope(map[int][]byte{1: make([]byte, 32)}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(pool, env)
	if err = credentials.Put(ctx, admin, "synthetic-not-a-real-key"); err != nil {
		t.Fatal(err)
	}
	s := NewService(pool, credentials, nil, []byte(strings.Repeat("p", 32)), 30*time.Minute, ai.Validator{})
	return s, pool, ctx, identity.Actor{Kind: "account", Role: "admin", ID: admin}, PresetInput{Title: "A useful day", Configuration: PresetConfigurationInput{ModelID: model, Entries: []string{"learn", "weave"}, MeaningLanguage: "en", Scenario: "story", Length: "long"}}
}
func samplePreset() ai.ValidatedBatch {
	return ai.ValidatedBatch{Passage: "We learn and weave.", Tags: []string{"study"}, WordCount: 4, ValidatorVersion: ai.ValidatorVersion, Targets: []ai.ValidatedTarget{
		{Entry: "learn", EntryMeaning: "gain knowledge", HintPhrase: "learn well", HintOccurrences: []ai.Occurrence{{Surface: "learn", Start: 0, End: 5}}, PassageOccurrences: []ai.Occurrence{{Surface: "learn", Start: 3, End: 8}}},
		{Entry: "weave", EntryMeaning: "make cloth", HintPhrase: "weave cloth", HintOccurrences: []ai.Occurrence{{Surface: "weave", Start: 0, End: 5}}, PassageOccurrences: []ai.Occurrence{{Surface: "weave", Start: 13, End: 18}}},
	}}
}
func readyPreset(t *testing.T, s *Service, ctx context.Context, admin identity.Actor, in PresetInput) (AdminPreset, string) {
	t.Helper()
	p, _, err := s.SavePreset(ctx, admin, uuid.Nil, in, "")
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.StartPreview(ctx, admin, p.ID, p.DraftVersion)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CompletePreview(ctx, run, samplePreset()); err != nil {
		t.Fatal(err)
	}
	p, rev, err := s.AdminPreset(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	return p, rev
}
func TestM002PresetDraftPreviewPublicationIsolation(t *testing.T) {
	s, pool, ctx, admin, in := presetFixture(t)
	p, rev, err := s.SavePreset(ctx, admin, uuid.Nil, in, "")
	if err != nil {
		t.Fatal(err)
	}
	if p.Listed || p.Preview != nil || p.DraftState != "needs_preview" || p.PublishedVersion != nil {
		t.Fatal("new draft exposed")
	}
	if _, _, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true); !errors.Is(err, ErrPreviewRequired) {
		t.Fatalf("published without preview: %v", err)
	}
	run, err := s.StartPreview(ctx, admin, p.ID, p.DraftVersion)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CompletePreview(ctx, run, samplePreset()); err != nil {
		t.Fatal(err)
	}
	p, rev, err = s.AdminPreset(ctx, p.ID)
	if err != nil || p.Preview == nil {
		t.Fatal(err)
	}
	p, rev, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true)
	if err != nil {
		t.Fatal(err)
	}
	published := *p.PublishedVersion
	in.Title = "A new title"
	p, rev, err = s.SavePreset(ctx, admin, p.ID, in, rev)
	if err != nil {
		t.Fatal(err)
	}
	if !p.Listed || p.Published.Title == in.Title || p.Title != in.Title || p.Preview == nil || !p.HasUnpublishedChanges {
		t.Fatal("title-only draft overwrote publication or lost preview")
	}
	live, _, err := s.PublicPresets(ctx, "en", nil, 20)
	if err != nil || len(live) != 1 || live[0].Title != "A useful day" || live[0].PublishedVersion != published || live[0].Sample.Passage != samplePreset().Passage {
		t.Fatalf("mixed public version: %+v %v", live, err)
	}
	empty, _, err := s.PublicPresets(ctx, "zh", nil, 20)
	if err != nil || len(empty) != 0 {
		t.Fatal("filter used wrong language")
	}
	p, rev, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true)
	if err != nil {
		t.Fatal(err)
	}
	if p.HasUnpublishedChanges || p.Published.Title != in.Title {
		t.Fatal("publication did not advance atomically")
	}
	in.Configuration.Scenario = "news"
	p, rev, err = s.SavePreset(ctx, admin, p.ID, in, rev)
	if err != nil {
		t.Fatal(err)
	}
	if p.Preview != nil || p.DraftState != "needs_preview" {
		t.Fatal("changed configuration reused sample")
	}
	if _, _, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true); !errors.Is(err, ErrPreviewRequired) {
		t.Fatal(err)
	}
	for _, table := range []string{"generation_runs", "generation_charges", "user_checkins", "growth_ledger", "analytics_events"} {
		var n int
		if err = pool.QueryRow(ctx, "SELECT count(*) FROM wordweave."+table).Scan(&n); err != nil || n != 0 {
			t.Fatalf("preview polluted %s: %d %v", table, n, err)
		}
	}
}
func TestM002PresetExceptionChargesOwnerAndKeepsRunningSnapshot(t *testing.T) {
	s, pool, ctx, admin, in := presetFixture(t)
	p, rev := readyPreset(t, s, ctx, admin, in)
	p, rev, err := s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true)
	if err != nil {
		t.Fatal(err)
	}
	owner := testdb.Learner(t, ctx, pool)
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner"}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.entitlement_groups SET max_entries_per_run=1,rolling_quota_limit=2 WHERE code='registered'`); err != nil {
		t.Fatal(err)
	}
	input := Input{in.Configuration.ModelID.String(), "en", "story", "long", in.Configuration.Entries}
	if _, err = s.Start(ctx, actor, input); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("ordinary permissions bypassed: %v", err)
	}
	if _, err = s.StartPreset(ctx, actor, p.ID, uuid.New()); !errors.Is(err, ErrPresetChanged) {
		t.Fatal("stale version accepted")
	}
	run, err := s.StartPreset(ctx, actor, p.ID, *p.PublishedVersion)
	if err != nil {
		t.Fatal(err)
	}
	if run.Spec.LengthCode != "long" || len(run.Spec.Entries) != 2 {
		t.Fatal("preset cut down to user plan")
	}
	if _, err = s.StartPreset(ctx, actor, p.ID, *p.PublishedVersion); !errors.Is(err, ErrGenerationInProgress) {
		t.Fatalf("multiple active runs: %v", err)
	}
	var source, origin, plan string
	var count int
	if err = pool.QueryRow(ctx, `SELECT source_kind,origin,plan_code FROM wordweave.generation_charges WHERE run_id=$1 AND account_id=$2 AND visitor_id IS NULL`, run.ID, owner).Scan(&source, &origin, &plan); err != nil || source != "plan" || origin != "base" || plan != "registered" {
		t.Fatalf("wrong quota owner: %s %s %s %v", source, origin, plan, err)
	}
	p, rev, err = s.PublishPreset(ctx, admin, p.ID, uuid.Nil, rev, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.StartPreset(ctx, actor, p.ID, run.ID); !errors.Is(err, ErrPresetUnavailable) {
		t.Fatal("unlisted preset starts")
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false,retired_at=clock_timestamp() WHERE id=$1`, in.Configuration.ModelID); err != nil {
		t.Fatal(err)
	}
	if err = s.CompleteValid(ctx, run, samplePreset()); err != nil {
		t.Fatalf("in-flight snapshot invalidated: %v", err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.generation_charges WHERE account_id=$1 AND state='consumed'`, owner).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate or missing charge: %d %v", count, err)
	}
}
func TestM002PreviewObsoleteVersionCannotSupplyNewDraft(t *testing.T) {
	s, _, ctx, admin, in := presetFixture(t)
	p, rev, err := s.SavePreset(ctx, admin, uuid.Nil, in, "")
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.StartPreview(ctx, admin, p.ID, p.DraftVersion)
	if err != nil {
		t.Fatal(err)
	}
	in.Configuration.Scenario = "news"
	p, rev, err = s.SavePreset(ctx, admin, p.ID, in, rev)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CompletePreview(ctx, run, samplePreset()); err != nil {
		t.Fatal(err)
	}
	p, rev, err = s.AdminPreset(ctx, p.ID)
	if err != nil || p.Preview != nil {
		t.Fatal("late preview attached to new draft")
	}
	if _, _, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true); !errors.Is(err, ErrPreviewRequired) {
		t.Fatal(err)
	}
	if _, err = s.StartPreview(ctx, admin, p.ID, run.VersionID); err == nil {
		t.Fatal("obsolete draft preview started")
	}
	next, err := s.StartPreview(ctx, admin, p.ID, p.DraftVersion)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CancelPreview(ctx, identity.Actor{Kind: "account", Role: "admin", ID: uuid.New()}, next.ID, next.Token); !errors.Is(err, ErrRunNotFound) {
		t.Fatal("cross-admin cancel")
	}
	status, err := s.CancelPreview(ctx, admin, next.ID, next.Token)
	if err != nil || status != "cancelled" {
		t.Fatal(err)
	}
	if _, err = s.CompletePreview(ctx, next, samplePreset()); !errors.Is(err, ErrTerminalRace) {
		t.Fatal("cancelled preview became valid")
	}
}
func TestM002PreviewUsageUnknownTotalsAndOptions(t *testing.T) {
	s, pool, ctx, admin, in := presetFixture(t)
	options, err := s.AdminGenerationOptions(ctx)
	if err != nil || !options.Availability.CanPreview || len(options.Models) != 1 || len(options.Lengths) != 4 || !strings.HasPrefix(options.VocabularyVersion, "sha256:") {
		t.Fatalf("admin catalog: %+v %v", options, err)
	}
	p, _, err := s.SavePreset(ctx, admin, uuid.Nil, in, "")
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.StartPreview(ctx, admin, p.ID, p.DraftVersion)
	if err != nil {
		t.Fatal(err)
	}
	recorder := usageRecorder{pool: pool, run: run.ID, preview: true}
	done, err := recorder.Begin(ctx, run.Spec)
	if err != nil {
		t.Fatal(err)
	}
	input, output := int64(12), int64(0)
	cost := "0.01234567890123456789"
	done(ai.Usage{InputTokens: &input, OutputTokens: &output, Cost: &cost})
	done, err = recorder.Begin(ctx, run.Spec)
	if err != nil {
		t.Fatal(err)
	}
	done(ai.Usage{InputTokens: &input})
	u, err := s.PreviewUsage(ctx, run.ID)
	if err != nil || u.ProviderCalls != 2 || u.InputTokens == nil || *u.InputTokens != 24 || u.OutputTokens != nil || u.Cost != nil || u.UnknownCalls != 1 {
		t.Fatalf("unknown converted to zero: %+v %v", u, err)
	}
	day := business.LearningDay(time.Now())
	summary, items, _, err := s.PreviewUsageHistory(ctx, day, day, nil, 20)
	if err != nil || len(items) != 1 || summary.LogicalRuns != 1 || summary.ProviderCalls != 2 || summary.Cost != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `DELETE FROM wordweave.openrouter_credentials`); err != nil {
		t.Fatal(err)
	}
	options, err = s.AdminGenerationOptions(ctx)
	if err != nil || options.Availability.CanPreview || *options.Availability.Reason != "credential_missing" || len(options.Models) != 1 {
		t.Fatal("missing credential hid valid options")
	}
	if _, err = s.StartPreview(ctx, admin, p.ID, p.DraftVersion); !errors.Is(err, ErrPresetCredentialMissing) {
		t.Fatalf("preview after credential loss: %v", err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false`); err != nil {
		t.Fatal(err)
	}
	options, err = s.AdminGenerationOptions(ctx)
	if err != nil || *options.Availability.Reason != "credential_missing" || len(options.Models) != 0 {
		t.Fatal("availability priority")
	}
}

func TestM002PresetCleanupKeepsPublishedPreviewActiveCallsAndUsage(t *testing.T) {
	s, pool, ctx, admin, in := presetFixture(t)
	p, rev := readyPreset(t, s, ctx, admin, in)
	cfg := pool.Config()
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE wordweave_maintenance`)
		return err
	}
	maintenance, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer maintenance.Close()
	original := p.DraftVersion
	p, rev, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true)
	if err != nil {
		t.Fatal(err)
	}
	in.Title = "Same sample, new title"
	p, rev, err = s.SavePreset(ctx, admin, p.ID, in, rev)
	if err != nil {
		t.Fatal(err)
	}
	p, rev, err = s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true)
	if err != nil {
		t.Fatal(err)
	}
	in.Configuration.Scenario = "discussion"
	p, rev, err = s.SavePreset(ctx, admin, p.ID, in, rev)
	if err != nil {
		t.Fatal(err)
	}
	active, err := s.StartPreview(ctx, admin, p.ID, p.DraftVersion)
	if err != nil {
		t.Fatal(err)
	}
	oldActive := p.DraftVersion
	in.Title = "New draft while preview runs"
	p, _, err = s.SavePreset(ctx, admin, p.ID, in, rev)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET completed_at=clock_timestamp()-interval '2 hours' WHERE status<>'active'`); err != nil {
		t.Fatal(err)
	}
	if _, err = CleanupPresets(ctx, maintenance, 200); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.preset_versions WHERE id=ANY($1::uuid[])`, []uuid.UUID{original, oldActive}).Scan(&count); err != nil || count != 2 {
		t.Fatalf("deleted preview dependency/active configuration: %d %v", count, err)
	}
	if _, err = s.CompletePreview(ctx, active, samplePreset()); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.ai_call_usage(preview_run_id,call_no,model_snapshot,usage_status,completed_at) VALUES($1,1,'test/preview','unknown',clock_timestamp())`, active.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.preset_preview_runs SET completed_at=clock_timestamp()-interval '2 hours' WHERE id=$1`, active.ID); err != nil {
		t.Fatal(err)
	}
	if n, err := CleanupPresets(ctx, maintenance, 200); err != nil || n != 1 {
		t.Fatalf("obsolete version not removed: %d %v", n, err)
	}
	var version *uuid.UUID
	var usage int
	if err = pool.QueryRow(ctx, `SELECT version_id,(SELECT count(*) FROM wordweave.ai_call_usage WHERE preview_run_id=$1) FROM wordweave.preset_preview_runs WHERE id=$1`, active.ID).Scan(&version, &usage); err != nil || version != nil || usage != 1 {
		t.Fatalf("usage history was deleted: %v %d %v", version, usage, err)
	}
	live, _, err := s.PublicPresets(ctx, "en", nil, 20)
	if err != nil || len(live) != 1 || live[0].Sample.Passage != samplePreset().Passage {
		t.Fatalf("publication lost its reused sample: %+v %v", live, err)
	}
}

func TestM002PublicPresetQueryPlans(t *testing.T) {
	s, pool, ctx, admin, in := presetFixture(t)
	p, rev := readyPreset(t, s, ctx, admin, in)
	if _, _, err := s.PublishPreset(ctx, admin, p.ID, p.DraftVersion, rev, true); err != nil {
		t.Fatal(err)
	}
	for _, q := range []struct {
		name, sql string
		args      []any
	}{{"published_page", publicPresetPageSQL, []any{"en", nil, nil, 21}}, {"full_sample", presetVersionSQL, []any{p.DraftVersion}}} {
		rows, err := pool.Query(ctx, "EXPLAIN (ANALYZE,BUFFERS) "+q.sql, q.args...)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var line string
			if err = rows.Scan(&line); err != nil {
				t.Fatal(err)
			}
			t.Log(q.name, line)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			t.Fatal(err)
		}
	}
}
