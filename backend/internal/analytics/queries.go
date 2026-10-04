package analytics

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type Metric struct {
	Value       *float64 `json:"value"`
	Numerator   *int64   `json:"numerator"`
	Denominator *int64   `json:"denominator"`
	Status      string   `json:"status"`
	Reason      *string  `json:"reason"`
}

func Count(n int64) Metric { v := float64(n); return Metric{Value: &v, Status: "ready"} }
func Ratio(n, d int64, observing bool) Metric {
	m := Metric{Numerator: &n, Denominator: &d, Status: "ready"}
	if d == 0 {
		m.Status = "no_sample"
	} else if observing {
		m.Status = "observing"
	} else {
		v := float64(n) / float64(d)
		m.Value = &v
	}
	return m
}
func unavailable(reason string) Metric { return Metric{Status: "unavailable", Reason: &reason} }

type DateRange struct {
	Start string `json:"start_day"`
	End   string `json:"end_day"`
}
type Common struct {
	Range               DateRange  `json:"range"`
	LearningDay         string     `json:"learning_day"`
	UpdatedAt           *time.Time `json:"updated_at"`
	Freshness           string     `json:"freshness"`
	DetailAvailableFrom time.Time  `json:"detail_available_from"`
}
type snapshot struct {
	Common
	tx         pgx.Tx
	now        time.Time
	start, end time.Time
	activated  *time.Time
	daily      map[string]Metric
}

func (s *Service) load(ctx context.Context, start, end time.Time) (*snapshot, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	v := &snapshot{tx: tx, start: start, end: end, daily: map[string]Metric{}}
	err = tx.QueryRow(ctx, `SELECT activated_at,analytics_updated_at,clock_timestamp() FROM wordweave.growth_settings WHERE singleton`).Scan(&v.activated, &v.UpdatedAt, &v.now)
	if err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	today := business.LearningDay(v.now)
	if start.After(end) || end.After(today) || !start.Equal(business.LearningDay(start)) || !end.Equal(business.LearningDay(end)) {
		tx.Rollback(ctx)
		return nil, ErrValidation
	}
	v.Range = DateRange{start.Format("2006-01-02"), end.Format("2006-01-02")}
	v.LearningDay = today.Format("2006-01-02")
	v.DetailAvailableFrom = v.now.Add(-90 * 24 * time.Hour)
	v.Freshness = "no_data"
	if v.UpdatedAt != nil {
		v.Freshness = "current"
		if v.now.Sub(*v.UpdatedAt) > 2*time.Minute {
			v.Freshness = "delayed"
		}
	}
	rows, err := tx.Query(ctx, `SELECT day,metric,dimension_key,numerator,denominator,value::double precision,maturity_state FROM wordweave.analytics_daily WHERE day BETWEEN $1 AND $2`, start, end)
	if err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	for rows.Next() {
		var day time.Time
		var name, dimension string
		var m Metric
		if err = rows.Scan(&day, &name, &dimension, &m.Numerator, &m.Denominator, &m.Value, &m.Status); err != nil {
			rows.Close()
			tx.Rollback(ctx)
			return nil, err
		}
		v.daily[day.Format("2006-01-02")+":"+name+":"+dimension] = m
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	return v, nil
}
func (v *snapshot) day(day time.Time, name, dimension string) Metric {
	m, ok := v.daily[day.Format("2006-01-02")+":"+name+":"+dimension]
	if !ok {
		return unavailable("source_unavailable")
	}
	return m
}
func (v *snapshot) sum(name, dimension string) Metric {
	total := float64(0)
	var n, d int64
	rate, observing := false, false
	for day := v.start; !day.After(v.end); day = day.AddDate(0, 0, 1) {
		m := v.day(day, name, dimension)
		if m.Status == "unavailable" {
			return m
		}
		if m.Numerator != nil && m.Denominator != nil {
			rate = true
			n += *m.Numerator
			d += *m.Denominator
			observing = observing || m.Status == "observing"
		} else if m.Value != nil {
			total += *m.Value
		}
	}
	if rate {
		return Ratio(n, d, observing)
	}
	return Metric{Value: &total, Status: "ready"}
}
func (v *snapshot) uv(ctx context.Context, dimension string) (Metric, error) {
	if v.start.Add(-4 * time.Hour).Before(v.DetailAvailableFrom) {
		return unavailable("detail_expired"), nil
	}
	if v.UpdatedAt == nil || v.activated == nil || v.start.Before(business.LearningDay(*v.activated)) {
		return unavailable("source_unavailable"), nil
	}
	var n int64
	err := v.tx.QueryRow(ctx, `SELECT count(DISTINCT e.browser_key_hash) FROM wordweave.analytics_events e WHERE e.event_kind='page_view' AND e.learning_day BETWEEN $1 AND $2 AND e.occurred_at>$3 AND e.occurred_at<=$4 AND ($5='all' OR EXISTS(SELECT 1 FROM wordweave.traffic_sessions t WHERE t.id=e.traffic_session_id AND t.entry_source_type=$5 AND t.started_at>$3))`, v.start, v.end, v.DetailAvailableFrom, v.UpdatedAt, dimension).Scan(&n)
	if err != nil {
		return unavailable("source_unavailable"), err
	}
	return Count(n), nil
}

type TrafficDay struct {
	Day    string `json:"day"`
	PV     Metric `json:"pv"`
	UV     Metric `json:"uv"`
	Bounce Metric `json:"bounce_rate"`
}
type Channel struct {
	Source string `json:"source_type"`
	PV     Metric `json:"pv"`
	UV     Metric `json:"uv"`
}
type Clarity struct {
	Available bool    `json:"available"`
	URL       *string `json:"url"`
}
type Traffic struct {
	Common
	PV       Metric       `json:"pv"`
	UV       Metric       `json:"uv"`
	Bounce   Metric       `json:"bounce_rate"`
	Series   []TrafficDay `json:"series"`
	Channels []Channel    `json:"channels"`
	Clarity  Clarity      `json:"clarity"`
}

func (s *Service) Traffic(ctx context.Context, start, end time.Time) (Traffic, error) {
	v, err := s.load(ctx, start, end)
	if err != nil {
		return Traffic{}, err
	}
	defer v.tx.Rollback(ctx)
	return s.traffic(ctx, v)
}
func (s *Service) traffic(ctx context.Context, v *snapshot) (Traffic, error) {
	result := Traffic{Common: v.Common, PV: v.sum("pv", "all"), Bounce: v.sum("bounce_rate", "all"), Series: []TrafficDay{}, Channels: []Channel{}, Clarity: Clarity{s.clarityURL != nil, s.clarityURL}}
	var err error
	result.UV, err = v.uv(ctx, "all")
	if err != nil {
		return result, err
	}
	for day := v.start; !day.After(v.end); day = day.AddDate(0, 0, 1) {
		result.Series = append(result.Series, TrafficDay{day.Format("2006-01-02"), v.day(day, "pv", "all"), v.day(day, "uv", "all"), v.day(day, "bounce_rate", "all")})
	}
	for _, dimension := range []string{"utm", "referrer", "direct_unknown"} {
		uv, err := v.uv(ctx, dimension)
		if err != nil {
			return result, err
		}
		result.Channels = append(result.Channels, Channel{dimension, v.sum("pv", dimension), uv})
	}
	return result, nil
}

type Registration struct {
	Converted    Metric `json:"converted_visitor_uv"`
	Anonymous    Metric `json:"anonymous_uv"`
	Rate         Metric `json:"rate"`
	Accounts     Metric `json:"new_accounts"`
	Unattributed Metric `json:"unattributed_accounts"`
}
type ActivationCohort struct {
	Day  string `json:"registration_day"`
	Rate Metric `json:"rate"`
}
type Activation struct {
	SevenDays Metric             `json:"within_7_days"`
	SameDay   Metric             `json:"same_day"`
	Cohorts   []ActivationCohort `json:"cohorts"`
}
type Review struct {
	Started    Metric `json:"started"`
	Submitted  Metric `json:"submitted"`
	Successful Metric `json:"successful"`
	Completion Metric `json:"completion_rate"`
	Success    Metric `json:"success_rate"`
}
type Generation struct {
	Valid       Metric `json:"valid"`
	Failed      Metric `json:"failed"`
	Cancelled   Metric `json:"cancelled"`
	Ongoing     Metric `json:"ongoing"`
	Precheck    Metric `json:"precheck_rejected"`
	FailureRate Metric `json:"failure_rate"`
}
type Funnel struct {
	Common
	Registration Registration `json:"registration"`
	Activation   Activation   `json:"activation"`
	Review       Review       `json:"review"`
	Generation   Generation   `json:"generation"`
}

func countRatio(n, d Metric) Metric {
	if n.Value == nil || d.Value == nil {
		return unavailable("source_unavailable")
	}
	return Ratio(int64(*n.Value), int64(*d.Value), false)
}
func (s *Service) Funnel(ctx context.Context, start, end time.Time) (Funnel, error) {
	v, err := s.load(ctx, start, end)
	if err != nil {
		return Funnel{}, err
	}
	defer v.tx.Rollback(ctx)
	return s.funnel(ctx, v)
}
func (s *Service) funnel(ctx context.Context, v *snapshot) (Funnel, error) {
	result := Funnel{Common: v.Common}
	r := Registration{Converted: v.sum("converted_visitor_uv", "all"), Anonymous: v.sum("anonymous_uv", "all"), Accounts: v.sum("new_accounts", "all"), Unattributed: v.sum("unattributed_accounts", "all")}
	r.Rate = countRatio(r.Converted, r.Anonymous)
	result.Registration = r
	result.Activation = Activation{SevenDays: v.sum("activation_7_days", "all"), SameDay: v.sum("activation_same_day", "all"), Cohorts: []ActivationCohort{}}
	for day := v.start; !day.After(v.end); day = day.AddDate(0, 0, 1) {
		result.Activation.Cohorts = append(result.Activation.Cohorts, ActivationCohort{day.Format("2006-01-02"), v.day(day, "activation_7_days", "all")})
	}
	started, submitted, successful := v.sum("review_cohort_started", "all"), v.sum("review_cohort_submitted", "all"), v.sum("review_cohort_successful", "all")
	result.Review = Review{started, submitted, successful, countRatio(submitted, started), countRatio(successful, submitted)}

	g := Generation{Valid: v.sum("generation_valid", "all"), Failed: v.sum("generation_failed", "all"), Cancelled: v.sum("generation_cancelled", "all"), Ongoing: v.sum("generation_ongoing", "all"), Precheck: v.sum("generation_precheck_rejected", "all")}
	if g.Valid.Value == nil || g.Failed.Value == nil {
		g.FailureRate = unavailable("source_unavailable")
	} else {
		g.FailureRate = Ratio(int64(*g.Failed.Value), int64(*g.Valid.Value+*g.Failed.Value), false)
	}
	result.Generation = g
	return result, nil
}

type RetentionCohort struct {
	Day      string `json:"registration_day"`
	Accounts int64  `json:"accounts"`
	D1       Metric `json:"d1"`
	D7       Metric `json:"d7"`
	D30      Metric `json:"d30"`
}
type RetentionDay struct {
	Day         string `json:"day"`
	WAU         Metric `json:"wau"`
	Generations Metric `json:"valid_generations"`
	Saved       Metric `json:"saved_passages"`
	Submissions Metric `json:"review_submissions"`
	Successful  Metric `json:"successful_reviews"`
	Frequency   Metric `json:"reviews_per_active_learner"`
}
type Retention struct {
	Common
	Cohorts []RetentionCohort `json:"cohorts"`
	Series  []RetentionDay    `json:"series"`
}

func (s *Service) Retention(ctx context.Context, start, end time.Time) (Retention, error) {
	v, err := s.load(ctx, start, end)
	if err != nil {
		return Retention{}, err
	}
	defer v.tx.Rollback(ctx)
	result := Retention{Common: v.Common, Cohorts: []RetentionCohort{}, Series: []RetentionDay{}}
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		key := day.Format("2006-01-02")
		d1, d7, d30 := v.day(day, "retention_d1", "all"), v.day(day, "retention_d7", "all"), v.day(day, "retention_d30", "all")
		var n int64
		if d1.Denominator != nil {
			n = *d1.Denominator
		}
		result.Cohorts = append(result.Cohorts, RetentionCohort{key, n, d1, d7, d30})
		sub := v.day(day, "review_submissions", "all")
		active := v.day(day, "active_learners", "all")
		result.Series = append(result.Series, RetentionDay{key, v.day(day, "wau", "all"), v.day(day, "valid_generations", "all"), v.day(day, "saved_passages", "all"), sub, v.day(day, "successful_reviews", "all"), countRatio(sub, active)})
	}
	return result, nil
}

type OverviewToday struct {
	PV          Metric `json:"pv"`
	UV          Metric `json:"uv"`
	Generations Metric `json:"valid_generations"`
	Saved       Metric `json:"saved_passages"`
	Reviews     Metric `json:"review_submissions"`
}
type OverviewWeek struct {
	WAU          Metric `json:"wau"`
	Registration Metric `json:"registration_rate"`
	Activation   Metric `json:"activation_rate"`
	Failures     Metric `json:"generation_failure_rate"`
}
type Overview struct {
	Common
	Today OverviewToday `json:"today"`
	Week  OverviewWeek  `json:"last_7_days"`
}

func (s *Service) Overview(ctx context.Context) (Overview, error) {
	var now time.Time
	if err := s.pool.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return Overview{}, err
	}
	today := business.LearningDay(now)
	v, err := s.load(ctx, today.AddDate(0, 0, -6), today)
	if err != nil {
		return Overview{}, err
	}
	defer v.tx.Rollback(ctx)
	f, err := s.funnel(ctx, v)
	if err != nil {
		return Overview{}, err
	}
	v.start = today
	uv, err := v.uv(ctx, "all")
	if err != nil {
		return Overview{}, err
	}
	return Overview{v.Common, OverviewToday{v.day(today, "pv", "all"), uv, v.day(today, "valid_generations", "all"), v.day(today, "saved_passages", "all"), v.day(today, "review_submissions", "all")}, OverviewWeek{v.day(today, "wau", "all"), f.Registration.Rate, f.Activation.SevenDays, f.Generation.FailureRate}}, nil
}
