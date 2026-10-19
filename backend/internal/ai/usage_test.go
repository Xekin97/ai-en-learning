package ai

import (
	"context"
	"errors"
	"testing"
)

var errSyntheticUsageFact = errors.New("synthetic usage fact failure")

type failingUsageRecorder struct {
	begin  bool
	mark   bool
	finish bool
}

func (recorder failingUsageRecorder) Begin(context.Context, GenerationSpec) (func(Usage), error) {
	return nil, errors.New("legacy usage path must not be selected")
}

func (recorder failingUsageRecorder) BeginCall(context.Context, GenerationSpec) (UsageCallHandle, error) {
	if recorder.begin {
		return nil, errSyntheticUsageFact
	}
	return failingUsageHandle{mark: recorder.mark, finish: recorder.finish}, nil
}

type failingUsageHandle struct {
	mark, finish bool
}

func (handle failingUsageHandle) MarkInvoked(context.Context, *bool) error {
	if handle.mark {
		return errSyntheticUsageFact
	}
	return nil
}

func (handle failingUsageHandle) FinishUsage(context.Context, Usage) error {
	if handle.finish {
		return errSyntheticUsageFact
	}
	return nil
}

func TestCriticalUsageFactErrorsRemainDistinguishable(t *testing.T) {
	for _, tc := range []struct {
		name     string
		recorder failingUsageRecorder
		step     string
	}{
		{"reserve", failingUsageRecorder{begin: true}, "begin"},
		{"mark invoked", failingUsageRecorder{mark: true}, "mark"},
		{"finish usage", failingUsageRecorder{finish: true}, "finish"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := WithUsageRecorder(context.Background(), tc.recorder)
			call, err := beginUsage(ctx, GenerationSpec{})
			if tc.step == "begin" {
				if !errors.Is(err, ErrCriticalUsageFact) || !errors.Is(err, errSyntheticUsageFact) {
					t.Fatalf("error=%v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			invoked := true
			if tc.step == "mark" {
				err = call.markInvoked(ctx, &invoked)
			} else {
				err = call.done()
			}
			if !errors.Is(err, ErrCriticalUsageFact) || !errors.Is(err, errSyntheticUsageFact) {
				t.Fatalf("error=%v", err)
			}
		})
	}
}
