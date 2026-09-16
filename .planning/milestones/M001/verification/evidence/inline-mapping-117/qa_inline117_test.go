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

	"github.com/google/uuid"
)

func TestQA117Consumers(t *testing.T) {
	for _, mode := range []string{"en", "zh", "ja", "wrong_hint_source", "unfinished_hint"} {
		t.Run(mode, func(t *testing.T) {
			ctx, api, pool, owner, model, cfg := cr039Harness(t)
			if err := api.credentials.Put(ctx, owner.ID, "qa117-synthetic-only"); err != nil {
				t.Fatal(err)
			}
			language := mode
			if mode == "wrong_hint_source" || mode == "unfinished_hint" {
				language = "en"
			}
			meanings := map[string][]string{"en": {"a plant reproductive unit", "to understand written words"}, "zh": {"种子", "阅读"}, "ja": {"種子", "読む"}}[language]
			tags := map[string]string{"en": "gardening", "zh": "花园", "ja": "庭園"}
			rawPassage := "🙂 They read(read) about seeds(seed), planted a seed, and kept reading (together). " + strings.TrimSpace(strings.Repeat("The neighbors enjoyed a quiet afternoon in the garden and shared useful ideas. ", 4))
			cleanPassage := strings.ReplaceAll(strings.ReplaceAll(rawPassage, "(read)", ""), "(seed)", "")
			hint := "plant a seed(seed) beside another seed"
			if mode == "wrong_hint_source" {
				hint = "plant a seed(read) beside another seed"
			}
			if mode == "unfinished_hint" {
				hint = "plant a seed(seed"
			}
			candidate := map[string]any{"passage": rawPassage, "tags": []string{tags[language]}, "targets": []map[string]any{
				{"source_entry": "seed", "entry_meaning": meanings[0], "hint_phrase": hint},
				{"source_entry": "read", "entry_meaning": meanings[1], "hint_phrase": "read(read) together while reading"},
			}}
			var calls atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var request map[string]any
				if json.NewDecoder(r.Body).Decode(&request) != nil {
					t.Error("upstream request not JSON")
					http.Error(w, "fixture", 500)
					return
				}
				format := request["response_format"].(map[string]any)["json_schema"].(map[string]any)["schema"].(map[string]any)
				target := format["properties"].(map[string]any)["targets"].(map[string]any)["items"].(map[string]any)
				if len(target["properties"].(map[string]any)) != 3 {
					t.Error("wire schema still has mapping arrays")
				}
				bytes, _ := json.Marshal(candidate)
				runes := []rune(string(bytes))
				w.Header().Set("Content-Type", "text/event-stream")
				for len(runes) > 0 {
					n := min(3, len(runes))
					chunk, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"delta": map[string]string{"content": string(runes[:n])}}}})
					fmt.Fprintf(w, "data: %s\n\n", chunk)
					w.(http.Flusher).Flush()
					runes = runes[n:]
				}
				fmt.Fprint(w, "data: [DONE]\n\n")
			}))
			defer provider.Close()
			cfg.OpenRouterBaseURL = provider.URL
			api, err := New(cfg, pool, pool)
			if err != nil {
				t.Fatal(err)
			}
			app := httptest.NewServer(api.Handler())
			defer app.Close()
			client := newBrowserClient(t)
			csrf := bootstrap(t, client, app.URL)
			registered := postJSON(t, client, app.URL+"/api/v1/auth/register", csrf, map[string]any{"username": "qa117_reader", "password": "synthetic-password-123", "password_confirmation": "synthetic-password-123", "ui_locale": "en-US"})
			requireStatus(t, registered, 201)
			csrf = dataString(t, registered.body, "csrf_token")
			response := rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/generations/stream", csrf, map[string]any{"model_id": model.String(), "meaning_language": language, "scenario": "discussion", "length": "short", "entries": []string{"seed", "read"}}, nil)
			if response.StatusCode != 200 {
				response.Body.Close()
				t.Fatal("stream preflight failed")
			}
			stream, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			run, token, valid := readGenerationSSE(t, strings.NewReader(string(stream)))
			if calls.Load() != 1 || strings.Contains(string(stream), "(seed)") || strings.Contains(string(stream), "(read)") || strings.Contains(string(stream), "_forms") {
				t.Fatal("private metadata leak or repeated model request")
			}
			var preview strings.Builder
			event := ""
			scanner := bufio.NewScanner(strings.NewReader(string(stream)))
			for scanner.Scan() {
				line := scanner.Text()
				if strings.HasPrefix(line, "event: ") {
					event = strings.TrimPrefix(line, "event: ")
				}
				if event == "passage.delta" && strings.HasPrefix(line, "data: ") {
					var d struct {
						Text string `json:"text"`
					}
					if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &d) != nil {
						t.Fatal("delta JSON")
					}
					preview.WriteString(d.Text)
					if !strings.HasPrefix(cleanPassage, preview.String()) {
						t.Fatal("unstable clean preview")
					}
				}
			}
			if scanner.Err() != nil || preview.String() != cleanPassage {
				t.Fatal("incomplete or altered clean stream")
			}
			var charged bool
			var drafts int
			if err := pool.QueryRow(ctx, `SELECT quota_charged,(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=$1) FROM wordweave.generation_runs WHERE id=$1`, run).Scan(&charged, &drafts); err != nil {
				t.Fatal(err)
			}
			if mode == "wrong_hint_source" || mode == "unfinished_hint" {
				if valid || charged || drafts != 0 || !strings.Contains(string(stream), `"quota_refunded":true`) || strings.Contains(string(stream), "hint_phrase") {
					t.Fatal("bad hint published or retained quota")
				}
				t.Log("PASS invalid metadata: clean preview only, one failed terminal, no draft, refunded")
				return
			}
			if !valid || !charged || drafts != 1 {
				t.Fatal("valid generation accounting/draft mismatch")
			}
			saved := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/generations/"+run+"/save", csrf, map[string]any{}, map[string]string{"X-Generation-Token": token}))
			requireStatus(t, saved, 201)
			batch := dataString(t, saved.body, "batch_id")
			detail := getJSON(t, client, app.URL+"/api/v1/me/batches/"+batch)
			requireStatus(t, detail, 200)
			if nestedString(t, detail.body, "data", "batch", "passage") != cleanPassage {
				t.Fatal("detail text changed")
			}
			for i, meaning := range meanings {
				if nestedString(t, detail.body, "data", "batch", "targets", fmt.Sprint(i), "entry_meaning") != meaning {
					t.Fatal("original entry meaning changed across storage")
				}
			}
			session := postJSON(t, client, app.URL+"/api/v1/me/review-sessions", csrf, map[string]any{"mode": "single_batch", "batch_id": batch})
			requireStatus(t, session, 201)
			attempt := postJSON(t, client, app.URL+"/api/v1/me/review-sessions/"+dataString(t, session.body, "session_id")+"/attempts", csrf, map[string]any{})
			requireStatus(t, attempt, 201)
			attemptID := dataString(t, attempt.body, "attempt_id")
			attemptToken := dataString(t, attempt.body, "attempt_token")
			current := attempt
			for range 2 {
				item := current.body["data"].(map[string]any)["item"].(map[string]any)
				if item["stage"] != "spelling" {
					t.Fatal("missing spelling item")
				}
				meaning := item["entry_meaning"].(string)
				answer := ""
				if meaning == meanings[0] {
					answer = "seed"
				} else if meaning == meanings[1] {
					answer = "read"
				} else {
					t.Fatal("review meaning not original input meaning")
				}
				blanks := 0
				for _, raw := range item["hint"].(map[string]any)["segments"].([]any) {
					segment := raw.(map[string]any)
					if segment["kind"] == "blank" {
						blanks++
					} else {
						text := strings.ToLower(segment["text"].(string))
						if strings.Contains(text, "seed") || strings.Contains(text, "read") {
							t.Fatal("hint leaked a target form")
						}
					}
				}
				if blanks != 2 {
					t.Fatal("missed unmarked hint repetition")
				}
				current = decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/me/review-attempts/"+attemptID+"/actions", csrf, map[string]any{"action_id": uuid.NewString(), "item_id": item["item_id"], "action": "answer", "answer": answer}, map[string]string{"X-Review-Attempt-Token": attemptToken}))
				requireStatus(t, current, 200)
			}
			item := current.body["data"].(map[string]any)["item"].(map[string]any)
			if item["stage"] != "passage_cloze" {
				t.Fatal("missing passage stage")
			}
			blanks := reviewPassageBlanks(t, current.body)
			if len(blanks) != 4 {
				t.Fatal("passage repeat count changed")
			}
			if blanks[0].groupKey != blanks[3].groupKey || blanks[1].groupKey != blanks[2].groupKey || blanks[0].groupKey == blanks[1].groupKey {
				t.Fatal("anonymous groups do not reflect source membership")
			}
			for _, raw := range item["passage_segments"].([]any) {
				segment := raw.(map[string]any)
				if segment["kind"] == "text" {
					text := strings.ToLower(segment["text"].(string))
					if strings.Contains(text, "seed") || strings.Contains(text, "read") {
						t.Fatal("passage leaked an unmarked form")
					}
				} else if _, ok := segment["surface"]; ok {
					t.Fatal("passage contains answer field")
				}
			}
			actual := []string{"read", "seeds", "seed", "reading"}
			answers := make([]map[string]any, 0, 4)
			for i, blank := range blanks {
				answers = append(answers, map[string]any{"blank_id": blank.blankID, "answer": actual[i]})
			}
			complete := decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, app.URL+"/api/v1/me/review-attempts/"+attemptID+"/actions", csrf, map[string]any{"action_id": uuid.NewString(), "item_id": item["item_id"], "action": "answer", "answers": answers}, map[string]string{"X-Review-Attempt-Token": attemptToken}))
			requireStatus(t, complete, 200)
			if dataString(t, complete.body, "outcome") != "session_completed" {
				t.Fatal("correct actual forms did not complete review")
			}
			t.Log("PASS language=" + language + ": clean stream, save/detail, two original-word answers, four surface answers, repeated blanking and anonymous grouping")
		})
	}
}
