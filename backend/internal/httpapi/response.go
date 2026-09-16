package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type responseMeta struct {
	RequestID string `json:"request_id"`
}

type listResponseMeta struct {
	RequestID  string  `json:"request_id"`
	NextCursor *string `json:"next_cursor"`
	HasMore    bool    `json:"has_more"`
}

type successEnvelope struct {
	Data any          `json:"data"`
	Meta responseMeta `json:"meta"`
}

type listSuccessEnvelope struct {
	Data any              `json:"data"`
	Meta listResponseMeta `json:"meta"`
}

type fieldError struct {
	Field string `json:"field"`
	Code  string `json:"code"`
}

type problem struct {
	Type        string       `json:"type"`
	Title       string       `json:"title"`
	Status      int          `json:"status"`
	Code        string       `json:"code"`
	Detail      string       `json:"detail"`
	RequestID   string       `json:"request_id"`
	FieldErrors []fieldError `json:"field_errors,omitempty"`
}

func writeJSON(writer http.ResponseWriter, request *http.Request, status int, data any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(successEnvelope{Data: data, Meta: responseMeta{RequestID: requestID(request.Context())}})
}

func writeListJSON(writer http.ResponseWriter, request *http.Request, data any, nextCursor *string, hasMore bool) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(writer).Encode(listSuccessEnvelope{Data: data, Meta: listResponseMeta{
		RequestID: requestID(request.Context()), NextCursor: nextCursor, HasMore: hasMore,
	}})
}

func writeNoContent(writer http.ResponseWriter) {
	writer.Header().Del("Content-Type")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(http.StatusNoContent)
}

func writeProblem(writer http.ResponseWriter, request *http.Request, status int, code, title, detail string, fields ...fieldError) {
	writer.Header().Set("Content-Type", "application/problem+json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(problem{
		Type:  "https://wordweave.example/problems/" + strings.ReplaceAll(code, "_", "-"),
		Title: title, Status: status, Code: code, Detail: detail,
		RequestID: requestID(request.Context()), FieldErrors: fields,
	})
}

func decodeStrict(writer http.ResponseWriter, request *http.Request, target any, maxBytes int64) error {
	request.Body = http.MaxBytesReader(writer, request.Body, maxBytes)
	raw, err := io.ReadAll(request.Body)
	if err != nil {
		return fmt.Errorf("read request body: %w", err)
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return errors.New("request body is required")
	}
	if err := rejectDuplicateKeys(raw); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request must contain exactly one JSON value")
	}
	return nil
}

func rejectDuplicateKeys(raw []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := inspectJSONValue(decoder); err != nil {
		return err
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("request must contain exactly one JSON value")
	}
	return nil
}

func inspectJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		return nil
	}
	switch delimiter {
	case '{':
		seen := map[string]struct{}{}
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return err
			}
			key, ok := keyToken.(string)
			if !ok {
				return errors.New("JSON object key must be a string")
			}
			if _, exists := seen[key]; exists {
				return fmt.Errorf("duplicate JSON key %q", key)
			}
			seen[key] = struct{}{}
			if err := inspectJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return errors.New("unterminated JSON object")
		}
	case '[':
		for decoder.More() {
			if err := inspectJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return errors.New("unterminated JSON array")
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	return nil
}

func decodeOrProblem(writer http.ResponseWriter, request *http.Request, target any, maxBytes int64) bool {
	if err := decodeStrict(writer, request, target, maxBytes); err != nil {
		writeProblem(writer, request, http.StatusBadRequest, "malformed_request", "Malformed request", "The request body is not valid for this operation.")
		return false
	}
	return true
}
