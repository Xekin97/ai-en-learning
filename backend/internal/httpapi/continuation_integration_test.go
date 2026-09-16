//go:build integration

package httpapi

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"wordweave/internal/ai"
)

func continuationHTTPCandidate() ai.Candidate {
	return ai.Candidate{Passage: "Young(young) people visited a vineyard.", Tags: []string{"visit"}, Targets: []ai.CandidateTarget{
		{SourceEntry: "grape", EntryMeaning: "a small fruit", HintPhrase: "fresh grapes(grape) beside a grape"},
		{SourceEntry: "young", EntryMeaning: "not old", HintPhrase: "young(young) children"},
	}}
}

func assertContinuationSettlement(t *testing.T, f *boundaryHTTPFixture, status string, charged bool, drafts, calls int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		var actual string
		var quota, cumulative bool
		var runs, actualDrafts, batches int
		err := f.pool.QueryRow(f.ctx, `SELECT call_status,quota_charged,counts_toward_cumulative,
		(SELECT count(*) FROM wordweave.generation_runs), (SELECT count(*) FROM wordweave.generation_drafts),
		(SELECT count(*) FROM wordweave.learning_batches) FROM wordweave.generation_runs`).Scan(&actual, &quota, &cumulative, &runs, &actualDrafts, &batches)
		if err != nil {
			t.Fatal(err)
		}
		if actual == status {
			if quota != charged || cumulative != (status == "valid" || status == "user_cancelled") || runs != 1 || actualDrafts != drafts || batches != 0 || int(f.calls.Load()) != calls {
				t.Fatalf("wrong single-run settlement: %s quota=%v cumulative=%v runs=%d drafts=%d batches=%d calls=%d", actual, quota, cumulative, runs, actualDrafts, batches, f.calls.Load())
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("remained %s, want %s", actual, status)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestContinuationHTTPFinalResultAndSingleSettlement(t *testing.T) {
	for _, mode := range []string{"success", "still_short", "invalid_mapping", "provider_429"} {
		t.Run(mode, func(t *testing.T) {
			original := continuationHTTPCandidate()
			extra := ai.Candidate{Passage: "They picked grapes(grape) with a young helper. " + strings.TrimSpace(strings.Repeat("Everyone shared food and stories together. ", 9)), Tags: []string{"harvest"}, Targets: []ai.CandidateTarget{}}
			if mode == "still_short" {
				extra.Passage = "They went home."
			}
			if mode == "invalid_mapping" {
				extra.Passage = strings.Replace(extra.Passage, "grapes(grape)", "bananas(grape)", 1)
			}
			var f *boundaryHTTPFixture
			f = newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Model    string `json:"model"`
					Messages []struct {
						Content string `json:"content"`
					} `json:"messages"`
				}
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Error(err)
					return
				}
				if f.calls.Load() == 2 {
					var feedback struct {
						Words      int      `json:"current_words"`
						Additional int      `json:"minimum_additional_words"`
						Missing    []string `json:"missing_entries"`
					}
					if request.Model != "test/no-online-provider" || len(request.Messages) != 2 || json.Unmarshal([]byte(request.Messages[1].Content), &feedback) != nil || feedback.Words != 5 || feedback.Additional != 45 || len(feedback.Missing) != 1 || feedback.Missing[0] != "grape" {
						t.Error("missing measured feedback or changed selected model")
					}
					if mode == "provider_429" {
						w.WriteHeader(429)
						return
					}
				}
				w.Header().Set("Content-Type", "text/event-stream")
				if f.calls.Load() == 1 {
					fmt.Fprint(w, p0HTTPWire(original))
				} else if f.calls.Load() == 3 && mode == "invalid_mapping" {
					unchanged := original
					unchanged.Passage += "\n\n" + extra.Passage
					unchanged.Tags = extra.Tags
					fmt.Fprint(w, p0HTTPWire(unchanged))
				} else {
					fmt.Fprint(w, p0HTTPWire(extra))
				}
			})
			response := f.start(t)
			raw, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil || response.StatusCode != 200 {
				t.Fatalf("stream: %d %v", response.StatusCode, err)
			}
			if strings.Count(string(raw), "event: generation.started") != 1 {
				t.Fatal("duplicate run start")
			}
			if mode != "success" {
				status := "validation_failed"
				calls := 3
				if mode == "provider_429" {
					status = "provider_failed"
					calls = 2
				}
				assertContinuationSettlement(t, f, status, false, 0, calls)
				if strings.Count(string(raw), "event: generation.failed") != 1 || !strings.Contains(string(raw), `"quota_refunded":true`) || strings.Contains(string(raw), "generation.validated") {
					t.Fatalf("invalid terminal: %s", raw)
				}
				return
			}
			assertContinuationSettlement(t, f, "valid", true, 1, 2)
			var preview strings.Builder
			var result generationResultDTO
			event := ""
			for _, line := range strings.Split(string(raw), "\n") {
				if strings.HasPrefix(line, "event: ") {
					event = strings.TrimPrefix(line, "event: ")
				}
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				data := []byte(strings.TrimPrefix(line, "data: "))
				if event == "passage.delta" {
					var delta struct {
						Text string `json:"text"`
					}
					if json.Unmarshal(data, &delta) != nil {
						t.Fatal("delta JSON")
					}
					preview.WriteString(delta.Text)
				}
				if event == "generation.validated" {
					var final struct {
						Result generationResultDTO `json:"result"`
					}
					if json.Unmarshal(data, &final) != nil {
						t.Fatal("final JSON")
					}
					result = final.Result
				}
			}
			if strings.Count(string(raw), "event: generation.validated") != 1 || preview.String() != result.Passage || !strings.Contains(result.Passage, "\n\n") || strings.Contains(result.Passage, "(grape)") || len(result.Targets) != 2 || result.Targets[0].EntryMeaning != original.Targets[0].EntryMeaning || len(result.Targets[0].HintBlanks) != 2 || len(result.Targets[1].Occurrences) != 2 || result.Tags[0] != "harvest" {
				t.Fatal("public stream/resources/positions changed")
			}
		})
	}
}

func TestCorrectionsHTTPMixedModesPreservePreviewAndSingleSettlement(t *testing.T) {
	for _, mode := range []string{"append_then_correct", "correct_then_append", "two_appends", "annotation_then_hint", "correction_once", "rewrite_refunded"} {
		t.Run(mode, func(t *testing.T) {
			original := continuationHTTPCandidate()
			extra := ai.Candidate{Passage: "They picked grapes(grape) with a young helper. " + strings.TrimSpace(strings.Repeat("Everyone shared food and stories together. ", 9)), Tags: []string{"harvest"}, Targets: []ai.CandidateTarget{}}
			if mode == "correct_then_append" {
				original.Passage += " Bananas(grape) grew nearby."
			}
			if mode == "annotation_then_hint" || mode == "correction_once" || mode == "rewrite_refunded" {
				original.Passage += "\n\n" + strings.Replace(extra.Passage, "grapes(grape)", "grapes(grapes)", 1)
				original.Tags = extra.Tags
			}
			if mode == "annotation_then_hint" {
				original.Targets[0].HintPhrase = "fresh grapes(grapes) beside a grape"
			}
			var f *boundaryHTTPFixture
			f = newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				call := f.calls.Load()
				if call > 3 {
					t.Error("more than two corrections")
				}
				if call == 1 {
					fmt.Fprint(w, p0HTTPWire(original))
					return
				}
				var request struct{ Messages []struct{ Content string } }
				if json.NewDecoder(r.Body).Decode(&request) != nil || len(request.Messages) != 2 {
					t.Error("invalid model request")
					return
				}
				var task map[string]json.RawMessage
				if json.Unmarshal([]byte(request.Messages[1].Content), &task) != nil {
					t.Error("invalid task")
					return
				}
				wantCorrection := mode == "annotation_then_hint" || mode == "correction_once" || mode == "rewrite_refunded" || mode == "append_then_correct" && call == 3 || mode == "correct_then_append" && call == 2
				_, isCorrection := task["field_to_correct"]
				if isCorrection != wantCorrection {
					t.Error("wrong correction/continuation mode")
				}
				response := extra
				switch mode {
				case "append_then_correct":
					if call == 2 {
						response.Passage = strings.Replace(extra.Passage, "grapes(grape)", "grapes(grapes)", 1)
					} else {
						response = original
						response.Passage += "\n\n" + extra.Passage
						response.Tags = extra.Tags
					}
				case "correct_then_append":
					if call == 2 {
						response = original
						response.Passage = strings.Replace(original.Passage, "Bananas(grape)", "Bananas", 1)
					}
				case "two_appends":
					if call == 2 {
						response.Passage = "They walked home."
					}
				case "annotation_then_hint", "correction_once", "rewrite_refunded":
					response = original
					response.Passage = strings.Replace(original.Passage, "grapes(grapes)", "grapes(grape)", 1)
					if mode == "annotation_then_hint" && call == 3 {
						response.Targets = append([]ai.CandidateTarget(nil), original.Targets...)
						response.Targets[0].HintPhrase = "fresh grapes(grape) beside a grape"
					}
					if mode == "rewrite_refunded" {
						response.Passage += " Unrequested rewrite."
					}
				}
				fmt.Fprint(w, p0HTTPWire(response))
			})
			response := f.start(t)
			raw, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil || response.StatusCode != 200 {
				t.Fatalf("stream: %v", err)
			}
			var preview strings.Builder
			var result generationResultDTO
			event := ""
			for _, line := range strings.Split(string(raw), "\n") {
				if strings.HasPrefix(line, "event: ") {
					event = strings.TrimPrefix(line, "event: ")
				}
				if !strings.HasPrefix(line, "data: ") {
					continue
				}
				data := []byte(strings.TrimPrefix(line, "data: "))
				if event == "passage.delta" {
					var delta struct{ Text string }
					if json.Unmarshal(data, &delta) != nil {
						t.Fatal("invalid delta")
					}
					preview.WriteString(delta.Text)
				}
				if event == "generation.validated" {
					var final struct{ Result generationResultDTO }
					if json.Unmarshal(data, &final) != nil {
						t.Fatal("invalid result")
					}
					result = final.Result
				}
			}
			if strings.Count(string(raw), "event: generation.started") != 1 || strings.Contains(preview.String(), "Unrequested rewrite") || strings.Contains(preview.String(), "(grape") {
				t.Fatal("rewritten text, annotations or duplicate start leaked")
			}
			if mode == "rewrite_refunded" {
				assertContinuationSettlement(t, f, "provider_failed", false, 0, 3)
				if strings.Count(string(raw), "event: generation.failed") != 1 || strings.Contains(string(raw), "generation.validated") || !strings.Contains(string(raw), "\"quota_refunded\":true") {
					t.Fatal("rewrite failure settlement incorrect")
				}
				return
			}
			calls := 3
			if mode == "correction_once" {
				calls = 2
			}
			assertContinuationSettlement(t, f, "valid", true, 1, calls)
			if strings.Count(string(raw), "event: generation.validated") != 1 || strings.Contains(string(raw), "generation.failed") || result.Passage != preview.String() || len(result.Targets) != 2 {
				t.Fatal("public preview/final/terminal contract changed")
			}
			for i, target := range result.Targets {
				if target.Entry != original.Targets[i].SourceEntry || target.EntryMeaning != original.Targets[i].EntryMeaning {
					t.Fatal("original entry/meaning changed")
				}
				if len(target.Occurrences) == 0 || len(target.HintBlanks) == 0 {
					t.Fatal("missing blanks")
				}
				runes := []rune(result.Passage)
				for _, span := range target.Occurrences {
					if span.Start < 0 || span.End > len(runes) || span.Start >= span.End || string(runes[span.Start:span.End]) != span.Surface {
						t.Fatal("incorrect final rune positions")
					}
				}
			}
		})
	}
}

func TestContinuationHTTPCancelAndDisconnectDuringCorrections(t *testing.T) {
	for _, blockAt := range []int{2, 3} {
		for _, mode := range []string{"cancel", "disconnect", "cancel_hidden", "disconnect_hidden"} {
			t.Run(fmt.Sprintf("%s_call_%d", mode, blockAt), func(t *testing.T) {
				opened, closed := make(chan struct{}), make(chan struct{})
				initial := continuationHTTPCandidate()
				if strings.HasSuffix(mode, "_hidden") {
					initial.Passage += " Grapes(grapes) grew nearby."
				}
				var f *boundaryHTTPFixture
				f = newBoundaryHTTPFixture(t, func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "text/event-stream")
					if f.calls.Load() == 1 {
						fmt.Fprint(w, p0HTTPWire(initial))
						return
					}
					if int(f.calls.Load()) < blockAt {
						if strings.HasSuffix(mode, "_hidden") {
							fmt.Fprint(w, p0HTTPWire(initial))
						} else {
							fmt.Fprint(w, p0HTTPWire(ai.Candidate{Passage: "They went home.", Tags: []string{"visit"}, Targets: []ai.CandidateTarget{}}))
						}
						return
					}
					w.WriteHeader(200)
					w.(http.Flusher).Flush()
					close(opened)
					<-r.Context().Done()
					close(closed)
				})
				response := f.start(t)
				defer response.Body.Close()
				scanner := bufio.NewScanner(response.Body)
				run, token := readGenerationStarted(t, scanner)
				select {
				case <-opened:
				case <-time.After(3 * time.Second):
					t.Fatal("continuation did not start")
				}
				if strings.HasPrefix(mode, "cancel") {
					r := rawJSONRequest(t, f.client, http.MethodPost, f.base+"/api/v1/generations/"+run+"/cancel", f.csrf, map[string]any{}, map[string]string{"X-Generation-Token": token})
					requireStatus(t, decodeResponse(t, r), 200)
					terminals := 0
					for scanner.Scan() {
						if scanner.Text() == "event: generation.cancelled" {
							terminals++
						}
						if scanner.Text() == "event: generation.validated" || scanner.Text() == "event: generation.failed" {
							t.Error("wrong cancellation terminal")
						}
					}
					if scanner.Err() != nil || terminals != 1 {
						t.Fatal("cancellation stream failed")
					}
					assertContinuationSettlement(t, f, "user_cancelled", true, 0, blockAt)
				} else {
					response.Body.Close()
					assertContinuationSettlement(t, f, "stream_failed", false, 0, blockAt)
				}
				select {
				case <-closed:
				case <-time.After(3 * time.Second):
					t.Fatal("cancelled upstream still running")
				}
			})
		}
	}
}
