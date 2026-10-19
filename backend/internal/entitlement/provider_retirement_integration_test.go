//go:build integration

package entitlement

import (
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/identity"
	"wordweave/internal/testdb"
)

func TestCR313RetiredProviderIsExcludedFromEntitlementOptions(t *testing.T) {
	pool, ctx := testdb.Open(t)
	owner := testdb.Learner(t, ctx, pool)
	var providerID, modelID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_providers(name,protocol,base_url,credential_configured) VALUES('CR313 entitlement provider','openai_chat','https://synthetic.invalid/v1',true) RETURNING id`).Scan(&providerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,provider_id,enabled,custom_parameters) VALUES('CR313 entitlement model','synthetic/cr313',$1,true,'{}') RETURNING id`, providerID).Scan(&modelID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES('registered',$1)`, modelID); err != nil {
		t.Fatal(err)
	}
	service := NewService(pool, pool)
	actor := identity.Actor{ID: owner, Kind: "account", Role: "learner", GroupCode: "registered"}
	before, err := service.Options(ctx, actor)
	if err != nil || !containsEntitlementModel(before.Models, modelID.String()) {
		t.Fatalf("active provider model missing: options=%+v err=%v", before, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.ai_providers SET credential_configured=false,retired_at=clock_timestamp() WHERE id=$1`, providerID); err != nil {
		t.Fatal(err)
	}
	after, err := service.Options(ctx, actor)
	if err != nil {
		t.Fatal(err)
	}
	if containsEntitlementModel(after.Models, modelID.String()) {
		t.Fatalf("retired provider model remained in options: %+v", after.Models)
	}
}

func containsEntitlementModel(models []Model, id string) bool {
	for _, model := range models {
		if model.ID == id {
			return true
		}
	}
	return false
}
