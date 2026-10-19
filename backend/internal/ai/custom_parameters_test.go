package ai

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
)

type compactByteFixture struct {
	Accepted []struct {
		ID             string `json:"id"`
		Raw            string `json:"raw"`
		NormalizedJSON string `json:"normalized_json"`
		Bytes          int    `json:"bytes"`
	} `json:"accepted"`
	RejectedNumbers []struct {
		ID    string `json:"id"`
		Token string `json:"token"`
		Code  string `json:"code"`
	} `json:"rejected_numbers"`
	SizeRecipes []struct {
		ID       string `json:"id"`
		Key      string `json:"key"`
		Repeat   string `json:"repeat"`
		Suffix   string `json:"suffix"`
		Count    int    `json:"count"`
		Bytes    int    `json:"bytes"`
		Accepted bool   `json:"accepted"`
	} `json:"size_recipes"`
}

func TestCompactByteSharedVectors(t *testing.T) {
	rawFixture, err := os.ReadFile("../../../.planning/milestones/M002-legacy-M003/technical/fixtures/cr306/compact-byte-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture compactByteFixture
	if err = json.Unmarshal(rawFixture, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, vector := range fixture.Accepted {
		t.Run("accepted/"+vector.ID, func(t *testing.T) {
			canonical, err := CanonicalCustomParameters(json.RawMessage(vector.Raw))
			if err != nil {
				t.Fatal(err)
			}
			if string(canonical) != vector.NormalizedJSON || len(canonical) != vector.Bytes {
				t.Fatalf("canonical=%q bytes=%d, want %q bytes=%d", canonical, len(canonical), vector.NormalizedJSON, vector.Bytes)
			}
		})
	}
	for _, vector := range fixture.RejectedNumbers {
		t.Run("rejected/"+vector.ID, func(t *testing.T) {
			_, err := CanonicalCustomParameters(json.RawMessage(`{"x":` + vector.Token + `}`))
			var contract *CustomParameterError
			if !errors.As(err, &contract) || contract.FieldCode != vector.Code {
				t.Fatalf("got %#v, want %s", err, vector.Code)
			}
		})
	}
	for _, vector := range fixture.SizeRecipes {
		t.Run("size/"+vector.ID, func(t *testing.T) {
			raw := `{"` + vector.Key + `":"` + strings.Repeat(vector.Repeat, vector.Count) + vector.Suffix + `"}`
			canonical, err := CanonicalCustomParameters(json.RawMessage(raw))
			if vector.Accepted {
				if err != nil || len(canonical) != vector.Bytes {
					t.Fatalf("canonical bytes=%d err=%v, want accepted bytes=%d", len(canonical), err, vector.Bytes)
				}
				return
			}
			var contract *CustomParameterError
			if !errors.As(err, &contract) || contract.FieldCode != "too_large" {
				t.Fatalf("got bytes=%d err=%#v, want too_large", len(canonical), err)
			}
		})
	}
}

func TestCanonicalCustomParametersContract(t *testing.T) {
	tests := []struct {
		name, raw, problem, code, pointer string
	}{
		{"required", "", "validation_failed", "required", ""},
		{"object", "[]", "validation_failed", "object_required", ""},
		{"duplicate decoded", `{"a":1,"\u0061":2}`, "invalid_json", "duplicate_key", "/a"},
		{"top protected normalized", `{"Max-Output_Tokens":1}`, "custom_parameter_conflict", "protected_field", "/Max-Output_Tokens"},
		{"nested secret", `{"reasoning":{"api-key":"x"}}`, "custom_parameter_conflict", "protected_field", "/reasoning/api-key"},
		{"nul value", `{"reasoning":"\u0000"}`, "validation_failed", "unsupported_character", "/reasoning"},
		{"unsafe integer", `{"seed":9007199254740992}`, "validation_failed", "number_out_of_range", "/seed"},
		{"unsafe decimal integer", `{"seed":9007199254740992.0}`, "validation_failed", "number_out_of_range", "/seed"},
		{"unsafe exponent integer", `{"seed":9.007199254740992e15}`, "validation_failed", "number_out_of_range", "/seed"},
		{"rounds to unsafe integer", `{"seed":9007199254740991.5}`, "validation_failed", "number_out_of_range", "/seed"},
		{"nonfinite", `{"temperature":1e9999}`, "validation_failed", "number_out_of_range", "/temperature"},
		{"unpaired high surrogate", `{"x":"\ud800"}`, "invalid_json", "invalid_json", ""},
		{"unpaired low surrogate", `{"x":"\udc00"}`, "invalid_json", "invalid_json", ""},
		{"too deep", `{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{}}}}}}}}}`, "validation_failed", "too_deep", "/a/b/c/d/e/f/g/h"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := CanonicalCustomParameters(json.RawMessage(test.raw))
			var contract *CustomParameterError
			if !errors.As(err, &contract) || contract.ProblemCode != test.problem || contract.FieldCode != test.code || contract.Pointer != test.pointer {
				t.Fatalf("got %#v, want %s/%s at %s", err, test.problem, test.code, test.pointer)
			}
		})
	}
}

func TestCanonicalCustomParametersSafePointerAndUTF8Bytes(t *testing.T) {
	_, err := CanonicalCustomParameters(json.RawMessage(`{"bad\u0000key":1}`))
	var contract *CustomParameterError
	if !errors.As(err, &contract) || contract.Pointer != "" || strings.ContainsRune(contract.Pointer, '\x00') {
		t.Fatalf("unsafe pointer: %#v", err)
	}
	raw, err := CanonicalCustomParameters(json.RawMessage("{\"note\":\"<>&\u2028\u2029\",\"escaped\":\"\\\\u2028\"}"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "{\"escaped\":\"\\\\u2028\",\"note\":\"<>&\u2028\u2029\"}" {
		t.Fatalf("canonical JSON is not compact UTF-8: %q", raw)
	}
}

func TestCanonicalCustomParametersCanonicalAndSize(t *testing.T) {
	raw, err := CanonicalCustomParameters(json.RawMessage(` { "reasoning" : { "max_tokens" : 12 }, "temperature" : 0.25 } `))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"reasoning":{"max_tokens":12},"temperature":0.25}` {
		t.Fatalf("unexpected canonical JSON: %s", raw)
	}
	_, err = CanonicalCustomParameters(json.RawMessage(`{"x":"` + strings.Repeat("a", customParametersMaxBytes) + `"}`))
	var contract *CustomParameterError
	if !errors.As(err, &contract) || contract.FieldCode != "too_large" {
		t.Fatalf("got %#v, want too_large", err)
	}
}

func TestProtocolRequestMergesCustomParametersAndOpenRouterRoute(t *testing.T) {
	custom := json.RawMessage(`{"temperature":0.2,"reasoning":{"max_tokens":64}}`)
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		snap := connectionSnapshot{connection: Connection{Protocol: protocol, BaseURL: "https://example.com/v1"}, outputMode: "prompt", customParameters: custom}
		_, body := protocolRequest(GenerationSpec{ProviderModelID: "model"}, snap, false)
		if body["temperature"] != 0.2 || body["reasoning"].(map[string]any)["max_tokens"] != float64(64) {
			t.Fatalf("%s did not preserve custom parameters: %#v", protocol, body)
		}
	}
	snap := connectionSnapshot{connection: Connection{Protocol: ProtocolChat, BaseURL: "https://openrouter.ai:443/api/v1/"}, outputMode: "json_schema", customParameters: json.RawMessage(`{}`)}
	_, body := protocolRequest(GenerationSpec{ProviderModelID: "model"}, snap, false)
	if body["provider"].(map[string]any)["require_parameters"] != true {
		t.Fatalf("missing OpenRouter structured route: %#v", body)
	}
	_, probe := protocolRequest(GenerationSpec{ProviderModelID: "model"}, snap, true)
	if _, exists := probe["provider"]; exists {
		t.Fatalf("probe must not inject OpenRouter route: %#v", probe)
	}
	for name, excluded := range map[string]connectionSnapshot{
		"prompt":     {connection: Connection{Protocol: ProtocolChat, BaseURL: "https://openrouter.ai/api/v1"}, outputMode: "prompt"},
		"compatible": {connection: Connection{Protocol: ProtocolChat, BaseURL: "https://gateway.example/api/v1"}, outputMode: "json_schema"},
		"responses":  {connection: Connection{Protocol: ProtocolResponses, BaseURL: "https://openrouter.ai/api/v1"}, outputMode: "json_schema"},
	} {
		excluded.customParameters = json.RawMessage(`{}`)
		_, excludedBody := protocolRequest(GenerationSpec{ProviderModelID: "model"}, excluded, false)
		if _, exists := excludedBody["provider"]; exists {
			t.Fatalf("%s must not inject OpenRouter route: %#v", name, excludedBody)
		}
	}
}

func TestRequestParametersSnapshotHasExactStableFacts(t *testing.T) {
	maxTokens := 4096
	spec := GenerationSpec{connection: &connectionSnapshot{
		connection:       Connection{Protocol: ProtocolChat, BaseURL: "https://openrouter.ai/api/v1"},
		maxOutputTokens:  &maxTokens,
		outputMode:       "json_schema",
		customParameters: json.RawMessage(`{"reasoning":{"max_tokens":64}}`),
	}}
	raw, err := RequestParametersSnapshot(spec)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot map[string]any
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		t.Fatal(err)
	}
	if len(snapshot) != 5 || snapshot["version"] != "custom-parameters-v1" || snapshot["output_mode"] != "json_schema" || snapshot["structured_route"] != "openrouter_require_parameters" || snapshot["max_output_tokens"] != float64(4096) {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
	custom := snapshot["custom_parameters"].(map[string]any)
	if custom["reasoning"].(map[string]any)["max_tokens"] != float64(64) {
		t.Fatalf("custom snapshot changed: %#v", custom)
	}
}

func TestProtocolRequestNeverDropsInvalidBoundParameters(t *testing.T) {
	snap := connectionSnapshot{connection: Connection{Protocol: ProtocolChat, BaseURL: "https://example.com/v1"}, outputMode: "prompt", customParameters: json.RawMessage(`{"temperature":`)}
	if _, _, err := protocolRequestChecked(GenerationSpec{ProviderModelID: "model"}, snap, false); err == nil {
		t.Fatal("invalid bound parameters were silently dropped")
	}
	snap.customParameters = json.RawMessage(`{"model":"forbidden"}`)
	var contract *CustomParameterError
	_, _, err := protocolRequestChecked(GenerationSpec{ProviderModelID: "model"}, snap, false)
	if !errors.As(err, &contract) || contract.ProblemCode != "custom_parameter_conflict" {
		t.Fatalf("controlled collision was not rejected: %#v", err)
	}
}
