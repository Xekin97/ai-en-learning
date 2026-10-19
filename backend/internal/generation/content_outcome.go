package generation

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"wordweave/internal/ai"
	"wordweave/internal/entitlement"
)

var errContentUsageFacts = errors.New("AI call facts do not support the content outcome")

type contentUsageFact struct {
	stage           string
	prompt          string
	model           string
	invoked         *bool
	reviewResult    string
	reasons         []string
	repairRequested bool
}

type contentContract struct {
	model    string
	service  entitlement.ContentService
	pipeline string
	status   string
}

func loadContentContract(ctx context.Context, tx pgx.Tx, id uuid.UUID, preview bool) (contentContract, error) {
	query := `SELECT provider_model_id_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,pipeline_version_snapshot,call_status
		FROM wordweave.generation_runs WHERE id=$1 FOR UPDATE`
	if preview {
		query = `SELECT provider_model_snapshot,content_review_enabled_snapshot,content_repair_limit_snapshot,pipeline_version_snapshot,status
			FROM wordweave.preset_preview_runs WHERE id=$1 FOR UPDATE`
	}
	var contract contentContract
	var model, pipeline *string
	var review *bool
	var limit *int
	if err := tx.QueryRow(ctx, query, id).Scan(&model, &review, &limit, &pipeline, &contract.status); err != nil {
		return contentContract{}, err
	}
	if contract.status != "active" {
		return contentContract{}, ErrTerminalRace
	}
	// Read nullable historical fields only after locking the row, so an already
	// terminal row consistently returns TerminalRace. An active run must carry
	// the complete current v5 contract and usage facts.
	if pipeline == nil || *pipeline != entitlement.PipelineVersion {
		return contentContract{}, errContentUsageFacts
	}
	if model == nil || review == nil || limit == nil {
		return contentContract{}, errContentUsageFacts
	}
	contract.model, contract.pipeline = *model, *pipeline
	contract.service.ContentReviewEnabled, contract.service.ContentRepairLimit = *review, *limit
	contract.service.NativeValidation = true
	return contract, nil
}

func readContentUsageFacts(ctx context.Context, tx pgx.Tx, id uuid.UUID, preview bool) ([]contentUsageFact, error) {
	owner := "user_run_id"
	if preview {
		owner = "preview_run_id"
	}
	rows, err := tx.Query(ctx, `SELECT call_no,call_stage,prompt_version,model_snapshot,provider_invoked,review_result,reason_codes,repair_requested
		FROM wordweave.ai_call_usage WHERE `+owner+`=$1 ORDER BY call_no`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var facts []contentUsageFact
	for rows.Next() {
		var no int
		var fact contentUsageFact
		if err = rows.Scan(&no, &fact.stage, &fact.prompt, &fact.model, &fact.invoked, &fact.reviewResult, &fact.reasons, &fact.repairRequested); err != nil {
			return nil, err
		}
		if no != len(facts)+1 {
			return nil, errContentUsageFacts
		}
		facts = append(facts, fact)
	}
	return facts, rows.Err()
}

func validateContentOutcome(ctx context.Context, tx pgx.Tx, id uuid.UUID, preview bool, pipeline PipelineResult) error {
	contract, err := loadContentContract(ctx, tx, id, preview)
	if err != nil {
		return err
	}
	if !validPipelineForService(contract.service, pipeline) {
		return errContentUsageFacts
	}
	facts, err := readContentUsageFacts(ctx, tx, id, preview)
	if err != nil {
		return err
	}
	if len(facts) < 2 {
		return errContentUsageFacts
	}
	promptVersions := map[string]string{
		"planning": ai.PlanPromptVersion, "generation": ai.PromptVersion,
		"fixed_edit": ai.FixedEditPromptVersion, "technical_repair": ai.NativePromptVersion,
		"content_review": ai.ReviewPromptVersion, "content_repair": ai.RewritePromptVersion,
	}
	technical := 0
	semantic := make([]contentUsageFact, 0, len(facts))
	for index, fact := range facts {
		if fact.model != contract.model || promptVersions[fact.stage] == "" || fact.prompt != promptVersions[fact.stage] {
			return errContentUsageFacts
		}
		if pipeline.Outcome != OutcomeServiceIncomplete || index != len(facts)-1 {
			if fact.invoked == nil || !*fact.invoked {
				return errContentUsageFacts
			}
		}
		if fact.stage == "technical_repair" {
			technical++
			if technical > entitlement.NativeCorrectionLimit || index < 2 {
				return errContentUsageFacts
			}
			continue
		}
		semantic = append(semantic, fact)
	}
	if len(semantic) < 2 || semantic[0].stage != "planning" || semantic[1].stage != "generation" {
		return errContentUsageFacts
	}
	if !contract.service.ContentReviewEnabled {
		if len(semantic) != 2 || pipeline.Outcome != OutcomeBasic || pipeline.Version != 1 {
			return errContentUsageFacts
		}
		return nil
	}
	if len(semantic) < 3 || semantic[2].stage != "fixed_edit" {
		return errContentUsageFacts
	}
	if pipeline.Outcome == OutcomeServiceIncomplete {
		return validateIncompleteUsage(semantic, pipeline)
	}
	return validateCompletedUsage(semantic, contract.service.ContentRepairLimit, pipeline)
}

func validReview(fact contentUsageFact, result string, requested bool) bool {
	if fact.stage != "content_review" || fact.reviewResult != result || fact.repairRequested != requested {
		return false
	}
	if result == "issues" {
		return len(fact.reasons) > 0
	}
	return len(fact.reasons) == 0
}

func sameReasons(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func validateRepair(review, repair contentUsageFact) bool {
	return validReview(review, "issues", true) && repair.stage == "content_repair" && sameReasons(review.reasons, repair.reasons)
}

func validateCompletedUsage(facts []contentUsageFact, limit int, pipeline PipelineResult) error {
	repairs := pipeline.Version - 2
	position := 3
	for index := 0; index < repairs; index++ {
		if position+1 >= len(facts) || !validateRepair(facts[position], facts[position+1]) {
			return errContentUsageFacts
		}
		position += 2
	}
	if position >= len(facts) {
		return errContentUsageFacts
	}
	switch pipeline.Outcome {
	case OutcomeReviewPassed, OutcomeRepairedPassed:
		if !validReview(facts[position], "pass", false) {
			return errContentUsageFacts
		}
	case OutcomeLimitFinalized:
		if repairs != limit || !validReview(facts[position], "issues", false) {
			return errContentUsageFacts
		}
	default:
		return errContentUsageFacts
	}
	if position+1 != len(facts) {
		return errContentUsageFacts
	}
	return nil
}

func validateIncompleteUsage(facts []contentUsageFact, pipeline PipelineResult) error {
	if pipeline.Version == 1 {
		if len(facts) != 3 {
			return errContentUsageFacts
		}
		return nil
	}
	completedRepairs := pipeline.Version - 2
	position := 3
	for index := 0; index < completedRepairs; index++ {
		if position+1 >= len(facts) || !validateRepair(facts[position], facts[position+1]) {
			return errContentUsageFacts
		}
		position += 2
	}
	switch len(facts) - position {
	case 0:
		return nil
	case 1:
		if facts[position].stage == "content_review" && facts[position].reviewResult == "indeterminate" && !facts[position].repairRequested && len(facts[position].reasons) == 0 {
			return nil
		}
	case 2:
		if validateRepair(facts[position], facts[position+1]) {
			return nil
		}
	}
	return fmt.Errorf("%w: invalid service-incomplete suffix", errContentUsageFacts)
}
