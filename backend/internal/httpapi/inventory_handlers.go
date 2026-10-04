package httpapi

import (
	"net/http"
	"wordweave/internal/growth"
)

func (server *Server) shopItems(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	limit, ok := listLimit(w, r)
	if !ok {
		return
	}
	kind := r.URL.Query().Get("kind")
	locale := learnerLocale(r)
	scope := "shop:" + actor.ID.String() + ":" + locale + ":" + kind
	var cursor *growth.DefinitionCursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		var value growth.DefinitionCursor
		if err := server.cursor.Decode(scope, raw, &value); err != nil {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/cursor", Code: "invalid"}}})
			return
		}
		cursor = &value
	}
	out, next, err := server.growth.Shop(r.Context(), actor.ID, locale, kind, cursor, limit)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	var encoded *string
	if next != nil {
		value, err := server.cursor.Encode(scope, *next)
		if err != nil {
			server.writeGrowthProblem(w, r, err)
			return
		}
		encoded = &value
	}
	writeListJSON(w, r, out, encoded, encoded != nil)
}
func (server *Server) ownedItems(w http.ResponseWriter, r *http.Request) {
	actor, _ := actorFromContext(r.Context())
	limit, ok := listLimit(w, r)
	if !ok {
		return
	}
	kind, state, locale := r.URL.Query().Get("kind"), r.URL.Query().Get("state"), learnerLocale(r)
	scope := "inventory:" + actor.ID.String() + ":" + locale + ":" + kind + ":" + state
	var cursor *growth.OwnedCursor
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		var value growth.OwnedCursor
		if err := server.cursor.Decode(scope, raw, &value); err != nil {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/cursor", Code: "invalid"}}})
			return
		}
		cursor = &value
	}
	items, more, err := server.growth.OwnedItems(r.Context(), actor.ID, locale, kind, state, cursor, limit)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	var next *string
	if more {
		last := items[len(items)-1]
		value, err := server.cursor.Encode(scope, growth.OwnedCursor{At: last.IssuedAt, ID: last.ID})
		if err != nil {
			server.writeGrowthProblem(w, r, err)
			return
		}
		next = &value
	}
	writeListJSON(w, r, struct {
		Items []growth.OwnedItem `json:"items"`
	}{items}, next, more)
}
func (server *Server) activationPreview(w http.ResponseWriter, r *http.Request) {
	var body struct{}
	if !decodeOrProblem(w, r, &body, 128) {
		return
	}
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	out, err := server.growth.ActivationPreview(r.Context(), actor.ID, id, learnerLocale(r))
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
func (server *Server) activateItem(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token   string `json:"confirmation_token"`
		Confirm bool   `json:"confirm_discard"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	key, ok := idempotencyKey(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	out, err := server.growth.Activate(r.Context(), actor.ID, key, id, learnerLocale(r), body.Token, body.Confirm)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
func (server *Server) refundPreview(w http.ResponseWriter, r *http.Request) {
	var body struct{}
	if !decodeOrProblem(w, r, &body, 128) {
		return
	}
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	out, err := server.growth.RefundPreview(r.Context(), actor.ID, id, learnerLocale(r))
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
func (server *Server) refundItem(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"confirmation_token"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	key, ok := idempotencyKey(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	out, err := server.growth.Refund(r.Context(), actor.ID, key, id, learnerLocale(r), body.Token)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
