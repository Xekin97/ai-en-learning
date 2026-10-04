package ai

import (
	"context"
	"encoding/json"
	"regexp"
	"sync"
)

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
type usageContextKey struct{}

func WithUsageRecorder(ctx context.Context, r UsageRecorder) context.Context {
	return context.WithValue(ctx, usageContextKey{}, r)
}
func beginUsage(ctx context.Context, spec GenerationSpec) (*callUsage, error) {
	c := &callUsage{}
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
	mu     sync.Mutex
	once   sync.Once
	usage  Usage
	finish func(Usage)
}

func (c *callUsage) done() {
	if c == nil {
		return
	}
	c.once.Do(func() {
		c.mu.Lock()
		u := c.usage
		c.mu.Unlock()
		if c.finish != nil {
			c.finish(u)
		}
	})
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
