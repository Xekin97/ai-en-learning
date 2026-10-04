//go:build integration

package httpapi

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/platform/security"
)

// CR-006: exercise the public admin save command, not a direct SQL price edit.
// The harness owns a disposable database and has no reachable AI provider.
func TestM002RetiredCardPriceEditingAndRefundHTTP(t *testing.T) {
	ctx, api, pool, _, unrelatedModel, _ := cr039Harness(t)
	password := "retirement-test-password"
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	insertSearchAccount(t, ctx, pool, "retirement_admin", hash, "admin")
	owner := insertSearchAccount(t, ctx, pool, "retirement_reader", hash, "learner")
	var model uuid.UUID
	if err = pool.QueryRow(ctx, `INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled) VALUES ('Card model','test/retirement-card',true) RETURNING id`).Scan(&model); err != nil {
		t.Fatal(err)
	}
	application := httptest.NewServer(api.Handler())
	defer application.Close()
	admin := loginAdminForSearch(t, application.URL, "retirement_admin", password)
	adminCSRF := bootstrap(t, admin, application.URL)
	learner := loginAdminForSearch(t, application.URL, "retirement_reader", password)
	learnerCSRF := bootstrap(t, learner, application.URL)
	definitions := application.URL + "/api/v1/admin/growth/items"
	input := func(points string, models ...uuid.UUID) map[string]any {
		return map[string]any{
			"kind":           "model_trial",
			"name":           map[string]any{"zh_CN": nil, "en_US": "Retirement test"},
			"description":    map[string]any{"zh_CN": nil, "en_US": "Model trial"},
			"exchange_price": "0", "activation_ttl_seconds": 86400,
			"effect": map[string]any{"kind": "model_trial", "model_ids": models, "trial_seconds": 86400, "retirement_points": points},
		}
	}
	created := postJSON(t, admin, definitions, adminCSRF, input("20", model))
	requireStatus(t, created, 201)
	definition := nestedString(t, created.body, "data", "item", "id")
	endpoint := definitions + "/" + definition
	listed := putJSON(t, admin, endpoint+"/listing", adminCSRF, map[string]any{"listed": true, "expected_revision": dataString(t, created.body, "revision")})
	requireStatus(t, listed, 200)
	exchanged := decodeResponse(t, rawJSONRequest(t, learner, http.MethodPost, application.URL+"/api/v1/shop/exchanges", learnerCSRF, map[string]any{"definition_id": definition, "quantity": 2}, map[string]string{"Idempotency-Key": uuid.NewString()}))
	requireStatus(t, exchanged, 200)
	items := nestedValue(t, exchanged.body, "data", "receipt", "items").([]any)
	if len(items) != 2 {
		t.Fatalf("expected two issued cards: %s", exchanged.raw)
	}
	first := items[0].(map[string]any)["item_id"].(string)
	second := items[1].(map[string]any)["item_id"].(string)
	itemPath := func(id string) string { return application.URL + "/api/v1/me/items/" + id }
	preview := postJSON(t, learner, itemPath(first)+"/activation-preview", learnerCSRF, map[string]any{})
	requireStatus(t, preview, 200)
	activated := decodeResponse(t, rawJSONRequest(t, learner, http.MethodPost, itemPath(first)+"/activate", learnerCSRF, map[string]any{"confirmation_token": dataString(t, preview.body, "confirmation_token"), "confirm_discard": false}, map[string]string{"Idempotency-Key": uuid.NewString()}))
	requireStatus(t, activated, 200)
	issuedSnapshot := func() string {
		t.Helper()
		var digest string
		if err := pool.QueryRow(ctx, `SELECT md5(jsonb_agg(jsonb_build_array(i.id,i.parameters_snapshot,i.activation_deadline,
 (SELECT array_agg(model_id ORDER BY model_id) FROM wordweave.user_item_models WHERE item_id=i.id)) ORDER BY i.id)::text)
 FROM wordweave.user_items i WHERE i.owner_id=$1`, owner).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		return digest
	}
	issuedBefore := issuedSnapshot()
	retire := func(id uuid.UUID) {
		t.Helper()
		path := application.URL + "/api/v1/admin/models/" + id.String()
		impact := getJSON(t, admin, path+"/removal-impact")
		requireStatus(t, impact, 200)
		removed := decodeResponse(t, rawJSONRequest(t, admin, http.MethodDelete, path, adminCSRF, map[string]any{"expected_revision": dataString(t, impact.body, "revision"), "confirmation_token": dataString(t, impact.body, "confirmation_token"), "confirmed": true}, nil))
		requireStatus(t, removed, 200)
	}
	retire(model)
	quote := func(id, amount string) string {
		t.Helper()
		p := postJSON(t, learner, itemPath(id)+"/refund-preview", learnerCSRF, map[string]any{})
		requireStatus(t, p, 200)
		if nestedValue(t, p.body, "data", "eligible") != true || dataString(t, p.body, "points") != amount {
			t.Fatalf("wrong current refund: %s", p.raw)
		}
		return dataString(t, p.body, "confirmation_token")
	}
	oldQuote := quote(first, "20")
	quote(second, "20") // Both activated and unused cards retain qualification.
	current := getJSON(t, admin, endpoint)
	requireStatus(t, current, 200)
	update := input("35", model)
	update["expected_revision"] = dataString(t, current.body, "revision")
	saved := putJSON(t, admin, endpoint, adminCSRF, update)
	requireStatus(t, saved, 200) // Before CR-006 this is 422 /effect/model_ids.
	if nestedString(t, saved.body, "data", "item", "effect", "retirement_points") != "35" || dataString(t, saved.body, "revision") == dataString(t, current.body, "revision") {
		t.Fatalf("price or revision not updated: %s", saved.raw)
	}
	requireStatus(t, putJSON(t, admin, endpoint, adminCSRF, update), 409)
	refund := func(id, token, key string) testResponse {
		t.Helper()
		return decodeResponse(t, rawJSONRequest(t, learner, http.MethodPost, itemPath(id)+"/retirement-refund", learnerCSRF, map[string]any{"confirmation_token": token}, map[string]string{"Idempotency-Key": key}))
	}
	stale := refund(first, oldQuote, uuid.NewString())
	requireStatus(t, stale, 409)
	if nestedString(t, stale.body, "code") != "preview_stale" {
		t.Fatalf("wrong stale quote error: %s", stale.raw)
	}
	key := uuid.NewString()
	token := quote(first, "35")
	paid := refund(first, token, key)
	requireStatus(t, paid, 200)
	if nestedString(t, paid.body, "data", "receipt", "points_delta") != "35" || nestedString(t, paid.body, "data", "item", "state") != "refunded" {
		t.Fatalf("wrong refund settlement: %s", paid.raw)
	}
	repeated := refund(first, token, key)
	requireStatus(t, repeated, 200)
	if !reflect.DeepEqual(nestedValue(t, paid.body, "data", "receipt"), nestedValue(t, repeated.body, "data", "receipt")) {
		t.Fatal("same-key refund changed the durable receipt")
	}
	update = input("50", model)
	update["expected_revision"] = dataString(t, saved.body, "revision")
	requireStatus(t, putJSON(t, admin, endpoint, adminCSRF, update), 200)
	repeated = refund(first, token, uuid.NewString())
	requireStatus(t, repeated, 200)
	if !reflect.DeepEqual(nestedValue(t, paid.body, "data", "receipt"), nestedValue(t, repeated.body, "data", "receipt")) {
		t.Fatal("later price edit or new key changed an already completed refund")
	}
	unused := refund(second, quote(second, "50"), uuid.NewString())
	requireStatus(t, unused, 200)
	if nestedString(t, unused.body, "data", "receipt", "points_delta") != "50" {
		t.Fatalf("unrefunded card did not use latest price: %s", unused.raw)
	}
	var balance int64
	var settlements int
	if err = pool.QueryRow(ctx, `SELECT points,(SELECT count(*) FROM wordweave.growth_settlements WHERE owner_id=$1 AND kind='model_refund') FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&balance, &settlements); err != nil || balance != 85 || settlements != 2 {
		t.Fatalf("refund not exactly once: points=%d settlements=%d error=%v", balance, settlements, err)
	}
	if issuedSnapshot() != issuedBefore {
		t.Fatal("definition edits changed issued card parameters or deadlines")
	}

	// Keeping this definition's old reference must not allow new retired or
	// missing references, duplicates, or invalid prices.
	retire(unrelatedModel)
	current = getJSON(t, admin, endpoint)
	requireStatus(t, current, 200)
	for _, tc := range []struct {
		name   string
		create bool
		points string
		models []uuid.UUID
		code   string
	}{
		{"new definition with retired model", true, "50", []uuid.UUID{model}, "invalid_reference"},
		{"another retired reference", false, "50", []uuid.UUID{model, unrelatedModel}, "invalid_reference"},
		{"unknown reference", false, "50", []uuid.UUID{model, uuid.New()}, "invalid_reference"},
		{"duplicate retained reference", false, "50", []uuid.UUID{model, model}, "duplicate_id"},
		{"negative retirement points", false, "-1", []uuid.UUID{model}, "out_of_range"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := input(tc.points, tc.models...)
			var result testResponse
			if tc.create {
				result = postJSON(t, admin, definitions, adminCSRF, body)
			} else {
				body["expected_revision"] = dataString(t, current.body, "revision")
				result = putJSON(t, admin, endpoint, adminCSRF, body)
			}
			requireStatus(t, result, 422)
			fields := nestedValue(t, result.body, "field_errors").([]any)
			if len(fields) != 1 || fields[0].(map[string]any)["code"] != tc.code {
				t.Fatalf("wrong validation: %s", result.raw)
			}
			after := getJSON(t, admin, endpoint)
			requireStatus(t, after, 200)
			if !reflect.DeepEqual(current.body["data"], after.body["data"]) {
				t.Fatal("rejected save changed definition or configuration revision")
			}
		})
	}
	// Once explicitly removed, the historical reference cannot be reintroduced.
	replacement := postJSON(t, admin, application.URL+"/api/v1/admin/models", adminCSRF, map[string]any{"display_name": "Replacement", "provider_model_id": "test/replacement", "connection_id": "00000000-0000-4000-8000-000000000001", "output_mode": "prompt", "expected_revision": configurationRevisionHTTP(t, admin, application.URL)})
	requireStatus(t, replacement, 201)
	replacementID := uuid.MustParse(nestedString(t, replacement.body, "data", "model", "id"))
	update = input("50", model, replacementID)
	update["expected_revision"] = dataString(t, replacement.body, "revision")
	mixed := putJSON(t, admin, endpoint, adminCSRF, update)
	requireStatus(t, mixed, 200)
	update = input("50", replacementID)
	update["expected_revision"] = dataString(t, mixed.body, "revision")
	replaced := putJSON(t, admin, endpoint, adminCSRF, update)
	requireStatus(t, replaced, 200)
	update = input("50", replacementID, model)
	update["expected_revision"] = dataString(t, replaced.body, "revision")
	requireStatus(t, putJSON(t, admin, endpoint, adminCSRF, update), 422)
	if issuedSnapshot() != issuedBefore {
		t.Fatal("editing definition model references changed already issued cards")
	}
}
