package generation

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"time"
)

type PreviewUsage struct {
	ID           uuid.UUID    `json:"preview_run_id"`
	PresetID     *uuid.UUID   `json:"preset_id"`
	DraftVersion *uuid.UUID   `json:"draft_version"`
	Status       string       `json:"status"`
	StartedAt    time.Time    `json:"started_at"`
	CompletedAt  *time.Time   `json:"completed_at"`
	Usage        UsageSummary `json:"usage"`
}

func (s *Service) PreviewUsageHistory(ctx context.Context, start, end time.Time, cursor *PresetCursor, limit int) (UsageSummary, []PreviewUsage, bool, error) {
	var summary UsageSummary
	items := []PreviewUsage{}
	if start.After(end) || limit < 1 || limit > 100 {
		return summary, items, false, ErrInvalidInput
	}
	from, until := start.Add(-4*time.Hour), end.AddDate(0, 0, 1).Add(-4*time.Hour)
	tx, err := s.app.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return summary, items, false, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `SELECT count(*) FROM wordweave.preset_preview_runs WHERE started_at>=$1 AND started_at<$2`, from, until).Scan(&summary.LogicalRuns)
	if err != nil {
		return summary, items, false, err
	}
	var cost *string
	err = tx.QueryRow(ctx, `SELECT `+usageAggregate+` FROM wordweave.ai_call_usage u WHERE EXISTS(SELECT 1 FROM wordweave.preset_preview_runs r WHERE r.id=u.preview_run_id AND r.started_at>=$1 AND r.started_at<$2)`, from, until).Scan(&summary.ProviderCalls, &summary.InputTokens, &summary.OutputTokens, &cost, &summary.UnknownCalls)
	if err != nil {
		return summary, items, false, err
	}
	if cost != nil {
		summary.Cost = &UsageCost{*cost, "openrouter_credits"}
	}
	var at *time.Time
	var id *uuid.UUID
	if cursor != nil {
		at = &cursor.At
		id = &cursor.ID
	}
	rows, err := tx.Query(ctx, `SELECT id,preset_id,version_id,status,started_at,completed_at FROM wordweave.preset_preview_runs WHERE started_at>=$1 AND started_at<$2 AND ($3::timestamptz IS NULL OR started_at<$3 OR (started_at=$3 AND id>$4)) ORDER BY started_at DESC,id LIMIT $5`, from, until, at, id, limit+1)
	if err != nil {
		return summary, items, false, err
	}
	for rows.Next() {
		var u PreviewUsage
		if err = rows.Scan(&u.ID, &u.PresetID, &u.DraftVersion, &u.Status, &u.StartedAt, &u.CompletedAt); err != nil {
			rows.Close()
			return summary, items, false, err
		}
		items = append(items, u)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return summary, items, false, err
	}
	more := len(items) > limit
	if more {
		items = items[:limit]
	}
	for i := range items {
		items[i].Usage, err = readUsage(ctx, tx, items[i].ID)
		if err != nil {
			return summary, items, false, err
		}
	}
	return summary, items, more, nil
}
