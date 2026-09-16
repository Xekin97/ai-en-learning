package generationtrace

// ProviderFact is a separate allowlisted projection, never an upstream envelope.
// Usage numbers are latest cumulative totals (not sums of repeated usage frames).
type ProviderFact struct {
	ID               string `json:"id"`
	RequestID        string `json:"upstream_request_id"`
	HTTPStatus       int    `json:"http_status"`
	Frame            int64  `json:"frame"`
	Bytes            int64  `json:"bytes"`
	Choice           int    `json:"choice_index"`
	ChoiceProvided   bool   `json:"choice_index_provided"`
	FinishReason     string `json:"finish_reason"`
	ErrorPresent     bool   `json:"error_present"`
	ErrorCodeType    string `json:"error_code_type"`
	ErrorCode        int    `json:"error_code"`
	UsageProvided    bool   `json:"usage_provided"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	TotalTokens      int64  `json:"total_tokens"`
	SyntaxOffset     int64  `json:"syntax_offset"`
}

func (t *Trace) Provider(s Stage, fact ProviderFact) {
	if t == nil || s >= stageCount {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	fact.ID, fact.RequestID = SafeID(fact.ID), SafeID(fact.RequestID)
	fact.FinishReason = member(fact.FinishReason, "stop|length|tool_calls|function_call|content_filter|error|not_provided", "other")
	if fact.FinishReason == "" {
		fact.FinishReason = "not_provided"
	}
	fact.ErrorCodeType = member(fact.ErrorCodeType, "number|string|null|other|not_provided", "other")
	if fact.ErrorCodeType == "" {
		fact.ErrorCodeType = "not_provided"
	}
	if fact.ErrorCode < 100 || fact.ErrorCode > 599 {
		fact.ErrorCode = 0
	}
	if fact.HTTPStatus < 100 || fact.HTTPStatus > 599 {
		fact.HTTPStatus = 0
	}
	t.emitLocked(Event{Kind: "provider", Fact: t.stages[s], Provider: &fact})
}
