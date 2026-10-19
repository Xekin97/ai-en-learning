//go:build integration

package portability

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestPlansCommitIsAtomicIdempotentAndResolveBlocksLateCommit(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience,updated_by) VALUES(current_date-1,0,0,0,0,$1)`, principal.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0)`); err != nil {
		t.Fatal(err)
	}
	service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
	file, err := service.Export(ctx, Plans, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(file.Data.PlanRows) != 4 {
		t.Fatalf("plans=%d", len(file.Data.PlanRows))
	}
	// Exercise a legal priority exchange and explicit null/zero/empty values.
	file.Data.PlanRows[0].Priority, file.Data.PlanRows[1].Priority = file.Data.PlanRows[1].Priority, file.Data.PlanRows[0].Priority
	zero := 0
	file.Data.PlanRows[0].Rolling24hLimit = &zero
	file.Data.PlanRows[0].AllowedLengths = []string{}
	preview, err := service.Preview(ctx, principal, Plans, file)
	if err != nil {
		t.Fatal(err)
	}
	if !preview.CanCommit || preview.OperationID == nil || preview.PreviewToken == nil {
		t.Fatalf("preview=%+v", preview)
	}
	result, err := service.Commit(ctx, principal, Plans, *preview.OperationID, *preview.PreviewToken, file)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "applied" {
		t.Fatalf("status=%s", result.Status)
	}
	again, err := service.Commit(ctx, principal, Plans, *preview.OperationID, *preview.PreviewToken, file)
	if err != nil {
		t.Fatal(err)
	}
	if again.Status != "applied" || again.ResultRevision != result.ResultRevision {
		t.Fatalf("retry=%+v", again)
	}
	var receipts int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.config_import_receipts WHERE operation_id=$1`, *preview.OperationID).Scan(&receipts); err != nil || receipts != 1 {
		t.Fatalf("receipt count=%d err=%v", receipts, err)
	}
	var priority int
	var limit *int
	var lengths int
	if err = pool.QueryRow(ctx, `SELECT priority,rolling_quota_limit,(SELECT count(*) FROM wordweave.group_lengths WHERE group_code='visitor') FROM wordweave.entitlement_groups WHERE code='visitor'`).Scan(&priority, &limit, &lengths); err != nil {
		t.Fatal(err)
	}
	if priority != file.Data.PlanRows[0].Priority || limit == nil || *limit != 0 || lengths != 0 {
		t.Fatalf("stored priority=%d limit=%v lengths=%d", priority, limit, lengths)
	}

	second, err := service.Export(ctx, Plans, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	preview2, err := service.Preview(ctx, principal, Plans, second)
	if err != nil {
		t.Fatal(err)
	}
	restarted := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
	resolved, err := restarted.Resolve(ctx, principal, Plans, *preview2.OperationID, *preview2.PreviewToken)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Status != "not_applied" || resolved.ReasonCode == nil || *resolved.ReasonCode != "resolved_before_commit" {
		t.Fatalf("resolved=%+v", resolved)
	}
	late, err := service.Commit(ctx, principal, Plans, *preview2.OperationID, *preview2.PreviewToken, second)
	if err != nil {
		t.Fatal(err)
	}
	if late.Status != "not_applied" {
		t.Fatalf("late=%+v", late)
	}
}

func TestResolveUnavailableDatabaseRemainsUnknown(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	service := New(pool, nil, []byte("synthetic-cursor-key-32-bytes!!!!!"))
	file, err := service.Export(ctx, Plans, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := service.Preview(ctx, principal, Plans, file)
	if err != nil || preview.OperationID == nil || preview.PreviewToken == nil {
		t.Fatalf("preview=%+v err=%v", preview, err)
	}
	pool.Close()
	if _, err = service.Resolve(ctx, principal, Plans, *preview.OperationID, *preview.PreviewToken); !errors.Is(err, ErrUnknown) {
		t.Fatalf("resolve unavailable error=%v", err)
	}
}

func TestCurrentAndPlainExportsPreserveRequiredEmptyCollections(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience,updated_by) VALUES(current_date-1,0,0,0,0,$1)`, principal.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0)`); err != nil {
		t.Fatal(err)
	}
	service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
	for _, cat := range []Category{Models, Plans, Items, Growth} {
		file, err := service.Export(ctx, cat, principal, false)
		if err != nil {
			t.Fatalf("%s: %v", cat, err)
		}
		raw, err := json.Marshal(file)
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := ParseFile(raw, cat, nil, false)
		if err != nil {
			t.Fatalf("%s roundtrip: %v\n%s", cat, err, raw)
		}
		_ = parsed
	}
}

func TestModelsItemsAndGrowthPreviewCommitRoundTrips(t *testing.T) {
	t.Run("models with encrypted replacement credential", func(t *testing.T) {
		pool, ctx := testdb.Open(t)
		principal := testPrincipal(t, ctx, pool)
		envelope, err := security.NewEnvelope(map[int][]byte{1: []byte("0123456789abcdef0123456789abcdef")}, 1)
		if err != nil {
			t.Fatal(err)
		}
		credentials := ai.NewCredentialStore(pool, envelope)
		service := New(pool, credentials, []byte("synthetic-capability-key-32-bytes!!"))
		providerID, modelID := uuid.New(), uuid.New()
		name, display, apiKey := "Synthetic", "Synthetic model", "synthetic-api-key"
		file := File{
			Format: "wordweave-config", Version: 1, Category: Models, CredentialMode: "included",
			Data: Data{Connections: []Connection{{
				ID: providerID, Name: &name, Protocol: ai.ProtocolChat, BaseURL: "https://synthetic.invalid/v1", APIKey: &apiKey,
				Models: []Model{{ID: modelID, ProviderModelID: "synthetic/model", DisplayName: &display, OutputMode: "prompt", Enabled: true, CustomParameters: json.RawMessage(`{}`)}},
			}}},
		}
		const passphrase = "synthetic passphrase 123"
		raw, err := EncryptFile(file, passphrase)
		if err != nil {
			t.Fatal(err)
		}
		parsed, err := ParseFile(raw, Models, stringPointer(passphrase), true)
		if err != nil {
			t.Fatal(err)
		}
		result := previewAndCommit(t, ctx, service, principal, Models, parsed)
		if result.Status != "applied" {
			t.Fatalf("result=%+v", result)
		}
		stored, err := credentials.ConnectionKey(ctx, providerID)
		if err != nil || stored != apiKey {
			t.Fatalf("credential=%q err=%v", stored, err)
		}
		var gotProvider uuid.UUID
		if err = pool.QueryRow(ctx, `SELECT provider_id FROM wordweave.ai_models WHERE id=$1 AND retired_at IS NULL`, modelID).Scan(&gotProvider); err != nil || gotProvider != providerID {
			t.Fatalf("provider=%s err=%v", gotProvider, err)
		}
	})

	t.Run("items", func(t *testing.T) {
		pool, ctx := testdb.Open(t)
		principal := testPrincipal(t, ctx, pool)
		service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
		var modelID uuid.UUID
		if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Portable card model','synthetic/portable-card',true) RETURNING id`).Scan(&modelID); err != nil {
			t.Fatal(err)
		}
		name, description := "Synthetic item", "Synthetic item description"
		extra, trial := 2, int64(7200)
		retirement := business.Amount(7)
		target := "pro"
		file := File{Format: "wordweave-config", Version: 1, Category: Items, CredentialMode: "none", Data: Data{ItemRows: []Item{
			{ID: uuid.New(), Kind: "makeup", Name: Bilingual{EN: &name}, Description: Bilingual{EN: &description}, ExchangePrice: 12, ActivationTTLSeconds: 3600, Listed: true, Effect: ItemEffect{Kind: "makeup"}},
			{ID: uuid.New(), Kind: "extra_credit", Name: Bilingual{EN: &name}, Description: Bilingual{EN: &description}, ExchangePrice: 13, ActivationTTLSeconds: 3600, Listed: true, Effect: ItemEffect{Kind: "extra_credit", ExtraCount: &extra}},
			{ID: uuid.New(), Kind: "model_trial", Name: Bilingual{EN: &name}, Description: Bilingual{EN: &description}, ExchangePrice: 14, ActivationTTLSeconds: 3600, Listed: true, Effect: ItemEffect{Kind: "model_trial", ModelIDs: []uuid.UUID{modelID}, TrialSeconds: &trial, RetirementPoints: &retirement}},
			{ID: uuid.New(), Kind: "plan_trial", Name: Bilingual{EN: &name}, Description: Bilingual{EN: &description}, ExchangePrice: 15, ActivationTTLSeconds: 3600, Listed: true, Effect: ItemEffect{Kind: "plan_trial", TrialSeconds: &trial, TargetPlanCode: &target}},
		}}}
		parsed := plainRoundTrip(t, file, Items)
		result := previewAndCommit(t, ctx, service, principal, Items, parsed)
		if result.Status != "applied" {
			t.Fatalf("result=%+v", result)
		}
		exported, err := service.Export(ctx, Items, principal, false)
		if err != nil {
			t.Fatal(err)
		}
		if len(exported.Data.ItemRows) != 4 {
			t.Fatalf("exported items=%d", len(exported.Data.ItemRows))
		}
		seen := map[string]bool{}
		for _, item := range exported.Data.ItemRows {
			seen[item.Kind] = true
			if item.Kind == "model_trial" && (len(item.Effect.ModelIDs) != 1 || item.Effect.ModelIDs[0] != modelID) {
				t.Fatalf("model trial models=%v", item.Effect.ModelIDs)
			}
		}
		for _, kind := range []string{"makeup", "extra_credit", "model_trial", "plan_trial"} {
			if !seen[kind] {
				t.Fatalf("missing exported kind %s", kind)
			}
		}
		_ = plainRoundTrip(t, exported, Items)
		current, err := service.Current(ctx, principal, Items)
		if err != nil {
			t.Fatal(err)
		}
		fromCurrent := plainRoundTrip(t, File{Format: "wordweave-config", Version: 1, Category: Items, CredentialMode: "none", Data: current.Configuration}, Items)
		result = previewAndCommit(t, ctx, service, principal, Items, fromCurrent)
		if result.Status != "applied" {
			t.Fatalf("current roundtrip=%+v", result)
		}
	})

	t.Run("growth", func(t *testing.T) {
		pool, ctx := testdb.Open(t)
		principal := testPrincipal(t, ctx, pool)
		seedGrowthBaseline(t, ctx, pool, principal.ID)
		service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
		file, err := service.Export(ctx, Growth, principal, false)
		if err != nil {
			t.Fatal(err)
		}
		file.Data.MasteryExperience = business.Amount(17)
		parsed := plainRoundTrip(t, file, Growth)
		result := previewAndCommit(t, ctx, service, principal, Growth, parsed)
		if result.Status != "applied" || result.EffectiveDay == nil {
			t.Fatalf("result=%+v", result)
		}
		var mastery business.Amount
		var futureRules int
		if err = pool.QueryRow(ctx, `SELECT mastery_experience FROM wordweave.growth_settings WHERE singleton`).Scan(&mastery); err != nil {
			t.Fatal(err)
		}
		if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.checkin_rules WHERE effective_day>current_date`).Scan(&futureRules); err != nil {
			t.Fatal(err)
		}
		if mastery != 17 || futureRules != 1 {
			t.Fatalf("mastery=%d future_rules=%d", mastery, futureRules)
		}
	})
}

func TestCrossCategoryAndHistoryProtectionBlockers(t *testing.T) {
	t.Run("referenced model cannot be removed", func(t *testing.T) {
		pool, ctx := testdb.Open(t)
		principal := testPrincipal(t, ctx, pool)
		var modelID uuid.UUID
		if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES('Referenced model','synthetic/referenced',true) RETURNING id`).Scan(&modelID); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('visitor',$1)`, modelID); err != nil {
			t.Fatal(err)
		}
		service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
		file, err := service.Export(ctx, Models, principal, false)
		if err != nil {
			t.Fatal(err)
		}
		for i := range file.Data.Connections {
			file.Data.Connections[i].Models = nil
		}
		preview, err := service.Preview(ctx, principal, Models, file)
		if err != nil {
			t.Fatal(err)
		}
		if preview.CanCommit || !hasBlocker(preview.Blockers, "active_reference") {
			t.Fatalf("preview=%+v", preview)
		}
	})

	t.Run("issued item cannot be removed and kind is identity", func(t *testing.T) {
		pool, ctx := testdb.Open(t)
		principal := testPrincipal(t, ctx, pool)
		var itemID uuid.UUID
		if err := pool.QueryRow(ctx, `INSERT INTO wordweave.item_definitions(kind,name_en,description_en,exchange_price,activation_ttl_seconds,listed,ever_issued,updated_by) VALUES('makeup','Issued','Synthetic issued item',1,3600,true,true,$1) RETURNING id`, principal.ID).Scan(&itemID); err != nil {
			t.Fatal(err)
		}
		service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
		file, err := service.Export(ctx, Items, principal, false)
		if err != nil {
			t.Fatal(err)
		}
		removed := file
		removed.Data.ItemRows = []Item{}
		preview, err := service.Preview(ctx, principal, Items, removed)
		if err != nil {
			t.Fatal(err)
		}
		if preview.CanCommit || !hasBlocker(preview.Blockers, "ever_issued") {
			t.Fatalf("removal preview=%+v", preview)
		}
		changed := file
		changed.Data.ItemRows[0].Kind = "extra_credit"
		changed.Data.ItemRows[0].Effect = ItemEffect{Kind: "extra_credit", ExtraCount: intPointer(1)}
		preview, err = service.Preview(ctx, principal, Items, changed)
		if err != nil {
			t.Fatal(err)
		}
		if preview.CanCommit || !hasBlocker(preview.Blockers, "identity_conflict") {
			t.Fatalf("kind preview=%+v", preview)
		}
	})
}

func TestGrowthThresholdSwapRetirementAndSameIdentityRestorePreserveAward(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	seedGrowthBaseline(t, ctx, pool, principal.ID)
	var learner uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,status,group_code) VALUES($1,'synthetic','learner','active','registered') RETURNING id`, "learner_"+uuid.NewString()[:8]).Scan(&learner); err != nil {
		t.Fatal(err)
	}
	aID, bID := uuid.New(), uuid.New()
	for _, row := range []struct {
		id        uuid.UUID
		threshold int
		name      string
	}{{aID, 2, "Two"}, {bID, 3, "Three"}} {
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.achievement_tiers(id,kind,threshold,enabled,name_en,title_en,points,experience) VALUES($1,'checkin_streak',$2,true,$3,$3,0,0)`, row.id, row.threshold, row.name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.achievement_awards(owner_id,tier_id,achieved_at,title_en_snapshot) VALUES($1,$2,clock_timestamp(),'Two')`, learner, aID); err != nil {
		t.Fatal(err)
	}
	service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
	file, err := service.Export(ctx, Growth, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	rows := file.Data.Achievements["checkin_streak"]
	rows[0].Threshold, rows[1].Threshold = rows[1].Threshold, rows[0].Threshold
	file.Data.Achievements["checkin_streak"] = rows
	if result := previewAndCommit(t, ctx, service, principal, Growth, plainRoundTrip(t, file, Growth)); result.Status != "applied" {
		t.Fatalf("swap=%+v", result)
	}

	current, err := service.Export(ctx, Growth, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	var restored Achievement
	kept := current.Data.Achievements["checkin_streak"][:0]
	for _, row := range current.Data.Achievements["checkin_streak"] {
		if row.ID == aID {
			restored = row
			continue
		}
		kept = append(kept, row)
	}
	current.Data.Achievements["checkin_streak"] = kept
	if result := previewAndCommit(t, ctx, service, principal, Growth, plainRoundTrip(t, current, Growth)); result.Status != "applied" {
		t.Fatalf("retire=%+v", result)
	}
	var retired bool
	var awards int
	if err = pool.QueryRow(ctx, `SELECT retired_at IS NOT NULL FROM wordweave.achievement_tiers WHERE id=$1`, aID).Scan(&retired); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.achievement_awards WHERE owner_id=$1 AND tier_id=$2`, learner, aID).Scan(&awards); err != nil {
		t.Fatal(err)
	}
	if !retired || awards != 1 {
		t.Fatalf("retired=%v awards=%d", retired, awards)
	}

	current, err = service.Export(ctx, Growth, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	current.Data.Achievements["checkin_streak"] = append(current.Data.Achievements["checkin_streak"], restored)
	if result := previewAndCommit(t, ctx, service, principal, Growth, plainRoundTrip(t, current, Growth)); result.Status != "applied" {
		t.Fatalf("restore=%+v", result)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.achievement_awards WHERE owner_id=$1 AND tier_id=$2`, learner, aID).Scan(&awards); err != nil || awards != 1 {
		t.Fatalf("restored award count=%d err=%v", awards, err)
	}
}

func TestRawFileFingerprintAuthorizationAndRetentionBarriers(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	service := New(pool, nil, []byte("synthetic-capability-key-32-bytes!!"))
	file, err := service.Export(ctx, Plans, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	compact, _ := json.Marshal(file)
	indented, _ := json.MarshalIndent(file, "", "  ")
	first, err := ParseFile(compact, Plans, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ParseFile(indented, Plans, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := service.Preview(ctx, principal, Plans, first)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Commit(ctx, principal, Plans, *preview.OperationID, *preview.PreviewToken, second); !errors.Is(err, ErrConflict) {
		t.Fatalf("raw-file conflict=%v", err)
	}

	preview, err = service.Preview(ctx, principal, Plans, first)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.account_sessions SET last_seen_at=clock_timestamp()-interval '1 hour' WHERE id=$1`, principal.SessionID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Commit(ctx, principal, Plans, *preview.OperationID, *preview.PreviewToken, first); !errors.Is(err, ErrForbidden) {
		t.Fatalf("revoked session=%v", err)
	}

	principal = testPrincipal(t, ctx, pool)
	preview, err = service.Preview(ctx, principal, Plans, first)
	if err != nil {
		t.Fatal(err)
	}
	ticketValue, err := service.parseTicket(*preview.PreviewToken)
	if err != nil {
		t.Fatal(err)
	}
	ticketValue.RetainUntil = time.Now().Add(-time.Minute)
	ticketValue.CommitNotAfter = ticketValue.RetainUntil.Add(-time.Hour)
	expiredToken, err := service.signTicket(ticketValue)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Resolve(ctx, principal, Plans, *preview.OperationID, expiredToken); !errors.Is(err, ErrExpired) {
		t.Fatalf("expired resolve=%v", err)
	}
}

func TestPlanCommitRejectsChangedHistoricalImpactSnapshot(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	service := New(pool, nil, []byte("synthetic-cursor-key-32-bytes!!!!!"))
	file, err := service.Export(ctx, Plans, principal, false)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := service.Preview(ctx, principal, Plans, file)
	if err != nil || preview.PreviewToken == nil || preview.OperationID == nil {
		t.Fatalf("preview=%+v err=%v", preview, err)
	}
	ticketBefore, err := service.parseTicket(*preview.PreviewToken)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code,status) VALUES($1,'synthetic-hash','learner','registered','active')`, "impact_"+uuid.NewString()[:8]); err != nil {
		t.Fatal(err)
	}
	result, err := service.Commit(ctx, principal, Plans, *preview.OperationID, *preview.PreviewToken, file)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "not_applied" || result.ReasonCode == nil || *result.ReasonCode != "impact_changed" {
		t.Fatalf("result=%+v", result)
	}
	previewAfter, err := service.Preview(ctx, principal, Plans, file)
	if err != nil || previewAfter.PreviewToken == nil {
		t.Fatalf("preview after=%+v err=%v", previewAfter, err)
	}
	ticketAfter, err := service.parseTicket(*previewAfter.PreviewToken)
	if err != nil {
		t.Fatal(err)
	}
	if ticketAfter.Impact == ticketBefore.Impact || previewAfter.Effects.BaseUsers != preview.Effects.BaseUsers+1 {
		t.Fatalf("impact/count did not move together before=%+v after=%+v", preview, previewAfter)
	}
}

func TestModelCommitLateFailureRollsBackCredentialAndConfiguration(t *testing.T) {
	pool, ctx := testdb.Open(t)
	principal := testPrincipal(t, ctx, pool)
	envelope, err := security.NewEnvelope(map[int][]byte{1: []byte("0123456789abcdef0123456789abcdef")}, 1)
	if err != nil {
		t.Fatal(err)
	}
	credentials := ai.NewCredentialStore(pool, envelope)
	service := New(pool, credentials, []byte("synthetic-capability-key-32-bytes!!"))
	providerID, modelID := uuid.New(), uuid.New()
	name, display, apiKey := "Rollback provider", "Rollback model", "synthetic-rollback-key"
	file := File{Format: "wordweave-config", Version: 1, Category: Models, CredentialMode: "included", Data: Data{Connections: []Connection{{
		ID: providerID, Name: &name, Protocol: ai.ProtocolChat, BaseURL: "https://rollback.invalid/v1", APIKey: &apiKey,
		Models: []Model{{ID: modelID, ProviderModelID: "synthetic/fail-after-key", DisplayName: &display, OutputMode: "prompt", Enabled: true, CustomParameters: json.RawMessage(`{}`)}},
	}}}}
	const passphrase = "synthetic rollback passphrase"
	raw, err := EncryptFile(file, passphrase)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseFile(raw, Models, stringPointer(passphrase), true)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := service.Preview(ctx, principal, Models, parsed)
	if err != nil || !preview.CanCommit {
		t.Fatalf("preview=%+v err=%v", preview, err)
	}
	var revisionBefore int64
	if err = pool.QueryRow(ctx, `SELECT revision FROM wordweave.growth_settings WHERE singleton`).Scan(&revisionBefore); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `CREATE FUNCTION wordweave.synthetic_cr313_model_failure() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.provider_model_id='synthetic/fail-after-key' THEN RAISE EXCEPTION 'synthetic late failure'; END IF; RETURN NEW; END $fn$`); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `CREATE TRIGGER synthetic_cr313_model_failure BEFORE INSERT OR UPDATE ON wordweave.ai_models FOR EACH ROW EXECUTE FUNCTION wordweave.synthetic_cr313_model_failure()`); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Commit(ctx, principal, Models, *preview.OperationID, *preview.PreviewToken, parsed); err == nil {
		t.Fatal("commit unexpectedly succeeded")
	}
	var providers, credentialsRows, models, receipts int
	var revision int64
	if err = pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM wordweave.ai_providers WHERE id=$1),
		(SELECT count(*) FROM wordweave.ai_provider_credentials WHERE provider_id=$1),
		(SELECT count(*) FROM wordweave.ai_models WHERE id=$2),
		(SELECT count(*) FROM wordweave.config_import_receipts WHERE operation_id=$3),
		(SELECT revision FROM wordweave.growth_settings WHERE singleton)`, providerID, modelID, *preview.OperationID).Scan(&providers, &credentialsRows, &models, &receipts, &revision); err != nil {
		t.Fatal(err)
	}
	if providers != 0 || credentialsRows != 0 || models != 0 || receipts != 0 || revision != revisionBefore {
		t.Fatalf("rollback providers=%d credentials=%d models=%d receipts=%d revision=%d", providers, credentialsRows, models, receipts, revision)
	}
}

func previewAndCommit(t *testing.T, ctx context.Context, service *Service, principal Principal, category Category, file File) Result {
	t.Helper()
	preview, err := service.Preview(ctx, principal, category, file)
	if err != nil {
		t.Fatal(err)
	}
	if !preview.CanCommit || preview.OperationID == nil || preview.PreviewToken == nil {
		t.Fatalf("preview=%+v", preview)
	}
	result, err := service.Commit(ctx, principal, category, *preview.OperationID, *preview.PreviewToken, file)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func plainRoundTrip(t *testing.T, file File, category Category) File {
	t.Helper()
	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseFile(raw, category, nil, false)
	if err != nil {
		t.Fatalf("parse %s: %v\n%s", category, err, raw)
	}
	return parsed
}

func seedGrowthBaseline(t *testing.T, ctx context.Context, pool *pgxpool.Pool, actor uuid.UUID) {
	t.Helper()
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.checkin_rules(effective_day,base_points,step_points,cap_points,normal_experience,updated_by) VALUES(current_date-1,0,0,0,0,$1)`, actor); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.growth_levels(level_no,min_experience,reward_enabled,points) VALUES(1,0,false,0)`); err != nil {
		t.Fatal(err)
	}
}

func stringPointer(value string) *string { return &value }
func intPointer(value int) *int          { return &value }

func hasBlocker(blockers []Blocker, code string) bool {
	for _, blocker := range blockers {
		if blocker.Code == code {
			return true
		}
	}
	return false
}

func testPrincipal(t *testing.T, ctx context.Context, pool *pgxpool.Pool) Principal {
	t.Helper()
	var p Principal
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,status) VALUES($1,'synthetic-hash','admin','active') RETURNING id`, "admin_"+uuid.NewString()[:8]).Scan(&p.ID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.account_sessions(account_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour') RETURNING id`, p.ID, []byte(uuid.NewString())).Scan(&p.SessionID); err != nil {
		t.Fatal(err)
	}
	return p
}
