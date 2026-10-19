package portability

import (
	"testing"

	"github.com/google/uuid"
)

func TestDiffEntitiesReportsExactSafeFieldsAndNullSides(t *testing.T) {
	limitBefore, limitAfter := 5, 0
	before := Plan{Code: "basic", Priority: 2, Rolling24hLimit: &limitBefore, MaxEntries: 5, AllowedLengths: []string{"short"}, ModelIDs: []uuid.UUID{}, ContentReviewEnabled: false, ContentRepairLimit: 0}
	after := before
	after.Rolling24hLimit = &limitAfter
	changes, counts := diffEntities(entities(Plans, Data{PlanRows: []Plan{before}}, false), entities(Plans, Data{PlanRows: []Plan{after}}, false))
	if counts.Updated != 1 || len(changes) != 1 || len(changes[0].Fields) != 1 || changes[0].Fields[0].Field != "/rolling_24h_limit" {
		t.Fatalf("quota diff=%+v counts=%+v", changes, counts)
	}
	beforeLimit, beforeOK := changes[0].Fields[0].Before.(*int)
	afterLimit, afterOK := changes[0].Fields[0].After.(*int)
	if !beforeOK || !afterOK || beforeLimit == nil || afterLimit == nil || *beforeLimit != limitBefore || *afterLimit != limitAfter {
		t.Fatalf("quota values=%+v", changes[0].Fields[0])
	}

	name := "safe"
	connection := Connection{ID: uuid.New(), Name: &name, Protocol: "openai_chat", BaseURL: "https://safe.invalid/v1", Models: []Model{}}
	changes, counts = diffEntities(nil, entities(Models, Data{Connections: []Connection{connection}}, false))
	if counts.Added != 1 || len(changes[0].Fields) != 3 {
		t.Fatalf("added diff=%+v counts=%+v", changes, counts)
	}
	for _, field := range changes[0].Fields {
		if field.Before != nil || field.Field == "/api_key" || field.Field == "/models" {
			t.Fatalf("unsafe or non-null added field=%+v", field)
		}
	}
}

func TestApprovedNoticeVocabularyUsesNormalizedPresence(t *testing.T) {
	providerID, modelID := uuid.New(), uuid.New()
	raw := []byte(`{"format":"wordweave-config","version":1,"category":"models","credential_mode":"none","data":{"connections":[{"id":"` + providerID.String() + `","protocol":"openai_chat","base_url":"https://generated.invalid/v1","name":null,"models":[{"id":"` + modelID.String() + `","provider_model_id":"vendor/model","display_name":null,"description":null,"max_output_tokens":null,"output_mode":"prompt","enabled":false,"custom_parameters":{}}]}]}}`)
	file, err := ParseFile(raw, Models, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	changes, _ := diffEntities(nil, entities(Models, file.Data, false))
	warnings, defaults := notices(Models, file, changes, Effects{})
	if len(warnings) != 0 || !hasNotice(defaults, "name_generated", "connection", providerID.String(), "/name") || !hasNotice(defaults, "name_generated", "model", modelID.String(), "/display_name") || !hasNotice(defaults, "optional_value_cleared", "model", modelID.String(), "/description") {
		t.Fatalf("warnings=%+v defaults=%+v", warnings, defaults)
	}

	en := "English"
	item := File{Category: Items, Data: Data{ItemRows: []Item{{ID: uuid.New(), Kind: "makeup", Name: Bilingual{EN: &en}, Description: Bilingual{EN: &en}, ActivationTTLSeconds: 1, Effect: ItemEffect{Kind: "makeup"}}}}}
	item, err = validateFile(item, false)
	if err != nil {
		t.Fatal(err)
	}
	changes, _ = diffEntities(nil, entities(Items, item.Data, false))
	warnings, defaults = notices(Items, item, changes, Effects{})
	id := item.Data.ItemRows[0].ID.String()
	if !hasNotice(warnings, "language_fallback", "item", id, "/name/zh_CN") || !hasNotice(defaults, "optional_value_cleared", "item", id, "/description/zh_CN") {
		t.Fatalf("warnings=%+v defaults=%+v", warnings, defaults)
	}
}

func hasNotice(rows []Notice, code, kind, identity, field string) bool {
	for _, row := range rows {
		if row.Code == code && row.ItemRef != nil && row.ItemRef.Kind == kind && row.ItemRef.Identity == identity && row.Field != nil && *row.Field == field {
			return true
		}
	}
	return false
}
