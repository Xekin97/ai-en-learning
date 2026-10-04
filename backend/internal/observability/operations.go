package observability

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"time"
)

// Operational metrics use fixed names and bounded-time aggregate queries. They
// never expose owners, browser keys, model IDs, source text, or answer content.
func writeOperations(ctx context.Context, w io.Writer, pool *pgxpool.Pool) {
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	var active, pending bool
	var lag *float64
	var expired, previewCalls, unknown int64
	err := pool.QueryRow(ctx, `SELECT s.activated_at IS NOT NULL,
 CASE WHEN s.analytics_updated_at IS NOT NULL THEN greatest(0,extract(epoch FROM(clock_timestamp()-s.analytics_updated_at)))::double precision END,
 EXISTS(SELECT 1 FROM wordweave.accounts a WHERE a.role='learner' AND (s.recompute_after_owner IS NULL OR a.id>s.recompute_after_owner)),
 (SELECT count(*) FROM wordweave.analytics_events WHERE occurred_at<=clock_timestamp()-interval '90 days'),
 (SELECT count(*) FROM wordweave.ai_call_usage WHERE preview_run_id IS NOT NULL AND completed_at>clock_timestamp()-interval '24 hours'),
 (SELECT count(*) FROM wordweave.ai_call_usage WHERE usage_status<>'known' AND completed_at>clock_timestamp()-interval '24 hours')
 FROM wordweave.growth_settings s WHERE singleton`).Scan(&active, &lag, &pending, &expired, &previewCalls, &unknown)
	fmt.Fprintln(w, "# TYPE wordweave_operational_metrics_available gauge")
	if err != nil {
		fmt.Fprintln(w, "wordweave_operational_metrics_available 0")
		return
	}
	fmt.Fprintln(w, "wordweave_operational_metrics_available 1")
	gauge := func(name string, value any) { fmt.Fprintf(w, "# TYPE %s gauge\n%s %v\n", name, name, value) }
	flag := func(v bool) int {
		if v {
			return 1
		}
		return 0
	}
	gauge("wordweave_growth_enabled", flag(active))
	gauge("wordweave_growth_recompute_pending", flag(active && pending))
	gauge("wordweave_analytics_snapshot_available", flag(lag != nil))
	if lag != nil {
		gauge("wordweave_analytics_lag_seconds", *lag)
	}
	gauge("wordweave_analytics_expired_events", expired)
	gauge("wordweave_preview_provider_calls_last_24h", previewCalls)
	gauge("wordweave_usage_unknown_calls_last_24h", unknown)
}
