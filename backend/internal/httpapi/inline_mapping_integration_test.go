//go:build integration

package httpapi

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"wordweave/internal/ai"
)

func TestInlineMappingHTTPStreamAndSavedContent(t *testing.T) {
	ctx, api, pool, actor, model, cfg := cr039Harness(t)
	if err := api.credentials.Put(ctx, actor.ID, "synthetic-inline-key"); err != nil {
		t.Fatal(err)
	}
	const intro = "She bought grapes(grape) (fresh fruit), shared a grape, and put more grapes on the table. "
	rawPassage := intro + strings.TrimSpace(strings.Repeat("Everyone enjoyed a calm afternoon together in the garden. ", 8))
	cleanPassage := strings.ReplaceAll(rawPassage, "(grape)", "")
	candidate := ai.Candidate{Passage: rawPassage, Tags: []string{"fruit"}, Targets: []ai.CandidateTarget{{SourceEntry: "grape", EntryMeaning: "a small fruit growing in clusters", HintPhrase: "fresh grapes(grape) beside another grape"}}}
	var calls atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		raw, _ := json.Marshal(map[string]any{"passage": candidate.Passage, "tags": candidate.Tags, "targets": map[string]any{"grape": map[string]any{"entry_meaning": candidate.Targets[0].EntryMeaning, "hint_phrase": candidate.Targets[0].HintPhrase}}})
		w.Header().Set("Content-Type", "text/event-stream")
		// Deliberately split source annotations and the passage's closing quote.
		for len(raw) > 0 {
			n := min(7, len(raw))
			chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string(raw[:n])}}}})
			fmt.Fprintf(w, "data: %s\n\n", chunk)
			w.(http.Flusher).Flush()
			raw = raw[n:]
		}
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer provider.Close()
	cfg.OpenRouterBaseURL = provider.URL
	api, err := integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	handler := api.Handler()
	application := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ServeHTTP(&pacedInlineWriter{ResponseWriter: w}, r)
	}))
	defer application.Close()
	client := newBrowserClient(t)
	csrf := bootstrap(t, client, application.URL)
	registered := postJSON(t, client, application.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "inline_stream", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US"})
	requireStatus(t, registered, http.StatusCreated)
	csrf = dataString(t, registered.body, "csrf_token")
	for attempt := 0; attempt < 10; attempt++ {
		response := rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/stream", csrf, map[string]any{"model_id": model.String(), "meaning_language": "en", "scenario": "story", "length": "short", "entries": []string{"grape"}}, nil)
		if response.StatusCode != 200 {
			response.Body.Close()
			t.Fatalf("stream HTTP %d", response.StatusCode)
		}
		raw, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		run, token, valid := readGenerationSSE(t, strings.NewReader(string(raw)))
		if !valid || strings.Contains(string(raw), "(grape)") || calls.Load() != int32(attempt+1) {
			t.Fatal("stream failed, leaked a source annotation, or repeated a provider call")
		}
		scanner := bufio.NewScanner(strings.NewReader(string(raw)))
		var event string
		var preview strings.Builder
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "event: ") {
				event = strings.TrimPrefix(line, "event: ")
			}
			if event == "passage.delta" && strings.HasPrefix(line, "data: ") {
				var payload struct {
					Text string `json:"text"`
				}
				if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &payload); err != nil {
					t.Fatal(err)
				}
				preview.WriteString(payload.Text)
				if !strings.HasPrefix(cleanPassage, preview.String()) {
					t.Fatal("stream exposed temporary metadata or rewrote ordinary text")
				}
			}
		}
		if err := scanner.Err(); err != nil {
			t.Fatal(err)
		}
		if preview.String() != cleanPassage {
			t.Fatalf("attempt %d: terminal event overtook clean deltas: got %d characters, want %d", attempt, len(preview.String()), len(cleanPassage))
		}
		saved := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, application.URL+"/api/v1/generations/"+run+"/save", csrf, map[string]any{}, map[string]string{"X-Generation-Token": token}))
		requireStatus(t, saved, http.StatusCreated)
		var savedPassage, savedHint string
		var passageCount, hintCount int
		if err := pool.QueryRow(ctx, `SELECT b.passage,t.hint_phrase,(SELECT count(*) FROM wordweave.passage_occurrences p WHERE p.target_id=t.id),(SELECT count(*) FROM wordweave.hint_occurrences h WHERE h.target_id=t.id) FROM wordweave.learning_batches b JOIN wordweave.batch_targets t ON t.batch_id=b.id WHERE b.generation_run_id=$1`, run).Scan(&savedPassage, &savedHint, &passageCount, &hintCount); err != nil {
			t.Fatal(err)
		}
		if savedPassage != cleanPassage || savedHint != "fresh grapes beside another grape" || passageCount != 3 || hintCount != 2 {
			t.Fatal("saved text/occurrences lost clean positions or unmarked repeats")
		}
	}
}

// Model a slow downstream writer so the provider can finish while a previous
// clean delta is still being written. The terminal event must never overtake it.
type pacedInlineWriter struct{ http.ResponseWriter }

func (writer *pacedInlineWriter) Unwrap() http.ResponseWriter { return writer.ResponseWriter }
func (writer *pacedInlineWriter) Write(payload []byte) (int, error) {
	if strings.HasPrefix(string(payload), "event: passage.delta") {
		time.Sleep(time.Millisecond)
	}
	return writer.ResponseWriter.Write(payload)
}
