package ai

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/url"
	"strings"
	"unicode/utf8"
)

const customParametersMaxBytes = 16 * 1024

type CustomParameterError struct {
	ProblemCode string
	FieldCode   string
	Pointer     string
}

func (e *CustomParameterError) Error() string {
	return e.ProblemCode + ": " + e.FieldCode + " at " + e.Pointer
}

func PrefixCustomParameterError(err error, prefix string) error {
	var target *CustomParameterError
	if !errors.As(err, &target) {
		return err
	}
	copy := *target
	copy.Pointer = strings.TrimRight(prefix, "/") + copy.Pointer
	return &copy
}

var protectedTopLevel = normalizedSet(
	"model", "models", "route", "router", "provider", "model_id", "provider_model_id",
	"messages", "input", "instructions", "system", "prompt", "conversation", "previous_response_id",
	"stream", "stream_options", "background", "async", "store", "include",
	"response_format", "text", "output_format", "output_config", "schema", "json_schema", "structured_outputs",
	"max_tokens", "max_output_tokens", "max_completion_tokens", "max_new_tokens", "output_mode",
	"tools", "tool_choice", "functions", "function_call", "parallel_tool_calls", "plugins", "n", "best_of",
	"extra_body", "body", "request", "request_body", "payload", "query", "extra_query",
)

var protectedAllLevels = normalizedSet(
	"api_key", "authorization", "headers", "extra_headers", "base_url", "api_base", "endpoint", "url", "api_version",
	"access_token", "bearer_token", "secret", "__proto__", "prototype", "constructor",
)

func normalizedSet(values ...string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[normalizeParameterName(value)] = struct{}{}
	}
	return set
}

func normalizeParameterName(value string) string {
	return strings.ToLower(strings.NewReplacer("_", "", "-", "").Replace(value))
}

func parameterError(problem, code, pointer string) error {
	return &CustomParameterError{ProblemCode: problem, FieldCode: code, Pointer: pointer}
}

func CanonicalCustomParameters(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, parameterError("validation_failed", "required", "")
	}
	if !utf8.Valid(raw) {
		return nil, parameterError("invalid_json", "invalid_json", "")
	}
	if !validJSONSurrogates(raw) {
		return nil, parameterError("invalid_json", "invalid_json", "")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	value, err := parseParameterValue(decoder, "", 1, true)
	if err != nil {
		return nil, err
	}
	if token, err := decoder.Token(); err != io.EOF || token != nil {
		return nil, parameterError("invalid_json", "invalid_json", "")
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, parameterError("validation_failed", "object_required", "")
	}
	canonical, err := marshalCanonicalJSON(object)
	if err != nil {
		return nil, parameterError("invalid_json", "invalid_json", "")
	}
	if len(canonical) > customParametersMaxBytes {
		return nil, parameterError("validation_failed", "too_large", "")
	}
	return canonical, nil
}

func parseParameterValue(decoder *json.Decoder, pointer string, depth int, root bool) (any, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, parameterError("invalid_json", "invalid_json", pointer)
	}
	switch current := token.(type) {
	case json.Delim:
		if depth > 8 {
			return nil, parameterError("validation_failed", "too_deep", pointer)
		}
		switch current {
		case '{':
			object := map[string]any{}
			seen := map[string]struct{}{}
			for decoder.More() {
				keyToken, keyErr := decoder.Token()
				key, ok := keyToken.(string)
				if keyErr != nil || !ok {
					return nil, parameterError("invalid_json", "invalid_json", pointer)
				}
				childPointer := pointer + "/" + escapeJSONPointer(key)
				if _, exists := seen[key]; exists {
					return nil, parameterError("invalid_json", "duplicate_key", childPointer)
				}
				seen[key] = struct{}{}
				if strings.ContainsRune(key, '\x00') {
					return nil, parameterError("validation_failed", "unsupported_character", pointer)
				}
				normalized := normalizeParameterName(key)
				if _, protected := protectedAllLevels[normalized]; protected {
					return nil, parameterError("custom_parameter_conflict", "protected_field", childPointer)
				}
				if root {
					if _, protected := protectedTopLevel[normalized]; protected {
						return nil, parameterError("custom_parameter_conflict", "protected_field", childPointer)
					}
				}
				value, valueErr := parseParameterValue(decoder, childPointer, depth+1, false)
				if valueErr != nil {
					return nil, valueErr
				}
				object[key] = value
			}
			if _, err = decoder.Token(); err != nil {
				return nil, parameterError("invalid_json", "invalid_json", pointer)
			}
			return object, nil
		case '[':
			array := []any{}
			for index := 0; decoder.More(); index++ {
				value, valueErr := parseParameterValue(decoder, fmt.Sprintf("%s/%d", pointer, index), depth+1, false)
				if valueErr != nil {
					return nil, valueErr
				}
				array = append(array, value)
			}
			if _, err = decoder.Token(); err != nil {
				return nil, parameterError("invalid_json", "invalid_json", pointer)
			}
			return array, nil
		default:
			return nil, parameterError("invalid_json", "invalid_json", pointer)
		}
	case string:
		if strings.ContainsRune(current, '\x00') {
			return nil, parameterError("validation_failed", "unsupported_character", pointer)
		}
		return current, nil
	case json.Number:
		text := current.String()
		limit := big.NewInt(9007199254740991)
		if !strings.ContainsAny(text, ".eE") {
			integer, ok := new(big.Int).SetString(text, 10)
			if !ok || new(big.Int).Abs(new(big.Int).Set(integer)).Cmp(limit) > 0 {
				return nil, parameterError("validation_failed", "number_out_of_range", pointer)
			}
			return integer.Int64(), nil
		}
		precise, _, preciseErr := big.ParseFloat(text, 10, 256, big.ToNearestEven)
		if preciseErr == nil && precise.IsInt() {
			integer, _ := precise.Int(nil)
			if new(big.Int).Abs(new(big.Int).Set(integer)).Cmp(limit) > 0 {
				return nil, parameterError("validation_failed", "number_out_of_range", pointer)
			}
			return integer.Int64(), nil
		}
		number, parseErr := current.Float64()
		if parseErr != nil || math.IsInf(number, 0) || math.IsNaN(number) {
			return nil, parameterError("validation_failed", "number_out_of_range", pointer)
		}
		if math.Trunc(number) == number && math.Abs(number) > 9007199254740991 {
			return nil, parameterError("validation_failed", "number_out_of_range", pointer)
		}
		return number, nil
	case nil, bool:
		return current, nil
	default:
		return nil, parameterError("invalid_json", "invalid_json", pointer)
	}
}

func marshalCanonicalJSON(value any) ([]byte, error) {
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	raw := bytes.TrimSuffix(output.Bytes(), []byte("\n"))
	return unescapeJSONLineSeparators(raw), nil
}

func unescapeJSONLineSeparators(raw []byte) []byte {
	result := make([]byte, 0, len(raw))
	for index := 0; index < len(raw); {
		if index+6 <= len(raw) && raw[index] == '\\' {
			preceding := 0
			for cursor := index - 1; cursor >= 0 && raw[cursor] == '\\'; cursor-- {
				preceding++
			}
			if preceding%2 == 0 {
				switch string(raw[index : index+6]) {
				case `\u2028`:
					result = append(result, []byte("\u2028")...)
					index += 6
					continue
				case `\u2029`:
					result = append(result, []byte("\u2029")...)
					index += 6
					continue
				}
			}
		}
		result = append(result, raw[index])
		index++
	}
	return result
}

func validJSONSurrogates(raw []byte) bool {
	inString := false
	for index := 0; index < len(raw); index++ {
		switch raw[index] {
		case '"':
			inString = !inString
		case '\\':
			if !inString || index+1 >= len(raw) {
				continue
			}
			if raw[index+1] != 'u' {
				index++
				continue
			}
			first, ok := decodeHex4(raw, index+2)
			if !ok {
				return false
			}
			if first >= 0xd800 && first <= 0xdbff {
				if index+12 > len(raw) || raw[index+6] != '\\' || raw[index+7] != 'u' {
					return false
				}
				second, valid := decodeHex4(raw, index+8)
				if !valid || second < 0xdc00 || second > 0xdfff {
					return false
				}
				index += 11
				continue
			}
			if first >= 0xdc00 && first <= 0xdfff {
				return false
			}
			index += 5
		}
	}
	return true
}

func decodeHex4(raw []byte, start int) (uint16, bool) {
	if start+4 > len(raw) {
		return 0, false
	}
	var value uint16
	for _, current := range raw[start : start+4] {
		value <<= 4
		switch {
		case current >= '0' && current <= '9':
			value += uint16(current - '0')
		case current >= 'a' && current <= 'f':
			value += uint16(current-'a') + 10
		case current >= 'A' && current <= 'F':
			value += uint16(current-'A') + 10
		default:
			return 0, false
		}
	}
	return value, true
}

func escapeJSONPointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func decodeCanonicalCustomParameters(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	canonical, err := CanonicalCustomParameters(raw)
	if err != nil {
		return nil, err
	}
	var object map[string]any
	if err = json.Unmarshal(canonical, &object); err != nil {
		return nil, err
	}
	return object, nil
}

func officialOpenRouter(connection Connection) bool {
	if connection.Protocol != ProtocolChat {
		return false
	}
	parsed, err := url.Parse(connection.BaseURL)
	if err != nil || parsed.Scheme != "https" || strings.ToLower(parsed.Hostname()) != "openrouter.ai" {
		return false
	}
	if parsed.Port() != "" && parsed.Port() != "443" {
		return false
	}
	return strings.TrimRight(parsed.EscapedPath(), "/") == "/api/v1"
}
