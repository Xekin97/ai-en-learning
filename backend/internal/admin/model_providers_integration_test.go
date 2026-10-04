//go:build integration

package admin

import (
	"errors"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"testing"
	"wordweave/internal/ai"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
	"wordweave/internal/testdb"
)

func TestProviderWorkspaceStableIdentityAtomicUpdatesAndFullListing(t *testing.T) {
	pool, ctx := testdb.Open(t)
	actor := testdb.Learner(t, ctx, pool)
	role := func(name string) *pgxpool.Pool {
		cfg := pool.Config()
		cfg.ConnConfig.RuntimeParams["role"] = name
		p, e := pgxpool.NewWithConfig(ctx, cfg)
		if e != nil {
			t.Fatal(e)
		}
		t.Cleanup(p.Close)
		return p
	}
	appPool := role("wordweave_app")
	aiPool := role("wordweave_ai")
	envelope, _ := security.NewEnvelope(map[int][]byte{1: []byte(strings.Repeat("k", 32))}, 1)
	credentials := ai.NewCredentialStore(aiPool, envelope)
	s := NewService(appPool, credentials, ai.NewGateway(credentials, "https://wordweave.example", ""), nil, []byte(strings.Repeat("r", 32)))
	_, revision, err := s.ModelProviders(ctx)
	if err != nil {
		t.Fatal(err)
	}
	in := ModelProviderInput{Connection: ai.ConnectionDraft{Name: "Provider", Protocol: ai.ProtocolChat, BaseURL: "https://provider.example/v1", APIKey: "synthetic-original"}, Expected: revision}
	for i := 0; i < 25; i++ {
		in.Models = append(in.Models, ProviderModelInput{NewModelInput: NewModelInput{ProviderModelID: fmt.Sprintf("Vendor/ID-%02d", i), OutputMode: "prompt", Enabled: true}})
	}
	created, revision, err := s.SaveProvider(ctx, actor, uuid.Nil, in)
	if err != nil {
		t.Fatal(err)
	}
	providerID := created.Connection.ID
	if len(created.Models) != 25 {
		t.Fatal("creation truncated models")
	}
	first, second := created.Models[0], created.Models[1]
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('registered',$1)`, first.ID); err != nil {
		t.Fatal(err)
	}
	pinned := ai.GenerationSpec{ModelID: first.ID.String()}
	if err = credentials.BindSpec(ctx, &pinned); err != nil {
		t.Fatal(err)
	}
	otherInput := ModelProviderInput{Connection: ai.ConnectionDraft{Name: "Provider", Protocol: ai.ProtocolChat, BaseURL: in.Connection.BaseURL, APIKey: "synthetic-other"}, Expected: revision, Models: []ProviderModelInput{{NewModelInput: NewModelInput{ProviderModelID: first.ProviderModelID, OutputMode: "prompt"}}}}
	other, revision, err := s.SaveProvider(ctx, actor, uuid.Nil, otherInput)
	if err != nil {
		t.Fatal(err)
	}
	makeInput := func(p ModelProvider, r string) ModelProviderInput {
		v := ModelProviderInput{Connection: ai.ConnectionDraft{Name: p.Connection.Name, Protocol: p.Connection.Protocol, BaseURL: p.Connection.BaseURL}, Expected: r}
		for _, m := range p.Models {
			uid := m.ID
			v.Models = append(v.Models, ProviderModelInput{ID: &uid, NewModelInput: NewModelInput{DisplayName: m.DisplayName, ProviderModelID: m.ProviderModelID, Description: m.Description, OutputMode: m.OutputMode, MaxOutputTokens: m.MaxOutputTokens, Enabled: m.Enabled}})
		}
		return v
	}
	in = makeInput(created, revision)
	in.Connection.Name = "Updated provider"
	in.Connection.APIKey = "synthetic-replacement"
	in.Models[0].DisplayName = "Renamed"
	in.Models[0].ProviderModelID = second.ProviderModelID
	in.Models[1].ProviderModelID = first.ProviderModelID
	in.Models = append(in.Models, ProviderModelInput{NewModelInput: NewModelInput{ProviderModelID: "Vendor/New", OutputMode: "json_schema"}})
	saved, next, err := s.SaveProvider(ctx, actor, providerID, in)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Connection.ID != providerID || len(saved.Models) != 26 || next == revision {
		t.Fatal("aggregate identity/count/revision mismatch")
	}
	updated, err := s.GetModel(ctx, first.ID)
	if err != nil || updated.ProviderModelID != second.ProviderModelID || updated.DisplayName != "Renamed" || updated.Connection.ID != providerID {
		t.Fatal("model identity not preserved", err)
	}
	var refs int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.group_models WHERE model_id=$1`, first.ID).Scan(&refs); err != nil || refs != 1 {
		t.Fatal("plan reference changed")
	}
	key, err := credentials.ConnectionKey(ctx, providerID)
	if err != nil || key != "synthetic-replacement" {
		t.Fatal("key rotation failed")
	}
	key, _ = credentials.ConnectionKey(ctx, other.Connection.ID)
	if key != "synthetic-other" {
		t.Fatal("another provider inherited key")
	}
	if err = credentials.BindSpec(ctx, &pinned); err != nil || pinned.ProviderModelID != first.ProviderModelID {
		t.Fatal("in-flight snapshot changed")
	}
	providers, revision, err := s.ModelProviders(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, p := range providers {
		if p.Connection.ID == providerID {
			found = true
			if len(p.Models) != 26 {
				t.Fatal("list cut off at old page boundary")
			}
			for _, m := range p.Models {
				if m.Connection.Name != "Updated provider" {
					t.Fatal("models disagree on shared connection")
				}
			}
		}
	}
	if !found {
		t.Fatal("provider missing")
	}
	in = makeInput(saved, revision)
	in.Connection.Name = "Blank key reuse"
	saved, revision, err = s.SaveProvider(ctx, actor, providerID, in)
	if err != nil {
		t.Fatal(err)
	}
	key, _ = credentials.ConnectionKey(ctx, providerID)
	if key != "synthetic-replacement" {
		t.Fatal("blank key erased credential")
	}
	in = makeInput(saved, revision)
	in.Connection.BaseURL = "https://different.example/v1"
	if _, _, err = s.SaveProvider(ctx, actor, providerID, in); !errors.Is(err, ai.ErrCredentialMissing) {
		t.Fatal("old key forwarded to another endpoint", err)
	}
	in = makeInput(saved, revision)
	in.Models = in.Models[1:]
	if _, _, err = s.SaveProvider(ctx, actor, providerID, in); !errors.Is(err, ErrValidation) {
		t.Fatal("omitted model accepted")
	}
	in = makeInput(saved, revision)
	uid := other.Models[0].ID
	in.Models[0].ID = &uid
	if _, _, err = s.SaveProvider(ctx, actor, providerID, in); !errors.Is(err, ErrValidation) {
		t.Fatal("foreign model accepted")
	}
	in = makeInput(saved, "stale")
	var conflict *business.RevisionConflict
	if _, _, err = s.SaveProvider(ctx, actor, providerID, in); !errors.As(err, &conflict) {
		t.Fatal("stale write accepted")
	}
	snapshot := func() string {
		var raw string
		e := pool.QueryRow(ctx, `SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM wordweave.ai_providers p),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM wordweave.ai_models m),(SELECT jsonb_agg(to_jsonb(c) ORDER BY provider_id) FROM wordweave.ai_provider_credentials c),(SELECT revision FROM wordweave.growth_settings))::text`).Scan(&raw)
		if e != nil {
			t.Fatal(e)
		}
		return raw
	}
	before := snapshot()
	if _, err = pool.Exec(ctx, `CREATE FUNCTION wordweave.reject_test_model() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.provider_model_id='Reject/This' THEN RAISE EXCEPTION 'controlled failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_test_model BEFORE INSERT ON wordweave.ai_models FOR EACH ROW EXECUTE FUNCTION wordweave.reject_test_model()`); err != nil {
		t.Fatal(err)
	}
	in = makeInput(saved, revision)
	in.Connection.Name = "Must roll back"
	in.Connection.APIKey = "synthetic-rollback"
	in.Models[0].DisplayName = "Must roll back"
	in.Models = append(in.Models, ProviderModelInput{NewModelInput: NewModelInput{ProviderModelID: "Reject/This", OutputMode: "prompt"}})
	if _, _, err = s.SaveProvider(ctx, actor, providerID, in); err == nil {
		t.Fatal("injected database error missing")
	}
	if snapshot() != before {
		t.Fatal("failed aggregate partially changed connection, key, model or revision")
	}
	if _, err = appPool.Exec(ctx, `SELECT ciphertext FROM wordweave.ai_provider_credentials`); err == nil {
		t.Fatal("app can read ciphertext")
	}
	if _, err = aiPool.Exec(ctx, `SELECT wordweave.update_provider_credential(NULL,NULL,NULL,NULL,NULL,NULL)`); err == nil {
		t.Fatal("AI role can write credentials")
	}
}
