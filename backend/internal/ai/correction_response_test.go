package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func correctionFixtureStream(plan *contentCorrection, candidate Candidate) Stream {
	values := map[string]any{}
	for _, task := range plan.Tasks {
		values[task.Key] = repairValue(candidate, task)
	}
	raw, _ := json.Marshal(values)
	return correctionRawFixture(plan, string(raw))
}

func correctionRawFixture(plan *contentCorrection, raw string) Stream {
	return &openRouterStream{body: io.NopCloser(strings.NewReader(protocolFrames(ProtocolChat, raw))), correction: plan}
}

func TestCorrectionResponseStrictEnvelopeAndIndependentValues(t *testing.T) {
	spec, original := fieldRepairFixture()
	original.Tags = []string{"home", "HOME"}
	original.Targets[0].HintPhrase = "the heavy door"
	v := testValidator(t)
	plan, err := v.correctionPlan(context.Background(), spec, original, nil, "")
	if err != nil || len(plan.Tasks) != 2 {
		t.Fatalf("plan: %v", err)
	}
	for _, raw := range []string{
		`{"r4":"open(open) the heavy door","r2":["home"]}`,
		`{"r2":["home"],"r4":"open(open) the heavy door"}`,
	} {
		response, err := decodeCorrection(context.Background(), []byte(raw), plan)
		if err != nil {
			t.Fatal(err)
		}
		result, feedback, err := v.applyCorrection(context.Background(), spec, original, response, plan)
		if err != nil || len(feedback) != 0 {
			t.Fatalf("feedback=%v err=%v", feedback, err)
		}
		if _, err := v.Validate(context.Background(), spec, result); err != nil {
			t.Fatal(err)
		}
	}
	for name, raw := range map[string]string{
		"missing":      `{"r2":["home"]}`,
		"extra":        `{"r2":["home"],"r4":"open(open)","passage":"changed"}`,
		"case":         `{"R2":["home"],"r4":"open(open)"}`,
		"duplicate":    `{"r2":["home"],"r4":"a","r4":"b"}`,
		"null":         `{"r2":null,"r4":"open(open)"}`,
		"null element": `{"r2":[null],"r4":"open(open)"}`,
		"wrong type":   `{"r2":"home","r4":"open(open)"}`,
		"nested path":  `{"r2":["home"],"r4":{"path":"passage","value":"changed"}}`,
		"trailing":     `{"r2":["home"],"r4":"open(open)"} {}`,
		"fenced":       "```json\n{\"r2\":[\"home\"],\"r4\":\"open(open)\"}\n```",
		"broken":       `{"r2":["home"],`,
		"invalid utf8": string([]byte{'{', '"', 0xff, '"', ':', '1', '}'}),
	} {
		t.Run(name, func(t *testing.T) {
			result, err := decodeCorrection(context.Background(), []byte(raw), plan)
			if DescribeFailure(err).Reason != "correction_response_shape" || result.Passage != "" || result.Targets != nil {
				t.Fatalf("partially accepted invalid envelope: %+v %v", result, err)
			}
		})
	}
	// Empty values are content failures; a good independent field may advance.
	response, err := decodeCorrection(context.Background(), []byte(`{"r2":["home"],"r4":""}`), plan)
	if err != nil {
		t.Fatal(err)
	}
	result, feedback, err := v.applyCorrection(context.Background(), spec, original, response, plan)
	if err != nil || len(feedback) != 1 || !reflect.DeepEqual(result.Tags, []string{"home"}) || result.Targets[0].HintPhrase != original.Targets[0].HintPhrase {
		t.Fatalf("independent acceptance failed: %+v %v", result, err)
	}
	if _, err := v.Validate(context.Background(), spec, result); err == nil {
		t.Fatal("partial candidate became valid")
	}
	if len(original.Tags) != 2 {
		t.Fatal("private base mutated")
	}
}

func TestCorrectionResponseRetriesAreBoundedAndTransportStops(t *testing.T) {
	for _, mode := range []string{"recover_shape", "repeat_shape", "protocol", "cancel", "initial_schema"} {
		t.Run(mode, func(t *testing.T) {
			spec, original := fieldRepairFixture()
			original.Targets[0].HintPhrase = "the heavy door"
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var provider *continuationProviderFixture
			provider = &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
				if next.correction == nil {
					t.Fatal("expected field correction")
				}
				switch mode {
				case "cancel":
					cancel()
					return correctionRawFixture(next.correction, `{}`)
				case "protocol":
					return &openRouterStream{body: io.NopCloser(strings.NewReader(p0SSE(`{"r4":"open(open) the heavy door"}`))), correction: next.correction}
				}
				if provider.calls == 2 && mode == "recover_shape" {
					if next.correction.PreviousError != "json_invalid" || !strings.Contains(systemPrompt(next), "RESPONSE_SHAPE") {
						t.Fatal("missing response feedback")
					}
					return correctionRawFixture(next.correction, `{"r4":"open(open) the heavy door"}`)
				}
				return correctionRawFixture(next.correction, `{"r4":`)
			}}
			initial := continuationStream(original)
			if mode == "initial_schema" {
				initial = &openRouterStream{body: io.NopCloser(strings.NewReader(protocolFrames(ProtocolChat, `{"passage":"They open the door.","tags":["home"],"targets":`)))}
			}
			budget := NewRepairBudget(2)
			result, err := ReceiveWithRepairBudget(ctx, provider, testValidator(t), spec, initial, func(string) error { return nil }, budget)
			if mode == "recover_shape" {
				if err != nil {
					t.Fatal(err)
				}
				if _, err := testValidator(t).Validate(ctx, spec, result); err != nil {
					t.Fatal(err)
				}
			} else if err == nil {
				t.Fatal("failure accepted")
			}
			want := 2
			if mode == "protocol" || mode == "cancel" {
				want = 1
			}
			if mode == "initial_schema" {
				want = 0
			}
			if provider.calls != want || budget.Remaining != 2-want {
				t.Fatalf("calls=%d remaining=%d", provider.calls, budget.Remaining)
			}
			if mode == "cancel" && !errors.Is(err, context.Canceled) {
				t.Fatal("cancel lost")
			}
		})
	}
}

func TestCorrectionGatewayThreeProtocolsAndUsage(t *testing.T) {
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		for _, outputMode := range []string{"prompt", "json_schema"} {
			t.Run(protocol+"/"+outputMode, func(t *testing.T) {
				spec, original := fieldRepairFixture()
				original.Targets[0].HintPhrase = "the heavy door"
				plan, err := testValidator(t).correctionPlan(context.Background(), spec, original, nil, "")
				if err != nil {
					t.Fatal(err)
				}
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					body, err := io.ReadAll(r.Body)
					if err != nil {
						t.Error(err)
						return
					}
					if !strings.Contains(string(body), "CORRECTION_SCHEMA") || strings.Contains(string(body), original.Passage) || strings.Contains(string(body), "wordweave_learning_batch") {
						t.Errorf("wrong request context/schema: %s", body)
					}
					w.Header().Set("Content-Type", "text/event-stream")
					fmt.Fprint(w, protocolFrames(protocol, `{"r4":"open(open) the heavy door"}`))
				}))
				defer server.Close()
				g := NewGateway(nil, "https://wordweave.example", "")
				g.client = server.Client()
				spec.correction = plan
				spec.connection = &connectionSnapshot{connection: Connection{ID: uuid.New(), Protocol: protocol, BaseURL: server.URL}, apiKey: "synthetic-secret", outputMode: outputMode}
				stream, err := g.Open(context.Background(), spec)
				if err != nil {
					t.Fatal(err)
				}
				defer stream.Close()
				closed := 0
				ctx := WithPassageClosedObserver(context.Background(), func() error { closed++; return nil })
				result, err := stream.Receive(ctx, func(string) error { t.Error("private correction delta exposed"); return nil })
				if err != nil || closed != 0 || result.Passage != original.Passage || result.Targets[0].HintPhrase != "open(open) the heavy door" {
					t.Fatalf("result=%+v err=%v closed=%d", result, err, closed)
				}
				usage := stream.(*openRouterStream).usage.usage
				if usage.InputTokens == nil || *usage.InputTokens != 10 || usage.OutputTokens == nil || *usage.OutputTokens != 20 {
					t.Fatalf("usage lost: %+v", usage)
				}
			})
		}
	}
}

func TestCorrectionSharesBudgetAcrossSeparateCandidateVersions(t *testing.T) {
	spec, original := fieldRepairFixture()
	original.Targets[0].HintPhrase = "the heavy door"
	budget := NewRepairBudget(2)
	provider := &continuationProviderFixture{makeNext: func(next GenerationSpec) Stream {
		return correctionRawFixture(next.correction, `{"r4":"open(open) the heavy door"}`)
	}}
	for version := 1; version <= 3; version++ {
		result, err := ReceiveWithRepairBudget(context.Background(), provider, testValidator(t), spec, continuationStream(original), func(string) error { return nil }, budget)
		if err != nil {
			t.Fatal(err)
		}
		_, validationErr := testValidator(t).Validate(context.Background(), spec, result)
		if (validationErr == nil) != (version <= 2) {
			t.Fatalf("unexpected version %d gate: %v", version, validationErr)
		}
	}
	if provider.calls != 2 || budget.Remaining != 0 {
		t.Fatal("budget reset between candidates")
	}
}

func TestCorrectionLegacyReceiverRetainsReportedCost(t *testing.T) {
	spec, candidate := fieldRepairFixture()
	candidate.Targets[0].HintPhrase = "the heavy door"
	plan, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	stream := correctionRawFixture(plan, `{"r4":"open(open) the heavy door"}`).(*openRouterStream)
	stream.usage = &callUsage{}
	if _, err := stream.Receive(context.Background(), func(string) error { t.Fatal("private delta"); return nil }); err != nil {
		t.Fatal(err)
	}
	if stream.usage.usage.Cost == nil || *stream.usage.usage.Cost != "0.5" {
		t.Fatalf("OpenRouter's reported cost lost: %+v", stream.usage.usage)
	}
}

func TestCorrectionShapeFeedbackDistinguishesContractErrors(t *testing.T) {
	spec, candidate := fieldRepairFixture()
	candidate.Targets[0].HintPhrase = "the heavy door"
	plan, err := testValidator(t).correctionPlan(context.Background(), spec, candidate, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct{ raw, want string }{
		{`{"r4":"a","r4":"b"}`, "json_duplicate_key"},
		{`{"r4":null}`, "json_null"},
		{`{"r4":1}`, "response_string_required at requested key r4"},
		{`{"untrusted_private_key":"x"}`, "response_key_missing at requested key r4"},
		{`{"r4":"a"} {}`, "json_trailing_content"},
	} {
		_, err := decodeCorrection(context.Background(), []byte(tt.raw), plan)
		if correctionShapeFeedback(err) != tt.want || strings.Contains(err.Error(), "untrusted_private_key") {
			t.Fatalf("feedback=%s err=%v", correctionShapeFeedback(err), err)
		}
	}
}
