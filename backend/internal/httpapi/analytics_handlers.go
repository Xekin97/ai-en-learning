package httpapi

import (
	"errors"
	"net/http"
	"time"

	"wordweave/internal/analytics"
	"wordweave/internal/generation"
)

func (s *Server) writeAnalyticsProblem(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, analytics.ErrValidation) {
		writeProblem(w, r, 422, "validation_failed", "Invalid date range", "Choose a valid learning-day range through today.")
		return
	}
	writeProblem(w, r, 503, "temporarily_unavailable", "Temporarily unavailable", "Please try again.")
}
func (s *Server) analyticsRange(w http.ResponseWriter, r *http.Request) (time.Time, time.Time, bool) {
	if !configurationQuery(w, r, "start_day", "end_day") {
		return time.Time{}, time.Time{}, false
	}
	start, err := time.Parse("2006-01-02", r.URL.Query().Get("start_day"))
	if err != nil {
		s.writeAnalyticsProblem(w, r, analytics.ErrValidation)
		return start, start, false
	}
	end, err := time.Parse("2006-01-02", r.URL.Query().Get("end_day"))
	if err != nil || end.Before(start) {
		s.writeAnalyticsProblem(w, r, analytics.ErrValidation)
		return start, end, false
	}
	return start, end, true
}
func (s *Server) adminTraffic(w http.ResponseWriter, r *http.Request) {
	start, end, ok := s.analyticsRange(w, r)
	if !ok {
		return
	}
	data, err := s.analytics.Traffic(r.Context(), start, end)
	if err != nil {
		s.writeAnalyticsProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, data)
}
func (s *Server) adminFunnel(w http.ResponseWriter, r *http.Request) {
	start, end, ok := s.analyticsRange(w, r)
	if !ok {
		return
	}
	data, err := s.analytics.Funnel(r.Context(), start, end)
	if err != nil {
		s.writeAnalyticsProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, data)
}
func (s *Server) adminRetention(w http.ResponseWriter, r *http.Request) {
	start, end, ok := s.analyticsRange(w, r)
	if !ok {
		return
	}
	data, err := s.analytics.Retention(r.Context(), start, end)
	if err != nil {
		s.writeAnalyticsProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, data)
}
func (s *Server) adminOverview(w http.ResponseWriter, r *http.Request) {
	if !configurationQuery(w, r) {
		return
	}
	data, err := s.analytics.Overview(r.Context())
	if err != nil {
		s.writeAnalyticsProblem(w, r, err)
		return
	}
	start, _ := time.Parse("2006-01-02", data.Range.Start)
	end, _ := time.Parse("2006-01-02", data.Range.End)
	usage, _, _, err := s.generation.PreviewUsageHistory(r.Context(), start, end, nil, 1)
	if err != nil {
		s.writeAnalyticsProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		analytics.Overview
		Usage generation.UsageSummary `json:"preview_usage"`
	}{data, usage})
}
