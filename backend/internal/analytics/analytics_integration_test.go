//go:build integration

package analytics

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func fixture(t *testing.T) (*Service, *pgxpool.Pool, context.Context) {
	t.Helper()
	pool, ctx := testdb.Open(t)
	if _, err := pool.Exec(ctx, `UPDATE wordweave.growth_settings SET activated_at=clock_timestamp()-interval '100 days' WHERE singleton`); err != nil {
		t.Fatal(err)
	}
	return NewService(pool, "https://wordweave.example", nil), pool, WithBrowser(ctx, []byte(strings.Repeat("a", 32)))
}
func record(t *testing.T, s *Service, ctx context.Context, owner *uuid.UUID, event Event) {
	t.Helper()
	if err := s.Record(ctx, owner, event); err != nil {
		t.Fatal(err)
	}
}
func TestM002BrowserDedupLoginAndRangeUV(t *testing.T) {
	s, pool, ctx := fixture(t)
	event := Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-205"}
	record(t, s, ctx, nil, event)
	record(t, s, ctx, nil, event)
	owner := testdb.Learner(t, ctx, pool)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		t.Fatal(err)
	}
	if err = Registered(ctx, tx, owner, c); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	record(t, s, ctx, &owner, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-204"})
	if err = Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	day := business.LearningDay(time.Now())
	traffic, err := s.Traffic(ctx, day, day)
	if err != nil || traffic.PV.Value == nil || *traffic.PV.Value != 2 || *traffic.UV.Value != 1 || traffic.Bounce.Status != "no_sample" {
		t.Fatalf("traffic duplicated sign-in: %+v %v", traffic, err)
	}
	funnel, err := s.Funnel(ctx, day, day)
	if err != nil || funnel.Registration.Rate.Value == nil || *funnel.Registration.Rate.Value != 1 || *funnel.Registration.Accounts.Value != 1 || *funnel.Registration.Unattributed.Value != 0 {
		t.Fatalf("registration attribution: %+v %v", funnel, err)
	}
	if funnel.Activation.SevenDays.Status != "observing" || funnel.Activation.SevenDays.Value != nil {
		t.Fatal("immature cohort treated as zero")
	}
	// The same first-party browser on two learning days is one range UV.
	if _, err = pool.Exec(ctx, `UPDATE wordweave.analytics_events SET occurred_at=occurred_at-interval '1 day',learning_day=learning_day-1 WHERE event_key LIKE $1`, "%:"+event.ID.String()); err != nil {
		t.Fatal(err)
	}
	if err = Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	traffic, err = s.Traffic(ctx, day.AddDate(0, 0, -1), day)
	if err != nil || *traffic.UV.Value != 1 || *traffic.Series[0].UV.Value != 1 || *traffic.Series[1].UV.Value != 1 {
		t.Fatalf("range UV summed days: %+v %v", traffic, err)
	}
	second := WithBrowser(ctx, []byte(strings.Repeat("b", 32)))
	record(t, s, second, nil, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-217"})
	if err = Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	traffic, err = s.Traffic(ctx, day, day)
	if err != nil || *traffic.UV.Value != 2 {
		t.Fatal("different browsers merged")
	}
}
func TestM002BounceGenerationCohortAndLateReview(t *testing.T) {
	s, pool, ctx := fixture(t)
	record(t, s, ctx, nil, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-205"})
	day := business.LearningDay(time.Now())
	// Move the one-page session to the beginning of this measured day and make it
	// inactive for 31 minutes; no job needs to run for the derived end to count.
	old := day.Add(-4 * time.Hour)
	now := time.Now()
	if old.After(now.Add(-31 * time.Minute)) {
		day = day.AddDate(0, 0, -1)
		old = day.Add(-4 * time.Hour)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.traffic_sessions SET started_at=$1,last_event_at=$1`, old); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.analytics_events SET occurred_at=$1,learning_day=$2`, old, day); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"generation_valid", "generation_valid", "generation_valid", "generation_failed", "generation_cancelled", ""} {
		id := uuid.New()
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,started_at,learning_day,source_kind,reference_key) VALUES($1,'generation_started',$2,$2,$3,'visitor',$4)`, "start:"+id.String(), old, day, id); err != nil {
			t.Fatal(err)
		}
		if kind != "" {
			if _, err := pool.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,started_at,learning_day,source_kind,reference_key) VALUES($1,$2,$3,$3,$4,'visitor',$5)`, "end:"+id.String(), kind, old, day, id); err != nil {
				t.Fatal(err)
			}
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.review_cohort_daily(start_day,started_count,submitted_count,successful_count,updated_at) VALUES($1,4,3,2,clock_timestamp())`, day.AddDate(0, 0, -95)); err != nil {
		t.Fatal(err)
	}
	if err := Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	traffic, err := s.Traffic(ctx, day, day)
	if err != nil || traffic.Bounce.Value == nil || *traffic.Bounce.Value != 1 {
		t.Fatalf("bounce denominator includes active or excludes ended: %+v %v", traffic, err)
	}
	funnel, err := s.Funnel(ctx, day, day)
	if err != nil || funnel.Generation.FailureRate.Value == nil || *funnel.Generation.FailureRate.Value != 0.25 || *funnel.Generation.Cancelled.Value != 1 || *funnel.Generation.Ongoing.Value != 1 {
		t.Fatalf("wrong generation cohort: %+v %v", funnel, err)
	}
	historic := day.AddDate(0, 0, -95)
	funnel, err = s.Funnel(ctx, historic, historic)
	if err != nil || *funnel.Review.Started.Value != 4 || *funnel.Review.Completion.Value != 0.75 {
		t.Fatalf("late review cohort disappeared: %+v %v", funnel, err)
	}
	if _, err = pool.Exec(ctx, `UPDATE wordweave.review_cohort_daily SET submitted_count=4,successful_count=3,updated_at=clock_timestamp() WHERE start_day=$1`, historic); err != nil {
		t.Fatal(err)
	}
	funnel, err = s.Funnel(ctx, historic, historic)
	if err != nil || *funnel.Review.Completion.Value != 0.75 {
		t.Fatal("dashboard crossed aggregation snapshot")
	}
	if err = Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	funnel, err = s.Funnel(ctx, historic, historic)
	if err != nil || *funnel.Review.Completion.Value != 1 {
		t.Fatal("late submission omitted from original cohort")
	}
}
func TestM002ExpiredDetailsAndDeletionCannotReconnectBrowser(t *testing.T) {
	s, pool, ctx := fixture(t)
	first := testdb.Learner(t, ctx, pool)
	second := testdb.Learner(t, ctx, pool)
	record(t, s, ctx, nil, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-205"})
	record(t, s, ctx, &first, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-204"})
	record(t, s, ctx, &second, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-005"})
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		t.Fatal(err)
	}
	if err = Registered(ctx, tx, second, c); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	old := business.LearningDay(time.Now()).AddDate(0, 0, -91)
	if _, err = pool.Exec(ctx, `INSERT INTO wordweave.analytics_daily(day,metric,dimension_key,value,updated_at,maturity_state) VALUES($1,'pv','all',42,clock_timestamp(),'ready'),($1,'uv','all',10,clock_timestamp(),'ready')`, old); err != nil {
		t.Fatal(err)
	}
	if err = Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	traffic, err := s.Traffic(ctx, old, old)
	if err != nil || *traffic.PV.Value != 42 || *traffic.Series[0].UV.Value != 10 || traffic.UV.Status != "unavailable" || *traffic.UV.Reason != "detail_expired" {
		t.Fatalf("fabricated exact historical UV: %+v %v", traffic, err)
	}
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		t.Fatal(err)
	}
	if err = business.LockLearner(ctx, tx, first); err != nil {
		t.Fatal(err)
	}
	if err = Erase(ctx, tx, first); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `DELETE FROM wordweave.accounts WHERE id=$1`, first); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var chains, otherFacts int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.analytics_events WHERE browser_key_hash IS NOT NULL OR traffic_session_id IS NOT NULL`).Scan(&chains); err != nil || chains != 0 {
		t.Fatal("browser chain retained")
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM wordweave.analytics_events WHERE owner_id=$1 AND event_kind='registered'`, second).Scan(&otherFacts); err != nil || otherFacts != 1 {
		t.Fatal("other learner's business facts erased")
	}
}
func TestM002PurgeRequiresFreshCheckpointAndLeavesAnonymousTotals(t *testing.T) {
	s, pool, ctx := fixture(t)
	owner := testdb.Learner(t, ctx, pool)
	record(t, s, ctx, &owner, Event{ID: uuid.New(), Kind: "page_view", Page: "PAGE-205"})
	if _, err := pool.Exec(ctx, `UPDATE wordweave.analytics_events SET occurred_at=occurred_at-interval '91 days',learning_day=learning_day-91; UPDATE wordweave.traffic_sessions SET started_at=started_at-interval '91 days',last_event_at=last_event_at-interval '91 days'; UPDATE wordweave.growth_settings SET analytics_updated_at=clock_timestamp()-interval '3 minutes',analytics_aggregated_through=clock_timestamp()-interval '3 minutes'`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.analytics_accounts(owner_id,registered_learning_day,retention_due_at) VALUES($1,current_date-91,clock_timestamp()-interval '1 day')`, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := Purge(ctx, pool, 100); err != ErrAggregationBehind {
		t.Fatalf("purged ahead of checkpoint: %v", err)
	}
	if err := Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	cfg := pool.Config()
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE wordweave_maintenance`)
		return err
	}
	maintenance, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer maintenance.Close()
	if err = Aggregate(ctx, maintenance); err != nil {
		t.Fatalf("maintenance aggregation permissions: %v", err)
	}
	n, err := Purge(ctx, maintenance, 100)
	if err != nil || n != 3 {
		t.Fatalf("retention cleanup: n=%d %v", n, err)
	}
	var events, sessions, links, cohorts, accounts, daily int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.analytics_events),(SELECT count(*) FROM wordweave.traffic_sessions),(SELECT count(*) FROM wordweave.traffic_session_accounts),(SELECT count(*) FROM wordweave.analytics_accounts),(SELECT count(*) FROM wordweave.accounts),(SELECT count(*) FROM wordweave.analytics_daily)`).Scan(&events, &sessions, &links, &cohorts, &accounts, &daily); err != nil || events != 0 || sessions != 0 || links != 0 || cohorts != 0 || accounts != 1 || daily == 0 {
		t.Fatalf("cleanup crossed retention boundary: %d %d %d %d %d %d %v", events, sessions, links, cohorts, accounts, daily, err)
	}
}

func TestM002ExactRetentionDaysDistinctWAUAndActivationWindow(t *testing.T) {
	s, pool, ctx := fixture(t)
	today := business.LearningDay(time.Now())
	cohort := today.AddDate(0, 0, -32)
	a := testdb.Learner(t, ctx, pool)
	b := testdb.Learner(t, ctx, pool)
	empty := testdb.Learner(t, ctx, pool)
	for _, owner := range []uuid.UUID{a, b} {
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.analytics_accounts(owner_id,registered_learning_day,first_saved_at,retention_due_at) VALUES($1,$2,$3,clock_timestamp()+interval '58 days')`, owner, cohort, cohort.AddDate(0, 0, 6).Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
	}
	event := func(owner uuid.UUID, day time.Time, kind, outcome string) {
		t.Helper()
		if _, err := pool.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,owner_id,occurred_at,learning_day,source_kind,event_outcome) VALUES($1,$2,$3,$4,$5,'account',$6)`, uuid.NewString(), kind, owner, day.Add(-3*time.Hour), day, outcome); err != nil {
			t.Fatal(err)
		}
	}
	event(a, cohort.AddDate(0, 0, 1), "generation_valid", "account")
	event(a, cohort.AddDate(0, 0, 7), "review_submitted", "unsuccessful")
	event(b, cohort.AddDate(0, 0, 6), "generation_valid", "account") // within activation window, not D7
	event(b, cohort.AddDate(0, 0, 30), "generation_valid", "account")
	event(a, today.AddDate(0, 0, -6), "generation_valid", "account")
	event(a, today.AddDate(0, 0, -1), "review_submitted", "successful")
	event(empty, today.AddDate(0, 0, -1), "review_submitted", "empty")
	if err := Aggregate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	result, err := s.Retention(ctx, cohort, cohort)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range []Metric{result.Cohorts[0].D1, result.Cohorts[0].D7, result.Cohorts[0].D30} {
		if m.Status != "ready" || m.Value == nil || *m.Value != 0.5 || *m.Denominator != 2 {
			t.Fatalf("not exact-day retention: %+v", m)
		}
	}
	funnel, err := s.Funnel(ctx, cohort, cohort)
	if err != nil || *funnel.Activation.SevenDays.Value != 1 || *funnel.Activation.SameDay.Value != 0 {
		t.Fatalf("activation window conflated with D7: %+v %v", funnel, err)
	}
	result, err = s.Retention(ctx, today, today)
	if err != nil || *result.Series[0].WAU.Value != 2 {
		t.Fatalf("WAU duplicated days or counted empty submission: %+v %v", result, err)
	}
	result, err = s.Retention(ctx, today.AddDate(0, 0, -1), today.AddDate(0, 0, -1))
	if err != nil || *result.Series[0].Submissions.Value != 2 || *result.Series[0].Frequency.Value != 2 {
		t.Fatalf("empty submission lost or counted as learner: %+v %v", result, err)
	}
}
