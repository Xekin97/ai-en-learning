package httpapi

import (
	"github.com/google/uuid"
	"net/http"
)

func (server *Server) makeupPreview(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Item uuid.UUID `json:"item_id"`
		Day  string    `json:"learning_day"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.growth.MakeupPreview(r.Context(), actor.ID, body.Item, body.Day)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
func (server *Server) makeupCheckin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Item  uuid.UUID `json:"item_id"`
		Day   string    `json:"learning_day"`
		Token string    `json:"confirmation_token"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	key, ok := idempotencyKey(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	result, err := server.growth.Makeup(r.Context(), actor.ID, key, body.Item, body.Day, body.Token)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, result)
}
