package httpapi

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/portability"
)

func TestPortabilityKDFGateCapacityRateAndRelease(t *testing.T) {
	now := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)
	actor := uuid.New()
	capacity := newPortabilityKDFGate()
	if !capacity.acquire(actor, now) || !capacity.acquire(actor, now) {
		t.Fatal("first two KDF operations were not admitted")
	}
	if capacity.acquire(actor, now) {
		t.Fatal("third concurrent KDF operation was admitted")
	}
	capacity.release()
	if !capacity.acquire(actor, now) {
		t.Fatal("released KDF slot was not restored")
	}
	capacity.release()
	capacity.release()

	rate := newPortabilityKDFGate()
	for i := 0; i < 10; i++ {
		if !rate.acquire(actor, now) {
			t.Fatalf("admission %d was rejected", i+1)
		}
		rate.release()
	}
	if rate.acquire(actor, now) {
		t.Fatal("eleventh KDF operation within one minute was admitted")
	}
	if !rate.acquire(actor, now.Add(time.Minute)) {
		t.Fatal("KDF rate did not recover after the window")
	}
	rate.release()
}

func TestPortabilityUnknownResponseUsesRecoverySemantics(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/config-portability/plans/operations/00000000-0000-4000-8000-000000000001/resolve", nil)
	response := httptest.NewRecorder()
	(&Server{}).writePortabilityError(response, request, portability.ErrUnknown)
	if response.Code != http.StatusServiceUnavailable || response.Header().Get("Retry-After") != "2" {
		t.Fatalf("status=%d retry=%q body=%s", response.Code, response.Header().Get("Retry-After"), response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"outcome_unknown"`) || !strings.Contains(response.Body.String(), `"outcome":"unknown"`) {
		t.Fatalf("body=%s", response.Body.String())
	}
}

func TestPortabilityRequestDecoderRequiresExactCaseAndNonNullPassphrases(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		target func() any
		wantOK bool
	}{
		{"export exact", `{"include_credentials":false}`, func() any { return &portabilityExportRequest{} }, true},
		{"export case alias", `{"Include_Credentials":false}`, func() any { return &portabilityExportRequest{} }, false},
		{"plain export null password", `{"include_credentials":false,"passphrase":null}`, func() any { return &portabilityExportRequest{} }, false},
		{"preview exact", `{"file_base64":"e30="}`, func() any { return &portabilityFileRequest{} }, true},
		{"preview case alias", `{"File_Base64":"e30="}`, func() any { return &portabilityFileRequest{} }, false},
		{"preview null password", `{"file_base64":"e30=","passphrase":null}`, func() any { return &portabilityFileRequest{} }, false},
		{"import null password", `{"file_base64":"e30=","preview_token":"token","operation_id":"00000000-0000-4000-8000-000000000001","confirmed":true,"passphrase":null}`, func() any { return &portabilityImportRequest{} }, false},
		{"resolve case alias", `{"Preview_Token":"token"}`, func() any { return &portabilityResolveRequest{} }, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/config-portability/models/test", bytes.NewBufferString(test.body))
			response := httptest.NewRecorder()
			if got := decodeOrProblem(response, request, test.target(), 4096); got != test.wantOK {
				t.Fatalf("decode=%v status=%d body=%s", got, response.Code, response.Body.String())
			}
			if !test.wantOK && response.Code != http.StatusBadRequest {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestBoundedPortabilityResponseRejectsWholePreviewBeforeWritingToken(t *testing.T) {
	token := "synthetic-preview-token-that-must-not-leak"
	preview := portability.Preview{
		Category:     portability.Models,
		PreviewToken: &token,
		Changes: []portability.Change{{
			Action: "added",
			Kind:   "model",
			Label:  strings.Repeat("x", portabilityResponseLimit),
		}},
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/config-portability/models/previews", nil)
	response := httptest.NewRecorder()

	if (&Server{}).writeBoundedPortabilityJSON(response, request, preview, "preview_too_large") {
		t.Fatal("oversized preview was written")
	}
	if response.Code != http.StatusRequestEntityTooLarge || !strings.Contains(response.Body.String(), `"code":"preview_too_large"`) {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), token) || strings.Contains(response.Body.String(), strings.Repeat("x", 256)) {
		t.Fatal("oversized preview or recovery token leaked in error response")
	}
}
