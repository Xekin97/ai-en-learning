package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/admin"
)

func TestAdminQuotaV14Fixtures(t *testing.T) {
	t.Parallel()
	directory := filepath.Join("..", "..", "testdata", "contracts", "v1.4")
	manifestBytes, err := os.ReadFile(filepath.Join(directory, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Version  string `json:"contract_version"`
		Fixtures []struct{ File, Method, SHA256 string }
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Version != "v1.4" || len(manifest.Fixtures) != 7 {
		t.Fatal("incomplete contract manifest")
	}
	for _, fixture := range manifest.Fixtures {
		t.Run(fixture.File, func(t *testing.T) {
			t.Parallel()
			raw, err := os.ReadFile(filepath.Join(directory, fixture.File))
			if err != nil {
				t.Fatal(err)
			}
			if fmt.Sprintf("%x", sha256.Sum256(raw)) != fixture.SHA256 {
				t.Fatal("fixture digest drift")
			}
			if err := validateAdminQuotaEnvelope(raw, fixture.Method == "PUT"); err != nil {
				t.Fatal(err)
			}
			// Build an independent application model and compare the actual mapper
			// and envelope serialization with the named wire fixture.
			plan, locale := "basic", "en-US"
			quota := &admin.GenerationQuota{Kind: "limited"}
			remaining := 2
			user := admin.User{ID: uuid.MustParse("11111111-1111-4111-8111-111111111111"), Username: "quota_reader", Role: "learner", PlanCode: &plan, Status: "active", UILocale: &locale, CreatedAt: time.Date(2026, 9, 5, 0, 0, 0, 0, time.UTC), LearningBatchCount: 7, GenerationQuota: quota}
			switch fixture.File {
			case "user-zero.json":
				remaining = 0
			case "user-unlimited.json":
				quota.Kind = "unlimited"
			case "group-limited.json":
				plan = "pro"
				remaining = 7
			case "group-zero.json":
				plan = "plus"
				remaining = 0
			case "group-unlimited.json":
				plan = "plus"
				quota.Kind = "unlimited"
			case "user-admin.json":
				user.ID = uuid.MustParse("22222222-2222-4222-8222-222222222222")
				user.Username = "quota_admin"
				user.Role = "admin"
				user.PlanCode = nil
				user.UILocale = nil
				user.LearningBatchCount = 0
				user.GenerationQuota = nil
			}
			if quota.Kind == "limited" {
				quota.Remaining = &remaining
			}
			data := map[string]any{"user": mapAdminUserDetail(user)}
			if fixture.Method == "PUT" {
				data["quota_reset"] = true
			}
			actual, err := json.Marshal(successEnvelope{Data: data, Meta: responseMeta{RequestID: "req_cr033_fixture"}})
			if err != nil {
				t.Fatal(err)
			}
			var wantJSON, gotJSON any
			if err := json.Unmarshal(raw, &wantJSON); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(actual, &gotJSON); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(wantJSON, gotJSON) {
				t.Fatalf("mapper mismatch: %s", actual)
			}
			if err := validateAdminQuotaEnvelope(actual, fixture.Method == "PUT"); err != nil {
				t.Fatal(err)
			}
			summary, err := json.Marshal(mapAdminUserSummary(user))
			if err != nil {
				t.Fatal(err)
			}
			if bytes.Contains(summary, []byte("generation_quota")) || bytes.Contains(summary, []byte("learning_batch_count")) {
				t.Fatal("detail fields leaked into summary")
			}
		})
	}
}

// This is a test oracle for the approved JSON shape, not a production parser
// or a replacement for the frontend's strict schemas.
func validateAdminQuotaEnvelope(raw []byte, groupChange bool) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return err
	}
	if !quotaExactKeys(envelope, "data", "meta") {
		return fmt.Errorf("envelope keys")
	}
	meta, ok := envelope["meta"].(map[string]any)
	if !ok || !quotaExactKeys(meta, "request_id") {
		return fmt.Errorf("meta keys")
	}
	if id, ok := meta["request_id"].(string); !ok || id == "" {
		return fmt.Errorf("request id")
	}
	data, ok := envelope["data"].(map[string]any)
	if !ok {
		return fmt.Errorf("data object")
	}
	if groupChange {
		if !quotaExactKeys(data, "user", "quota_reset") || data["quota_reset"] != true {
			return fmt.Errorf("group outcome")
		}
	} else if !quotaExactKeys(data, "user") {
		return fmt.Errorf("detail outcome")
	}
	user, ok := data["user"].(map[string]any)
	if !ok || !quotaExactKeys(user, "id", "username", "role", "plan_code", "status", "ui_locale", "created_at", "learning_batch_count", "generation_quota") {
		return fmt.Errorf("user keys")
	}
	for _, key := range []string{"id", "username", "created_at"} {
		if value, ok := user[key].(string); !ok || value == "" {
			return fmt.Errorf("missing %s", key)
		}
	}
	if _, err := time.Parse(time.RFC3339Nano, user["created_at"].(string)); err != nil {
		return err
	}
	if user["status"] != "active" || (user["ui_locale"] != nil && user["ui_locale"] != "en-US" && user["ui_locale"] != "zh-CN") {
		return fmt.Errorf("user enums")
	}
	if !quotaNonnegativeInteger(user["learning_batch_count"]) {
		return fmt.Errorf("batch count")
	}
	if user["role"] == "admin" {
		if groupChange || user["plan_code"] != nil || user["generation_quota"] != nil {
			return fmt.Errorf("admin projection")
		}
		return nil
	}
	if user["role"] != "learner" || (user["plan_code"] != "basic" && user["plan_code"] != "pro" && user["plan_code"] != "plus") {
		return fmt.Errorf("learner projection")
	}
	quota, ok := user["generation_quota"].(map[string]any)
	if !ok || !quotaExactKeys(quota, "kind", "remaining") {
		return fmt.Errorf("quota keys")
	}
	switch quota["kind"] {
	case "limited":
		if !quotaNonnegativeInteger(quota["remaining"]) {
			return fmt.Errorf("limited remaining")
		}
	case "unlimited":
		if quota["remaining"] != nil {
			return fmt.Errorf("unlimited remaining")
		}
	default:
		return fmt.Errorf("quota kind")
	}
	return nil
}
func quotaExactKeys(object map[string]any, keys ...string) bool {
	if len(object) != len(keys) {
		return false
	}
	for _, key := range keys {
		if _, ok := object[key]; !ok {
			return false
		}
	}
	return true
}
func quotaNonnegativeInteger(value any) bool {
	number, ok := value.(json.Number)
	if !ok {
		return false
	}
	n, err := number.Int64()
	return err == nil && n >= 0
}

func TestAdminQuotaV14RejectsContractDrift(t *testing.T) {
	t.Parallel()
	base, err := os.ReadFile(filepath.Join("..", "..", "testdata", "contracts", "v1.4", "user-limited.json"))
	if err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func(map[string]any){
		"missing quota":     func(u map[string]any) { delete(u, "generation_quota") },
		"learner null":      func(u map[string]any) { u["generation_quota"] = nil },
		"admin object":      func(u map[string]any) { u["role"] = "admin"; u["plan_code"] = nil },
		"negative":          func(u map[string]any) { u["generation_quota"].(map[string]any)["remaining"] = -1 },
		"fraction":          func(u map[string]any) { u["generation_quota"].(map[string]any)["remaining"] = 1.5 },
		"string":            func(u map[string]any) { u["generation_quota"].(map[string]any)["remaining"] = "2" },
		"limited null":      func(u map[string]any) { u["generation_quota"].(map[string]any)["remaining"] = nil },
		"missing remaining": func(u map[string]any) { delete(u["generation_quota"].(map[string]any), "remaining") },
		"unlimited number":  func(u map[string]any) { u["generation_quota"].(map[string]any)["kind"] = "unlimited" },
		"unknown kind":      func(u map[string]any) { u["generation_quota"].(map[string]any)["kind"] = "disabled" },
		"extra quota field": func(u map[string]any) { u["generation_quota"].(map[string]any)["limit"] = 5 },
		"extra user field":  func(u map[string]any) { u["quota_reset_at"] = "2026-01-01" },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var envelope map[string]any
			if err := json.Unmarshal(base, &envelope); err != nil {
				t.Fatal(err)
			}
			mutate(envelope["data"].(map[string]any)["user"].(map[string]any))
			raw, _ := json.Marshal(envelope)
			if err := validateAdminQuotaEnvelope(raw, false); err == nil {
				t.Fatal("accepted contract drift")
			}
		})
	}
	if err := validateAdminQuotaEnvelope(base, true); err == nil {
		t.Fatal("PUT accepted a missing quota_reset")
	}
}
