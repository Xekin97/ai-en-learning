package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteNoContentEnforcesPrivateNoStoreResponse(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name              string
		presetContentType string
		presetCache       string
	}{
		{name: "empty headers"},
		{name: "removes preset content type", presetContentType: "application/json; charset=utf-8"},
		{name: "overrides preset cache policy", presetCache: "private, max-age=60"},
		{name: "removes content type and overrides cache policy", presetContentType: "text/plain", presetCache: "public, max-age=3600"},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			writer := httptest.NewRecorder()
			if test.presetContentType != "" {
				writer.Header().Set("Content-Type", test.presetContentType)
			}
			if test.presetCache != "" {
				writer.Header().Set("Cache-Control", test.presetCache)
			}

			writeNoContent(writer)
			response := writer.Result()
			defer response.Body.Close()

			if response.StatusCode != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNoContent)
			}
			if body := writer.Body.Bytes(); len(body) != 0 {
				t.Fatalf("body length = %d, want 0; body = %q", len(body), body)
			}
			if contentType := response.Header.Get("Content-Type"); contentType != "" {
				t.Fatalf("Content-Type = %q, want absent", contentType)
			}
			if cacheControl := response.Header.Get("Cache-Control"); cacheControl != "no-store" {
				t.Fatalf("Cache-Control = %q, want %q", cacheControl, "no-store")
			}
		})
	}
}

func TestSuccessEnvelopeSeparatesOrdinaryAndListMetadata(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest("GET", "/", nil)
	request = request.WithContext(context.WithValue(request.Context(), requestIDKey, "req_test"))

	t.Run("ordinary response omits pagination fields", func(t *testing.T) {
		writer := httptest.NewRecorder()
		writeJSON(writer, request, 200, struct{}{})

		meta := responseMetadata(t, writer.Body.Bytes())
		if _, exists := meta["next_cursor"]; exists {
			t.Fatalf("ordinary response unexpectedly included next_cursor: %s", writer.Body.String())
		}
		if _, exists := meta["has_more"]; exists {
			t.Fatalf("ordinary response unexpectedly included has_more: %s", writer.Body.String())
		}
	})

	t.Run("terminal list explicitly includes null cursor and false has_more", func(t *testing.T) {
		writer := httptest.NewRecorder()
		writeListJSON(writer, request, struct {
			Items []string `json:"items"`
		}{Items: []string{}}, nil, false)

		meta := responseMetadata(t, writer.Body.Bytes())
		nextCursor, exists := meta["next_cursor"]
		if !exists || nextCursor != nil {
			t.Fatalf("terminal list next_cursor = %#v, exists = %t; response = %s", nextCursor, exists, writer.Body.String())
		}
		hasMore, exists := meta["has_more"]
		if !exists || hasMore != false {
			t.Fatalf("terminal list has_more = %#v, exists = %t; response = %s", hasMore, exists, writer.Body.String())
		}
	})

	t.Run("non-terminal list includes opaque cursor and true has_more", func(t *testing.T) {
		writer := httptest.NewRecorder()
		cursor := "cur_test"
		writeListJSON(writer, request, struct {
			Items []string `json:"items"`
		}{Items: []string{"one"}}, &cursor, true)

		meta := responseMetadata(t, writer.Body.Bytes())
		if meta["next_cursor"] != cursor || meta["has_more"] != true {
			t.Fatalf("non-terminal list metadata mismatch: %s", writer.Body.String())
		}
	})
}

func responseMetadata(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var envelope struct {
		Meta map[string]any `json:"meta"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return envelope.Meta
}

func TestDecodeStrictRejectsUnknownDuplicateAndMultipleValues(t *testing.T) {
	t.Parallel()
	for _, raw := range []string{`{"name":"a","name":"b"}`, `{"unknown":true}`, `{"name":"a"} {}`} {
		request := httptest.NewRequest("POST", "/", strings.NewReader(raw))
		writer := httptest.NewRecorder()
		var target struct {
			Name string `json:"name"`
		}
		if err := decodeStrict(writer, request, &target, 1024); err == nil {
			t.Fatalf("decodeStrict(%q) unexpectedly succeeded", raw)
		}
	}
}

func TestDecodeStrictAcceptsSingleKnownObject(t *testing.T) {
	t.Parallel()
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"WordWeave"}`))
	writer := httptest.NewRecorder()
	var target struct {
		Name string `json:"name"`
	}
	if err := decodeStrict(writer, request, &target, 1024); err != nil {
		t.Fatal(err)
	}
	if target.Name != "WordWeave" {
		t.Fatalf("name = %q", target.Name)
	}
}
