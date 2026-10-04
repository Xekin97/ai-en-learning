//go:build integration

package observability

import (
	"bytes"
	"strings"
	"testing"
	"wordweave/internal/testdb"
)

func TestM002OperationalMetricsDistinguishMissingSnapshot(t *testing.T) {
	pool, ctx := testdb.Open(t)
	var out bytes.Buffer
	writeOperations(ctx, &out, pool)
	if !strings.Contains(out.String(), "wordweave_operational_metrics_available 1") || !strings.Contains(out.String(), "wordweave_analytics_snapshot_available 0") || strings.Contains(out.String(), "wordweave_analytics_lag_seconds") {
		t.Fatalf("unknown metrics reported as known: %s", out.String())
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '1 day',analytics_updated_at=clock_timestamp()-interval '3 minutes'`); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	writeOperations(ctx, &out, pool)
	if !strings.Contains(out.String(), "wordweave_analytics_snapshot_available 1") || !strings.Contains(out.String(), "wordweave_analytics_lag_seconds 18") {
		t.Fatalf("missing real maintenance lag: %s", out.String())
	}
}
