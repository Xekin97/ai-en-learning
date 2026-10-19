package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sync"
	"time"
)

// ErrCriticalUsageFact marks reservation, invocation, or final accounting
// persistence failures. Callers must fail the logical request rather than turn
// these database-unknown states into a recoverable content-service outcome.
var ErrCriticalUsageFact = errors.New("critical AI usage fact was not persisted")

func criticalUsageFact(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%w: %w", ErrCriticalUsageFact, err)
}

// Usage contains only provider-reported accounting fields, never generated text.
// Nil means unreported; a reported zero remains a known zero.
type Usage struct {
	RequestID    *string
	InputTokens  *int64
	OutputTokens *int64
	Cost         *string
}
type UsageRecorder interface {
	Begin(context.Context, GenerationSpec) (func(Usage), error)
}
type UsageCallHandle interface {
	MarkInvoked(context.Context, *bool) error
	FinishUsage(context.Context, Usage) error
}
type DetailedUsageRecorder interface {
	BeginCall(context.Context, GenerationSpec) (UsageCallHandle, error)
}
type usageContextKey struct{}
type invocationObserverKey struct{}
type passageClosedObserverKey struct{}

func WithUsageRecorder(ctx context.Context, r UsageRecorder) context.Context {
	return context.WithValue(ctx, usageContextKey{}, r)
}
func WithInvocationObserver(ctx context.Context, observer func() error) context.Context {
	return context.WithValue(ctx, invocationObserverKey{}, observer)
}

// WithPassageClosedObserver registers the request-local publication boundary
// for a streamed candidate. The provider calls it exactly once after the
// closing passage quote has been safely decoded and after any clean delta from
// that same chunk has been delivered. It does not imply provider EOF, valid
// metadata, or a saveable result.
func WithPassageClosedObserver(ctx context.Context, observer func() error) context.Context {
	return context.WithValue(ctx, passageClosedObserverKey{}, observer)
}

// NotifyPassageClosed is used by provider Stream implementations after their
// safe extractor closes the passage string. Closing a transport or returning
// a Candidate must never call it implicitly.
func NotifyPassageClosed(ctx context.Context) error {
	observer, ok := ctx.Value(passageClosedObserverKey{}).(func() error)
	if !ok || observer == nil {
		return nil
	}
	return observer()
}
func notifyInvoked(ctx context.Context, invoked *bool) error {
	if invoked == nil || !*invoked {
		return nil
	}
	if observer, ok := ctx.Value(invocationObserverKey{}).(func() error); ok && observer != nil {
		return observer()
	}
	return nil
}
func beginUsage(ctx context.Context, spec GenerationSpec) (*callUsage, error) {
	c := &callUsage{}
	if r, ok := ctx.Value(usageContextKey{}).(DetailedUsageRecorder); ok {
		handle, err := r.BeginCall(ctx, spec)
		if err != nil {
			return nil, criticalUsageFact(err)
		}
		c.mark = handle.MarkInvoked
		c.finishCritical = handle.FinishUsage
		return c, nil
	}
	if r, ok := ctx.Value(usageContextKey{}).(UsageRecorder); ok {
		var err error
		c.finish, err = r.Begin(ctx, spec)
		if err != nil {
			return nil, err
		}
	}
	return c, nil
}

type callUsage struct {
	mu             sync.Mutex
	once           sync.Once
	usage          Usage
	finish         func(Usage)
	mark           func(context.Context, *bool) error
	finishCritical func(context.Context, Usage) error
	doneErr        error
}

func (c *callUsage) markInvoked(ctx context.Context, value *bool) error {
	if c == nil || c.mark == nil {
		return nil
	}
	return criticalUsageFact(c.mark(ctx, value))
}

func (c *callUsage) done() error {
	if c == nil {
		return nil
	}
	c.once.Do(func() {
		c.mu.Lock()
		u := c.usage
		c.mu.Unlock()
		if c.finish != nil {
			c.finish(u)
		}
		if c.finishCritical != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			c.doneErr = criticalUsageFact(c.finishCritical(ctx, u))
		}
	})
	return c.doneErr
}

var decimalUsage = regexp.MustCompile(`^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]{1,3})?$`)

func (c *callUsage) observe(data, key string) {
	if c == nil {
		return
	}
	var e struct {
		ID    string `json:"id"`
		Usage *struct {
			Input  *int64          `json:"prompt_tokens"`
			Output *int64          `json:"completion_tokens"`
			Cost   json.RawMessage `json:"cost"`
		} `json:"usage"`
	}
	if json.Unmarshal([]byte(data), &e) != nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if id := privateSafeID(e.ID, key); id != "" {
		c.usage.RequestID = &id
	}
	if e.Usage == nil {
		return
	}
	if e.Usage.Input != nil && *e.Usage.Input >= 0 {
		c.usage.InputTokens = e.Usage.Input
	}
	if e.Usage.Output != nil && *e.Usage.Output >= 0 {
		c.usage.OutputTokens = e.Usage.Output
	}
	if value := string(e.Usage.Cost); len(value) <= 128 && decimalUsage.MatchString(value) {
		c.usage.Cost = &value
	}
}
