package httpapi

import (
	"github.com/google/uuid"
	"net/http"
	"wordweave/internal/growth"
	"wordweave/internal/platform/business"
)

func learnerLocale(r *http.Request) string {
	actor, _ := actorFromContext(r.Context())
	if actor.UILocale != nil {
		return *actor.UILocale
	}
	return "zh-CN"
}
func idempotencyKey(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	key, err := uuid.Parse(r.Header.Get("Idempotency-Key"))
	if err != nil || key == uuid.Nil {
		writeProblem(w, r, 422, "validation_failed", "Request could not be accepted", "An idempotency key is required.", fieldError{"/idempotency_key", "required"})
		return uuid.Nil, false
	}
	return key, true
}
func (server *Server) personalGrowth(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	out, err := server.growth.Personal(r.Context(), actor.ID, learnerLocale(r))
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
func (server *Server) checkinCalendar(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	out, err := server.growth.Calendar(r.Context(), actor.ID, r.URL.Query().Get("start_date"), r.URL.Query().Get("end_date"))
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
func (server *Server) personalLevelAwards(w http.ResponseWriter, r *http.Request) {
	server.listPersonalAwards(w, r, false)
}
func (server *Server) personalAchievements(w http.ResponseWriter, r *http.Request) {
	server.listPersonalAwards(w, r, true)
}
func (server *Server) listPersonalAwards(w http.ResponseWriter, r *http.Request, achievement bool) {
	actor, _ := actorFromContext(r.Context())
	limit, ok := listLimit(w, r)
	if !ok {
		return
	}
	locale := learnerLocale(r)
	kind := ""
	scope := "level-awards:"
	if achievement {
		kind = r.URL.Query().Get("kind")
		scope = "achievements:"
	}
	scope += actor.ID.String() + ":" + locale + ":" + kind
	var cursor *growth.AwardCursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		var decoded growth.AwardCursor
		if err := server.cursor.Decode(scope, raw, &decoded); err != nil {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/cursor", Code: "invalid"}}})
			return
		}
		cursor = &decoded
	}
	var data any
	var more bool
	var last growth.AwardCursor
	var err error
	if achievement {
		var items []growth.Achievement
		items, more, err = server.growth.PersonalAchievements(r.Context(), actor.ID, locale, kind, cursor, limit)
		data = struct {
			Items []growth.Achievement `json:"items"`
		}{items}
		if more {
			n := items[len(items)-1]
			last = growth.AwardCursor{Kind: n.Kind, Order: n.Threshold, ID: n.ID}
		}
	} else {
		var items []growth.LevelAward
		items, more, err = server.growth.PersonalLevelAwards(r.Context(), actor.ID, locale, cursor, limit)
		data = struct {
			Items []growth.LevelAward `json:"items"`
		}{items}
		if more {
			n := items[len(items)-1]
			last = growth.AwardCursor{Order: n.Number, ID: n.ID}
		}
	}
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	var next *string
	if more {
		value, err := server.cursor.Encode(scope, last)
		if err != nil {
			server.writeGrowthProblem(w, r, err)
			return
		}
		next = &value
	}
	writeListJSON(w, r, data, next, more)
}
func (server *Server) claimLevelReward(w http.ResponseWriter, r *http.Request) {
	server.claimGrowthReward(w, r, false)
}
func (server *Server) claimAchievement(w http.ResponseWriter, r *http.Request) {
	server.claimGrowthReward(w, r, true)
}
func (server *Server) claimGrowthReward(w http.ResponseWriter, r *http.Request, achievement bool) {
	var body struct{}
	if !decodeOrProblem(w, r, &body, 128) {
		return
	}
	id, ok := growthID(w, r, "award_id")
	if !ok {
		return
	}
	key, ok := idempotencyKey(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.growth.Claim(r.Context(), actor.ID, key, id, achievement, learnerLocale(r))
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) exchangeItems(w http.ResponseWriter, r *http.Request) {
	var input struct {
		DefinitionID uuid.UUID `json:"definition_id"`
		Quantity     int64     `json:"quantity"`
	}
	if !decodeConfiguration(w, r, &input) {
		return
	}
	key, ok := idempotencyKey(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	receipt, err := server.growth.Exchange(r.Context(), actor.ID, key, input.DefinitionID, input.Quantity)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Receipt growth.Receipt `json:"receipt"`
	}{receipt})
}
func (server *Server) personalPointsLedger(w http.ResponseWriter, r *http.Request) {
	server.pointsLedger(w, r, false)
}
func (server *Server) adminPointsLedger(w http.ResponseWriter, r *http.Request) {
	server.pointsLedger(w, r, true)
}
func (server *Server) pointsLedger(w http.ResponseWriter, r *http.Request, admin bool) {
	actor, _ := actorFromContext(r.Context())
	owner := actor.ID
	if admin {
		var ok bool
		owner, ok = growthID(w, r, "user_id")
		if !ok {
			return
		}
	}
	limit, ok := listLimit(w, r)
	if !ok {
		return
	}
	scope := "points-ledger:" + actor.ID.String() + ":" + owner.String()
	var cursor *growth.LedgerCursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		var decoded growth.LedgerCursor
		if err := server.cursor.Decode(scope, raw, &decoded); err != nil {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/cursor", Code: "invalid"}}})
			return
		}
		cursor = &decoded
	}
	out, more, err := server.growth.Ledger(r.Context(), owner, admin, cursor, limit)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	var next *string
	if more {
		last := out.Items[len(out.Items)-1]
		token, err := server.cursor.Encode(scope, growth.LedgerCursor{At: last.At, ID: last.ID})
		if err != nil {
			server.writeGrowthProblem(w, r, err)
			return
		}
		next = &token
	}
	writeListJSON(w, r, out, next, more)
}
func (server *Server) adminGrantPoints(w http.ResponseWriter, r *http.Request) {
	owner, ok := growthID(w, r, "user_id")
	if !ok {
		return
	}
	var body struct {
		Points business.Amount `json:"points"`
		Reason string          `json:"reason"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	key, ok := idempotencyKey(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	receipt, err := server.growth.GrantPoints(r.Context(), actor.ID, owner, key, body.Points, body.Reason)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Receipt growth.Receipt `json:"receipt"`
	}{receipt})
}
