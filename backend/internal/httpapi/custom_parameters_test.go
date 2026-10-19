package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeModelProblemPreservesDuplicatePointer(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/models", strings.NewReader(`{"custom_parameters":{"reasoning":{"effort":"low","effort":"high"}}}`))
	response := httptest.NewRecorder()
	var target struct {
		Custom json.RawMessage `json:"custom_parameters"`
	}
	if decodeModelOrProblem(response, request, &target, 32<<10, "/custom_parameters") {
		t.Fatal("duplicate key was accepted")
	}
	var body problem
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusBadRequest || body.Code != "invalid_json" || len(body.FieldErrors) != 1 || body.FieldErrors[0].Code != "duplicate_key" || body.FieldErrors[0].Field != "/custom_parameters/reasoning/effort" {
		t.Fatalf("unexpected problem: status=%d body=%+v", response.Code, body)
	}
}

func TestDecodeModelProblemUsesCR306TransportCode(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/admin/models", strings.NewReader(`{"custom_parameters":"`+strings.Repeat("a", 1024)+`"}`))
	response := httptest.NewRecorder()
	var target any
	if decodeModelOrProblem(response, request, &target, 128, "/custom_parameters") {
		t.Fatal("oversized request was accepted")
	}
	var body problem
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusRequestEntityTooLarge || body.Code != "request_too_large" {
		t.Fatalf("unexpected problem: status=%d body=%+v", response.Code, body)
	}
}
