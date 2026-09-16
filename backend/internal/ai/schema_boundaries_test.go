package ai

import (
	"context"
	"io"
	"strings"
	"testing"
)

// Keep root ordering explicit: passage is a stream-owned first field.
func boundaryDocument(keys, values []string) string {
	parts := make([]string, len(keys))
	for i, key := range keys {
		parts[i] = p0JSON(key) + ":" + values[i]
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func TestBoundarySchemaEveryField(t *testing.T) {
	_, candidate := p0Candidate()
	rootKeys := []string{"passage", "tags", "targets"}
	rootValues := []string{p0JSON(candidate.Passage), p0JSON(candidate.Tags), p0JSON(candidate.Targets)}
	targetKeys := []string{"entry_meaning", "hint_phrase"}
	targetValues := []string{p0JSON(candidate.Targets[0].EntryMeaning), p0JSON(candidate.Targets[0].HintPhrase)}
	check := func(t *testing.T, raw, reason string) {
		t.Helper()
		var got Candidate
		err := decodeCandidateStrict(context.Background(), []byte(raw), &got)
		d := DescribeFailure(err)
		if err == nil || d.Stage != "candidate_schema" || d.Reason != reason {
			t.Fatalf("want %s; got %+v", reason, d)
		}
	}
	var valid Candidate
	if err := decodeCandidateStrict(context.Background(), []byte(boundaryDocument(rootKeys, rootValues)), &valid); err != nil {
		t.Fatal(err)
	}
	for _, level := range []string{"root", "target"} {
		keys, values := rootKeys, rootValues
		if level == "target" {
			keys, values = targetKeys, targetValues
		}
		for index, key := range keys {
			for _, mutation := range []string{"missing", "duplicate", "alias", "null", "type"} {
				t.Run(level+"/"+key+"/"+mutation, func(t *testing.T) {
					kk, vv := append([]string(nil), keys...), append([]string(nil), values...)
					reason := "candidate_keys_invalid"
					if level == "target" {
						reason = "target_keys_invalid"
					}
					switch mutation {
					case "missing":
						kk = append(kk[:index], kk[index+1:]...)
						vv = append(vv[:index], vv[index+1:]...)
					case "duplicate":
						kk = append(kk, key)
						vv = append(vv, values[index])
						reason = "json_duplicate_key"
					case "alias":
						kk[index] = strings.ToUpper(key)
					case "null":
						vv[index] = "null"
						reason = "json_null"
					case "type":
						vv[index] = "false"
						reason = "json_invalid"
						if key == "targets" {
							reason = "targets_type_invalid"
						}
					}
					if level == "root" && key == "passage" && mutation != "duplicate" {
						reason = "passage_not_first"
					}
					raw := boundaryDocument(kk, vv)
					if level == "target" {
						rv := append([]string(nil), rootValues...)
						rv[2] = "{" + p0JSON(candidate.Targets[0].SourceEntry) + ":" + raw + "," + p0JSON(candidate.Targets[1].SourceEntry) + ":" + p0JSON(candidate.Targets[1]) + "}"
						raw = boundaryDocument(rootKeys, rv)
					}
					check(t, raw, reason)
				})
			}
		}
	}
}

func TestBoundarySSEFraming(t *testing.T) {
	_, candidate := p0Candidate()
	wire := p0SSE(p0JSON(candidate))
	for _, prefix := range []string{"data:\n\n", ": ping\r\n\r\n", "event: message\nid: 1\nretry: 1000\n\n"} {
		for _, crlf := range []bool{false, true} {
			body := prefix + wire
			if crlf {
				body = strings.ReplaceAll(body, "\n", "\r\n")
			}
			stream := openRouterStream{io.NopCloser(strings.NewReader(body))}
			var clean strings.Builder
			got, err := stream.Receive(context.Background(), func(s string) error { clean.WriteString(s); return nil })
			if err != nil || got.Passage != candidate.Passage || clean.String() != "Young people share grapes and another grape." {
				t.Fatalf("valid SSE framing: %v", err)
			}
		}
	}
}

func TestBoundarySSEInvalidUTF8RejectedBeforeReplacement(t *testing.T) {
	_, candidate := p0Candidate()
	wire := strings.Replace(p0SSE(p0JSON(candidate)), "people", "pe"+string([]byte{0xff})+"ple", 1)
	stream := openRouterStream{io.NopCloser(strings.NewReader(wire))}
	var preview strings.Builder
	_, err := stream.Receive(context.Background(), func(s string) error { preview.WriteString(s); return nil })
	if DescribeFailure(err).Reason != "sse_event_encoding_invalid" || preview.Len() != 0 {
		t.Fatalf("invalid wire encoding was silently replaced: %+v; emitted=%d", DescribeFailure(err), preview.Len())
	}
}

func TestBoundaryMultipleCompleteChoicesAreNotMergedAsValid(t *testing.T) {
	_, candidate := p0Candidate()
	choice := map[string]any{"delta": map[string]string{"content": p0JSON(candidate)}}
	wire := "data: " + p0JSON(map[string]any{"choices": []any{choice, choice}}) + "\n\n"
	stream := openRouterStream{io.NopCloser(strings.NewReader(wire))}
	_, err := stream.Receive(context.Background(), func(string) error { return nil })
	if DescribeFailure(err).Reason != "json_trailing_content" {
		t.Fatalf("two complete choices accepted as one result: %v", err)
	}
}

func TestBoundaryMinimumWordThreshold(t *testing.T) {
	validator := testValidator(t)
	for _, minimum := range []int{6, 7, 8} {
		spec, candidate := p0Candidate() // independently counted: seven clean words
		spec.MinimumWords = minimum
		batch, err := validator.Validate(context.Background(), spec, candidate)
		if minimum <= 7 {
			if err != nil || batch.WordCount != 7 {
				t.Fatalf("legal boundary: %v", err)
			}
		} else {
			detail := DescribeFailure(err)
			if detail.Reason != "passage_too_short" || detail.Actual != 7 || detail.Limit != 8 {
				t.Fatal("wrong word-count boundary")
			}
		}
	}
}
