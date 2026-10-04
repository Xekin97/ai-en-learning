package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
	"wordweave/internal/growth"
)

func TestGrowthConfigurationFieldErrors(t *testing.T) {
	cases := []struct {
		name, body string
		status     int
		field      string
	}{
		{"missing amount", `{"base_points":"1","step_points":"0","cap_points":"1","normal_experience":"0","expected_revision":"r"}`, 422, "/mastery_experience"},
		{"overflow amount", `{"mastery_experience":"9223372036854775808","base_points":"1","step_points":"0","cap_points":"1","normal_experience":"0","expected_revision":"r"}`, 422, "/mastery_experience"},
		{"null amount", `{"mastery_experience":null,"base_points":"1","step_points":"0","cap_points":"1","normal_experience":"0","expected_revision":"r"}`, 422, "/mastery_experience"},
		{"number amount", `{"mastery_experience":1,"base_points":"1","step_points":"0","cap_points":"1","normal_experience":"0","expected_revision":"r"}`, 400, ""},
		{"unknown", `{"mastery_experience":"1","extra":1}`, 400, ""},
		{"duplicate", `{"mastery_experience":"1","mastery_experience":"2"}`, 400, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest("PUT", "/", strings.NewReader(tc.body))
			var in growth.SettingsInput
			if decodeConfiguration(w, r, &in) {
				t.Fatal("accepted invalid command")
			}
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.field) {
				t.Fatalf("wrong error: %d %s", w.Code, w.Body)
			}
		})
	}
}
func TestGrowthDescriptionBothSlotsRequiredAndNullable(t *testing.T) {
	body := `{"kind":"saved_passages","expected_revision":"r","changes":[{"client_key":"01992978-9323-7000-8000-000000000001","id":null,"value":{"threshold":1,"enabled":true,"name":{"zh_CN":null,"en_US":"Name"},"title":{"zh_CN":null,"en_US":"Title"},"description":%s,"reward":{"points":"0","experience":"0","item_definition_id":null,"item_count":0}}}]}`
	for _, tc := range []struct {
		description string
		ok          bool
		field       string
	}{{`{"zh_CN":null,"en_US":null}`, true, ""}, {`null`, false, "/changes/0/value/description"}, {`{"zh_CN":"说明"}`, false, "/changes/0/value/description/en_US"}} {
		raw := strings.Replace(body, "%s", tc.description, 1)
		w := httptest.NewRecorder()
		r := httptest.NewRequest("PUT", "/", strings.NewReader(raw))
		var in growth.AchievementChanges
		if ok := decodeConfiguration(w, r, &in); ok != tc.ok {
			t.Fatalf("decode=%v: %s", ok, w.Body)
		}
		if !tc.ok && (w.Code != 422 || !strings.Contains(w.Body.String(), tc.field)) {
			t.Fatalf("wrong field: %s", w.Body)
		}
	}
}
func TestConfigurationTooLargeReturns413(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/", strings.NewReader(strings.Repeat(" ", (2<<20)+1)))
	var in growth.LevelSave
	if decodeConfiguration(w, r, &in) || w.Code != 413 {
		t.Fatalf("oversize status %d", w.Code)
	}
}

func TestItemEffectsRejectMixedRights(t *testing.T) {
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"kind":"model_trial","model_ids":[],"trial_seconds":60,"retirement_points":"0","extra_count":1}`, 400},
		{`{"kind":"plan_trial","target_plan_code":"pro","trial_seconds":60,"model_ids":[]}`, 400},
		{`{"kind":"makeup","extra_count":null}`, 400},
		{`{"kind":"extra_credit"}`, 422},
	} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
		var input growth.EffectInput
		if decodeConfiguration(w, r, &input) || w.Code != tc.status {
			t.Fatalf("invalid effect accepted: %d %s", w.Code, w.Body)
		}
	}
}
