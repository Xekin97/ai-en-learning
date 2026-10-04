package ai

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestUsagePreservesReportedZeroPartialAndExactDecimal(t *testing.T) {
	n := 0
	var actual Usage
	c := &callUsage{finish: func(u Usage) { n++; actual = u }}
	c.observe(`{"id":"gen-synthetic","usage":{"prompt_tokens":12,"completion_tokens":0,"cost":0.000000000000123456789}}`, "secret-key")
	c.done()
	c.done()
	if n != 1 || actual.InputTokens == nil || *actual.InputTokens != 12 || actual.OutputTokens == nil || *actual.OutputTokens != 0 || actual.Cost == nil || *actual.Cost != "0.000000000000123456789" {
		t.Fatalf("usage changed: %+v", actual)
	}
	c = &callUsage{}
	c.observe(`{"usage":{"prompt_tokens":null,"completion_tokens":null,"cost":null}}`, "")
	if c.usage.InputTokens != nil || c.usage.OutputTokens != nil || c.usage.Cost != nil {
		t.Fatal("unknown became zero")
	}
	c.observe(`{"usage":{"prompt_tokens":-1,"cost":"0.1"}}`, "")
	if c.usage.InputTokens != nil || c.usage.Cost != nil {
		t.Fatal("invalid usage accepted")
	}
}
func TestUsageFrameAfterContentAndFailureStillRecordedOnce(t *testing.T) {
	for _, bad := range []bool{false, true} {
		calls := 0
		var actual Usage
		usage := &callUsage{finish: func(u Usage) { calls++; actual = u }}
		wire := `data: {"id":"gen-synthetic","usage":{"prompt_tokens":7,"completion_tokens":0,"cost":0},"choices":[]}` + "\n\n"
		if bad {
			wire += "data: broken\n\n"
		} else {
			wire += "data: [DONE]\n\n"
		}
		stream := openRouterStream{body: io.NopCloser(strings.NewReader(wire)), usage: usage}
		_, _ = stream.Receive(context.Background(), func(string) error { return nil })
		_ = stream.Close()
		if calls != 1 || actual.InputTokens == nil || *actual.InputTokens != 7 || actual.Cost == nil || *actual.Cost != "0" {
			t.Fatal("protocol failure lost already reported accounting")
		}
	}
}
