package generation

import (
	"context"
	"time"
)

// InvocationBounds separates confirmed provider calls from the crash window in
// which sending could not be confirmed. Explicit provider_invoked=false rows
// are reported but never added to the upper bound.
type InvocationBounds struct {
	Lower, Upper, Unknown, NotInvoked int64
}

type ContentFrequency struct {
	AcceptedRuns, EnhancedRuns  int64
	ReviewRuns                  InvocationBounds
	RepairRuns                  InvocationBounds
	ForcedRuns                  InvocationBounds
	ContradictionRuns           InvocationBounds
	ForcedAndContradictionRuns  InvocationBounds
	ForcedOrContradictionRuns   InvocationBounds
	RepairCalls                 InvocationBounds
	ForcedCalls                 InvocationBounds
	ContradictionCalls          InvocationBounds
	ForcedAndContradictionCalls InvocationBounds
	ReviewIssueRuns             int64
	RepairRequestedRuns         int64
	Stages                      map[string]InvocationBounds
}

// DiagnoseContentFrequency is an internal/operator diagnostic. entryKind is
// normal or preset for user runs; preview=true selects background previews and
// requires an empty entryKind. It stores no aggregate and exposes no HTTP API.
func (s *Service) DiagnoseContentFrequency(ctx context.Context, start, end time.Time, entryKind string, preview bool) (ContentFrequency, error) {
	var out ContentFrequency
	if !end.After(start) || (preview && entryKind != "") || (!preview && entryKind != "normal" && entryKind != "preset") {
		return out, ErrInvalidInput
	}
	runs := `SELECT id,content_review_enabled_snapshot AS enhanced FROM wordweave.generation_runs WHERE content_policy_version=1 AND started_at >= $1 AND started_at < $2 AND entry_kind=$3`
	usageKey := "user_run_id"
	args := []any{start, end, entryKind}
	if preview {
		runs = `SELECT id,content_review_enabled_snapshot AS enhanced FROM wordweave.preset_preview_runs WHERE content_policy_version=1 AND started_at >= $1 AND started_at < $2`
		usageKey = "preview_run_id"
		args = []any{start, end}
	}
	query := `WITH selected AS (` + runs + `), facts AS (
		SELECT r.id,r.enhanced,
		 coalesce(bool_or(u.call_stage='content_review' AND u.provider_invoked IS TRUE),false) review_true,
		 coalesce(bool_or(u.call_stage='content_review' AND u.provider_invoked IS NULL),false) review_unknown,
		 coalesce(bool_or(u.call_stage='content_review' AND u.provider_invoked IS FALSE),false) review_false,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS TRUE),false) repair_true,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS NULL),false) repair_unknown,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS FALSE),false) repair_false,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS TRUE AND 'forced_wording'=ANY(u.reason_codes)),false) f_true,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS NULL AND 'forced_wording'=ANY(u.reason_codes)),false) f_unknown,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS FALSE AND 'forced_wording'=ANY(u.reason_codes)),false) f_false,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS TRUE AND 'contradiction'=ANY(u.reason_codes)),false) c_true,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS NULL AND 'contradiction'=ANY(u.reason_codes)),false) c_unknown,
		 coalesce(bool_or(u.call_stage='content_repair' AND u.provider_invoked IS FALSE AND 'contradiction'=ANY(u.reason_codes)),false) c_false,
		 coalesce(bool_or(u.call_stage='content_review' AND u.review_result='issues'),false) review_issues,
		 coalesce(bool_or(u.call_stage='content_review' AND u.repair_requested IS TRUE),false) repair_requested,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS TRUE) repair_calls_true,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS NULL) repair_calls_unknown,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS FALSE) repair_calls_false,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS TRUE AND 'forced_wording'=ANY(u.reason_codes)) f_calls_true,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS NULL AND 'forced_wording'=ANY(u.reason_codes)) f_calls_unknown,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS FALSE AND 'forced_wording'=ANY(u.reason_codes)) f_calls_false,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS TRUE AND 'contradiction'=ANY(u.reason_codes)) c_calls_true,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS NULL AND 'contradiction'=ANY(u.reason_codes)) c_calls_unknown,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS FALSE AND 'contradiction'=ANY(u.reason_codes)) c_calls_false,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS TRUE AND 'forced_wording'=ANY(u.reason_codes) AND 'contradiction'=ANY(u.reason_codes)) fc_calls_true,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS NULL AND 'forced_wording'=ANY(u.reason_codes) AND 'contradiction'=ANY(u.reason_codes)) fc_calls_unknown,
		 count(*) FILTER(WHERE u.call_stage='content_repair' AND u.provider_invoked IS FALSE AND 'forced_wording'=ANY(u.reason_codes) AND 'contradiction'=ANY(u.reason_codes)) fc_calls_false
		FROM selected r LEFT JOIN wordweave.ai_call_usage u ON u.` + usageKey + `=r.id GROUP BY r.id,r.enhanced)
	SELECT count(*),count(*) FILTER(WHERE enhanced),
	 count(*) FILTER(WHERE review_true),count(*) FILTER(WHERE review_true OR review_unknown),count(*) FILTER(WHERE review_unknown),count(*) FILTER(WHERE review_false),
	 count(*) FILTER(WHERE repair_true),count(*) FILTER(WHERE repair_true OR repair_unknown),count(*) FILTER(WHERE repair_unknown),count(*) FILTER(WHERE repair_false),
	 count(*) FILTER(WHERE f_true),count(*) FILTER(WHERE f_true OR f_unknown),count(*) FILTER(WHERE f_unknown),count(*) FILTER(WHERE f_false),
	 count(*) FILTER(WHERE c_true),count(*) FILTER(WHERE c_true OR c_unknown),count(*) FILTER(WHERE c_unknown),count(*) FILTER(WHERE c_false),
	 count(*) FILTER(WHERE f_true AND c_true),count(*) FILTER(WHERE (f_true OR f_unknown) AND (c_true OR c_unknown)),count(*) FILTER(WHERE f_unknown OR c_unknown),count(*) FILTER(WHERE f_false AND c_false),
	 count(*) FILTER(WHERE f_true OR c_true),count(*) FILTER(WHERE f_true OR f_unknown OR c_true OR c_unknown),count(*) FILTER(WHERE f_unknown OR c_unknown),count(*) FILTER(WHERE f_false OR c_false),
	 coalesce(sum(repair_calls_true),0),coalesce(sum(repair_calls_true+repair_calls_unknown),0),coalesce(sum(repair_calls_unknown),0),coalesce(sum(repair_calls_false),0),
	 coalesce(sum(f_calls_true),0),coalesce(sum(f_calls_true+f_calls_unknown),0),coalesce(sum(f_calls_unknown),0),coalesce(sum(f_calls_false),0),
	 coalesce(sum(c_calls_true),0),coalesce(sum(c_calls_true+c_calls_unknown),0),coalesce(sum(c_calls_unknown),0),coalesce(sum(c_calls_false),0),
	 coalesce(sum(fc_calls_true),0),coalesce(sum(fc_calls_true+fc_calls_unknown),0),coalesce(sum(fc_calls_unknown),0),coalesce(sum(fc_calls_false),0),
	 count(*) FILTER(WHERE review_issues),count(*) FILTER(WHERE repair_requested) FROM facts`
	err := s.app.QueryRow(ctx, query, args...).Scan(
		&out.AcceptedRuns, &out.EnhancedRuns,
		&out.ReviewRuns.Lower, &out.ReviewRuns.Upper, &out.ReviewRuns.Unknown, &out.ReviewRuns.NotInvoked,
		&out.RepairRuns.Lower, &out.RepairRuns.Upper, &out.RepairRuns.Unknown, &out.RepairRuns.NotInvoked,
		&out.ForcedRuns.Lower, &out.ForcedRuns.Upper, &out.ForcedRuns.Unknown, &out.ForcedRuns.NotInvoked,
		&out.ContradictionRuns.Lower, &out.ContradictionRuns.Upper, &out.ContradictionRuns.Unknown, &out.ContradictionRuns.NotInvoked,
		&out.ForcedAndContradictionRuns.Lower, &out.ForcedAndContradictionRuns.Upper, &out.ForcedAndContradictionRuns.Unknown, &out.ForcedAndContradictionRuns.NotInvoked,
		&out.ForcedOrContradictionRuns.Lower, &out.ForcedOrContradictionRuns.Upper, &out.ForcedOrContradictionRuns.Unknown, &out.ForcedOrContradictionRuns.NotInvoked,
		&out.RepairCalls.Lower, &out.RepairCalls.Upper, &out.RepairCalls.Unknown, &out.RepairCalls.NotInvoked,
		&out.ForcedCalls.Lower, &out.ForcedCalls.Upper, &out.ForcedCalls.Unknown, &out.ForcedCalls.NotInvoked,
		&out.ContradictionCalls.Lower, &out.ContradictionCalls.Upper, &out.ContradictionCalls.Unknown, &out.ContradictionCalls.NotInvoked,
		&out.ForcedAndContradictionCalls.Lower, &out.ForcedAndContradictionCalls.Upper, &out.ForcedAndContradictionCalls.Unknown, &out.ForcedAndContradictionCalls.NotInvoked,
		&out.ReviewIssueRuns, &out.RepairRequestedRuns,
	)
	if err != nil {
		return out, err
	}
	out.Stages = make(map[string]InvocationBounds, 6)
	stageQuery := `WITH selected AS (` + runs + `) SELECT u.call_stage,
		count(*) FILTER(WHERE u.provider_invoked IS TRUE),count(*) FILTER(WHERE u.provider_invoked IS TRUE OR u.provider_invoked IS NULL),
		count(*) FILTER(WHERE u.provider_invoked IS NULL),count(*) FILTER(WHERE u.provider_invoked IS FALSE)
		FROM selected r JOIN wordweave.ai_call_usage u ON u.` + usageKey + `=r.id
		WHERE u.call_stage=ANY($` + stageArrayParameter(preview) + `::text[]) GROUP BY u.call_stage`
	stageArgs := append(args, []string{"planning", "generation", "fixed_edit", "technical_repair", "content_review", "content_repair"})
	rows, err := s.app.Query(ctx, stageQuery, stageArgs...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var stage string
		var bounds InvocationBounds
		if err = rows.Scan(&stage, &bounds.Lower, &bounds.Upper, &bounds.Unknown, &bounds.NotInvoked); err != nil {
			return out, err
		}
		out.Stages[stage] = bounds
	}
	if err = rows.Err(); err != nil {
		return out, err
	}
	return out, nil
}

func stageArrayParameter(preview bool) string {
	if preview {
		return "3"
	}
	return "4"
}
