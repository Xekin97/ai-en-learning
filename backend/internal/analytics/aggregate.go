package analytics

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
)

// Aggregate only rebuilds complete retained learning days. The partial day at
// the 90-day boundary keeps its already anonymous totals; it is never replaced
// with a misleading partial total after its earliest events expire.
func Aggregate(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var locked bool
	if err = tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(209002)`).Scan(&locked); err != nil {
		return err
	}
	if !locked {
		return nil
	}
	// No exclusive global configuration lock spans aggregation. The single UPDATE
	// at the end changes only the operational checkpoint, never its revision.
	var activated *time.Time
	var now time.Time
	if err = tx.QueryRow(ctx, `SELECT activated_at,clock_timestamp() FROM wordweave.growth_settings WHERE singleton`).Scan(&activated, &now); err != nil {
		return err
	}
	if activated == nil || now.Before(*activated) {
		return nil
	}
	cutoff := now.Add(-90 * 24 * time.Hour)
	from := business.LearningDay(cutoff).AddDate(0, 0, 1)
	activationDay := business.LearningDay(*activated)
	if activationDay.After(from) {
		from = activationDay
	}
	today := business.LearningDay(now)

	_, err = tx.Exec(ctx, aggregateDailySQL, from, today, cutoff, now)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, aggregateCohortsSQL, from, today, cutoff, now)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, aggregateReviewSQL, now)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.growth_settings SET analytics_aggregated_through=$1,analytics_updated_at=$1 WHERE singleton`, now)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

const aggregateDailySQL = `WITH days AS(SELECT d::date AS day FROM generate_series($1::date,$2::date,interval '1 day') d),
 events AS MATERIALIZED(SELECT * FROM wordweave.analytics_events WHERE occurred_at>$3 AND occurred_at<=$4),
 counts AS(SELECT d.day,
  count(*) FILTER(WHERE e.event_kind='page_view') pv,
  count(DISTINCT e.browser_key_hash) FILTER(WHERE e.event_kind='page_view') uv,
  count(DISTINCT e.browser_key_hash) FILTER(WHERE e.event_kind='page_view' AND e.event_outcome='anonymous') anonymous_uv,
  count(DISTINCT e.browser_key_hash) FILTER(WHERE e.event_kind='registered' AND EXISTS(SELECT 1 FROM events v WHERE v.event_kind='page_view' AND v.event_outcome='anonymous' AND v.learning_day=d.day AND v.browser_key_hash=e.browser_key_hash AND v.occurred_at<=e.occurred_at)) converted,
  count(*) FILTER(WHERE e.event_kind='registered') new_accounts,
  count(*) FILTER(WHERE e.event_kind='registered' AND NOT EXISTS(SELECT 1 FROM events v WHERE v.event_kind='page_view' AND v.event_outcome='anonymous' AND v.learning_day=d.day AND v.browser_key_hash=e.browser_key_hash AND v.occurred_at<=e.occurred_at)) unattributed,
  count(*) FILTER(WHERE e.event_kind='generation_valid') valid_generations,
  count(*) FILTER(WHERE e.event_kind='passage_saved') saved_passages,
  count(*) FILTER(WHERE e.event_kind='review_submitted') review_submissions,
  count(*) FILTER(WHERE e.event_kind='review_submitted' AND e.event_outcome='successful') successful_reviews,
  count(DISTINCT e.owner_id) FILTER(WHERE e.event_kind='generation_valid' OR(e.event_kind='review_submitted' AND e.event_outcome<>'empty')) active_learners,
  count(*) FILTER(WHERE e.event_kind='generation_precheck_rejected') prechecks
 FROM days d LEFT JOIN events e ON e.learning_day=d.day GROUP BY d.day),
 generated AS(SELECT d.day,
  count(*) FILTER(WHERE t.event_kind='generation_valid') valid,
  count(*) FILTER(WHERE t.event_kind='generation_failed') failed,
  count(*) FILTER(WHERE t.event_kind='generation_cancelled') cancelled,
  count(*) FILTER(WHERE t.id IS NULL AND s.id IS NOT NULL) ongoing
 FROM days d LEFT JOIN events s ON s.learning_day=d.day AND s.event_kind='generation_started'
 LEFT JOIN events t ON t.reference_key=s.reference_key AND t.event_kind IN('generation_valid','generation_failed','generation_cancelled') GROUP BY d.day),
 bounces AS(SELECT d.day,count(t.id) n,count(t.id) FILTER(WHERE t.pageviews=1 AND NOT t.has_key_action) bounced FROM days d LEFT JOIN wordweave.traffic_sessions t ON (t.started_at AT TIME ZONE 'UTC'+interval '4 hours')::date=d.day AND t.started_at>$3 AND coalesce(t.ended_at,t.last_event_at+interval '30 minutes')<=$4 GROUP BY d.day),
 weekly AS(SELECT d.day,count(DISTINCT e.owner_id) n FROM days d LEFT JOIN events e ON e.learning_day BETWEEN d.day-6 AND d.day AND e.owner_id IS NOT NULL AND(e.event_kind='generation_valid' OR(e.event_kind='review_submitted' AND e.event_outcome<>'empty')) WHERE d.day-6>($3::timestamptz AT TIME ZONE 'UTC'+interval '4 hours')::date AND d.day-6>=(SELECT (activated_at AT TIME ZONE 'UTC'+interval '4 hours')::date FROM wordweave.growth_settings WHERE singleton) GROUP BY d.day),
 channels AS(SELECT d.day,channel.dimension,count(e.id) pv,count(DISTINCT e.browser_key_hash) uv FROM days d CROSS JOIN(VALUES('utm'),('referrer'),('direct_unknown')) channel(dimension) LEFT JOIN events e ON e.learning_day=d.day AND e.event_kind='page_view' AND EXISTS(SELECT 1 FROM wordweave.traffic_sessions t WHERE t.id=e.traffic_session_id AND t.started_at>$3 AND t.entry_source_type=channel.dimension) GROUP BY d.day,channel.dimension),
 projected AS(
 SELECT c.day,v.metric,'all' dimension,NULL::bigint numerator,NULL::bigint denominator,v.value::numeric value,'ready' maturity FROM counts c CROSS JOIN LATERAL(VALUES('pv',c.pv),('uv',c.uv),('anonymous_uv',c.anonymous_uv),('converted_visitor_uv',c.converted),('new_accounts',c.new_accounts),('unattributed_accounts',c.unattributed),('valid_generations',c.valid_generations),('saved_passages',c.saved_passages),('review_submissions',c.review_submissions),('successful_reviews',c.successful_reviews),('active_learners',c.active_learners),('generation_precheck_rejected',c.prechecks),('review_cohort_started',0),('review_cohort_submitted',0),('review_cohort_successful',0))v(metric,value)
 UNION ALL SELECT g.day,v.metric,'all',NULL,NULL,v.value::numeric,'ready' FROM generated g CROSS JOIN LATERAL(VALUES('generation_valid',g.valid),('generation_failed',g.failed),('generation_cancelled',g.cancelled),('generation_ongoing',g.ongoing))v(metric,value)
 UNION ALL SELECT day,'bounce_rate','all',bounced,n,CASE WHEN n>0 THEN bounced::numeric/n END,CASE WHEN n=0 THEN 'no_sample' ELSE 'ready' END FROM bounces
 UNION ALL SELECT day,'wau','all',NULL,NULL,n::numeric,'ready' FROM weekly
 UNION ALL SELECT day,v.metric,dimension,NULL,NULL,v.value::numeric,'ready' FROM channels CROSS JOIN LATERAL(VALUES('pv',pv),('uv',uv))v(metric,value)
)
 INSERT INTO wordweave.analytics_daily(day,metric,dimension_key,numerator,denominator,value,updated_at,maturity_state)
 SELECT day,metric,dimension,numerator,denominator,value,$4,maturity FROM projected
 ON CONFLICT(day,metric,dimension_key) DO UPDATE SET numerator=excluded.numerator,denominator=excluded.denominator,value=excluded.value,updated_at=excluded.updated_at,maturity_state=excluded.maturity_state`
const aggregateCohortsSQL = `WITH days AS(SELECT d::date AS day FROM generate_series($1::date,$2::date,interval '1 day') d),
 events AS MATERIALIZED(SELECT owner_id,learning_day FROM wordweave.analytics_events WHERE occurred_at>$3 AND occurred_at<=$4 AND owner_id IS NOT NULL AND(event_kind='generation_valid' OR(event_kind='review_submitted' AND event_outcome<>'empty'))),
 counts AS(SELECT d.day,count(a.owner_id) n,
 count(a.owner_id) FILTER(WHERE (a.first_saved_at AT TIME ZONE 'UTC'+interval '4 hours')::date=d.day AND a.first_saved_at<=$4) same_day,
 count(a.owner_id) FILTER(WHERE (a.first_saved_at AT TIME ZONE 'UTC'+interval '4 hours')::date BETWEEN d.day AND d.day+6 AND a.first_saved_at<=$4) seven_days,
 count(a.owner_id) FILTER(WHERE EXISTS(SELECT 1 FROM events e WHERE e.owner_id=a.owner_id AND e.learning_day=d.day+1)) d1,
 count(a.owner_id) FILTER(WHERE EXISTS(SELECT 1 FROM events e WHERE e.owner_id=a.owner_id AND e.learning_day=d.day+7)) d7,
 count(a.owner_id) FILTER(WHERE EXISTS(SELECT 1 FROM events e WHERE e.owner_id=a.owner_id AND e.learning_day=d.day+30)) d30
 FROM days d LEFT JOIN wordweave.analytics_accounts a ON a.registered_learning_day=d.day AND a.retention_due_at>$4 GROUP BY d.day),
 projected AS(SELECT c.day,c.n,v.metric,v.numerator,v.maturity FROM counts c CROSS JOIN LATERAL(VALUES
 ('activation_same_day',c.same_day,0),('activation_7_days',c.seven_days,6),('retention_d1',c.d1,1),('retention_d7',c.d7,7),('retention_d30',c.d30,30))v(metric,numerator,maturity))
 INSERT INTO wordweave.analytics_daily(day,metric,dimension_key,numerator,denominator,value,updated_at,maturity_state)
 SELECT day,metric,'all',numerator,n,CASE WHEN n>0 AND day+maturity<$2 THEN numerator::numeric/n END,$4,
 CASE WHEN n=0 THEN 'no_sample' WHEN day+maturity>=$2 THEN 'observing' ELSE 'ready' END FROM projected
 ON CONFLICT(day,metric,dimension_key) DO UPDATE SET numerator=excluded.numerator,denominator=excluded.denominator,value=excluded.value,updated_at=excluded.updated_at,maturity_state=excluded.maturity_state`

const aggregateReviewSQL = `INSERT INTO wordweave.analytics_daily(day,metric,dimension_key,numerator,denominator,value,updated_at,maturity_state)
 SELECT c.start_day,v.metric,'all',NULL,NULL,v.value,$1,'ready' FROM wordweave.review_cohort_daily c
 CROSS JOIN LATERAL(VALUES('review_cohort_started',c.started_count),('review_cohort_submitted',c.submitted_count),('review_cohort_successful',c.successful_count))v(metric,value)
 ON CONFLICT(day,metric,dimension_key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`
