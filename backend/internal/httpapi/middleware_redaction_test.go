package httpapi

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCR313SensitivePortabilityPanicLogIsRedacted(t *testing.T) {
	var log bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&log, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/config-portability/models/imports", nil)
	request = request.WithContext(context.WithValue(request.Context(), requestIDKey, "req_cr313"))
	response := httptest.NewRecorder()
	(&Server{}).recoverPanic(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("synthetic-secret-passphrase-and-key")
	})).ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("panic response status=%d", response.Code)
	}
	logged := log.String()
	if strings.Contains(logged, "synthetic-secret") || strings.Contains(logged, "goroutine") || strings.Contains(logged, "middleware_redaction_test.go") {
		t.Fatalf("sensitive panic value or stack leaked: %s", logged)
	}
	if !strings.Contains(logged, "request_id=req_cr313") || !strings.Contains(logged, "reason=panic") {
		t.Fatalf("safe panic facts missing: %s", logged)
	}
}

func TestCR313SensitivePathClassificationIsNarrow(t *testing.T) {
	if !isSensitiveRequestPath("/api/v1/admin/config-portability/models/previews") {
		t.Fatal("portability route not classified sensitive")
	}
	if isSensitiveRequestPath("/api/v1/admin/config-portability-logs") {
		t.Fatal("unrelated route classified sensitive")
	}
}
