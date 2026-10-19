package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"wordweave/internal/ai"
	"wordweave/internal/capacity"
	"wordweave/internal/generation"
)

func capacityServer(t *testing.T) *Server {
	t.Helper()
	gate, err := capacity.New(capacity.Config{
		Global: 5, Preview: 1, Probe: 1, Preflight: 5, Connection: 5,
		RetryAfter: 7 * time.Second, DefaultConnectionGroup: "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	service := generation.NewService(nil, nil, nil, nil, time.Minute, ai.Validator{})
	service.SetCapacityGate(gate)
	return &Server{generation: service}
}

func assertCapacityBusyProblem(t *testing.T, recorder *httptest.ResponseRecorder, wantRetryAfter int) {
	t.Helper()
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Retry-After"); got != strconv.Itoa(wantRetryAfter) {
		t.Fatalf("Retry-After=%q, want=%d", got, wantRetryAfter)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control=%q, want=no-store", got)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/problem+json; charset=utf-8" {
		t.Fatalf("Content-Type=%q", got)
	}
	var problem struct {
		Code    string                     `json:"code"`
		Context map[string]json.RawMessage `json:"context"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if problem.Code != "generation_busy" {
		t.Fatalf("code=%q", problem.Code)
	}
	if len(problem.Context) != 2 {
		t.Fatalf("context=%s, want exactly accepted and retry_after_seconds", problem.Context)
	}
	var accepted bool
	if err := json.Unmarshal(problem.Context["accepted"], &accepted); err != nil {
		t.Fatalf("accepted: %v", err)
	}
	var retryAfterSeconds int
	if err := json.Unmarshal(problem.Context["retry_after_seconds"], &retryAfterSeconds); err != nil {
		t.Fatalf("retry_after_seconds: %v", err)
	}
	if accepted || retryAfterSeconds != wantRetryAfter || strconv.Itoa(retryAfterSeconds) != recorder.Header().Get("Retry-After") {
		t.Fatalf("accepted=%t retry_after_seconds=%d Retry-After=%q", accepted, retryAfterSeconds, recorder.Header().Get("Retry-After"))
	}
}

func TestGenerationBusyProblemIsExplicitlyNotAccepted(t *testing.T) {
	server := capacityServer(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/generations/stream", nil)
	server.writeGenerationProblem(recorder, request, capacity.ErrBusy)
	assertCapacityBusyProblem(t, recorder, 7)
}

func TestPresetPreviewBusyUsesSameCapacityProblem(t *testing.T) {
	server := capacityServer(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/presets/example/previews/stream", nil)
	server.writePresetProblem(recorder, request, generation.ErrGenerationBusy)
	assertCapacityBusyProblem(t, recorder, 7)
}

func TestAdminProbeBusyUsesSameCapacityProblem(t *testing.T) {
	server := capacityServer(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/model-connections/probe", nil)
	server.writeAdminProblem(recorder, request, capacity.ErrBusy)
	assertCapacityBusyProblem(t, recorder, 7)
}
