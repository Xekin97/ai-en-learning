package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNoticeConfigurationDefaultAndValidation(t *testing.T) {
	const prefix = `{"title":{"zh_CN":null,"en_US":"News"},"body_markdown":{"zh_CN":null,"en_US":"Body"},"remind":true`
	for _, tc := range []struct {
		name, body string
		status     int
		once       bool
	}{
		{"omitted", prefix + `,"visible":true}`, 200, false},
		{"true", prefix + `,"visible":true,"remind_once":true}`, 200, true},
		{"false", prefix + `,"visible":true,"remind_once":false}`, 200, false},
		{"missing existing field", prefix + `,"remind_once":true}`, 422, false},
		{"wrong type", prefix + `,"visible":true,"remind_once":"yes"}`, 400, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/admin/notices", strings.NewReader(tc.body))
			w := httptest.NewRecorder()
			var input NoticeConfigurationInput
			ok := decodeConfiguration(w, req, &input)
			if w.Code != tc.status || ok != (tc.status == 200) {
				t.Fatalf("status=%d ok=%v body=%s", w.Code, ok, w.Body.String())
			}
			if ok && input.domain().RemindOnce != tc.once {
				t.Fatal("wrong effective default")
			}
		})
	}
}
