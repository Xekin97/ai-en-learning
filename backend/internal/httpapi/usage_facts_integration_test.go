//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"wordweave/internal/ai"
	"wordweave/internal/generation"
)

func recordSuccessfulGenerationFacts(t *testing.T, ctx context.Context, server *Server, run generation.Run) {
	t.Helper()
	type fact struct {
		stage, prompt, review string
	}
	facts := []fact{{"planning", ai.PlanPromptVersion, "not_applicable"}, {"generation", ai.PromptVersion, "not_applicable"}}
	if run.Snapshot.ContentService.ContentReviewEnabled {
		facts = append(facts, fact{"fixed_edit", ai.FixedEditPromptVersion, "not_applicable"}, fact{"content_review", ai.ReviewPromptVersion, "pass"})
	}
	for index, item := range facts {
		if _, err := server.pool.Exec(ctx, `INSERT INTO wordweave.ai_call_usage(user_run_id,call_no,model_snapshot,usage_status,completed_at,call_stage,prompt_version,provider_invoked,review_result)
			VALUES($1,$2,$3,'unknown',clock_timestamp(),$4,$5,true,$6)`, run.ID, index+1, run.Spec.ProviderModelID, item.stage, item.prompt, item.review); err != nil {
			t.Fatal(err)
		}
	}
}

func testScenePlan(entries ...string) map[string]any {
	uses := make([]map[string]string, 0, len(entries))
	for _, entry := range entries {
		uses = append(uses, map[string]string{
			"entry": entry, "form": entry, "meaning": "the selected meaning of " + entry,
			"phrase": entry + " in context", "role": "Fits the selected word into the shared scene.",
		})
	}
	return map[string]any{
		"scene":        "People work together in one calm shared situation.",
		"participants": []map[string]string{{"id": "Mara", "role": "participant"}},
		"fixed_facts":  []string{"The participants remain in the same place."},
		"beats":        []string{"The participants begin their shared task.", "They discuss the result together."},
		"word_uses":    uses,
	}
}

func providerTaskName(request map[string]any) string {
	format, _ := request["response_format"].(map[string]any)
	schema, _ := format["json_schema"].(map[string]any)
	name, _ := schema["name"].(string)
	return name
}

func isPlanProviderRequest(request map[string]any) bool {
	if providerTaskName(request) == "wordweave_scene_plan" {
		return true
	}
	messages, _ := request["messages"].([]any)
	for _, raw := range messages {
		message, _ := raw.(map[string]any)
		content, _ := message["content"].(string)
		if strings.Contains(content, "SCENE_PLAN_SCHEMA") {
			return true
		}
	}
	return false
}

func writeChatObject(writer http.ResponseWriter, value any) {
	raw, _ := json.Marshal(value)
	chunk, _ := json.Marshal(map[string]any{"choices": []map[string]any{{"delta": map[string]string{"content": string(raw)}}}})
	writer.Header().Set("Content-Type", "text/event-stream")
	_, _ = fmt.Fprintf(writer, "data: %s\n\ndata: [DONE]\n\n", chunk)
}
